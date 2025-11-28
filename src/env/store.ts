import { watch, type FSWatcher } from 'node:fs';
import { ENV_FILE, ENV_VAR_PREFIX } from '../container/config.js';
import { cleanupSessionContainer } from '../container/session.js';
import { isContainerMode } from '../container/index.js';

/**
 * Environment variable store.
 * Loads env vars from:
 * 1. Process env vars with BUN_ prefix (from MCP config)
 * 2. .bun-runner-env file in DATA_DIR
 *
 * File vars take precedence over MCP config vars.
 */

/** Parsed environment variables available to sandboxed code */
let userEnvVars: Record<string, string> = {};

/** File watcher for hot reload */
let fileWatcher: FSWatcher | null = null;

/**
 * Parse a dotenv-style file content into key-value pairs.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE (handle quoted values)
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load env vars from MCP config (process.env with BUN_ prefix).
 * Strips the prefix when storing.
 */
function loadFromMcpConfig(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(ENV_VAR_PREFIX) && value !== undefined) {
      // Strip the BUN_ prefix
      const strippedKey = key.slice(ENV_VAR_PREFIX.length);
      if (strippedKey) {
        result[strippedKey] = value;
      }
    }
  }

  return result;
}

/**
 * Load env vars from the .bun-runner-env file.
 */
async function loadFromFile(): Promise<Record<string, string>> {
  try {
    const file = Bun.file(ENV_FILE);
    const content = await file.text();
    return parseEnvFile(content);
  } catch {
    // File doesn't exist or can't be read - that's OK
    return {};
  }
}

/**
 * Load all environment variables from both sources.
 * File vars take precedence over MCP config vars.
 */
export async function loadEnvVars(): Promise<void> {
  const mcpVars = loadFromMcpConfig();
  const fileVars = await loadFromFile();

  // Merge: file takes precedence
  userEnvVars = { ...mcpVars, ...fileVars };

  const mcpCount = Object.keys(mcpVars).length;
  const fileCount = Object.keys(fileVars).length;
  const totalCount = Object.keys(userEnvVars).length;

  if (totalCount > 0) {
    console.error(`[env] Loaded ${totalCount} env var(s): ${mcpCount} from MCP config, ${fileCount} from file`);
  }
}

/**
 * Get all loaded environment variables.
 */
export function getEnvVars(): Record<string, string> {
  return { ...userEnvVars };
}

/**
 * Get list of env var names (for AI visibility).
 */
export function getEnvVarNames(): string[] {
  return Object.keys(userEnvVars);
}

/**
 * Start watching the env file for changes.
 * On change, reloads vars and restarts container if in container mode.
 */
export function watchEnvFile(): void {
  if (fileWatcher) return; // Already watching

  try {
    fileWatcher = watch(ENV_FILE, async (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        console.error('[env] File changed, reloading...');
        await loadEnvVars();

        // Restart container if in container mode
        if (isContainerMode()) {
          console.error('[env] Restarting container to apply new env vars...');
          await cleanupSessionContainer();
        }
      }
    });
    console.error(`[env] Watching ${ENV_FILE} for changes`);
  } catch {
    // File doesn't exist yet - that's OK, we'll try again if needed
    console.error(`[env] File ${ENV_FILE} not found, skipping watch`);
  }
}

/**
 * Stop watching the env file.
 */
export function unwatchEnvFile(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

/**
 * Get all env vars with their values (for web UI).
 */
export function getAllEnvVars(): Record<string, string> {
  return { ...userEnvVars };
}

/**
 * Serialize env vars to dotenv format.
 */
function serializeEnvFile(vars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    // Quote values that contain special characters
    if (value.includes(' ') || value.includes('"') || value.includes("'") || value.includes('\n')) {
      lines.push(`${key}="${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Set or update an environment variable.
 * Writes to the env file and updates in-memory store.
 */
export async function setEnvVar(name: string, value: string): Promise<void> {
  // Validate name (alphanumeric, underscores)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid env var name: ${name}. Must be alphanumeric with underscores, starting with a letter or underscore.`);
  }

  // Load current file vars (not including MCP config vars)
  const fileVars = await loadFromFile();
  fileVars[name] = value;

  // Write back to file
  const content = serializeEnvFile(fileVars);
  await Bun.write(ENV_FILE, content);

  // Update in-memory store directly (avoid Bun.file caching issues)
  userEnvVars[name] = value;
  console.error(`[env] Set ${name}, now have ${Object.keys(userEnvVars).length} vars`);
}

/**
 * Delete an environment variable.
 * Only deletes from file; MCP config vars cannot be deleted.
 * @returns true if deleted, false if not found in file
 */
export async function deleteEnvVar(name: string): Promise<boolean> {
  // Load current file vars
  const fileVars = await loadFromFile();

  if (!(name in fileVars)) {
    return false;
  }

  delete fileVars[name];

  // Write back to file
  const content = serializeEnvFile(fileVars);
  await Bun.write(ENV_FILE, content);

  // Update in-memory store directly
  delete userEnvVars[name];
  console.error(`[env] Deleted ${name}, now have ${Object.keys(userEnvVars).length} vars`);
  return true;
}

