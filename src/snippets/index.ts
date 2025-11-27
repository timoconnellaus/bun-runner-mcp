export {
  SnippetStore,
  SNIPPETS_DIR,
  type SnippetMetadata,
  type Snippet,
  type ValidationResult,
  validateSnippetName,
  validateSnippetCode,
  extractDescription,
} from './store.js';

export {
  inlineSnippets,
  parseDirectives,
  stripExports,
  type InlineResult,
} from './inliner.js';
