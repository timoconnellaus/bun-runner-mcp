import { spawn } from 'bun';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import type { Permission, PermissionDeniedError } from '../types/index.js';
import type { PermissionStore } from '../proxy/store.js';
import {
  isContainerMode,
  isContainerCliAvailable,
  executeInSessionContainer,
  cleanupSessionContainer,
} from '../container/index.js';
import { inlineSnippets } from '../snippets/index.js';

const PROXY_URL = 'http://localhost:9999';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  permissionRequired?: Permission;
  exitCode?: number;
}

export interface ExecutionOptions {
  timeout?: number;
  containerImage?: string;
}

/**
 * Check if the proxy server is healthy and available.
 * @returns true if proxy is available, false otherwise
 */
async function checkProxyHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PROXY_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Execute code in a sandboxed environment.
 * Supports two execution modes:
 * - preload (default): Uses Bun's preload feature for runtime sandboxing
 * - container: Uses Apple Containers for VM-level isolation
 *
 * @param code - TypeScript/JavaScript code to execute
 * @param permissionStore - Shared permission store (same instance used by HTTP proxy)
 * @param options - Execution options (timeout, container image)
 * @returns ExecutionResult with output or error information
 */
export async function executeInSandbox(
  code: string,
  permissionStore: PermissionStore,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const { timeout = 30000 } = options;

  // Inline any referenced snippets
  const inlineResult = await inlineSnippets(code);
  if (!inlineResult.success) {
    return {
      success: false,
      error: inlineResult.error || 'Failed to inline snippets',
      exitCode: -1,
    };
  }

  const processedCode = inlineResult.code!;
  if (inlineResult.snippetsUsed && inlineResult.snippetsUsed.length > 0) {
    console.error(`[executor] Inlined ${inlineResult.snippetsUsed.length} snippet(s): ${inlineResult.snippetsUsed.join(', ')}`);
  }

  // Check if container mode is enabled
  if (isContainerMode()) {
    return executeInContainer(processedCode, options);
  }

  // Check if proxy server is available
  const proxyHealthy = await checkProxyHealth();
  if (!proxyHealthy) {
    return {
      success: false,
      error: 'Proxy server is not available. Please ensure the HTTP server is running on port 9999.',
      exitCode: -1,
    };
  }

  // Create a temporary file for the code
  const tempFile = join(tmpdir(), `bun-runner-${crypto.randomUUID()}.ts`);

  try {
    // Write processed code (with inlined snippets) to temporary file
    await writeFile(tempFile, processedCode, 'utf-8');

    // Prepare environment variables
    const env = {
      ...process.env,
      PROXY_URL: PROXY_URL,
    };

    // Execute the code using Bun with preload for sandboxing
    const proc = spawn({
      cmd: ['bun', 'run', '--preload', './src/sandbox/preload.ts', tempFile],
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill();
    }, timeout);

    // Wait for process to complete
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    // Collect output
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    // Clean up temporary file
    await unlink(tempFile).catch(() => {});

    // Check for permission denied errors in stderr
    const permissionDenied = parsePermissionDenied(stderr);
    if (permissionDenied) {
      return {
        success: false,
        error: stderr,
        permissionRequired: permissionDenied.requiredPermission,
        exitCode,
      };
    }

    // Return result
    if (exitCode === 0) {
      return {
        success: true,
        output: stdout,
        exitCode,
      };
    } else {
      return {
        success: false,
        output: stdout,
        error: stderr,
        exitCode,
      };
    }
  } catch (error) {
    // Clean up temporary file on error
    await unlink(tempFile).catch(() => {});

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      exitCode: -1,
    };
  }
}

/**
 * Parse stderr output to detect permission denied errors.
 *
 * @param stderr - Standard error output from the process
 * @returns PermissionDeniedError if detected, null otherwise
 */
function parsePermissionDenied(stderr: string): PermissionDeniedError | null {
  try {
    // Look for JSON error objects in stderr
    // The proxy server should output errors in JSON format
    const lines = stderr.split('\n');
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.code === 'PERMISSION_DENIED' && parsed.requiredPermission) {
          return parsed as PermissionDeniedError;
        }
      } catch {
        // Not JSON, continue
      }
    }
  } catch {
    // Parsing failed
  }

  return null;
}

/**
 * Execute code inside an Apple Container.
 * Provides VM-level isolation with npm package support.
 *
 * @param code - TypeScript/JavaScript code to execute
 * @param options - Execution options
 * @returns ExecutionResult with output or error information
 */
async function executeInContainer(
  code: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const { timeout = 30000 } = options;

  // Check if container CLI is available
  const cliAvailable = await isContainerCliAvailable();
  if (!cliAvailable) {
    return {
      success: false,
      error: 'Apple Container CLI is not available. Set EXECUTION_MODE=preload or install Apple Containers (macOS 26+).',
      exitCode: -1,
    };
  }

  try {
    // Execute code in session container (Bun auto-installs packages)
    const result = await executeInSessionContainer(code, { timeout });

    if (result.success) {
      return {
        success: true,
        output: result.stdout,
        exitCode: result.exitCode,
      };
    } else {
      return {
        success: false,
        output: result.stdout,
        error: result.stderr || result.error,
        exitCode: result.exitCode,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      exitCode: -1,
    };
  }
}

/**
 * Cleanup function to stop the session container.
 * Call this when the MCP server is shutting down.
 */
export async function cleanupContainer(): Promise<void> {
  await cleanupSessionContainer();
}
