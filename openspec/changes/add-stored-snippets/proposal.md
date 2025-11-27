# Change: Add Stored Code Snippets

## Why

AI assistants frequently write similar code patterns (API calls, data transformations, utilities) that they want to reuse across sessions. Currently, there's no way to persist and recall previously written code, forcing assistants to rewrite the same logic repeatedly.

## What Changes

- Add persistent snippet storage in `.bun-runner-mcp/snippets/` directory
- Snippets are TypeScript files with JSDoc frontmatter containing metadata (description required)
- New MCP tools to manage snippets: `save_snippet`, `list_snippets`, `get_snippet`, `get_snippet_types`, `delete_snippet`
- Snippets can be imported and called from `run_code` with different parameters
- Type introspection via tsserver `quickinfo` command for function signatures

## Impact

- Affected specs: New `snippets` capability
- Affected code:
  - `src/mcp/server.ts` - Add new MCP tool handlers
  - `src/snippets/` - New module for snippet storage and management
  - `src/container/tsserver.ts` - Add `quickinfo` command support for type extraction
