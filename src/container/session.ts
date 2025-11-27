import {
  startContainer,
  stopContainer,
  isContainerRunning,
  executeCode,
  installPackage,
  type ContainerResult,
  type ContainerInfo,
  type StartContainerOptions,
  type ExecOptions,
} from './manager.js';
import { ensureBaseImage } from './image.js';

/**
 * Session-scoped container management.
 * Provides lazy initialization and automatic cleanup of containers.
 */

/** Session state holding the active container */
interface SessionState {
  container: ContainerInfo | null;
  initialized: boolean;
}

/** Global session state */
const session: SessionState = {
  container: null,
  initialized: false,
};

/** Track if shutdown hook is registered */
let shutdownHookRegistered = false;

/**
 * Register process exit handlers to clean up container.
 */
function registerShutdownHook(): void {
  if (shutdownHookRegistered) {
    return;
  }

  const cleanup = async () => {
    if (session.container) {
      console.error('[container] Cleaning up session container on shutdown...');
      await stopContainer(session.container).catch(() => {});
      session.container = null;
    }
  };

  // Handle various exit signals
  process.on('exit', () => {
    // Synchronous cleanup - can't do async here
    if (session.container) {
      console.error('[container] Process exiting, container may need manual cleanup:', session.container.containerId);
    }
  });

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('[container] Uncaught exception:', error);
    await cleanup();
    process.exit(1);
  });

  shutdownHookRegistered = true;
}

/**
 * Get the current session container, creating one if necessary.
 * This implements lazy initialization - container is only started on first use.
 *
 * @param options - Container start options
 * @returns Container info or error
 */
export async function getOrCreateContainer(
  options: StartContainerOptions = {}
): Promise<{ success: boolean; container?: ContainerInfo; error?: string }> {
  // Register shutdown hook on first call
  registerShutdownHook();

  // If we have a container, check if it's still running
  if (session.container) {
    const running = await isContainerRunning(session.container.containerId);
    if (running) {
      return { success: true, container: session.container };
    }
    // Container died, clear state
    session.container = null;
    session.initialized = false;
  }

  // Ensure base image exists
  if (!session.initialized) {
    const imageResult = await ensureBaseImage();
    if (!imageResult.success) {
      return {
        success: false,
        error: imageResult.error,
      };
    }
    session.initialized = true;
  }

  // Start a new container
  const result = await startContainer(options);
  if (result.success && result.container) {
    session.container = result.container;
  }

  return result;
}

/**
 * Execute code in the session container.
 * Automatically creates container if not already running.
 *
 * @param code - TypeScript/JavaScript code to execute
 * @param options - Execution options
 * @returns Execution result
 */
export async function executeInSessionContainer(
  code: string,
  options: ExecOptions = {}
): Promise<ContainerResult & { error?: string }> {
  const containerResult = await getOrCreateContainer();
  if (!containerResult.success || !containerResult.container) {
    return {
      success: false,
      stdout: '',
      stderr: containerResult.error || 'Failed to get container',
      exitCode: -1,
      error: containerResult.error,
    };
  }

  return executeCode(containerResult.container, code, options);
}

/**
 * Install a package in the session container.
 * Automatically creates container if not already running.
 *
 * @param packageName - Name of the npm package to install
 * @returns Installation result
 */
export async function installPackageInSession(
  packageName: string
): Promise<ContainerResult & { error?: string }> {
  const containerResult = await getOrCreateContainer();
  if (!containerResult.success || !containerResult.container) {
    return {
      success: false,
      stdout: '',
      stderr: containerResult.error || 'Failed to get container',
      exitCode: -1,
      error: containerResult.error,
    };
  }

  return installPackage(containerResult.container.containerId, packageName);
}

/**
 * Get the current session container ID, if any.
 * Does not create a container if none exists.
 *
 * @returns Container ID or null
 */
export function getCurrentContainerId(): string | null {
  return session.container?.containerId ?? null;
}

/**
 * Explicitly stop and clean up the session container.
 * Usually not needed as shutdown hooks handle cleanup.
 */
export async function cleanupSessionContainer(): Promise<void> {
  if (session.container) {
    await stopContainer(session.container).catch(() => {});
    session.container = null;
  }
}

/**
 * Check if a session container is currently active.
 */
export function hasActiveContainer(): boolean {
  return session.container !== null;
}
