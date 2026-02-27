import { describe, it, expect } from 'vitest';
import { createParser, getSupportedLanguages, detectLanguage } from '../../engine/scanner/tree-sitter.js';

describe('tree-sitter parser factory', () => {
  it('creates a parser for typescript', () => {
    const parser = createParser('typescript');
    expect(parser).toBeDefined();
    const tree = parser.parse('const x: number = 1;');
    expect(tree.rootNode.type).toBe('program');
  });

  it('creates a parser for swift', () => {
    const parser = createParser('swift');
    expect(parser).toBeDefined();
    const tree = parser.parse('let x: Int = 1');
    expect(tree.rootNode.type).toBe('source_file');
  });

  it('creates a parser for python', () => {
    const parser = createParser('python');
    expect(parser).toBeDefined();
    const tree = parser.parse('x: int = 1');
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('throws for unsupported language', () => {
    expect(() => createParser('cobol')).toThrow('Unsupported language: cobol');
  });

  it('detects language from file extension', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript');
    expect(detectLanguage('foo.tsx')).toBe('tsx');
    expect(detectLanguage('foo.swift')).toBe('swift');
    expect(detectLanguage('foo.py')).toBe('python');
    expect(detectLanguage('foo.go')).toBe('go');
    expect(detectLanguage('foo.rs')).toBe('rust');
    expect(detectLanguage('foo.java')).toBe('java');
    expect(detectLanguage('foo.js')).toBe('javascript');
    expect(detectLanguage('foo.jsx')).toBe('javascript');
  });

  it('getSupportedLanguages returns all supported languages', () => {
    const langs = getSupportedLanguages();
    expect(langs).toContain('typescript');
    expect(langs).toContain('swift');
    expect(langs).toContain('python');
    expect(langs.length).toBeGreaterThanOrEqual(7);
  });
});
