import { spawn } from 'bun';
import { mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CONTAINER_CLI,
  BASE_IMAGE_NAME,
  PACKAGE_CACHE_DIR,
  CONTAINER_PATHS,
  CONTAINER_ENV,
  RESOURCE_LIMITS,
  EXECUTION_TIMEOUT_MS,
} from './config.js';
import { getDiagnostics, stopTsServer } from './tsserver.js';

/**
 * Bun configuration for package caching.
 * Uses the mounted /packages volume for persistent cache across executions.
 */
const BUNFIG_CONTENT = `[install.cache]
# Use mounted volume for persistent package cache
dir = "${CONTAINER_PATHS.packages}/cache"
# Disable manifest to always resolve latest versions
disableManifest = true
`;

/**
 * TypeScript configuration for type checking.
 * Uses incremental mode with cache stored in /packages for persistence.
 */
const TSCONFIG_CONTENT = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "tsBuildInfoFile": "${CONTAINER_PATHS.packages}/.tsbuildinfo",
    "typeRoots": ["${CONTAINER_PATHS.packages}/node_modules/@types", "${CONTAINER_PATHS.packages}/node_modules"],
    "types": ["bun-types"]
  },
  "include": ["./*.ts"]
}
`;

/**
 * Container lifecycle management for Apple Containers.
 * Handles starting, executing in, and stopping containers.
 */

/** Result of a container operation */
export interface ContainerResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Options for starting a container */
export interface StartContainerOptions {
  /** Custom resource limits */
  cpus?: number;
  memoryMB?: number;
}

/** Info about a running container */
export interface ContainerInfo {
  /** Container name/ID */
  containerId: string;
  /** Host path for code files (mounted to /code in container) */
  codeDir: string;
}

/** Options for executing code in a container */
export interface ExecOptions {
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Working directory inside container */
  workdir?: string;
}

/**
 * Execute a container CLI command with optional timeout.
 */
async function runContainerCommand(
  args: string[],
  options: { timeout?: number } = {}
): Promise<ContainerResult> {
  const { timeout } = options;

  const proc = spawn({
    cmd: [CONTAINER_CLI, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Set up timeout if specified
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout) {
    timeoutId = setTimeout(() => {
      proc.kill();
    }, timeout);
  }

  const exitCode = await proc.exited;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return {
    success: exitCode === 0,
    stdout,
    stderr,
    exitCode,
  };
}

/**
 * Start a new container from the base image.
 * Container runs in detached mode with volume mounts.
 *
 * @param options - Container start options
 * @returns Container info if successful, error otherwise
 */
export async function startContainer(
  options: StartContainerOptions = {}
): Promise<{ success: boolean; container?: ContainerInfo; error?: string }> {
  const { cpus = RESOURCE_LIMITS.cpus, memoryMB = RESOURCE_LIMITS.memoryMB } = options;

  // Generate container name upfront - this is what we'll use to reference it
  const containerId = `bun-runner-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Ensure package cache directory exists
    await mkdir(PACKAGE_CACHE_DIR, { recursive: true });

    // Create temp directory for code files on host
    const codeDir = join(tmpdir(), `bun-runner-code-${containerId}`);
    await mkdir(codeDir, { recursive: true });

    // Write bunfig.toml for Bun's package cache configuration
    await writeFile(join(codeDir, 'bunfig.toml'), BUNFIG_CONTENT, 'utf-8');

    // Write tsconfig.json for TypeScript type checking
    await writeFile(join(codeDir, 'tsconfig.json'), TSCONFIG_CONTENT, 'utf-8');

    // Build container run command
    const args = [
      'run',
      '--detach',
      '--name', containerId,
      // Volume mounts
      '--volume', `${PACKAGE_CACHE_DIR}:${CONTAINER_PATHS.packages}`,
      '--volume', `${codeDir}:${CONTAINER_PATHS.code}`,
      // Resource limits
      '--cpus', String(cpus),
      '--memory', `${memoryMB}m`,
      // Environment variables
      ...Object.entries(CONTAINER_ENV).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
      // Base image
      BASE_IMAGE_NAME,
      // Keep container running with sleep infinity
      'sleep',
      'infinity',
    ];

    const result = await runContainerCommand(args);

    if (!result.success) {
      // Clean up the code directory on failure
      await rm(codeDir, { recursive: true, force: true }).catch(() => {});
      return {
        success: false,
        error: `Failed to start container: ${result.stderr}`,
      };
    }

    // Ensure bun-types and typescript are installed for type checking
    // Install to /packages so it persists across container sessions
    const installResult = await runContainerCommand(
      ['exec', containerId, 'bun', 'install', '--cwd', CONTAINER_PATHS.packages, 'bun-types', 'typescript'],
      { timeout: 60000 }
    );

    if (!installResult.success) {
      console.error('[container] Warning: Failed to install bun-types:', installResult.stderr);
      // Continue anyway - type checking will work without bun-specific types
    }

    return {
      success: true,
      container: {
        containerId,
        codeDir,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a command inside a running container.
 *
 * @param containerId - ID of the container
 * @param command - Command and arguments to execute
 * @param options - Execution options
 * @returns Execution result
 */
export async function execInContainer(
  containerId: string,
  command: string[],
  options: ExecOptions = {}
): Promise<ContainerResult> {
  const { timeout = EXECUTION_TIMEOUT_MS, workdir } = options;

  const args = [
    'exec',
    ...(workdir ? ['--workdir', workdir] : []),
    containerId,
    ...command,
  ];

  return runContainerCommand(args, { timeout });
}

/**
 * Execute code inside a running container.
 * Writes code to the host-mounted volume, executes it with Bun, then cleans up.
 *
 * @param container - Container info with ID and code directory
 * @param code - TypeScript/JavaScript code to execute
 * @param options - Execution options
 * @returns Execution result
 */
export async function executeCode(
  container: ContainerInfo,
  code: string,
  options: ExecOptions = {}
): Promise<ContainerResult> {
  const { timeout = EXECUTION_TIMEOUT_MS } = options;
  const filename = `code-${crypto.randomUUID()}.ts`;
  const hostPath = join(container.codeDir, filename);
  const containerPath = `${CONTAINER_PATHS.code}/${filename}`;

  try {
    // Write code to host-mounted volume
    await writeFile(hostPath, code, 'utf-8');

    // Type-check the code using tsserver for fast incremental checking
    // After initial startup (~2-3s), subsequent checks are ~50-200ms
    const diagnostics = await getDiagnostics(container.containerId, containerPath);

    if (!diagnostics.success) {
      // Clean up and return type errors
      await unlink(hostPath).catch(() => {});
      const errors = diagnostics.errors.join('\n');
      return {
        success: false,
        stdout: '',
        stderr: `TypeScript error:\n${errors}`,
        exitCode: 1,
      };
    }

    // Execute the code with Bun inside container
    const result = await execInContainer(
      container.containerId,
      ['bun', 'run', containerPath],
      { timeout, workdir: CONTAINER_PATHS.code }
    );

    // Clean up the code file
    await unlink(hostPath).catch(() => {});

    return result;
  } catch (error) {
    // Clean up on error
    await unlink(hostPath).catch(() => {});

    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: -1,
    };
  }
}

/**
 * Stop and remove a container.
 *
 * @param container - Container info
 * @returns Success status
 */
export async function stopContainer(
  container: ContainerInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    // Stop the tsserver if running
    await stopTsServer(container.containerId);

    // Stop the container
    const stopResult = await runContainerCommand(['stop', container.containerId], { timeout: 10000 });

    // Remove the container
    const rmResult = await runContainerCommand(['rm', container.containerId], { timeout: 5000 });

    // Clean up the code directory
    await rm(container.codeDir, { recursive: true, force: true }).catch(() => {});

    if (!stopResult.success && !rmResult.success) {
      return {
        success: false,
        error: `Failed to stop/remove container: ${stopResult.stderr || rmResult.stderr}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a container is running and healthy.
 *
 * @param containerId - ID of the container to check
 * @returns true if container is running
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const result = await runContainerCommand(['inspect', containerId]);
    if (!result.success) {
      return false;
    }
    // Check if the container state indicates running
    return result.stdout.includes('"Running": true') ||
           result.stdout.includes('running') ||
           result.stdout.includes('Running');
  } catch {
    return false;
  }
}

/**
 * Install a package inside the container using Bun.
 *
 * @param containerId - ID of the container
 * @param packageName - Name of the npm package to install
 * @returns Installation result
 */
export async function installPackage(
  containerId: string,
  packageName: string
): Promise<ContainerResult> {
  return execInContainer(
    containerId,
    ['bun', 'install', packageName],
    { timeout: 60000, workdir: CONTAINER_PATHS.packages }
  );
}
