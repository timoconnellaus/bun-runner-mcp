import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Container runtime configuration.
 * Centralizes all paths, defaults, and resource limits.
 */

/** Base directory for all bun-runner-mcp data */
export const DATA_DIR = join(homedir(), '.bun-runner-mcp');

/** Directory for cached npm packages */
export const PACKAGE_CACHE_DIR = join(DATA_DIR, 'packages');

/** Directory for package node_modules inside cache */
export const NODE_MODULES_DIR = join(PACKAGE_CACHE_DIR, 'node_modules');

/** Name of the base container image with Bun pre-installed */
export const BASE_IMAGE_NAME = 'oven/bun:alpine';

/** Docker Hub reference for pulling the base image */
export const BASE_IMAGE_REFERENCE = 'docker.io/oven/bun:alpine';

/** Container CLI binary name */
export const CONTAINER_CLI = 'container';

/** Resource limits for container execution */
export const RESOURCE_LIMITS = {
  /** Number of CPUs allocated to container */
  cpus: 2,
  /** Memory limit in megabytes */
  memoryMB: 512,
} as const;

/** Execution timeout in milliseconds */
export const EXECUTION_TIMEOUT_MS = 30000;

/** Directory for stored snippets */
export const SNIPPETS_DIR = join(DATA_DIR, 'snippets');

/** Container paths for volume mounts */
export const CONTAINER_PATHS = {
  /** Mount point for package cache inside container */
  packages: '/packages',
  /** Mount point for code files inside container */
  code: '/code',
  /** Mount point for snippets inside container */
  snippets: '/.bun-runner-mcp/snippets',
} as const;

/** Environment variables set inside container */
export const CONTAINER_ENV = {
  /** Bun install cache directory */
  BUN_INSTALL_CACHE_DIR: CONTAINER_PATHS.packages,
  /** Node modules path */
  NODE_PATH: `${CONTAINER_PATHS.packages}/node_modules`,
} as const;

/** Execution mode - preload (default) or container */
export type ExecutionMode = 'preload' | 'container';

/**
 * Get execution mode from environment variable.
 * @returns 'container' if EXECUTION_MODE=container, 'preload' otherwise
 */
export function getExecutionMode(): ExecutionMode {
  const mode = process.env.EXECUTION_MODE?.toLowerCase();
  return mode === 'container' ? 'container' : 'preload';
}

/**
 * Check if container execution mode is enabled.
 */
export function isContainerMode(): boolean {
  return getExecutionMode() === 'container';
}
