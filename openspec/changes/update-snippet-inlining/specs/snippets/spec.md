## MODIFIED Requirements

### Requirement: Snippet Import from run_code

User code executed via `run_code` SHALL reference snippets using directive comments. Snippet code SHALL be inlined (prepended) to the user's code before execution to ensure npm package dependencies in snippets are auto-installed by Bun.

#### Scenario: Single snippet via directive
- **WHEN** `run_code` is called with code containing `// @use-snippet: fetch-weather`
- **AND** the snippet "fetch-weather" exists and exports a `fetchWeather` function
- **THEN** the snippet code SHALL be prepended to the user's code before execution
- **AND** the `fetchWeather` function SHALL be available in the user's code scope
- **AND** any npm packages imported in the snippet SHALL be auto-installed by Bun

#### Scenario: Multiple independent snippets
- **WHEN** `run_code` is called with code containing multiple directives: `// @use-snippet: utils` and `// @use-snippet: api-client`
- **AND** both snippets exist
- **THEN** both snippets SHALL be inlined before user code
- **AND** all exported functions from both snippets SHALL be available
- **AND** npm dependencies from both snippets SHALL be auto-installed

#### Scenario: Non-existent snippet reference
- **WHEN** `run_code` is called with code containing `// @use-snippet: missing-snippet`
- **AND** no snippet named "missing-snippet" exists
- **THEN** execution SHALL fail with an error indicating the snippet was not found

#### Scenario: Old import pattern deprecated
- **WHEN** `run_code` is called with code containing `import { x } from '.bun-runner-mcp/snippets/name.ts'`
- **THEN** this pattern is deprecated (but may still work for backward compatibility)
- **AND** users SHOULD be migrated to use the directive syntax instead

## ADDED Requirements

### Requirement: Snippet Directive Syntax

The system SHALL recognize `// @use-snippet: <name>` comments as directives to inline snippet code.

#### Scenario: Directive format
- **WHEN** parsing user code for snippet directives
- **THEN** comments matching the pattern `// @use-snippet: <snippet-name>` SHALL be recognized
- **AND** the snippet name SHALL be extracted and validated

#### Scenario: Multiple directives in code
- **WHEN** user code contains multiple `// @use-snippet:` directives
- **THEN** all directives SHALL be processed
- **AND** all referenced snippets SHALL be resolved and inlined

#### Scenario: Directive placement
- **WHEN** snippet directives appear anywhere in the user code
- **THEN** they SHALL be processed regardless of location
- **AND** snippet code SHALL be prepended to the top of the script in dependency order

### Requirement: Transitive Snippet Dependencies

The system SHALL resolve transitive dependencies when snippets reference other snippets.

#### Scenario: Snippet depends on another snippet
- **WHEN** snippet A contains `// @use-snippet: B`
- **AND** user code contains `// @use-snippet: A`
- **THEN** both snippet B and snippet A SHALL be inlined
- **AND** snippet B SHALL appear before snippet A in the inlined code
- **AND** user code SHALL appear after both snippets

#### Scenario: Multi-level dependencies
- **WHEN** snippet A uses snippet B, and snippet B uses snippet C
- **AND** user code uses snippet A
- **THEN** snippets SHALL be inlined in order: C, B, A, then user code

#### Scenario: Circular dependency detection
- **WHEN** snippet A contains `// @use-snippet: B`
- **AND** snippet B contains `// @use-snippet: A`
- **THEN** execution SHALL fail with an error indicating a circular dependency
- **AND** the error message SHALL identify the circular chain (e.g., "A → B → A")

### Requirement: Duplicate Snippet Elimination

The system SHALL ensure each snippet is inlined at most once, even if referenced multiple times.

#### Scenario: Multiple references to same snippet
- **WHEN** snippet A contains `// @use-snippet: C`
- **AND** snippet B contains `// @use-snippet: C`
- **AND** user code contains both `// @use-snippet: A` and `// @use-snippet: B`
- **THEN** snippet C SHALL be inlined exactly once
- **AND** snippet C SHALL appear before both A and B in the inlined code

#### Scenario: Direct and transitive reference
- **WHEN** user code contains `// @use-snippet: A` and `// @use-snippet: B`
- **AND** snippet A contains `// @use-snippet: B`
- **THEN** snippet B SHALL be inlined exactly once
- **AND** snippet B SHALL appear before snippet A

### Requirement: Export Transformation for Inlined Snippets

The system SHALL transform export statements in snippets to regular declarations when inlining.

#### Scenario: Transform export function
- **WHEN** a snippet contains `export function fetchWeather(city: string) { ... }`
- **AND** the snippet is inlined
- **THEN** the code SHALL be transformed to `function fetchWeather(city: string) { ... }`

#### Scenario: Transform export const
- **WHEN** a snippet contains `export const API_KEY = "abc123";`
- **AND** the snippet is inlined
- **THEN** the code SHALL be transformed to `const API_KEY = "abc123";`

#### Scenario: Transform export default class
- **WHEN** a snippet contains `export default class Client { ... }`
- **AND** the snippet is inlined
- **THEN** the code SHALL be transformed to `class Client { ... }`

#### Scenario: Preserve non-export code
- **WHEN** a snippet contains regular code without exports
- **AND** the snippet is inlined
- **THEN** the code SHALL remain unchanged
- **AND** JSDoc comments and other metadata SHALL be preserved

### Requirement: Snippet Dependency Detection

The system SHALL detect snippet dependencies by parsing snippet code for `// @use-snippet:` directives.

#### Scenario: Snippet with dependency directive
- **WHEN** snippet "api-client" contains `// @use-snippet: http-utils`
- **THEN** the system SHALL recognize "http-utils" as a dependency of "api-client"
- **AND** this dependency SHALL be included in the resolution graph

#### Scenario: Snippet without dependencies
- **WHEN** a snippet contains no `// @use-snippet:` directives
- **THEN** the snippet SHALL be treated as having zero snippet dependencies
- **AND** it may still have npm package dependencies which will be auto-installed

### Requirement: Execution Mode Compatibility

Snippet inlining SHALL work identically in both preload and container execution modes.

#### Scenario: Preload mode execution
- **WHEN** `run_code` is executed in preload mode (using `bun --preload`)
- **AND** user code includes snippet directives
- **THEN** snippets SHALL be inlined and npm packages SHALL be auto-installed

#### Scenario: Container mode execution
- **WHEN** `run_code` is executed in container mode (using Apple Containers)
- **AND** user code includes snippet directives
- **THEN** snippets SHALL be inlined and npm packages SHALL be auto-installed
- **AND** behavior SHALL be identical to preload mode

### Requirement: Error Messages with Line Numbers

The system SHALL provide error messages that include line numbers from the final combined code (after snippet inlining).

#### Scenario: Error in user code
- **WHEN** user code has a syntax or runtime error
- **AND** snippets have been inlined before the user code
- **THEN** error messages SHALL indicate the line number in the final combined code
- **AND** a comment indicating where user code starts MAY be added (e.g., `// USER CODE STARTS AT LINE 42`)

#### Scenario: Error in snippet code
- **WHEN** an inlined snippet has a syntax or runtime error
- **THEN** the error message SHALL include the line number where the error occurred
- **AND** the snippet name MAY be identifiable via source comments or error context
