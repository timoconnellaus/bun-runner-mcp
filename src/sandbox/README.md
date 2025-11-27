# Sandbox Module

This module provides the sandboxing infrastructure for executing untrusted user code safely by intercepting dangerous API calls and routing them through a permission proxy.

## Files

### `preload.ts`

Preload script that runs before user code via `bun --preload`. It:

- **Overrides `fetch`**: Intercepts all fetch calls and routes them through the permission proxy server
- **Blocks Bun APIs**: Prevents direct access to file system (`Bun.write`, `Bun.file`) and process spawning (`Bun.spawn`)
- **Blocks environment access**: Prevents reading `process.env` and `import.meta.env`
- **Exports `PermissionError`**: Custom error class for permission denials with all necessary information

**Key Features:**
- All HTTP requests go through proxy at `PROXY_URL` (default: `http://localhost:9998`)
- Returns `403` responses as `PermissionError` with structured error data
- Makes errors serializable and actionable for permission requests

### `wrapper.ts`

Provides code wrapping utilities:

- **`wrapUserCode(code, options)`**: Wraps user code with:
  - Timeout handling (default 30s)
  - Console output capture
  - Error handling and formatting
  - Permission error serialization to JSON

- **`extractPermissionError(stderr)`**: Parses stderr to extract permission errors from executed code

**Options:**
```typescript
{
  timeout?: number;        // Execution timeout in ms (default: 30000)
  proxyUrl?: string;       // Permission proxy URL
  captureConsole?: boolean; // Whether to capture console output
}
```

### `index.ts`

Re-exports all public APIs from the sandbox module.

## Usage

### Running Sandboxed Code

```typescript
import { wrapUserCode } from './sandbox/wrapper.js';

const userCode = `
  const response = await fetch('https://api.example.com/data');
  console.log(await response.json());
`;

const wrapped = wrapUserCode(userCode, {
  timeout: 10000,
  proxyUrl: 'http://localhost:9998',
});

// Execute with bun
// bun --preload ./src/sandbox/preload.ts run <wrapped-code-file>
```

### Handling Permission Errors

```typescript
import { extractPermissionError } from './sandbox/wrapper.js';

const { stderr } = await executeCode(wrappedCode);
const permError = extractPermissionError(stderr);

if (permError) {
  console.log('Permission required:', permError.requiredPermission);
  console.log('Request ID:', permError.requestId);
  // Use requestId to grant permission and retry
}
```

## How It Works

1. **Preload Phase**: `preload.ts` runs before user code, replacing global APIs
2. **Execution Phase**: User code runs with sandboxed APIs
3. **HTTP Request**: User calls `fetch()` → routed to proxy server
4. **Permission Check**: Proxy checks if permission is granted
5. **Response**: Either returns data or throws `PermissionError`
6. **Error Handling**: Wrapper catches and serializes errors for parsing

## Security Model

- **Default Deny**: All dangerous operations blocked by default
- **Explicit Permissions**: Each capability requires explicit permission grant
- **Proxy-Based**: Central permission proxy validates all external access
- **Error Transparency**: Permission errors contain exact requirement for granting

## Architecture

```
User Code
    ↓
preload.ts (intercepts fetch, blocks Bun APIs)
    ↓
Permission Proxy Server (checks permissions)
    ↓
External Resource OR PermissionError
```
