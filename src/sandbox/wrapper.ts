// Generates the code wrapper that sets up the sandbox environment

export interface WrapOptions {
  timeout?: number;
  proxyUrl?: string;
  captureConsole?: boolean;
}

/**
 * Wraps user code with sandbox setup and error handling.
 * Returns executable code that can be run with bun --preload.
 *
 * @param code - User code to execute
 * @param options - Configuration options
 * @returns Wrapped code string
 */
export function wrapUserCode(code: string, options?: WrapOptions): string {
  const {
    timeout = 30000, // 30 second default timeout
    proxyUrl: _proxyUrl = 'http://localhost:9998', // Reserved for future use
    captureConsole = true,
  } = options || {};

  return `
// ============================================================================
// SANDBOX WRAPPER - Generated code
// ============================================================================

(async () => {
  // Set up timeout
  const timeoutMs = ${timeout};
  let timeoutHandle: Timer | null = null;

  if (timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      console.error(\`Execution timeout after \${timeoutMs}ms\`);
      process.exit(124); // Timeout exit code
    }, timeoutMs);
  }

  // Console capture setup
  ${captureConsole ? `
  const consoleOutput: Array<{ type: string; args: unknown[] }> = [];
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  console.log = (...args: unknown[]) => {
    consoleOutput.push({ type: 'log', args });
    originalConsole.log(...args);
  };

  console.error = (...args: unknown[]) => {
    consoleOutput.push({ type: 'error', args });
    originalConsole.error(...args);
  };

  console.warn = (...args: unknown[]) => {
    consoleOutput.push({ type: 'warn', args });
    originalConsole.warn(...args);
  };

  console.info = (...args: unknown[]) => {
    consoleOutput.push({ type: 'info', args });
    originalConsole.info(...args);
  };

  console.debug = (...args: unknown[]) => {
    consoleOutput.push({ type: 'debug', args });
    originalConsole.debug(...args);
  };
  ` : ''}

  try {
    // ========================================================================
    // USER CODE START
    // ========================================================================

${code.split('\n').map(line => '    ' + line).join('\n')}

    // ========================================================================
    // USER CODE END
    // ========================================================================

    // Clear timeout on success
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Output console capture if enabled
    ${captureConsole ? `
    if (consoleOutput.length > 0) {
      console.log('\\n--- Console Output ---');
      for (const entry of consoleOutput) {
        originalConsole[entry.type as keyof typeof originalConsole](...entry.args);
      }
    }
    ` : ''}

    process.exit(0);
  } catch (error) {
    // Clear timeout on error
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Format and output error
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PERMISSION_DENIED') {
      // Permission error - format as JSON for easy parsing
      console.error('\\n--- Permission Error ---');
      console.error(JSON.stringify({
        type: 'PermissionError',
        code: error.code,
        requiredPermission: (error as any).requiredPermission,
        requestId: (error as any).requestId,
        attemptedAction: (error as any).attemptedAction,
        message: (error as Error).message,
      }, null, 2));
      process.exit(1);
    } else if (error instanceof Error) {
      // Regular error
      console.error('\\n--- Error ---');
      console.error(\`\${error.name}: \${error.message}\`);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    } else {
      // Unknown error
      console.error('\\n--- Unknown Error ---');
      console.error(String(error));
      process.exit(1);
    }
  }
})();
`.trim();
}

/**
 * Extracts permission error from stderr output.
 * Looks for JSON-formatted permission errors in the stderr.
 *
 * @param stderr - Standard error output from execution
 * @returns Parsed permission error or null
 */
export function extractPermissionError(stderr: string): {
  code: 'PERMISSION_DENIED';
  requiredPermission: unknown;
  requestId: string;
  attemptedAction?: unknown;
  message: string;
} | null {
  try {
    // Look for JSON object in stderr
    const jsonMatch = stderr.match(/\{[\s\S]*"type"\s*:\s*"PermissionError"[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const errorData = JSON.parse(jsonMatch[0]);
    if (errorData.type === 'PermissionError' && errorData.code === 'PERMISSION_DENIED') {
      return {
        code: errorData.code,
        requiredPermission: errorData.requiredPermission,
        requestId: errorData.requestId,
        attemptedAction: errorData.attemptedAction,
        message: errorData.message,
      };
    }
  } catch {
    // Failed to parse, not a permission error
  }

  return null;
}
