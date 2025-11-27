# Tasks: Add Apple Container Runtime with Package Support

## 1. Container Infrastructure

- [x] 1.1 Create `src/container/config.ts` with paths and defaults
  - Cache directory: `~/.bun-runner-mcp/packages`
  - Base image name: `bun-runner-base`
  - Default resource limits: 2 CPUs, 512MB RAM
  - Execution timeout: 30 seconds

- [x] 1.2 Create `src/container/image.ts` for base image management
  - Function to check if base image exists (`container image list`)
  - Function to build base image with Bun runtime
  - Dockerfile/image definition with Alpine + Bun

- [x] 1.3 Create `src/container/manager.ts` for container lifecycle
  - Function to start session container (`container run` with volumes)
  - Function to execute code in running container (`container exec`)
  - Function to stop and remove container
  - Handle stdout/stderr capture
  - Implement timeout handling for individual executions
  - Container health check (detect if container crashed)

- [x] 1.4 Create `src/container/session.ts` for session state
  - Track running container ID
  - Provide getOrCreateContainer() for lazy initialization
  - Register shutdown hook to clean up container on process exit

- [ ] 1.5 Test basic container execution
  - Verify `container run` works with simple script
  - Verify volume mounts work correctly
  - Verify resource limits are applied
  - **Note**: Requires macOS 26+ with Apple Containers installed

## 2. Package Management

- [x] 2.1 Create `src/container/packages.ts` for import parsing
  - Parse ES module imports from code string
  - Parse CommonJS requires from code string
  - Identify npm package names (exclude relative/absolute paths)
  - Handle scoped packages (@org/package)

- [x] 2.2 Implement package cache directory structure
  - Create cache directory on startup if not exists
  - Structure: `~/.bun-runner-mcp/packages/node_modules/`

- [x] 2.3 Implement package installation in container
  - Run `bun install <package>` inside container with cache volume
  - Capture install output for debugging
  - Handle install failures gracefully

- [x] 2.4 Implement package availability check
  - Check if package exists in cache before installing
  - Skip install for already-cached packages

## 3. Executor Integration

- [x] 3.1 Add execution mode configuration
  - Environment variable: `EXECUTION_MODE=container|preload`
  - Default to `preload` for backwards compatibility

- [x] 3.2 Update `src/mcp/executor.ts`
  - Add container execution path
  - Route based on execution mode config
  - Maintain same return interface

- [x] 3.3 Wire package resolution into execution flow
  - Parse imports before execution
  - Install missing packages
  - Execute code with packages available

## 4. Module Structure

- [x] 4.1 Create `src/container/index.ts` with exports
- [x] 4.2 Update any necessary imports in existing code

## 5. Testing & Documentation

- [ ] 5.1 Manual test: Simple code without packages
- [ ] 5.2 Manual test: Code with common package (e.g., lodash)
- [ ] 5.3 Manual test: Code with scoped package (e.g., @faker-js/faker)
- [ ] 5.4 Manual test: Resource limit enforcement
- [ ] 5.5 Manual test: Container reuse (multiple executions, same session)
- [ ] 5.6 Manual test: Container cleanup on server shutdown
- [ ] 5.7 Update README with container mode instructions

**Note**: Manual testing tasks (5.1-5.6) require macOS 26+ with Apple Containers CLI installed. These can be completed once the runtime environment is available.
