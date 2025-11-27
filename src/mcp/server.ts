#!/usr/bin/env bun

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Permission, PermissionDeniedError } from '../types/index.js';
import {
  serializePermission,
  generatePermissionRequest,
  createPermissionDeniedError,
} from '../types/index.js';
import { executeInSandbox, type ExecutionResult } from './executor.js';
import { PermissionStore } from '../proxy/store.js';

// Global shared permission store (used by both MCP tools and HTTP proxy)
const permissionStore = new PermissionStore();

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'bun-runner',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
    return {
      tools: [
        {
          name: 'run_code',
          description:
            'Execute TypeScript/JavaScript code in a sandboxed Bun environment. ' +
            'Code runs with restricted permissions - network, file, and environment access must be explicitly granted.',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The TypeScript/JavaScript code to execute',
              },
              timeout: {
                type: 'number',
                description: 'Optional timeout in milliseconds (default: 30000)',
              },
            },
            required: ['code'],
          },
        },
        {
          name: 'grant_permission',
          description:
            'Grant a permission for this session. Permissions control access to HTTP requests, file operations, and environment variables.',
          inputSchema: {
            type: 'object',
            properties: {
              permission: {
                type: 'object',
                description: 'The permission to grant (HttpPermission, FilePermission, or EnvPermission)',
              },
            },
            required: ['permission'],
          },
        },
        {
          name: 'list_permissions',
          description: 'List all currently granted permissions for this session.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'revoke_permission',
          description: 'Revoke a previously granted permission.',
          inputSchema: {
            type: 'object',
            properties: {
              permission: {
                type: 'object',
                description: 'The permission to revoke (must match a granted permission)',
              },
            },
            required: ['permission'],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'run_code':
        return await handleRunCode(args ?? {});

      case 'grant_permission':
        return await handleGrantPermission(args ?? {});

      case 'list_permissions':
        return await handleListPermissions();

      case 'revoke_permission':
        return await handleRevokePermission(args ?? {});

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

/**
 * Handle the run_code tool
 */
async function handleRunCode(args: Record<string, unknown>) {
  const code = args.code as string;
  const timeout = args.timeout as number | undefined;

  if (!code || typeof code !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Code parameter is required and must be a string' }, null, 2),
        },
      ],
    };
  }

  // Execute the code with current permissions
  const result: ExecutionResult = await executeInSandbox(code, permissionStore, { timeout });

  // Format the result
  if (result.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              output: result.output,
              exitCode: result.exitCode,
            },
            null,
            2
          ),
        },
      ],
    };
  } else if (result.permissionRequired) {
    // Permission was denied - inform the user
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'Permission denied',
              permissionRequired: result.permissionRequired,
              message: `Code requires permission: ${serializePermission(result.permissionRequired)}. Use grant_permission to grant access.`,
            },
            null,
            2
          ),
        },
      ],
    };
  } else {
    // Execution failed
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: result.error,
              output: result.output,
              exitCode: result.exitCode,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

/**
 * Handle the grant_permission tool
 */
async function handleGrantPermission(args: Record<string, unknown>) {
  const permission = args.permission as Permission;

  if (!permission || !permission.type) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Valid permission object is required' }, null, 2),
        },
      ],
    };
  }

  // Validate permission structure
  const validationError = validatePermission(permission);
  if (validationError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: validationError, permission },
            null,
            2
          ),
        },
      ],
    };
  }

  // Add to permission store
  permissionStore.grant(permission);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            granted: true,
            permission: serializePermission(permission),
            totalPermissions: permissionStore.list().length,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle the list_permissions tool
 */
async function handleListPermissions() {
  const permissions = permissionStore.list();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            permissions: permissions.map((p) => ({
              ...p,
              serialized: serializePermission(p),
            })),
            total: permissions.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle the revoke_permission tool
 */
async function handleRevokePermission(args: Record<string, unknown>) {
  const permission = args.permission as Permission;

  if (!permission || !permission.type) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Valid permission object is required' }, null, 2),
        },
      ],
    };
  }

  // Revoke from permission store
  const revoked = permissionStore.revoke(permission);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            revoked,
            permission: serializePermission(permission),
            totalPermissions: permissionStore.list().length,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Validate permission structure and return error message if invalid
 * @returns Error message if invalid, null if valid
 */
