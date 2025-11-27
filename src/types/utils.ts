import type { Permission, HttpPermission, FilePermission, EnvPermission, PermissionDeniedError } from './permissions.js';

/**
 * Match a path against a pattern with * wildcards.
 * @param pattern - Pattern string with * as wildcard (e.g., "/api/users/*")
 * @param path - Actual path to match (e.g., "/api/users/123")
 * @returns true if path matches pattern
 */
export function matchPath(pattern: string, path: string): boolean {
  // Escape special regex characters except *
  const escapeRegex = (str: string) =>
    str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert pattern to regex: * becomes [^/]* (match anything except /)
  const regexPattern = escapeRegex(pattern).replace(/\\\*/g, '[^/]*');
  const regex = new RegExp(`^${regexPattern}$`);

  return regex.test(path);
}

/**
 * Match an environment variable name against a pattern with * wildcards.
 * @param pattern - Pattern string with * as wildcard (e.g., "SECRET_*")
 * @param varName - Actual variable name to match (e.g., "SECRET_API_KEY")
 * @returns true if variable name matches pattern
 */
export function matchEnvVar(pattern: string, varName: string): boolean {
  // Escape special regex characters except *
  const escapeRegex = (str: string) =>
    str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert pattern to regex: * becomes .* (match anything)
  const regexPattern = escapeRegex(pattern).replace(/\\\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);

  return regex.test(varName);
}

/**
 * Check if two HTTP permissions match.
 */
function matchHttpPermission(required: HttpPermission, granted: HttpPermission): boolean {
  // Host must match exactly
  if (required.host !== granted.host) {
    return false;
  }

  // If required has a path pattern, granted must match or be broader
  if (required.pathPattern) {
    if (!granted.pathPattern) {
      return true; // Granted permission allows all paths
    }
    // Check if granted pattern matches or is broader than required
    // For now, they must match exactly or granted must be "*"
    if (granted.pathPattern !== required.pathPattern && granted.pathPattern !== '*') {
      // More sophisticated matching: check if granted pattern could match required pattern
      if (!matchPath(granted.pathPattern, required.pathPattern)) {
        return false;
      }
    }
  }

  // If required has methods, granted must include all required methods
  if (required.methods && required.methods.length > 0) {
    if (!granted.methods || granted.methods.length === 0) {
      return true; // Granted permission allows all methods
    }
    // All required methods must be in granted methods
    return required.methods.every(method => granted.methods!.includes(method));
  }

  return true;
}

/**
 * Check if two file permissions match.
 */
function matchFilePermission(required: FilePermission, granted: FilePermission): boolean {
  // Check if granted path pattern matches required path
  if (!matchPath(granted.path, required.path)) {
    return false;
  }

  // All required operations must be in granted operations
  return required.operations.every(op => granted.operations.includes(op));
}

/**
 * Check if two environment variable permissions match.
 */
function matchEnvPermission(required: EnvPermission, granted: EnvPermission): boolean {
  // All required variables must be covered by granted patterns
  return required.variables.every(requiredVar =>
    granted.variables.some(grantedPattern => matchEnvVar(grantedPattern, requiredVar))
  );
}

/**
 * Check if a granted permission covers a required permission.
 * @param required - The permission being checked
 * @param granted - The permission that was granted
 * @returns true if granted permission covers the required permission
 */
export function matchPermission(required: Permission, granted: Permission): boolean {
  // Permissions must be the same type
  if (required.type !== granted.type) {
    return false;
  }

  switch (required.type) {
    case 'http':
      return matchHttpPermission(required, granted as HttpPermission);
    case 'file':
      return matchFilePermission(required, granted as FilePermission);
    case 'env':
      return matchEnvPermission(required, granted as EnvPermission);
    default:
      return false;
  }
}

/**
 * Generate a permission request from an HTTP request.
 * @param url - The URL being accessed
 * @param method - HTTP method (GET, POST, etc.)
 * @returns HttpPermission object
 */
export function generatePermissionRequest(url: URL, method: string): HttpPermission {
  const upperMethod = method.toUpperCase();
  const validMethod = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(upperMethod)
    ? upperMethod as ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')
    : 'GET';

  return {
    type: 'http',
    host: url.hostname,
    pathPattern: url.pathname,
    methods: [validMethod],
    description: `${validMethod} request to ${url.hostname}${url.pathname}`,
  };
}

/**
 * Serialize a permission to a human-readable string.
 * @param perm - Permission to serialize
 * @returns String representation
 */
export function serializePermission(perm: Permission): string {
  switch (perm.type) {
    case 'http': {
      const methods = perm.methods?.join(', ') || 'ALL';
      const path = perm.pathPattern || '*';
      return `HTTP [${methods}] ${perm.host}${path}`;
    }
    case 'file': {
      const ops = perm.operations.join(', ');
      return `FILE [${ops}] ${perm.path}`;
    }
    case 'env': {
      const vars = perm.variables.join(', ');
      return `ENV [${vars}]`;
    }
    default:
      return 'UNKNOWN';
  }
}

/**
 * Create a permission denied error object.
 * @param permission - The permission that was denied
 * @param action - Details about the attempted action
 * @returns PermissionDeniedError object
 */
export function createPermissionDeniedError(
  permission: Permission,
  action: { type: string; details: Record<string, unknown> }
): PermissionDeniedError {
  return {
    code: 'PERMISSION_DENIED',
    requiredPermission: permission,
    attemptedAction: action,
    requestId: crypto.randomUUID(),
  };
}
