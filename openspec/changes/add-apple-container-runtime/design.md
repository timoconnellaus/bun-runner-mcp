# Design: Apple Container Runtime with Package Support

## Context

The MCP server currently uses a preload-based sandbox that intercepts JavaScript APIs at runtime. While functional, this approach:
- Relies on runtime hooks that could theoretically be bypassed
- Doesn't provide true process isolation
- Makes package installation risky (postinstall scripts run on host)

Apple Containers (announced WWDC 2025) provide native macOS container support using lightweight VMs on Apple Silicon. Each container runs in its own VM, providing hardware-level isolation.

**Stakeholders:**
- End users: Want safe code execution with package support
- Operators: Need production-ready isolation without Docker licensing concerns
- Developers: Need local development parity with production

## Goals / Non-Goals

### Goals
- Provide VM-level isolation for untrusted code execution
- Enable safe npm package installation and usage
- Maintain sub-second execution latency for simple code
- Support persistent package cache to avoid repeated installs
- Integrate cleanly with existing MCP tool interface

### Non-Goals
- Support for non-macOS platforms (Docker remains option for Linux/Windows)
- Custom container orchestration beyond session-scoped reuse
- Package version pinning or lockfile management (always install latest)

## Decisions

### Decision 1: Use Apple Container CLI (`container`) for orchestration
**Choice:** Shell out to `container` CLI rather than using Containerization framework directly.

**Rationale:**
- CLI is stable public interface; framework API may change
- Simpler integration - spawn process, capture output
- No Swift dependencies in TypeScript codebase
- Can switch to framework later if needed

**Alternatives considered:**
- Direct Containerization framework: Requires Swift bridge, more complex
- Docker: Cross-platform but requires Docker Desktop license for commercial use

### Decision 2: Single shared package cache volume
**Choice:** Mount `~/.bun-runner-mcp/packages` as `/packages` in all containers.

**Rationale:**
- Packages persist across executions
- First install is slow, subsequent runs fast
- Single cache simplifies management
- Bun's cache is disk-efficient

**Alternatives considered:**
- Per-execution isolated packages: Clean but slow (reinstall every time)
- Pre-baked images per package set: Complex image management

### Decision 3: Parse imports before execution
**Choice:** Statically analyze user code for imports, install missing packages before running.

**Rationale:**
- Fail fast with clear error if package unavailable
- Can show user what packages will be installed
- Avoids runtime import failures mid-execution

**Alternatives considered:**
- Runtime resolution with auto-install: Harder to control, unclear failures
- Pre-declared package list: Extra friction for users

### Decision 4: Base image with Bun pre-installed
**Choice:** Build and cache a base OCI image with Bun runtime.

**Rationale:**
- Avoid downloading Bun on every execution
- Consistent Bun version across runs
- Fast container startup

**Image contents:**
- Alpine Linux (minimal footprint)
- Bun runtime (latest stable)
- Basic build tools for native packages (optional, later)

### Decision 5: Resource limits per execution
**Choice:** Default limits of 2 CPUs, 512MB RAM, 30s timeout.

**Rationale:**
- Prevent runaway processes from consuming host resources
- Consistent with current executor timeout
- Can be made configurable later

### Decision 6: Reuse container within MCP session
**Choice:** Keep a single container running per MCP session, reuse it for multiple `run_code` calls.

**Rationale:**
- Eliminates container startup overhead (~200-500ms) for subsequent executions
- Packages installed in one execution remain available in the next
- Session boundary provides natural cleanup point
- Aligns with how users typically work (multiple related code runs)

**Implementation:**
- Start container on first `run_code` call in session
- Keep container running, execute subsequent code via `container exec`
- Stop container when MCP session ends (server shutdown)
- Track container ID in session state

**Alternatives considered:**
- Fresh container per execution: Maximum isolation but slow
- Container pooling: Complex, overkill for single-user MCP sessions

### Decision 7: Native packages work without special handling
**Choice:** No special handling for packages with native dependencies - rely on Bun's handling.

**Rationale:**
- Bun handles native compilation internally
- Base image uses Linux, native packages compile for Linux target
- Adds complexity to special-case this
- Can revisit if specific packages fail

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Server (macOS native)                                  │
│  src/mcp/server.ts                                          │
│  - Holds session state including container ID               │
└───────────────────────────┬─────────────────────────────────┘
                            │ run_code tool call
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Executor (src/mcp/executor.ts)                             │
│  - Detects execution mode (container vs preload)            │
│  - Delegates to appropriate backend                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ container mode
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Container Manager (src/container/manager.ts)               │
│  - Ensures base image exists                                │
│  - Starts session container on first run                    │
│  - Reuses container for subsequent runs (container exec)    │
│  - Stops container on session end                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Package Resolver (src/container/packages.ts)               │
│  - Parses imports from user code                            │
│  - Checks cache for installed packages                      │
│  - Installs missing packages via container exec             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Apple Container (Linux VM) - long-running per session      │
│                                                             │
│  Volumes:                                                   │
│  --volume ~/.bun-runner-mcp/packages:/packages  (rw)        │
│  --volume /tmp/bun-runner-code:/code            (rw)        │
│                                                             │
│  Environment:                                               │
│  BUN_INSTALL_CACHE_DIR=/packages                            │
│                                                             │
│  Execution (via container exec):                            │
│  bun run /code/main.ts                                      │
│                                                             │
│  Limits:                                                    │
│  --cpus 2 --memory 512m                                     │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── container/
│   ├── index.ts           # Module exports
│   ├── manager.ts         # Container lifecycle (start, exec, stop)
│   ├── session.ts         # Session state, container reuse logic
│   ├── packages.ts        # Import parsing, package resolution
│   ├── image.ts           # Base image building/caching
│   └── config.ts          # Paths, defaults, resource limits
├── mcp/
│   └── executor.ts        # Updated: add container execution mode
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Apple Containers is v0.1.0 | May have bugs, breaking changes | Pin CLI version, test thoroughly |
| macOS-only solution | Limits deployment options | Keep preload mode as fallback, Docker for cross-platform |
| Package install latency | First run with new package is slow | Show progress, cache aggressively |
| Session container state accumulation | Long sessions may accumulate state | Resource limits prevent runaway; session end cleans up |

## Migration Plan

### Phase 1: Container Infrastructure
1. Implement container manager with image building
2. Test basic code execution without packages
3. Add execution mode switch to executor

### Phase 2: Package Support
1. Implement import parser
2. Add package installation in container
3. Set up persistent cache volume

### Phase 3: Integration
1. Wire into MCP executor
2. Add configuration (enable/disable, resource limits)
3. Update documentation

### Rollback
- Container mode is opt-in via environment variable
- Preload sandbox remains default
- No database migrations or breaking changes to existing functionality
