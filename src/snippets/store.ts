import { mkdir, readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SNIPPETS_DIR } from '../container/config.js';

/**
 * Snippet storage and management.
 * Persists code snippets to ~/.bun-runner-mcp/snippets/
 */

export { SNIPPETS_DIR };

/** Snippet metadata extracted from JSDoc */
export interface SnippetMetadata {
  name: string;
  description: string;
}

/** Full snippet with code and metadata */
export interface Snippet extends SnippetMetadata {
  code: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Regex for valid snippet names: alphanumeric, hyphen, underscore */
const VALID_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Regex to extract @description from JSDoc */
const DESCRIPTION_REGEX = /\/\*\*[\s\S]*?@description\s+([^\n*]+)[\s\S]*?\*\//;

/**
 * Validate snippet name.
 * Names must be alphanumeric with hyphens or underscores.
 */
export function validateSnippetName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Snippet name is required' };
  }

  if (!VALID_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error: 'Snippet name must contain only alphanumeric characters, hyphens, or underscores',
    };
  }

  return { valid: true };
}

/**
 * Extract @description from JSDoc comment in code.
 */
export function extractDescription(code: string): string | null {
  const match = code.match(DESCRIPTION_REGEX);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Validate snippet code.
 * Code must contain a JSDoc with @description tag.
 */
export function validateSnippetCode(code: string): ValidationResult {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Snippet code is required' };
  }

  const description = extractDescription(code);
  if (!description) {
    return {
      valid: false,
      error: 'Snippet must contain a JSDoc comment with @description tag. Example: /** @description Fetches weather data */',
    };
  }

  return { valid: true };
}

/**
 * SnippetStore manages persistent storage of code snippets.
 */
export class SnippetStore {
  private snippetsDir: string;

  constructor(snippetsDir: string = SNIPPETS_DIR) {
    this.snippetsDir = snippetsDir;
  }

  /**
   * Ensure the snippets directory exists.
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.snippetsDir, { recursive: true });
  }

  /**
   * Get the file path for a snippet.
   */
  private getSnippetPath(name: string): string {
    return join(this.snippetsDir, `${name}.ts`);
  }

  /**
   * Save a snippet to disk.
   * @param name - Snippet name (alphanumeric, hyphens, underscores)
   * @param code - TypeScript code with JSDoc @description
   * @returns Success status and any error
   */
  async save(name: string, code: string): Promise<{ success: boolean; error?: string }> {
    // Validate name
    const nameValidation = validateSnippetName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    // Validate code
    const codeValidation = validateSnippetCode(code);
    if (!codeValidation.valid) {
      return { success: false, error: codeValidation.error };
    }

    try {
      await this.ensureDir();
      const filePath = this.getSnippetPath(name);
      await writeFile(filePath, code, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all snippets with their names and descriptions.
   */
  async list(): Promise<{ snippets: SnippetMetadata[]; error?: string }> {
    try {
      await this.ensureDir();
      const files = await readdir(this.snippetsDir);
      const snippets: SnippetMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith('.ts')) continue;

        const name = file.slice(0, -3); // Remove .ts extension
        const filePath = this.getSnippetPath(name);

        try {
          const code = await readFile(filePath, 'utf-8');
          const description = extractDescription(code) || 'No description';
          snippets.push({ name, description });
        } catch {
          // Skip files we can't read
        }
      }

      return { snippets };
    } catch (error) {
      return {
        snippets: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get a snippet by name.
   * @param name - Snippet name
   * @returns Snippet with code and metadata, or error
   */
  async get(name: string): Promise<{ snippet?: Snippet; error?: string }> {
    const nameValidation = validateSnippetName(name);
    if (!nameValidation.valid) {
      return { error: nameValidation.error };
    }

    try {
      const filePath = this.getSnippetPath(name);

      // Check if file exists
      try {
        await stat(filePath);
      } catch {
        return { error: `Snippet '${name}' not found` };
      }

      const code = await readFile(filePath, 'utf-8');
      const description = extractDescription(code) || 'No description';

      return {
        snippet: { name, description, code },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete a snippet by name.
   * @param name - Snippet name
   * @returns Success status and any error
   */
  async delete(name: string): Promise<{ success: boolean; error?: string }> {
    const nameValidation = validateSnippetName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    try {
      const filePath = this.getSnippetPath(name);

      // Check if file exists
      try {
        await stat(filePath);
      } catch {
        return { success: false, error: `Snippet '${name}' not found` };
      }

      await unlink(filePath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if a snippet exists.
   * @param name - Snippet name
   * @returns true if snippet exists
   */
  async exists(name: string): Promise<boolean> {
    try {
      const filePath = this.getSnippetPath(name);
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the directory path for snippets.
   * Used for making snippets importable in run_code.
   */
  getSnippetsDir(): string {
    return this.snippetsDir;
  }
}
