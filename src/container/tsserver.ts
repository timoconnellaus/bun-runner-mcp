import { spawn } from 'bun';
import type { Subprocess } from 'bun';
import { CONTAINER_CLI, CONTAINER_PATHS } from './config.js';

/**
 * TypeScript Language Server manager for fast incremental type checking.
 * Keeps a tsserver process running in the container for ~50-200ms diagnostics
 * after initial startup (~2-3s).
 */

/** Response from tsserver */
interface TsServerResponse {
  seq: number;
  type: 'response' | 'event';
  command?: string;
  request_seq?: number;
  success?: boolean;
  body?: any;
  message?: string;
  event?: string;
}

/** Diagnostic message from tsserver (with includeLinePosition: true) */
interface TsDiagnostic {
  start: number; // Character position
  length: number;
  message: string;
  code: number;
  category: string;
  source?: string;
  startLocation: { line: number; offset: number };
  endLocation: { line: number; offset: number };
}

/** Result of getDiagnostics */
export interface DiagnosticsResult {
  success: boolean;
  errors: string[];
  diagnostics: TsDiagnostic[];
}

/** Quick info result from tsserver */
export interface QuickInfo {
  kind: string;
  kindModifiers: string;
  displayString: string;
  documentation?: string;
}

/** Exported function type information */
export interface ExportedFunction {
  name: string;
  typeSignature: string;
  documentation?: string;
}

/**
 * TsServer instance managing a long-running TypeScript language server process.
 */
export class TsServer {
  private process: Subprocess | null = null;
  private containerId: string;
  private seqNumber = 0;
  private responseBuffer = '';
  private pendingResponses = new Map<number, {
    resolve: (response: TsServerResponse) => void;
    reject: (error: Error) => void;
  }>();
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;

  constructor(containerId: string) {
    this.containerId = containerId;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Start the tsserver process inside the container.
   * Initial startup takes ~2-3s as tsserver initializes.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('TsServer already started');
    }

    // Start tsserver in the container with JSON protocol
    // Use the installed typescript package's tsserver binary directly
    // Note: `bun x tsserver` doesn't work - it tries to download a non-existent "tsserver" package
    const proc = spawn({
      cmd: [
        CONTAINER_CLI,
        'exec',
        '-i', // Keep stdin open for interactive communication
        '--workdir', CONTAINER_PATHS.code,
        this.containerId,
        `${CONTAINER_PATHS.packages}/node_modules/.bin/tsserver`,
        '--useInferredProjectPerProjectRoot',
      ],
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    this.process = proc;

    // Set up stdout reader to parse JSON responses
    this.startReadingResponses();

    // Wait a bit for tsserver to initialize
    // The server should send initial events when ready
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.isReady = true;
    if (this.readyResolve) {
      this.readyResolve();
    }
  }

  /**
   * Read and parse JSON responses from tsserver stdout.
   */
  private async startReadingResponses(): Promise<void> {
    if (!this.process?.stdout) {
      return;
    }

    try {
      // Read from stdout stream
      const stdout = this.process.stdout;
      if (typeof stdout === 'number') {
        throw new Error('Expected ReadableStream for stdout');
      }

      const reader = stdout.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer and process complete messages
        this.responseBuffer += decoder.decode(value, { stream: true });
        this.processResponseBuffer();
      }
    } catch (error) {
      console.error('[tsserver] Error reading responses:', error);
    }
  }

  /**
   * Process the response buffer and extract complete JSON messages.
   * tsserver sends messages in format: Content-Length: N\n\n{json}
   */
  private processResponseBuffer(): void {
    while (true) {
      // Look for Content-Length header
      const headerMatch = this.responseBuffer.match(/Content-Length: (\d+)\r?\n\r?\n/);
      if (!headerMatch) {
        break;
      }

      const contentLength = parseInt(headerMatch[1], 10);
      const headerLength = headerMatch[0].length;
      const messageStart = headerMatch.index! + headerLength;
      const messageEnd = messageStart + contentLength;

      // Check if we have the complete message
      if (this.responseBuffer.length < messageEnd) {
        break;
      }

      // Extract the JSON message
      const messageText = this.responseBuffer.slice(messageStart, messageEnd);
      this.responseBuffer = this.responseBuffer.slice(messageEnd);

      try {
        const response: TsServerResponse = JSON.parse(messageText);
        this.handleResponse(response);
      } catch (error) {
        console.error('[tsserver] Failed to parse response:', error, messageText);
      }
    }
  }

