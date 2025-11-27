# Change: Wire Executor to Use Preload Sandbox

## Why
The executor currently runs user code directly without sandboxing. To enforce the permission system, code must run with the preload that routes fetch() through the proxy server.

## What Changes
- Executor spawns Bun with `--preload ./src/sandbox/preload.ts`
- Executor starts/connects to proxy server before running code
- Executor grants session permissions to proxy via Control API
- Executor clears permissions after code execution

## Impact
- Affected specs: [new capability - code-execution]
- Affected code: src/mcp/executor.ts
