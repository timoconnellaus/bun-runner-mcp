import { spawn } from 'bun';
import { BASE_IMAGE_NAME, BASE_IMAGE_REFERENCE, CONTAINER_CLI } from './config.js';

/**
 * Base image management for Apple Containers.
 * Handles checking for existing images and pulling from Docker Hub.
 */

/** Result of spawning a container command */
interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a container CLI command.
 */
async function runContainerCommand(args: string[]): Promise<CommandResult> {
  const proc = spawn({
    cmd: [CONTAINER_CLI, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
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
 * Check if the container CLI is available.
 * @returns true if container CLI exists and is executable
 */
export async function isContainerCliAvailable(): Promise<boolean> {
  try {
    const result = await runContainerCommand(['--version']);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Check if the base image exists.
 * Apple Container CLI lists images as "NAME TAG DIGEST" format.
 * We check for 'oven/bun' and 'alpine' in the output.
 * @returns true if base image is available
 */
export async function baseImageExists(): Promise<boolean> {
  try {
    const result = await runContainerCommand(['image', 'list']);
    if (!result.success) {
      return false;
    }
    // Check if oven/bun:alpine appears in the image list
    // The output format is: NAME TAG DIGEST
    // So we check for both 'oven/bun' and 'alpine' on the same line
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.includes('oven/bun') && line.includes('alpine')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Pull the base container image from Docker Hub.
 * Uses oven/bun:alpine which has Bun pre-installed.
 * @returns Result with success status and any error message
 */
export async function buildBaseImage(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if CLI is available
    const cliAvailable = await isContainerCliAvailable();
    if (!cliAvailable) {
      return {
        success: false,
        error: 'Apple Container CLI (container) is not available. Ensure macOS 26+ or source build is installed.',
      };
    }

    // Check if image already exists
    const exists = await baseImageExists();
    if (exists) {
      return { success: true };
    }

    // Pull the pre-built Bun image from Docker Hub
    // Apple Container CLI supports pulling OCI images directly
    const pullResult = await runContainerCommand([
      'image',
      'pull',
      BASE_IMAGE_REFERENCE,
    ]);

    if (!pullResult.success) {
      return {
        success: false,
        error: `Failed to pull base image: ${pullResult.stderr}`,
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
 * Ensure the base image is available, pulling it if necessary.
 * @returns Result with success status and any error message
 */
export async function ensureBaseImage(): Promise<{ success: boolean; error?: string }> {
  const exists = await baseImageExists();
  if (exists) {
    return { success: true };
  }
  return buildBaseImage();
}
