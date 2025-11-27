# bun-runner-mcp

An MCP (Model Context Protocol) server that executes TypeScript/JavaScript code in a sandboxed Bun environment with permission-based security controls.

## Features

- **Sandboxed Execution**: Run TypeScript/JavaScript code in an isolated environment
- **Permission System**: Fine-grained control over HTTP requests, file access, and environment variables
- **Two Execution Modes**:
  - **Preload** (default): Uses Bun's preload feature for runtime sandboxing
  - **Container**: Uses Apple Containers for VM-level isolation (macOS 26+)
- **HTTP Proxy**: All network requests are routed through a permission-checking proxy

## Installation

```bash
bun install
```

## Usage

### Running the MCP Server

```bash
bun run start
```

Or for development with watch mode:

```bash
bun run dev
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bun-runner": {
      "command": "bun",
      "args": ["run", "/path/to/bun-runner-mcp/src/mcp/server.ts"]
    }
  }
}
```

## MCP Tools

### `run_code`

Execute TypeScript/JavaScript code in the sandbox.

```json
{
  "code": "console.log('Hello, world!')",
  "timeout": 30000
}
```

### `grant_permission`

Grant a permission for the current session.

**HTTP Permission:**
```json
{
  "permission": {
    "type": "http",
    "host": "api.example.com",
    "description": "Access example API"
  }
}
```

**File Permission:**
```json
{
  "permission": {
    "type": "file",
    "path": "/tmp/data/*",
    "operations": ["read", "write"],
    "description": "Access temp files"
  }
}
```

**Environment Variable Permission:**
```json
{
  "permission": {
    "type": "env",
    "variables": ["API_KEY", "SECRET_*"],
    "description": "Access API keys"
  }
}
```

### `list_permissions`

List all currently granted permissions.

### `revoke_permission`

Revoke a previously granted permission.

## Execution Modes

### Preload Mode (Default)

Uses Bun's preload feature to intercept and sandbox network requests. All HTTP requests are routed through a local proxy server (port 9999) that enforces permissions.

### Container Mode

For stronger isolation, set `EXECUTION_MODE=container` to use Apple Containers (requires macOS 26+). This provides VM-level isolation with:

- Isolated filesystem
- Network isolation
- Resource limits
- TypeScript type checking via tsserver

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   MCP Client    │────▶│   MCP Server     │
│  (Claude, etc)  │     │  (stdio transport)│
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐           ┌───────▼───────┐
              │  Preload  │           │   Container   │
              │  Sandbox  │           │    (Apple)    │
              └─────┬─────┘           └───────────────┘
                    │
              ┌─────▼─────┐
              │HTTP Proxy │
              │ (port 9999)│
              └───────────┘
```

## License

MIT
