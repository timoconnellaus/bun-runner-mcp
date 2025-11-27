# Change: Integrate Docker Sandbox for Production

## Why
For production deployment, code execution should happen inside a hardened Docker container with security constraints (read-only filesystem, dropped capabilities, resource limits). The Docker config exists but isn't wired into the executor.

## What Changes
- Add Docker execution mode to executor (alternative to local mode)
- Executor can spawn code inside running container
- MCP server can be configured to use Docker mode via environment variable
- Container lifecycle managed by docker-compose

## Impact
- Affected specs: [new capability - docker-sandbox]
- Affected code: src/mcp/executor.ts, docker-compose.yml
