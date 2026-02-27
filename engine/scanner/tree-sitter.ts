// engine/scanner/tree-sitter.ts — Tree-sitter parser factory with multi-language support
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');

const LANGUAGE_MAP: Record<string, () => any> = {
  typescript: () => require('tree-sitter-typescript').typescript,
  tsx: () => require('tree-sitter-typescript').tsx,
  javascript: () => require('tree-sitter-javascript'),
  swift: () => require('tree-sitter-swift'),
  python: () => require('tree-sitter-python'),
  go: () => require('tree-sitter-go'),
  rust: () => require('tree-sitter-rust'),
  java: () => require('tree-sitter-java'),
  graphql: () => require('tree-sitter-graphql'),
};

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.swift': 'swift',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.graphql': 'graphql',
  '.gql': 'graphql',
};

/**
 * Creates a tree-sitter parser configured for the given language.
 * Throws if the language is not supported.
 */
export function createParser(language: string): any {
  const loader = LANGUAGE_MAP[language];
  if (!loader) throw new Error(`Unsupported language: ${language}`);
  const parser = new Parser();
  parser.setLanguage(loader());
  return parser;
}

/**
 * Detects the language from a file path based on its extension.
 * Returns null if the extension is not recognized.
 */
export function detectLanguage(filePath: string): string | null {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const ext = filePath.slice(dotIndex);
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Returns all supported language identifiers.
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_MAP);
}
