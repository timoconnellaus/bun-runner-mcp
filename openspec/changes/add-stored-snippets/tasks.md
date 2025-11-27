## 1. Snippet Storage Module

- [x] 1.1 Create `src/snippets/store.ts` with SnippetStore class
- [x] 1.2 Implement snippet save (write file with validation)
- [x] 1.3 Implement snippet list (read directory, parse frontmatter)
- [x] 1.4 Implement snippet get (read file, return code + metadata)
- [x] 1.5 Implement snippet delete (remove file)
- [x] 1.6 Add frontmatter parsing for JSDoc `@description` tag

## 2. Type Introspection

- [x] 2.1 Add `quickinfo` command to TsServer class
- [x] 2.2 Create `getExportedFunctionTypes()` method to extract function signatures
- [x] 2.3 Handle snippets with multiple exported functions

## 3. MCP Tool Integration

- [x] 3.1 Add `save_snippet` tool handler
- [x] 3.2 Add `list_snippets` tool handler
- [x] 3.3 Add `get_snippet` tool handler
- [x] 3.4 Add `get_snippet_types` tool handler
- [x] 3.5 Add `delete_snippet` tool handler
- [x] 3.6 Register all new tools in ListToolsRequestSchema handler

## 4. Run Code Integration

- [x] 4.1 Make snippets importable from `run_code` (e.g., `import { fetchWeather } from '.bun-runner-mcp/snippets/fetch-weather.ts'`)
- [x] 4.2 Ensure snippet directory is accessible in sandbox execution context

## 5. Testing

- [x] 5.1 Test snippet CRUD operations
- [x] 5.2 Test type extraction via tsserver
- [x] 5.3 Test importing snippets from run_code
