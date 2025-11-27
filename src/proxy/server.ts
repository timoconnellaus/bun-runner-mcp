// Permission Proxy Server
// Runs inside container, intercepts all HTTP requests from sandboxed code

import type { Permission, PermissionDeniedError } from '../types/index.js';
import {
  generatePermissionRequest,
  createPermissionDeniedError,
  serializePermission,
} from '../types/index.js';
import { PermissionStore } from './store.js';

const CONTROL_PORT = 9999;
const PROXY_PORT = 9998;

// In-memory permission store
const store = new PermissionStore();

/**
 * Control API Server - Host uses this to grant/revoke permissions
 * Port: 9999
 */
function createControlServer(): void {
  const server = Bun.serve({
    port: CONTROL_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        // POST /grant - Grant a permission
        if (path === '/grant' && req.method === 'POST') {
          const permission = (await req.json()) as Permission;
          store.grant(permission);
          console.log(`[CONTROL] Granted permission: ${serializePermission(permission)}`);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // POST /revoke - Revoke a permission
        if (path === '/revoke' && req.method === 'POST') {
          const permission = (await req.json()) as Permission;
          const revoked = store.revoke(permission);
          console.log(
            `[CONTROL] ${revoked ? 'Revoked' : 'Not found'}: ${serializePermission(permission)}`
          );
          return new Response(JSON.stringify({ success: revoked }), {
            status: revoked ? 200 : 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // GET /permissions - List all granted permissions
        if (path === '/permissions' && req.method === 'GET') {
          const permissions = store.list();
          console.log(`[CONTROL] Listed ${permissions.length} permissions`);
          return new Response(JSON.stringify({ permissions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // POST /clear - Clear all permissions
        if (path === '/clear' && req.method === 'POST') {
          store.clear();
          console.log('[CONTROL] Cleared all permissions');
          return new Response(JSON.stringify({ success: true }), {
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
        console.error('[CONTROL] Error handling request:', error);
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

  console.log(`Control API listening on port ${CONTROL_PORT}`);
}

/**
 * Proxy API Server - Sandboxed code routes requests through here
 * Port: 9998
 */
function createProxyServer(): void {
  const server = Bun.serve({
    port: PROXY_PORT,
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

          console.log(
            `[PROXY] Checking permission for ${body.method} ${body.url}`
          );
          console.log(`[PROXY] Required: ${serializePermission(requiredPermission)}`);

          // Check if permission is granted
          if (!store.check(requiredPermission)) {
            console.log(`[PROXY] DENIED: ${serializePermission(requiredPermission)}`);

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

          console.log(`[PROXY] ALLOWED: Forwarding request to ${body.url}`);

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

        // Health check endpoint
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
        console.error('[PROXY] Error handling request:', error);
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

  console.log(`Proxy API listening on port ${PROXY_PORT}`);
}

// Start both servers
console.log('Starting Permission Proxy Server...');
console.log('This server runs inside the container and intercepts all HTTP requests.');
console.log('');

createControlServer();
createProxyServer();

console.log('');
console.log('Ready to handle requests.');
