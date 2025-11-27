/**
 * Container runtime module for Apple Containers.
 * Provides VM-level isolation for code execution with npm package support.
 */

// Configuration
export {
  DATA_DIR,
  PACKAGE_CACHE_DIR,
  NODE_MODULES_DIR,
  BASE_IMAGE_NAME,
  BASE_IMAGE_REFERENCE,
  CONTAINER_CLI,
  RESOURCE_LIMITS,
  EXECUTION_TIMEOUT_MS,
  CONTAINER_PATHS,
  CONTAINER_ENV,
  type ExecutionMode,
  getExecutionMode,
  isContainerMode,
} from './config.js';

// Image management
export {
  isContainerCliAvailable,
  baseImageExists,
  buildBaseImage,
  ensureBaseImage,
} from './image.js';

// Container lifecycle
export {
  type ContainerResult,
  type ContainerInfo,
  type StartContainerOptions,
  type ExecOptions,
  startContainer,
  execInContainer,
  executeCode,
  stopContainer,
  isContainerRunning,
  installPackage,
} from './manager.js';

// Session management
export {
  getOrCreateContainer,
  executeInSessionContainer,
  installPackageInSession,
  getCurrentContainerId,
  cleanupSessionContainer,
  hasActiveContainer,
} from './session.js';

// Package management
export {
  parseImports,
  ensureCacheDirectory,
  isPackageInstalled,
  getInstalledPackages,
  resolvePackages,
  type PackageResolutionResult,
} from './packages.js';

// TypeScript Language Server
export {
  type DiagnosticsResult,
  TsServer,
  getTsServer,
  stopTsServer,
  getDiagnostics,
} from './tsserver.js';