  /**
   * Handle a parsed response from tsserver.
   */
  private handleResponse(response: TsServerResponse): void {
    if (response.type === 'response' && response.request_seq !== undefined) {
      const pending = this.pendingResponses.get(response.request_seq);
      if (pending) {
        this.pendingResponses.delete(response.request_seq);
        if (response.success === false) {
          pending.reject(new Error(response.message || 'Request failed'));
        } else {
          pending.resolve(response);
        }
      }
    }
    // Ignore events for now (like 'projectLoadingStart', 'projectLoadingFinish', etc.)
  }

  /**
   * Send a command to tsserver and wait for the response.
   */
  private async sendCommand(command: string, args: any): Promise<TsServerResponse> {
    if (!this.process || !this.isReady) {
      throw new Error('TsServer not started or not ready');
    }

    await this.readyPromise;

    const seq = ++this.seqNumber;
    const request = {
      seq,
      type: 'request',
      command,
      arguments: args,
    };

    const requestJson = JSON.stringify(request) + '\n';

    return new Promise((resolve, reject) => {
      this.pendingResponses.set(seq, { resolve, reject });

      // Set timeout for response
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(seq);
        reject(new Error(`Request timeout for command: ${command}`));
      }, 10000);

      // Send request to tsserver stdin
      if (this.process?.stdin) {
        const stdin = this.process.stdin;
        if (typeof stdin === 'number') {
          clearTimeout(timeout);
          this.pendingResponses.delete(seq);
          reject(new Error('Expected FileSink for stdin'));
          return;
        }

        // Use Bun's FileSink.write method
        try {
          stdin.write(requestJson);
        } catch (error) {
          clearTimeout(timeout);
          this.pendingResponses.delete(seq);
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      } else {
        clearTimeout(timeout);
        this.pendingResponses.delete(seq);
        reject(new Error('TsServer stdin not available'));
        return;
      }

      // Clear timeout when we get a response
      const originalResolve = resolve;
      this.pendingResponses.get(seq)!.resolve = (response) => {
        clearTimeout(timeout);
        originalResolve(response);
      };
    });
  }

  /**
   * Open a file in tsserver for type checking.
   */
  private async openFile(filePath: string): Promise<void> {
    await this.sendCommand('open', {
      file: filePath,
    });
  }

  /**
   * Close a file in tsserver.
   */
  private async closeFile(filePath: string): Promise<void> {
    try {
      await this.sendCommand('close', {
        file: filePath,
      });
    } catch (error) {
      // Ignore errors when closing files
      console.error('[tsserver] Error closing file:', error);
    }
  }

  /**
   * Get quick info (type information) at a specific position in a file.
   *
   * @param filePath - Absolute path to the file
   * @param line - 1-based line number
   * @param offset - 1-based character offset
   * @returns Quick info or null if not available
   */
  async getQuickInfo(filePath: string, line: number, offset: number): Promise<QuickInfo | null> {
    try {
      // Open the file first
      await this.openFile(filePath);

      // Get quick info at position
      const response = await this.sendCommand('quickinfo', {
        file: filePath,
        line,
        offset,
      });

      // Close the file
      await this.closeFile(filePath);

      if (!response.body) {
        return null;
      }

      return {
        kind: response.body.kind || '',
        kindModifiers: response.body.kindModifiers || '',
        displayString: response.body.displayString || '',
        documentation: response.body.documentation || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get navigation tree for a file (symbols and their positions).
   *
   * @param filePath - Absolute path to the file
   * @returns Navigation tree response
   */
  async getNavigationTree(filePath: string): Promise<any> {
    try {
      await this.openFile(filePath);
      const response = await this.sendCommand('navtree', {
        file: filePath,
      });
      await this.closeFile(filePath);
      return response.body;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get type signatures for all exported functions in a file.
   *
   * @param filePath - Absolute path to the file
   * @returns Array of exported function signatures
   */
  async getExportedFunctionTypes(filePath: string): Promise<ExportedFunction[]> {
    const functions: ExportedFunction[] = [];

    try {
      // Open file for analysis
      await this.openFile(filePath);

      // Get navigation tree to find exported items
      const navTree = await this.sendCommand('navtree', {
        file: filePath,
      });

      if (!navTree.body || !navTree.body.childItems) {
        await this.closeFile(filePath);
        return functions;
      }

      // Find exported functions from navigation tree
      const processItem = async (item: any): Promise<void> => {
        // Check for function declarations that are exported
        if (item.kind === 'function' && item.kindModifiers?.includes('export')) {
          // Get type info at the function position
          const quickInfo = await this.sendCommand('quickinfo', {
            file: filePath,
            line: item.spans[0]?.start?.line || 1,
            offset: item.spans[0]?.start?.offset || 1,
          });

          if (quickInfo.body) {
            functions.push({
              name: item.text,
              typeSignature: quickInfo.body.displayString || '',
              documentation: quickInfo.body.documentation || undefined,
            });
          }
        }

        // Process child items recursively
        if (item.childItems) {
          for (const child of item.childItems) {
            await processItem(child);
          }
        }
      };

      // Process all items in the tree
      for (const item of navTree.body.childItems) {
        await processItem(item);
      }

      await this.closeFile(filePath);
      return functions;
    } catch (error) {
      console.error('[tsserver] Error getting exported function types:', error);
      return functions;
    }
  }

  /**
   * Get semantic diagnostics (type errors) for a file.
   * This is fast (~50-200ms) after initial startup.
   *
   * @param filePath - Absolute path to the file in container (e.g., /code/test.ts)
   * @returns Diagnostics result with errors and raw diagnostics
   */
  async getDiagnostics(filePath: string): Promise<DiagnosticsResult> {
    try {
      // Open the file first
      await this.openFile(filePath);

      // Get semantic diagnostics
      const response = await this.sendCommand('semanticDiagnosticsSync', {
        file: filePath,
        includeLinePosition: true,
      });

      // Close the file to free resources
      await this.closeFile(filePath);

      const diagnostics: TsDiagnostic[] = response.body || [];

      // Format errors for display
      const errors = diagnostics.map((diag) => {
        const line = diag.startLocation.line;
        const col = diag.startLocation.offset;
        const category = diag.category.toLowerCase();
        return `${filePath}(${line},${col}): ${category} TS${diag.code}: ${diag.message}`;
      });

      return {
        success: diagnostics.length === 0,
        errors,
        diagnostics,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        diagnostics: [],
      };
    }
  }

  /**
   * Stop the tsserver process and clean up.
   */
  async stop(): Promise<void> {
    if (this.process) {
      try {
        // Send exit command to gracefully shut down
        await this.sendCommand('exit', {});
      } catch (error) {
        // Ignore errors during shutdown
      }

      // Kill the process if it's still running
      try {
        this.process.kill();
        await this.process.exited;
      } catch (error) {
        // Ignore errors
      }

      this.process = null;
      this.isReady = false;
      this.pendingResponses.clear();
      this.responseBuffer = '';
    }
  }

  /**
   * Check if tsserver is running.
   */
  isRunning(): boolean {
    return this.process !== null && this.isReady;
  }
}

/**
 * Map of container ID to TsServer instance.
 * Allows reusing tsserver across multiple code executions.
 */
const tsservers = new Map<string, TsServer>();

/**
 * Get or create a TsServer instance for a container.
 *
 * @param containerId - ID of the container
 * @returns TsServer instance
 */
export async function getTsServer(containerId: string): Promise<TsServer> {
  let server = tsservers.get(containerId);

  if (!server || !server.isRunning()) {
    server = new TsServer(containerId);
    await server.start();
    tsservers.set(containerId, server);
  }

  return server;
}

/**
 * Stop and remove the TsServer instance for a container.
 *
 * @param containerId - ID of the container
 */
export async function stopTsServer(containerId: string): Promise<void> {
  const server = tsservers.get(containerId);
  if (server) {
    await server.stop();
    tsservers.delete(containerId);
  }
}

/**
 * Get type diagnostics for a file using tsserver.
 * Automatically manages tsserver lifecycle.
 *
 * @param containerId - ID of the container
 * @param filePath - Path to the file in container (e.g., /code/test.ts)
 * @returns Diagnostics result
 */
export async function getDiagnostics(
  containerId: string,
  filePath: string
): Promise<DiagnosticsResult> {
  const server = await getTsServer(containerId);
  return server.getDiagnostics(filePath);
}
