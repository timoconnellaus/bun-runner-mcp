# Bun Runner MCP Server

## Overview

The MCP server provides tools for running sandboxed Bun/TypeScript code with fine-grained permission control.

## Files Created

### `/Users/tim/repos/bun-runner-mcp/src/mcp/server.ts`
Main MCP server implementation using @modelcontextprotocol/sdk.

**Features:**
- Runs on stdio transport (compatible with Claude Desktop and other MCP clients)
- Manages session-based permissions
- Provides 4 tools for code execution and permission management
- Proper error handling and structured responses

**Tools exposed:**

1. **run_code** - Execute TypeScript/JavaScript code in sandbox
   - Input: `{ code: string, timeout?: number }`
   - Output: `{ success: boolean, output?: string, error?: string, permissionRequired?: Permission, exitCode?: number }`

2. **grant_permission** - Grant a permission for the session
   - Input: `{ permission: Permission }`
   - Output: `{ granted: boolean, permission: string, totalPermissions: number }`

3. **list_permissions** - List current session permissions
   - Output: `{ permissions: Permission[], total: number }`

4. **revoke_permission** - Revoke a permission
   - Input: `{ permission: Permission }`
   - Output: `{ revoked: boolean, permission: string, totalPermissions: number }`

### `/Users/tim/repos/bun-runner-mcp/src/mcp/executor.ts`
Code execution logic with sandboxing support.

**Features:**
- Creates temporary files for code execution
- Manages timeouts (default: 30s)
- Captures stdout and stderr
- Parses permission denied errors from stderr
- Returns structured execution results
- Cleans up temporary files

**Current implementation:**
- Local execution mode (no Docker yet)
- Supports permission environment variables
- Ready for Docker containerization (containerImage option placeholder)

### `/Users/tim/repos/bun-runner-mcp/src/mcp/index.ts`
Re-exports for clean module interface.

## Usage

### Starting the Server

```bash
# Development mode (with watch)
bun run dev

# Production mode
bun run start

# Build for distribution
bun run build
# Output: ./dist/server.js
```

### Connecting to the Server

The server uses stdio transport, so it can be used with any MCP client:

```json
{
  "mcpServers": {
    "bun-runner": {
      "command": "bun",
      "args": ["run", "/Users/tim/repos/bun-runner-mcp/src/mcp/server.ts"]
    }
  }
}
```

Or using the built version:

```json
{
  "mcpServers": {
    "bun-runner": {
      "command": "bun",
      "args": ["/Users/tim/repos/bun-runner-mcp/dist/server.js"]
    }
  }
}
```

### Example Tool Calls

**1. Run simple code:**
```json
{
  "name": "run_code",
  "arguments": {
    "code": "console.log('Hello, world!');"
  }
}
```

**2. Grant HTTP permission:**
```json
{
  "name": "grant_permission",
  "arguments": {
    "permission": {
      "type": "http",
      "host": "api.example.com",
      "pathPattern": "/v1/*",
      "methods": ["GET", "POST"],
      "description": "Access to Example API"
    }
  }
}
```

**3. List permissions:**
```json
{
  "name": "list_permissions",
  "arguments": {}
}
```

**4. Run code with timeout:**
```json
{
  "name": "run_code",
  "arguments": {
    "code": "console.log(2 + 2);",
    "timeout": 5000
  }
}
```

## Permission Types

### HttpPermission
```typescript
{
  type: 'http',
  host: string,              // e.g., "gmail.googleapis.com"
  pathPattern?: string,      // e.g., "/gmail/v1/*"
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[],
  description: string
}
```

### FilePermission
```typescript
{
  type: 'file',
  path: string,              // e.g., "/tmp/data/*"
  operations: ('read' | 'write')[],
  description: string
}
```

### EnvPermission
```typescript
{
  type: 'env',
  variables: string[],       // e.g., ["API_KEY", "SECRET_*"]
  description: string
}
```

## Session Management

- Permissions are stored per-session
- Session starts fresh when server starts
- Permissions persist for the lifetime of the server process
- No persistence between restarts (intentional for security)

## Testing

A test file is included to verify the executor works:

```bash
bun run test-server.ts
```

Expected output:
```
Testing MCP server components...

1. Testing code execution:
Result: { success: true, hasOutput: true, exitCode: 0 }

2. Testing code with calculation:
Result: { success: true, output: "4", exitCode: 0 }

3. Testing code with error:
Result: { success: false, hasError: true, exitCode: 1 }

All tests completed!
```

## Architecture

```
MCP Client (Claude Desktop, etc.)
    ↓ stdio (JSON-RPC)
server.ts (MCP Server)
    ↓ function call
executor.ts (Code Execution)
    ↓ spawn Bun process
Sandboxed Code Execution
```

## Future Enhancements

1. **Docker Support**: Add container-based execution for stronger isolation
2. **Proxy Server Integration**: Connect to permission proxy for network interception
3. **Resource Limits**: Add memory and CPU limits
4. **Permission Persistence**: Optional permission storage
5. **Audit Logging**: Track all permission grants and code executions
6. **Multi-session Support**: Support multiple isolated sessions

## Security Notes

- Current implementation uses local execution (same process privileges as server)
- For production use, implement Docker containerization
- Permissions are not enforced yet (requires proxy server integration)
- Temporary files are created in system temp directory
- Code is executed with same user permissions as server process

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `bun` - Runtime and bundler
- `typescript` - Type checking

## Build Output

```bash
bun run build
```

Produces:
- `./dist/server.js` - Bundled server (420 KB)
- Includes all dependencies
- Can be distributed as single file
- Requires Bun runtime to execute
