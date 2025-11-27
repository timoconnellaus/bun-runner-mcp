import { SnippetStore } from './store.js';

/**
 * Snippet inlining for run_code.
 * Parses directive comments, resolves dependencies, and prepends snippet code.
 */

/** Regex to match // @use-snippet: <name> directives */
const DIRECTIVE_REGEX = /\/\/\s*@use-snippet:\s*([a-zA-Z0-9_-]+)/g;

/** Regex to strip export keywords */
const EXPORT_FUNCTION_REGEX = /^export\s+(async\s+)?function\s+/gm;
const EXPORT_CONST_REGEX = /^export\s+(const|let|var)\s+/gm;
const EXPORT_CLASS_REGEX = /^export\s+(abstract\s+)?class\s+/gm;
const EXPORT_DEFAULT_REGEX = /^export\s+default\s+/gm;
const EXPORT_TYPE_REGEX = /^export\s+(type|interface)\s+/gm;

/** Result of snippet inlining */
export interface InlineResult {
  success: boolean;
  code?: string;
  error?: string;
  snippetsUsed?: string[];
}

/** Dependency graph node */
interface DepNode {
  name: string;
  code: string;
  deps: string[];
}

/**
 * Parse snippet directives from code.
 * @param code - User code to parse
 * @returns Array of snippet names referenced
 */
export function parseDirectives(code: string): string[] {
  const matches = code.matchAll(DIRECTIVE_REGEX);
  const names: string[] = [];
  for (const match of matches) {
    const name = match[1];
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Strip export keywords from snippet code for inlining.
 * @param code - Snippet code with exports
 * @returns Code with exports transformed to regular declarations
 */
export function stripExports(code: string): string {
  return code
    .replace(EXPORT_FUNCTION_REGEX, (match, async) => async ? 'async function ' : 'function ')
    .replace(EXPORT_CONST_REGEX, (_, keyword) => `${keyword} `)
    .replace(EXPORT_CLASS_REGEX, (_, abstract) => abstract ? 'abstract class ' : 'class ')
    .replace(EXPORT_DEFAULT_REGEX, '')
    .replace(EXPORT_TYPE_REGEX, (_, keyword) => `${keyword} `);
}

/**
 * Build dependency graph for snippets.
 * @param snippetNames - Initial snippet names to resolve
 * @param store - SnippetStore instance
 * @returns Map of snippet name to DepNode, or error
 */
async function buildDependencyGraph(
  snippetNames: string[],
  store: SnippetStore
): Promise<{ graph?: Map<string, DepNode>; error?: string }> {
  const graph = new Map<string, DepNode>();
  const toProcess = [...snippetNames];
  const processing = new Set<string>();

  while (toProcess.length > 0) {
    const name = toProcess.shift()!;

    if (graph.has(name)) {
      continue; // Already processed
    }

    const result = await store.get(name);
    if (result.error || !result.snippet) {
      return { error: `Snippet '${name}' not found` };
    }

    const code = result.snippet.code;
    const deps = parseDirectives(code);

    graph.set(name, { name, code, deps });

    // Add deps to process queue
    for (const dep of deps) {
      if (!graph.has(dep) && !toProcess.includes(dep)) {
        toProcess.push(dep);
      }
    }
  }

  return { graph };
}

/**
 * Detect circular dependencies in the graph.
 * @param graph - Dependency graph
 * @returns Error message if circular, null otherwise
 */
function detectCircular(graph: Map<string, DepNode>): string | null {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(name: string): string | null {
    visited.add(name);
    recStack.add(name);
    path.push(name);

    const node = graph.get(name);
    if (node) {
      for (const dep of node.deps) {
        if (!visited.has(dep)) {
          const result = dfs(dep);
          if (result) return result;
        } else if (recStack.has(dep)) {
          // Found cycle
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          return `Circular dependency detected: ${cycle.join(' → ')}`;
        }
      }
    }

    path.pop();
    recStack.delete(name);
    return null;
  }

  for (const name of graph.keys()) {
    if (!visited.has(name)) {
      const result = dfs(name);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Topological sort of dependency graph.
 * @param graph - Dependency graph
 * @param rootNames - Root snippet names (entry points)
 * @returns Sorted list of snippet names (dependencies first)
 */
function topologicalSort(graph: Map<string, DepNode>, rootNames: string[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);

    const node = graph.get(name);
    if (node) {
      // Visit dependencies first
      for (const dep of node.deps) {
        visit(dep);
      }
    }

    result.push(name);
  }

  // Visit all root nodes and their dependencies
  for (const name of rootNames) {
    visit(name);
  }

  return result;
}

/**
 * Inline snippets into user code.
 * Parses directives, resolves dependencies, and prepends snippet code.
 *
 * @param userCode - User's code with // @use-snippet: directives
 * @param store - SnippetStore instance (optional, uses default if not provided)
 * @returns InlineResult with combined code or error
 */
export async function inlineSnippets(
  userCode: string,
  store?: SnippetStore
): Promise<InlineResult> {
  const snippetStore = store || new SnippetStore();

  // Parse directives from user code
  const directiveNames = parseDirectives(userCode);

  if (directiveNames.length === 0) {
    // No snippets to inline
    return { success: true, code: userCode, snippetsUsed: [] };
  }

  // Build dependency graph
  const graphResult = await buildDependencyGraph(directiveNames, snippetStore);
  if (graphResult.error) {
    return { success: false, error: graphResult.error };
  }

  const graph = graphResult.graph!;

  // Check for circular dependencies
  const circularError = detectCircular(graph);
  if (circularError) {
    return { success: false, error: circularError };
  }

  // Topological sort to get correct order
  const sortedNames = topologicalSort(graph, directiveNames);

  // Build combined code
  const parts: string[] = [];

  // Add header comment
  parts.push(`// === INLINED SNIPPETS (${sortedNames.length}) ===`);

  // Add each snippet in dependency order
  for (const name of sortedNames) {
    const node = graph.get(name)!;
    parts.push(`// --- snippet: ${name} ---`);
    parts.push(stripExports(node.code));
    parts.push('');
  }

  parts.push('// === USER CODE ===');
  parts.push(userCode);

  return {
    success: true,
    code: parts.join('\n'),
    snippetsUsed: sortedNames,
  };
}