function validatePermission(permission: Permission): string | null {
  switch (permission.type) {
    case 'http':
      if (typeof permission.host !== 'string') {
        return 'HttpPermission requires "host" field (string). Example: {"type":"http","host":"httpbin.org","description":"Access httpbin.org"}';
      }
      if (typeof permission.description !== 'string') {
        return 'HttpPermission requires "description" field (string). Example: {"type":"http","host":"httpbin.org","description":"Access httpbin.org"}';
      }
      return null;
    case 'file':
      if (typeof permission.path !== 'string') {
        return 'FilePermission requires "path" field (string). Example: {"type":"file","path":"/tmp/data/*","operations":["read","write"],"description":"Access temp files"}';
      }
      if (!Array.isArray(permission.operations)) {
        return 'FilePermission requires "operations" field (array of "read" and/or "write"). Example: {"type":"file","path":"/tmp/data/*","operations":["read","write"],"description":"Access temp files"}';
      }
      if (typeof permission.description !== 'string') {
        return 'FilePermission requires "description" field (string). Example: {"type":"file","path":"/tmp/data/*","operations":["read","write"],"description":"Access temp files"}';
      }
      return null;
    case 'env':
      if (!Array.isArray(permission.variables)) {
        return 'EnvPermission requires "variables" field (array of strings). Example: {"type":"env","variables":["API_KEY","SECRET_*"],"description":"Access API keys"}';
      }
      if (typeof permission.description !== 'string') {
        return 'EnvPermission requires "description" field (string). Example: {"type":"env","variables":["API_KEY","SECRET_*"],"description":"Access API keys"}';
      }
      return null;
    default:
      return `Unknown permission type "${(permission as { type: string }).type}". Valid types are: "http", "file", "env"`;
  }
}

// Store HTTP server reference for cleanup
let httpServer: ReturnType<typeof Bun.serve> | null = null;

/**
 * Start the HTTP server for proxy functionality.
 * This server runs on port 9999 and handles:
 * - /proxy - HTTP proxy requests (checks permissions and forwards)
 * - /grant - Grant a permission
 * - /revoke - Revoke a permission
 * - /permissions - List all permissions
 * - /clear - Clear all permissions
 * - /health - Health check
 */
function startHttpServer(): void {
  const PORT = 9999;

  httpServer = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        // POST /proxy - Proxy a request
        if (path === '/proxy' && req.method === 'POST') {
          const body = (await req.json()) as {
            url: string;
            method: string;
            headers?: Record<string, string>;
            body?: string;
          };

          // Parse the target URL
          const targetUrl = new URL(body.url);

          // Generate required permission
          const requiredPermission = generatePermissionRequest(targetUrl, body.method);

          console.error(
            `[PROXY] Checking permission for ${body.method} ${body.url}`
          );
          console.error(`[PROXY] Required: ${serializePermission(requiredPermission)}`);

          // Check if permission is granted
          if (!permissionStore.check(requiredPermission)) {
            console.error(`[PROXY] DENIED: ${serializePermission(requiredPermission)}`);

            // Create permission denied error
            const error: PermissionDeniedError = createPermissionDeniedError(
              requiredPermission,
              {
                type: 'http_request',
                details: {
                  url: body.url,
                  method: body.method,
                  headers: body.headers || {},
                },
              }
            );

            return new Response(JSON.stringify(error), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          console.error(`[PROXY] ALLOWED: Forwarding request to ${body.url}`);

          // Permission granted - forward the request
          try {
            const response = await fetch(body.url, {
              method: body.method,
              headers: body.headers,
              body: body.body,
            });

            // Read response
            const responseBody = await response.text();
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });

            // Return the actual response
            return new Response(
              JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          } catch (fetchError) {
            console.error('[PROXY] Error forwarding request:', fetchError);
            return new Response(
              JSON.stringify({
                error: 'Failed to forward request',
                message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
              }),
              {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
        }

        // POST /grant - Grant a permission
        if (path === '/grant' && req.method === 'POST') {
          const permission = (await req.json()) as Permission;
          permissionStore.grant(permission);
          console.error(`[HTTP] Granted permission: ${serializePermission(permission)}`);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // POST /revoke - Revoke a permission
        if (path === '/revoke' && req.method === 'POST') {
          const permission = (await req.json()) as Permission;
          const revoked = permissionStore.revoke(permission);
          console.error(
            `[HTTP] ${revoked ? 'Revoked' : 'Not found'}: ${serializePermission(permission)}`
          );
          return new Response(JSON.stringify({ success: revoked }), {
            status: revoked ? 200 : 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // GET /permissions - List all granted permissions
        if (path === '/permissions' && req.method === 'GET') {
          const permissions = permissionStore.list();
          console.error(`[HTTP] Listed ${permissions.length} permissions`);
          return new Response(JSON.stringify({ permissions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // POST /clear - Clear all permissions
        if (path === '/clear' && req.method === 'POST') {
          permissionStore.clear();
          console.error('[HTTP] Cleared all permissions');
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // GET /health - Health check
        if (path === '/health' && req.method === 'GET') {
          return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Unknown endpoint
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[HTTP] Error handling request:', error);
        return new Response(
          JSON.stringify({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    },
  });

  console.error(`HTTP server listening on port ${PORT}`);
}

/**
 * Cleanup function to shut down gracefully
 */
function cleanup() {
  console.error('Shutting down...');
  if (httpServer) {
    httpServer.stop();
    httpServer = null;
  }
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  // Set up cleanup handlers for graceful shutdown
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);

  // Exit when stdin closes (parent process died)
  process.stdin.on('end', () => {
    console.error('stdin closed, shutting down');
    cleanup();
  });

  // Also handle stdin close event
  process.stdin.on('close', () => {
    console.error('stdin closed, shutting down');
    cleanup();
  });

  // Start HTTP server first
  startHttpServer();

  // Then connect MCP transport
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error('Bun Runner MCP Server running on stdio');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
