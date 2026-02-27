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
  '<thinking>',
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

  it('agents/validator.md exists with required sections', () => {
    const content = readFileSync(resolve(process.cwd(), 'agents/validator.md'), 'utf8');
    expect(content).toContain('PASS');
    expect(content).toContain('FAIL');
    expect(content).toContain('INCONCLUSIVE');
    expect(content).toContain('Verdict');
    expect(content).toContain('phantom');
    // Verify tool restriction — validator must be read-only
    expect(content).toContain('tools:');
    expect(content).toContain('- Read');
    expect(content).toContain('- Grep');
    expect(content).toContain('- Glob');
    expect(content).toContain('Iron Laws');
  });

  it('commands/verify.md exists and references validator agent', () => {
    const content = readFileSync(resolve(process.cwd(), 'commands/verify.md'), 'utf8');
    expect(content).toContain('validator');
    expect(content).toContain('PASS');
    expect(content).toContain('FAIL');
    expect(content).toContain('/scan');
  });
});
