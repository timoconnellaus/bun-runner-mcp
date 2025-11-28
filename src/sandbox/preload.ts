// This file is loaded before user code via bun --preload
// It replaces fetch and other APIs to route through the permission proxy

declare const Bun: any;
declare const process: { env: Record<string, string | undefined>; exit: (code: number) => never };

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:9999';

// Store original fetch
const originalFetch = globalThis.fetch;

/**
 * Permission error thrown when a permission is denied.
 * Contains all information needed to request the permission.
 */
export class PermissionError extends Error {
  code = 'PERMISSION_DENIED' as const;
  requiredPermission: unknown;
  requestId: string;
  attemptedAction?: unknown;

  constructor(error: {
    requiredPermission: unknown;
    requestId: string;
    attemptedAction?: unknown;
  }) {
    super(`Permission denied. Required: ${JSON.stringify(error.requiredPermission)}`);
    this.name = 'PermissionError';
    this.requiredPermission = error.requiredPermission;
    this.requestId = error.requestId;
    this.attemptedAction = error.attemptedAction;
  }
}

/**
 * Create permission-aware fetch that routes through proxy server.
 */
const sandboxedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    // Convert input to URL and method
    let url: URL;
    if (typeof input === 'string') {
      url = new URL(input);
    } else if (input instanceof URL) {
      url = input;
    } else {
      // Request object
      url = new URL(input.url);
    }

    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const headers = init?.headers || (input instanceof Request ? input.headers : undefined);
    const body = init?.body || (input instanceof Request ? input.body : undefined);

    // Build proxy request
    const proxyRequest = {
      url: url.toString(),
      method: method,
      headers: headers ? Object.fromEntries(
        headers instanceof Headers
          ? headers.entries()
          : Array.isArray(headers)
            ? headers
            : Object.entries(headers)
      ) : undefined,
      body: body ? (typeof body === 'string' ? body : await new Response(body).text()) : undefined,
    };

    // Call proxy server
    const proxyResponse = await originalFetch(`${PROXY_URL}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyRequest),
    });

    // Check for permission denied
    if (proxyResponse.status === 403) {
      const errorData = await proxyResponse.json();
      if (errorData.code === 'PERMISSION_DENIED') {
        // Output JSON to stderr for executor to parse
        console.error(JSON.stringify(errorData));
        throw new PermissionError({
          requiredPermission: errorData.requiredPermission,
          requestId: errorData.requestId,
          attemptedAction: errorData.attemptedAction,
        });
      }
    }

    // Parse the proxy response to reconstruct the actual HTTP response
    const proxyData = await proxyResponse.json() as {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
    };

    // Reconstruct Response object with actual response data
    return new Response(proxyData.body, {
      status: proxyData.status,
      statusText: proxyData.statusText,
      headers: new Headers(proxyData.headers),
    });
  } catch (error) {
    // Re-throw PermissionError as-is
    if (error instanceof PermissionError) {
      throw error;
    }
    // Wrap other errors
    throw error;
  }
};

// Override global fetch
Object.defineProperty(globalThis, 'fetch', {
  value: sandboxedFetch,
  writable: false,
  configurable: false,
});

// Block/sandbox dangerous Bun APIs
if (typeof Bun !== 'undefined') {
  // Block file system operations
  const createBlockedFunction = (name: string) => {
    return () => {
      throw new Error(`${name} is blocked in sandbox mode. File system access requires explicit permissions.`);
    };
  };

  Object.defineProperty(Bun, 'write', {
    value: createBlockedFunction('Bun.write'),
    writable: false,
    configurable: false,
  });

  Object.defineProperty(Bun, 'file', {
    value: createBlockedFunction('Bun.file'),
    writable: false,
    configurable: false,
  });

  // Block process spawning
  Object.defineProperty(Bun, 'spawn', {
    value: createBlockedFunction('Bun.spawn'),
    writable: false,
    configurable: false,
  });

  Object.defineProperty(Bun, 'spawnSync', {
    value: createBlockedFunction('Bun.spawnSync'),
    writable: false,
    configurable: false,
  });
}

// Get allowed env vars from ALLOWED_ENV_VARS (comma-separated list)
const ALLOWED_ENV_VARS = (process.env.ALLOWED_ENV_VARS || '').split(',').filter(Boolean);

// Cache the actual values before replacing process.env
const cachedEnvValues: Record<string, string | undefined> = {};
for (const key of ALLOWED_ENV_VARS) {
  cachedEnvValues[key] = process.env[key];
}

// Replace process.env with a proxy that only allows specific vars
Object.defineProperty(process, 'env', {
  get() {
    return new Proxy({} as Record<string, string | undefined>, {
      get(_, key: string) {
        if (ALLOWED_ENV_VARS.includes(key)) {
          return cachedEnvValues[key];
        }
        // Provide helpful error message
        const available = ALLOWED_ENV_VARS.length > 0
          ? `Available: ${ALLOWED_ENV_VARS.join(', ')}`
          : 'No env vars configured. Add them to ~/.bun-runner-mcp/.bun-runner-env';
        throw new Error(`process.env.${key} access is blocked. ${available}`);
      },
      has(_, key: string) {
        return ALLOWED_ENV_VARS.includes(key);
      },
      ownKeys() {
        return ALLOWED_ENV_VARS;
      },
      getOwnPropertyDescriptor(_, key: string) {
        if (ALLOWED_ENV_VARS.includes(key)) {
          return {
            value: cachedEnvValues[key],
            writable: false,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      },
    });
  },
  configurable: false,
});

// Block import.meta.env if it exists
if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
  Object.defineProperty(import.meta, 'env', {
    get() {
      throw new Error('import.meta.env access is blocked in sandbox mode. Environment variable access requires explicit permissions.');
    },
    configurable: false,
  });
}
