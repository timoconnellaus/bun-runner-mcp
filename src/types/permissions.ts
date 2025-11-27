// Permission types for controlling access to external resources

export interface HttpPermission {
  type: 'http';
  host: string;                    // e.g., "gmail.googleapis.com"
  pathPattern?: string;            // e.g., "/gmail/v1/users/*/messages/*" - supports * wildcards
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[];
  description: string;             // Human readable: "Read Gmail messages"
}

export interface FilePermission {
  type: 'file';
  path: string;                    // e.g., "/tmp/data/*"
  operations: ('read' | 'write')[];
  description: string;
}

export interface EnvPermission {
  type: 'env';
  variables: string[];             // e.g., ["API_KEY", "SECRET_*"]
  description: string;
}

export type Permission = HttpPermission | FilePermission | EnvPermission;

export interface PermissionDeniedError {
  code: 'PERMISSION_DENIED';
  requiredPermission: Permission;
  attemptedAction: {
    type: string;
    details: Record<string, unknown>;
  };
  requestId: string;               // UUID for tracking/granting
}

export interface PermissionGrant {
  permission: Permission;
  grantedAt: Date;
  expiresAt?: Date;
  grantedBy: string;               // User/system that granted
}
