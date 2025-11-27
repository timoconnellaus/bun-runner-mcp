## ADDED Requirements

### Requirement: Snippet Persistence

The system SHALL persist code snippets to disk in the `.bun-runner-mcp/snippets/` directory relative to the MCP server working directory.

#### Scenario: Snippet directory creation
- **WHEN** a snippet is saved
- **AND** the `.bun-runner-mcp/snippets/` directory does not exist
- **THEN** the directory SHALL be created automatically

#### Scenario: Snippet file format
- **WHEN** a snippet is saved with name "fetch-weather"
- **THEN** it SHALL be stored as `.bun-runner-mcp/snippets/fetch-weather.ts`
- **AND** the file SHALL contain valid TypeScript code

### Requirement: Snippet Metadata

Each snippet SHALL include JSDoc frontmatter with a required `@description` tag that describes the snippet's purpose.

#### Scenario: Valid snippet with description
- **WHEN** saving a snippet with code containing `/** @description Fetches weather data */`
- **THEN** the save SHALL succeed
- **AND** the description SHALL be extractable via `list_snippets`

#### Scenario: Missing description rejected
- **WHEN** saving a snippet without a `@description` JSDoc tag
- **THEN** the save SHALL fail with an error indicating description is required

### Requirement: MCP Tool - save_snippet

The system SHALL provide a `save_snippet` MCP tool to save a named code snippet.

#### Scenario: Save new snippet
- **WHEN** `save_snippet` is called with name "fetch-weather" and valid TypeScript code with description
- **THEN** the snippet SHALL be saved to `.bun-runner-mcp/snippets/fetch-weather.ts`
- **AND** response SHALL confirm success

#### Scenario: Overwrite existing snippet
- **WHEN** `save_snippet` is called with a name that already exists
- **THEN** the existing snippet SHALL be overwritten with the new code

#### Scenario: Invalid snippet name rejected
- **WHEN** `save_snippet` is called with a name containing invalid characters (not alphanumeric, hyphen, or underscore)
- **THEN** the save SHALL fail with a validation error

### Requirement: MCP Tool - list_snippets

The system SHALL provide a `list_snippets` MCP tool to list all available snippets with their names and descriptions.

#### Scenario: List snippets
- **WHEN** `list_snippets` is called
- **THEN** response SHALL include an array of snippets
- **AND** each snippet SHALL have `name` and `description` fields

#### Scenario: Empty snippet list
- **WHEN** `list_snippets` is called with no saved snippets
- **THEN** response SHALL return an empty array

### Requirement: MCP Tool - get_snippet

The system SHALL provide a `get_snippet` MCP tool to retrieve the full code and metadata for a named snippet.

#### Scenario: Get existing snippet
- **WHEN** `get_snippet` is called with name "fetch-weather"
- **AND** a snippet with that name exists
- **THEN** response SHALL include the full TypeScript code and description

#### Scenario: Get non-existent snippet
- **WHEN** `get_snippet` is called with a name that does not exist
- **THEN** response SHALL return an error indicating snippet not found

### Requirement: MCP Tool - get_snippet_types

The system SHALL provide a `get_snippet_types` MCP tool to retrieve TypeScript type information for exported functions in a snippet.

#### Scenario: Get function types
- **WHEN** `get_snippet_types` is called with name "fetch-weather"
- **AND** the snippet exports a function `fetchWeather(city: string): Promise<WeatherData>`
- **THEN** response SHALL include the function name and its type signature

#### Scenario: Multiple exports
- **WHEN** `get_snippet_types` is called for a snippet with multiple exported functions
- **THEN** response SHALL include type information for all exported functions

### Requirement: MCP Tool - delete_snippet

The system SHALL provide a `delete_snippet` MCP tool to remove a saved snippet.

#### Scenario: Delete existing snippet
- **WHEN** `delete_snippet` is called with name "fetch-weather"
- **AND** a snippet with that name exists
- **THEN** the snippet file SHALL be deleted
- **AND** response SHALL confirm deletion

#### Scenario: Delete non-existent snippet
- **WHEN** `delete_snippet` is called with a name that does not exist
- **THEN** response SHALL return an error indicating snippet not found

### Requirement: Snippet Import from run_code

Saved snippets SHALL be importable from code executed via `run_code`.

#### Scenario: Import and call snippet
- **WHEN** `run_code` is called with code `import { fetchWeather } from '.bun-runner-mcp/snippets/fetch-weather.ts'; await fetchWeather('London');`
- **AND** the snippet "fetch-weather" exists and exports `fetchWeather`
- **THEN** the import SHALL resolve successfully
- **AND** the function SHALL execute with the provided parameters
