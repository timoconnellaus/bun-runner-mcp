## 1. Snippet Directive Parsing

- [x] 1.1 Add directive parser to detect `// @use-snippet: <name>` comments
- [x] 1.2 Support multiple directives in user code
- [x] 1.3 Extract snippet names from directives
- [x] 1.4 Validate that referenced snippet names exist

## 2. Dependency Graph Resolution

- [x] 2.1 Create dependency analyzer to detect snippet-to-snippet references
- [x] 2.2 Implement topological sort for dependency ordering
- [x] 2.3 Detect circular dependencies and return clear error
- [x] 2.4 Eliminate duplicate snippets when multiple snippets depend on the same snippet

## 3. Code Transformation

- [x] 3.1 Strip or transform `export` keywords when inlining snippets
- [x] 3.2 Handle `export default` vs `export { ... }` vs `export function` patterns
- [x] 3.3 Preserve JSDoc comments and other metadata
- [x] 3.4 Add source mapping comments for debugging (optional)

## 4. Code Inlining

- [x] 4.1 Update `executeInSandbox()` to process snippet directives before execution
- [x] 4.2 Update `executeInSessionContainer()` to process snippet directives
- [x] 4.3 Prepend resolved snippet code in correct dependency order
- [x] 4.4 Preserve line numbers for user code in error messages

## 5. Migration and Backwards Compatibility

- [x] 5.1 Update `save_snippet` tool description to document directive syntax
- [x] 5.2 Add migration notes to snippet-related MCP tool descriptions
- [ ] 5.3 Consider deprecation warning if old import pattern detected

## 6. Testing

- [x] 6.1 Test single snippet inlining
- [x] 6.2 Test multiple independent snippets
- [x] 6.3 Test transitive dependencies (snippet A uses snippet B)
- [x] 6.4 Test circular dependency detection
- [x] 6.5 Test duplicate elimination
- [x] 6.6 Test snippet with npm packages auto-install
- [ ] 6.7 Test both preload and container execution modes
