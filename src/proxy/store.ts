import type { Permission } from '../types/index.js';
import { matchPermission } from '../types/index.js';

/**
 * Permission store for managing granted permissions.
 * This runs inside the container and tracks which permissions have been granted.
 */
export class PermissionStore {
  private permissions: Permission[] = [];

  /**
   * Grant a permission.
   * @param perm - Permission to grant
   */
  grant(perm: Permission): void {
    this.permissions.push(perm);
  }

  /**
   * Revoke a permission.
   * @param perm - Permission to revoke
   * @returns true if found and removed, false otherwise
   */
  revoke(perm: Permission): boolean {
    const initialLength = this.permissions.length;
    this.permissions = this.permissions.filter(
      (granted) => !this.isSamePermission(granted, perm)
    );
    return this.permissions.length < initialLength;
  }

  /**
   * Check if a required permission is covered by any granted permission.
   * @param required - The permission being checked
   * @returns true if any granted permission covers this requirement
   */
  check(required: Permission): boolean {
    return this.permissions.some((granted) => matchPermission(required, granted));
  }

  /**
   * List all granted permissions.
   * @returns Array of all granted permissions
   */
  list(): Permission[] {
    return [...this.permissions];
  }

  /**
   * Clear all granted permissions.
   */
  clear(): void {
    this.permissions = [];
  }

  /**
   * Check if two permissions are the same.
   * Used for revocation - must match all fields exactly.
   */
  private isSamePermission(p1: Permission, p2: Permission): boolean {
    if (p1.type !== p2.type) {
      return false;
    }

    switch (p1.type) {
      case 'http': {
        const p2Http = p2 as typeof p1;
        return (
          p1.host === p2Http.host &&
          p1.pathPattern === p2Http.pathPattern &&
          this.arrayEquals(p1.methods, p2Http.methods)
        );
      }
      case 'file': {
        const p2File = p2 as typeof p1;
        return (
          p1.path === p2File.path &&
          this.arrayEquals(p1.operations, p2File.operations)
        );
      }
      case 'env': {
        const p2Env = p2 as typeof p1;
        return this.arrayEquals(p1.variables, p2Env.variables);
      }
      default:
        return false;
    }
  }

  /**
   * Compare two arrays for equality (order-independent).
   */
  private arrayEquals<T>(a?: T[], b?: T[]): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;

    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
}
