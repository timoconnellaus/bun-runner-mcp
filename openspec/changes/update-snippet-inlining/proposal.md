# Change: Update Snippet Inlining Strategy

## Why

Currently, snippets are stored as separate files and imported via file paths (e.g., `import { fetchWeather } from '.bun-runner-mcp/snippets/fetch-weather.ts'`). This approach has a critical limitation: Bun's auto-install feature for npm packages only works when dependencies are declared in the main script being executed. When snippets contain npm package imports and are loaded as external files, Bun doesn't auto-install those dependencies, causing runtime errors.

## What Changes

- Replace file-based imports with inline/prepend strategy: snippet code is injected at the start of user code before execution
- Add snippet directive syntax for users to specify which snippets to include (e.g., `// @use-snippet: fetch-weather`)
- Implement dependency graph resolution to handle snippets that depend on other snippets
- Handle circular dependency detection and duplicate snippet elimination
- Transform snippet exports to work in inline context (exports become regular declarations when inlined)
- **BREAKING**: The import-based snippet usage pattern will no longer work; users must use the directive syntax instead

## Impact

- Affected specs: `snippets` (modify existing capability)
- Affected code:
  - `src/snippets/` - Add dependency resolution and code transformation logic
  - `src/mcp/executor.ts` - Process snippet directives before execution
  - `src/container/session.ts` - Process snippet directives for container mode
- Breaking change: Existing snippet import syntax will need migration to directive syntax
- Benefits: npm packages in snippets will now work correctly in both preload and container modes
