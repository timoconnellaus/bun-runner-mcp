# Package Management Specification

## ADDED Requirements

### Requirement: Import Detection
The system SHALL detect npm package imports in user code before execution.

#### Scenario: ES module import detected
- **WHEN** user code contains `import x from 'package-name'`
- **THEN** system SHALL identify `package-name` as a required package

#### Scenario: CommonJS require detected
- **WHEN** user code contains `require('package-name')`
- **THEN** system SHALL identify `package-name` as a required package

#### Scenario: Scoped package detected
- **WHEN** user code contains `import x from '@scope/package-name'`
- **THEN** system SHALL identify `@scope/package-name` as a required package

#### Scenario: Relative import ignored
- **WHEN** user code contains `import x from './local-file'`
- **THEN** system SHALL NOT treat `./local-file` as an npm package

#### Scenario: Built-in module ignored
- **WHEN** user code contains `import fs from 'fs'`
- **THEN** system SHALL NOT treat `fs` as an npm package requiring installation

### Requirement: Package Cache
The system SHALL maintain a persistent package cache to avoid repeated installations.

#### Scenario: Cache directory created
- **WHEN** system starts with container mode enabled
- **AND** cache directory does not exist
- **THEN** system SHALL create `~/.bun-runner-mcp/packages/`

#### Scenario: Cached package reused
- **WHEN** code requires package `lodash`
- **AND** `lodash` exists in package cache
- **THEN** system SHALL NOT reinstall the package
- **AND** execution SHALL use cached version

### Requirement: Package Installation
The system SHALL install missing packages inside the container before code execution.

#### Scenario: Missing package installed
- **WHEN** code requires package `lodash`
- **AND** `lodash` is NOT in package cache
- **THEN** system SHALL run `bun install lodash` inside container
- **AND** package SHALL be installed to shared cache volume
- **AND** subsequent executions SHALL find package in cache

#### Scenario: Multiple packages installed
- **WHEN** code requires packages `lodash` and `axios`
- **AND** neither package is in cache
- **THEN** system SHALL install both packages before execution

#### Scenario: Installation failure handling
- **WHEN** package installation fails (e.g., package not found)
- **THEN** system SHALL return error indicating which package failed
- **AND** execution SHALL NOT proceed

### Requirement: Package Availability in Execution
The system SHALL make installed packages available to user code during execution.

#### Scenario: Package importable after install
- **WHEN** package `lodash` has been installed to cache
- **AND** user code contains `import _ from 'lodash'`
- **THEN** import SHALL resolve successfully
- **AND** code SHALL execute with package available
