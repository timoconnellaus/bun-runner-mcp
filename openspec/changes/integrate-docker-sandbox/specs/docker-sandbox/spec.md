## ADDED Requirements

### Requirement: Docker Execution Mode
The executor SHALL support running code inside a Docker container when EXECUTION_MODE=docker.

#### Scenario: Docker mode enabled
- **WHEN** EXECUTION_MODE environment variable is set to "docker"
- **THEN** executor runs code inside the bun-sandbox container

#### Scenario: Local mode (default)
- **WHEN** EXECUTION_MODE is not set or set to "local"
- **THEN** executor runs code locally with preload

### Requirement: Container Security
The Docker container SHALL enforce security constraints on executed code.

#### Scenario: Read-only filesystem
- **WHEN** code attempts to write outside /tmp or /sandbox/code
- **THEN** write operation fails with permission error

#### Scenario: No process spawning
- **WHEN** code attempts to spawn child processes
- **THEN** operation fails due to sandbox restrictions

#### Scenario: Resource limits enforced
- **WHEN** code exceeds memory limit (256MB) or CPU quota
- **THEN** container kills the process

### Requirement: Container Lifecycle
The MCP server SHALL require the Docker container to be running when in Docker mode.

#### Scenario: Container not running
- **WHEN** Docker mode is enabled but container is not running
- **THEN** executor returns error with instructions to run docker-compose up

#### Scenario: Container health check
- **WHEN** Docker mode is enabled
- **THEN** executor verifies container health before executing code
