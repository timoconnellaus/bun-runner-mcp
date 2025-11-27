# Change: Add Apple Container Runtime with Package Support

## Why
The current preload-based sandbox provides runtime interception but relies on JavaScript-level hooks that could potentially be bypassed. For production-grade isolation, code should execute inside a true container with hardware-level VM isolation. Apple Containers provide native macOS container support with lightweight VMs optimized for Apple Silicon, offering stronger security guarantees without requiring Docker Desktop.

Additionally, users need the ability to use npm packages in their code. The container approach enables safe package installation and caching without compromising the host system.

## What Changes
- Add Apple Container execution backend as alternative to preload sandbox
- Create base Linux image with Bun runtime pre-installed
- Implement package cache system with persistent volume mounts
- Parse imports from user code to detect package requirements
- Install packages on-demand inside container with shared cache
- Support resource limits (CPU, memory) for execution safety
- **BREAKING**: Requires macOS with Apple Containers installed (macOS 26+ or source build)

## Impact
- Affected specs: [new capability - container-runtime], [new capability - package-management]
- Affected code:
  - `src/mcp/executor.ts` - Add container execution mode
  - `src/container/` (new) - Container management, image building, package parsing
  - `package.json` - Add container management dependencies
