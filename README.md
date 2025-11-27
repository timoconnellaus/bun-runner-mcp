# bun-runner-mcp

An MCP (Model Context Protocol) server that executes TypeScript/JavaScript code in a sandboxed Bun environment with permission-based security controls.

## Features

- **Sandboxed Execution**: Run TypeScript/JavaScript code in an isolated environment
- **Permission System**: Fine-grained control over HTTP requests, file access, and environment variables
- **Two Execution Modes**:
  - **Preload** (default): Uses Bun's preload feature for runtime sandboxing
  - **Container**: Uses Apple Containers for VM-level isolation (macOS 26+)
- **HTTP Proxy**: All network requests are routed through a permission-checking proxy

## Quick Start

### Installation

```bash
git clone https://github.com/timoconnellaus/bun-runner-mcp.git
cd bun-runner-mcp
bun install
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

**Standard Mode (Preload Sandbox):**

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

**Container Mode (Apple Containers - Recommended for untrusted code):**

```json
{
  "mcpServers": {
    "bun-runner": {
      "command": "bun",
      "args": ["run", "/path/to/bun-runner-mcp/src/mcp/server.ts"],
      "env": {
        "EXECUTION_MODE": "container"
      }
    }
  }
}
```

> **Note:** Container mode requires macOS 26 (Tahoe) or later with Apple Containers installed.

### Running Manually

```bash
# Standard mode
bun run start

# Container mode
EXECUTION_MODE=container bun run start

# Development with watch
bun run dev
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

### Container Mode (Apple Containers)

For stronger isolation, use Apple Containers which provides VM-level isolation. This is the recommended mode for untrusted code execution.

#### Requirements

- **macOS 26 (Tahoe)** or later
- Apple Containers CLI (`container` command) installed
- Internet connection for initial image pull

#### How It Works

1. **Lazy Initialization**: The container is created on first code execution, not at startup
2. **Session Persistence**: The same container is reused for all executions within a session
3. **Auto-Cleanup**: Container is automatically stopped when the MCP server exits
4. **Image Management**: Uses `oven/bun:alpine` from Docker Hub, automatically pulled on first use

#### Container Specifications

| Resource | Limit |
|----------|-------|
| CPUs | 2 |
| Memory | 512 MB |
| Base Image | `oven/bun:alpine` |
| Timeout | 30 seconds (default) |

#### Features

- **VM-Level Isolation**: Code runs in a fully isolated virtual machine
- **Isolated Filesystem**: No access to host filesystem
- **Network Isolation**: Network access is controlled by the container runtime
- **Package Support**: npm packages are automatically installed via Bun
- **TypeScript Support**: Full TypeScript execution with type checking via tsserver

#### Verifying Container CLI

Check if Apple Containers is available:

```bash
container --version
```

List available images:

```bash
container image list
```

#### Troubleshooting

**Container CLI not found:**
- Ensure you're running macOS 26 (Tahoe) or later
- The `container` CLI should be available at `/usr/bin/container`

**Image pull fails:**
- Check your internet connection
- Verify Docker Hub is accessible
- Try manually: `container image pull docker.io/oven/bun:alpine`

**Container won't start:**
- Check system resources (memory, disk space)
- Look for error messages in stderr output
- Ensure no conflicting containers are running

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
