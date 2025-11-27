## ADDED Requirements

### Requirement: Sandboxed Code Execution
The executor SHALL run user code in a sandboxed environment using the Bun preload mechanism.

#### Scenario: Code runs with preload
- **WHEN** user submits code via run_code tool
- **THEN** executor spawns Bun with --preload flag pointing to sandbox/preload.ts

### Requirement: Proxy Permission Sync
The executor SHALL synchronize session permissions to the proxy server before code execution.

#### Scenario: Permissions granted before execution
- **WHEN** session has granted permissions
- **THEN** executor sends each permission to proxy Control API before spawning code

#### Scenario: Permissions cleared after execution
- **WHEN** code execution completes (success or failure)
- **THEN** executor clears permissions from proxy via Control API

### Requirement: Proxy Server Lifecycle
The executor SHALL ensure the proxy server is running before executing code.

#### Scenario: Proxy health check
- **WHEN** executor prepares to run code
- **THEN** executor checks proxy health endpoint at localhost:9998/health

#### Scenario: Proxy not available
- **WHEN** proxy server is not responding
- **THEN** executor returns error indicating proxy unavailable
