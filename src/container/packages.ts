import { access, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NODE_MODULES_DIR, PACKAGE_CACHE_DIR } from './config.js';
import { installPackageInSession } from './session.js';

/**
 * Package management and import parsing.
 * Handles detecting npm packages in code and ensuring they're installed.
 */

/**
 * Regex patterns for detecting imports in code.
 */
const IMPORT_PATTERNS = {
  // ES module: import x from 'package', import { x } from 'package', import x, { y } from 'package', or import 'package'
  esImport: /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
  // Dynamic import: import('package')
  dynamicImport: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CommonJS require: require('package')
  commonjsRequire: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Export from: export * from 'package'
  exportFrom: /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g,
};

/**
 * Check if a module specifier refers to an npm package (not relative/absolute/builtin).
 *
 * @param specifier - Module specifier from import/require
 * @returns true if this is an npm package
 */
function isNpmPackage(specifier: string): boolean {
  // Skip relative paths
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return false;
  }

  // Skip Node.js built-in modules
  const builtins = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
    'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
    'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
    'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
    'process', 'punycode', 'querystring', 'readline', 'repl',
    'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
    'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
    // Node: prefixed versions
    'node:assert', 'node:async_hooks', 'node:buffer', 'node:child_process',
    'node:cluster', 'node:console', 'node:constants', 'node:crypto',
    'node:dgram', 'node:diagnostics_channel', 'node:dns', 'node:domain',
    'node:events', 'node:fs', 'node:http', 'node:http2', 'node:https',
    'node:inspector', 'node:module', 'node:net', 'node:os', 'node:path',
    'node:perf_hooks', 'node:process', 'node:punycode', 'node:querystring',
    'node:readline', 'node:repl', 'node:stream', 'node:string_decoder',
    'node:timers', 'node:tls', 'node:trace_events', 'node:tty', 'node:url',
    'node:util', 'node:v8', 'node:vm', 'node:wasi', 'node:worker_threads',
    'node:zlib',
    // Bun-specific
    'bun', 'bun:test', 'bun:sqlite', 'bun:ffi', 'bun:jsc',
  ]);

  // Get the package name (handle scoped packages and subpaths)
  const packageName = getPackageName(specifier);

  return !builtins.has(specifier) && !builtins.has(packageName);
}

/**
 * Extract the npm package name from an import specifier.
 * Handles scoped packages (@org/package) and subpaths (package/submodule).
 *
 * @param specifier - Full import specifier
 * @returns Package name only
 */
function getPackageName(specifier: string): string {
  // Handle scoped packages: @org/package/subpath -> @org/package
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }

  // Regular packages: package/subpath -> package
  const slashIndex = specifier.indexOf('/');
  if (slashIndex !== -1) {
    return specifier.slice(0, slashIndex);
  }

  return specifier;
}

/**
 * Parse code to extract all npm package dependencies.
 *
 * @param code - TypeScript/JavaScript source code
 * @returns Array of unique npm package names
 */
export function parseImports(code: string): string[] {
  const specifiers = new Set<string>();

  // Apply all import patterns
  for (const [, pattern] of Object.entries(IMPORT_PATTERNS)) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[1];
      if (specifier && isNpmPackage(specifier)) {
        specifiers.add(getPackageName(specifier));
      }
    }
  }

  return Array.from(specifiers);
}

/**
 * Ensure the package cache directory exists.
 */
export async function ensureCacheDirectory(): Promise<void> {
  await mkdir(PACKAGE_CACHE_DIR, { recursive: true });
  await mkdir(NODE_MODULES_DIR, { recursive: true });
}

/**
 * Check if a package is already installed in the cache.
 *
 * @param packageName - Name of the npm package
 * @returns true if package exists in cache
 */
export async function isPackageInstalled(packageName: string): Promise<boolean> {
  try {
    // For scoped packages, need to check the @org/package path
    const packagePath = join(NODE_MODULES_DIR, ...packageName.split('/'));
    await access(packagePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of all installed packages in the cache.
 *
 * @returns Array of installed package names
 */
export async function getInstalledPackages(): Promise<string[]> {
  try {
    await ensureCacheDirectory();
    const entries = await readdir(NODE_MODULES_DIR, { withFileTypes: true });
    const packages: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        // Scoped package - read subdirectory
        const scopePath = join(NODE_MODULES_DIR, entry.name);
        const scopedEntries = await readdir(scopePath, { withFileTypes: true });
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.isDirectory()) {
            packages.push(`${entry.name}/${scopedEntry.name}`);
          }
        }
      } else if (!entry.name.startsWith('.')) {
        packages.push(entry.name);
      }
    }

    return packages;
  } catch {
    return [];
  }
}

/** Result of resolving packages for code execution */
export interface PackageResolutionResult {
  success: boolean;
  packages: string[];
  installed: string[];
  failed: string[];
  error?: string;
}

/**
 * Resolve and install all packages required by code.
 * Parses imports, checks cache, and installs missing packages.
 *
 * @param code - Source code to analyze
 * @returns Resolution result with lists of packages
 */
export async function resolvePackages(code: string): Promise<PackageResolutionResult> {
  const packages = parseImports(code);

  if (packages.length === 0) {
    return {
      success: true,
      packages: [],
      installed: [],
      failed: [],
    };
  }

  await ensureCacheDirectory();

  const installed: string[] = [];
  const failed: string[] = [];

  for (const pkg of packages) {
    // Check if already installed
    const isInstalled = await isPackageInstalled(pkg);
    if (isInstalled) {
      installed.push(pkg);
      continue;
    }

    // Install the package
    console.error(`[packages] Installing ${pkg}...`);
    const result = await installPackageInSession(pkg);

    if (result.success) {
      installed.push(pkg);
      console.error(`[packages] Installed ${pkg}`);
    } else {
      failed.push(pkg);
      console.error(`[packages] Failed to install ${pkg}: ${result.stderr}`);
    }
  }

  return {
    success: failed.length === 0,
    packages,
    installed,
    failed,
    error: failed.length > 0 ? `Failed to install packages: ${failed.join(', ')}` : undefined,
  };
}
