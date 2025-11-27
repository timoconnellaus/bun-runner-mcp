## Context

Bun's auto-install feature only processes import statements in the main script file being executed. When snippets are stored as separate files and imported, their npm dependencies are not detected or installed. This breaks a key value proposition of snippets: being able to save reusable code with all its dependencies.

The inlining approach solves this by treating snippet code as if it were written directly in the user's script, ensuring Bun sees and auto-installs all dependencies.

## Goals / Non-Goals

**Goals:**
- Enable npm package auto-install for code in snippets
- Support snippets that depend on other snippets (transitive dependencies)
- Maintain snippet reusability and modularity
- Work identically in both preload and container execution modes
- Provide clear error messages for circular dependencies

**Non-Goals:**
- Support dynamic/runtime snippet selection (all snippets must be specified via static directives)
- Version management for snippets (snippets are always latest version)
- Cross-session snippet sharing (snippets remain local to the MCP server instance)

## Decisions

### Decision: Directive-Based Snippet Inclusion

**What:** Users specify snippets via special comments: `// @use-snippet: fetch-weather`

**Why:**
- Simple, declarative syntax that's easy to parse
- Doesn't interfere with TypeScript/JavaScript parsing
- Clear intention: these comments are metadata, not code
- Similar to established patterns like `/// <reference>` in TypeScript

**Alternatives considered:**
- Magic import paths (e.g., `import from '@snippets/name'`) - Requires custom module resolution
- Function calls (e.g., `useSnippet('name')`) - Would execute at runtime, too late for Bun auto-install
- Configuration object parameter to `run_code` - Breaks the mental model of "just write code"

### Decision: Prepend All Snippet Code Before User Code

**What:** Resolved snippets are inserted at the very top of the script, before any user code.

**Why:**
- Ensures snippet dependencies are installed before user code runs
- Simplifies implementation: no AST parsing needed
- Works with Bun's auto-install mechanism
- Clear execution order

**Trade-offs:**
- Line numbers in user code shift down (can be mitigated with source map comments)
- All snippet code is in global scope

### Decision: Transform Exports to Declarations

**What:** When inlining snippets, `export function foo() {}` becomes `function foo() {}`

**Why:**
- Snippets use exports for reusability when stored separately
- When inlined, exports are unnecessary and would cause errors
- Simple regex-based transformation is sufficient for common patterns

**Supported patterns:**
```typescript
// BEFORE (in snippet file)
export function fetchWeather(city: string) { ... }
export const API_KEY = "...";
export default class Client { ... }

// AFTER (inlined)
function fetchWeather(city: string) { ... }
const API_KEY = "...";
class Client { ... }
```

**Limitations:**
- Named re-exports (e.g., `export { a as b }`) may need special handling
- Dynamic exports won't work (not expected in snippet use case)

### Decision: Topological Sort for Dependency Order

**What:** Use topological sort to determine correct inlining order when snippets depend on each other.

**Why:**
- Standard algorithm for dependency resolution
- Naturally detects circular dependencies during traversal
- Ensures code that depends on other code comes after its dependencies

**Example:**
```
Snippet A uses Snippet B
Snippet B uses Snippet C
User code uses Snippet A

Inline order: C → B → A → User Code
```

### Decision: Detect Snippet Dependencies via Directive Parsing

**What:** To detect if snippet A uses snippet B, parse snippet A's code for `// @use-snippet: B` directives.

**Why:**
- Consistent with how user code specifies snippets
- Doesn't require complex static analysis
- Explicit rather than implicit (clear dependency declaration)

**Trade-offs:**
- Snippets must declare their snippet dependencies even if they don't need inlining behavior
- Cannot auto-detect dependencies from import statements

## Risks / Trade-offs

### Risk: Line Number Mismatch in Error Messages
**Impact:** When user code has an error, the line number reported may not match their source code due to prepended snippet code.

**Mitigation:**
- Add source map-style comments: `// USER CODE STARTS AT LINE 42`
- Consider adjusting error line numbers in output (future enhancement)

### Risk: Global Scope Pollution
**Impact:** All snippet code runs in global scope, potentially causing name collisions.

**Mitigation:**
- Document best practices: use unique names or wrap in immediately-invoked function expressions (IIFE)
- Consider wrapping each snippet in a scope block (future enhancement)

### Risk: Breaking Change for Existing Users
**Impact:** Current import-based snippet usage will break.

**Mitigation:**
- Clear migration path in documentation
- Tool descriptions updated to show new syntax
- Consider detection and helpful error message for old pattern

### Trade-off: Static vs Dynamic Snippet Loading
**What we chose:** Static directives only (must be in source code)

**What we gave up:** Runtime snippet selection (e.g., choosing snippets based on conditions)

**Rationale:** Bun's auto-install runs at script parse time, before execution. Runtime selection would be too late for auto-install to work.

## Migration Plan

### For Existing Snippet Users

**Old pattern:**
```typescript
import { fetchWeather } from '.bun-runner-mcp/snippets/fetch-weather.ts';
const result = await fetchWeather('London');
```

**New pattern:**
```typescript
// @use-snippet: fetch-weather
const result = await fetchWeather('London');
```

### Rollout Steps

1. Implement new inlining system
2. Update all MCP tool descriptions with migration notes
3. Add detection for old import pattern with helpful error message
4. Update documentation and examples

### Rollback Plan

If critical issues arise:
1. Revert to file-based imports
2. Document npm package limitation in snippet descriptions
3. Consider hybrid approach (inlining optional, enabled via flag)

## Open Questions

- Should we support snippet versioning in the future? (e.g., `@use-snippet: fetch-weather@v2`)
- Should we add a `@use-snippet-exports: name` directive to control which exports become available?
- Should we support inline snippet definitions (define snippet in comment rather than separate file)?
