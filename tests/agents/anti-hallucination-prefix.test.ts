import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const AGENT_FILES = [
  'agents/cross-repo-reviewer.md',
  'agents/evolution-strategist.md',
  'agents/repo-analyst.md',
];

const REQUIRED_PHRASES = [
  'ANTI-HALLUCINATION PROTOCOL',
  'cannot confirm',
  'thinking',
  'confidence',
];

describe('Agent anti-hallucination protocol', () => {
  for (const file of AGENT_FILES) {
    it(`${file} contains anti-hallucination protocol`, () => {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const phrase of REQUIRED_PHRASES) {
        expect(content.toLowerCase()).toContain(phrase.toLowerCase());
      }
    });
  }
});
