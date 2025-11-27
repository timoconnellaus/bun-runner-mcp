# Container Runtime Specification

## ADDED Requirements

### Requirement: Apple Container Execution Mode
The system SHALL support executing user code inside Apple Containers when configured with `EXECUTION_MODE=container`.

#### Scenario: Container mode enabled
- **WHEN** `EXECUTION_MODE` environment variable is set to `container`
- **AND** user submits code via `run_code` tool
- **THEN** code SHALL execute inside an Apple Container VM
- **AND** container SHALL be isolated from host system

#### Scenario: Container mode disabled (default)
- **WHEN** `EXECUTION_MODE` environment variable is not set or set to `preload`
- **AND** user submits code via `run_code` tool
- **THEN** code SHALL execute using the preload sandbox (existing behavior)

### Requirement: Base Image Management
The system SHALL maintain a base container image with Bun runtime pre-installed.

#### Scenario: Base image exists
- **WHEN** container execution is requested
- **AND** base image `bun-runner-base` exists locally
- **THEN** system SHALL use existing image without rebuilding

#### Scenario: Base image missing
- **WHEN** container execution is requested
- **AND** base image `bun-runner-base` does not exist
- **THEN** system SHALL build the base image before execution
- **AND** base image SHALL contain Bun runtime

### Requirement: Resource Limits
The system SHALL enforce resource limits on container execution to prevent resource exhaustion.

#### Scenario: CPU limit enforced
- **WHEN** code executes in container
- **THEN** container SHALL be limited to configured CPU count (default: 2)

#### Scenario: Memory limit enforced
- **WHEN** code executes in container
- **THEN** container SHALL be limited to configured memory (default: 512MB)

#### Scenario: Timeout enforced
- **WHEN** code execution exceeds timeout (default: 30 seconds)
- **THEN** container SHALL be terminated
- **AND** execution result SHALL indicate timeout error

### Requirement: Volume Mounts
The system SHALL mount required volumes for code execution and package access.

#### Scenario: Code file mounted
- **WHEN** code executes in container
- **THEN** user code file SHALL be mounted read-only at `/code/main.ts`

#### Scenario: Package cache mounted
- **WHEN** code executes in container
- **THEN** package cache directory SHALL be mounted read-write at `/packages`

### Requirement: Output Capture
The system SHALL capture stdout and stderr from container execution.

#### Scenario: Successful execution output
- **WHEN** code executes successfully in container
- **THEN** stdout content SHALL be returned in execution result
- **AND** stderr content SHALL be returned in execution result

#### Scenario: Failed execution output
- **WHEN** code execution fails in container
- **THEN** error message SHALL be returned in execution result
- **AND** any partial stdout/stderr SHALL be included

### Requirement: Session Container Reuse
The system SHALL reuse a single container across multiple code executions within an MCP session.

#### Scenario: First execution starts container
- **WHEN** first `run_code` call is made in a session with container mode
- **AND** no session container is running
- **THEN** system SHALL start a new container
- **AND** container ID SHALL be stored in session state

#### Scenario: Subsequent execution reuses container
- **WHEN** `run_code` call is made in a session with container mode
- **AND** session container is already running
- **THEN** system SHALL execute code in existing container via `container exec`
- **AND** system SHALL NOT start a new container

#### Scenario: Session end stops container
- **WHEN** MCP session ends (server shutdown or client disconnect)
- **AND** session container is running
- **THEN** system SHALL stop and remove the session container

#### Scenario: Container crash recovery
- **WHEN** `run_code` call is made in a session
- **AND** session container has crashed or been stopped externally
- **THEN** system SHALL start a new container
- **AND** execution SHALL proceed normally
