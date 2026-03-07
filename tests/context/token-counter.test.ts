import { describe, expect, it } from 'vitest';
import { countTokens } from '../../engine/context/token-counter.js';

describe('countTokens', () => {
  it('returns zero for empty content', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns a positive token count for non-empty content', () => {
    expect(countTokens('const answer = 42;')).toBeGreaterThan(0);
  });

  it('counts repeated content consistently', () => {
    const first = countTokens('hello world');
    const second = countTokens('hello world');

    expect(first).toBe(second);
  });
});
