import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../engine/cli.js';

describe('engine/cli main', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let previousExitCode: number | undefined;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns zero for help output', async () => {
    const exitCode = await main(['--help']);

    expect(exitCode).toBe(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets process.exitCode for invalid input', async () => {
    const exitCode = await main(['--format']);

    expect(exitCode).toBe(1);
    expect(process.exitCode).toBe(1);
  });
});
