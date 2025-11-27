# Project Context

## Purpose
Bun Runner MCP is a sandboxed code execution server that implements the Model Context Protocol (MCP). It allows AI assistants to safely execute TypeScript/JavaScript code in a controlled environment where network, file system, and environment variable access must be explicitly granted through a permission system.

**Goals:**
- Enable safe code execution for AI-assisted development workflows
- Provide fine-grained permission control (HTTP, file, environment variables)
- Support both local development and production Docker deployment
- Integrate seamlessly with MCP-compatible clients (Claude Desktop, etc.)

## Tech Stack
- **Runtime:** Bun (latest)
- **Language:** TypeScript (strict mode, ESNext target)
- **Protocol:** Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Container:** Docker with security hardening (read-only fs, capability dropping, resource limits)

## Project Conventions

### Code Style
- ES modules (`"type": "module"` in package.json)
- Strict TypeScript (`"strict": true`)
- JSDoc-style comments for exported functions
- Console logging for server status (stderr for MCP servers to keep stdout for protocol)
- Use `type` imports for type-only imports
- File extensions in imports (`.js` for compiled output compatibility)

### Architecture Patterns
```
┌─────────────────────────────────────────────────────────────┐
│  MCP Client (Claude Desktop, etc.)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ stdio (MCP protocol)
┌───────────────────────────▼─────────────────────────────────┐
│  MCP Server (src/mcp/server.ts)                             │
│  Tools: run_code, grant_permission, list_permissions,       │
│         revoke_permission                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Executor (src/mcp/executor.ts)                             │
│  Writes code to temp file, spawns Bun with --preload        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Preload Sandbox (src/sandbox/preload.ts)                   │
│  Replaces fetch → proxy, blocks Bun.file, Bun.spawn, etc.   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP to localhost:9998
┌───────────────────────────▼─────────────────────────────────┐
│  Proxy Server (src/proxy/server.ts)                         │
│  Control API (:9999) - grant/revoke/list permissions        │
│  Proxy API (:9998) - intercept and check HTTP requests      │
└─────────────────────────────────────────────────────────────┘
```

**Key Files:**
- `src/mcp/server.ts` - MCP server entry point, tool handlers
- `src/mcp/executor.ts` - Code execution logic (temp file → Bun spawn)
- `src/proxy/server.ts` - Permission proxy with control API
- `src/sandbox/preload.ts` - Runtime sandboxing via Bun preload
- `src/types/permissions.ts` - Permission type definitions

### Testing Strategy
- Manual testing via MCP client connections (see `test/mcp.json`)
- Test permission flow: run code → get denied → grant permission → retry

### Git Workflow
- Feature branches for new work
- Conventional commits preferred
- Run `bun run build` before committing to verify no type errors

## Domain Context

### Permission Types
- **HttpPermission:** Controls access to external HTTP endpoints (host, path pattern, methods)
- **FilePermission:** Controls file system access (path pattern, read/write operations)
- **EnvPermission:** Controls environment variable access (variable names with wildcards)

### MCP Tools Exposed
- `run_code` - Execute TS/JS code with current permissions
- `grant_permission` - Add a permission to the session
- `list_permissions` - View all granted permissions
- `revoke_permission` - Remove a granted permission

### Ports
- `9998` - Proxy API (sandboxed code routes HTTP through here)
- `9999` - Control API (host grants/revokes permissions here)

## Important Constraints

### Current Implementation Status
| Component        | Status                              |
|------------------|-------------------------------------|
| Permission types | ✅ Complete                          |
| Proxy server     | ✅ Complete                          |
| Preload sandbox  | ✅ Complete                          |
| MCP server       | ✅ Complete                          |
| Executor         | ⚠️ Runs locally, not wired to proxy |
| Docker           | ✅ Config exists, not integrated     |

### Next Steps (in order)
1. **Wire executor to use preload** - Start proxy server, grant permissions, run with `bun --preload`
2. **Test full permission flow** - fetch() without permission → denied → grant → success
3. **Docker integration** - Run proxy + code inside container

### Security Requirements
- Code runs in sandboxed environment (blocked: Bun.file, Bun.write, Bun.spawn, process.env)
- All external HTTP requests must go through permission proxy
- Docker container runs with: read-only filesystem, all capabilities dropped, resource limits

## External Dependencies
- **@modelcontextprotocol/sdk** - Official MCP SDK for server implementation
- **Bun** - Runtime with native TypeScript support, required for execution
