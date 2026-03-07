import { encode } from 'gpt-tokenizer';

function estimateFallbackTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  try {
    return encode(text).length;
  } catch {
    return estimateFallbackTokens(text);
  }
}
