import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resolveConfigPath, validateConfig, DEFAULT_CONFIG } from '../engine/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('config', () => {
  const tmpDir = path.join(os.tmpdir(), 'omni-link-test-config');

  beforeEach(() => { fs.mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('resolveConfigPath finds local .omni-link.json first', () => {
    const localConfig = path.join(tmpDir, '.omni-link.json');
    fs.writeFileSync(localConfig, '{}');
    const result = resolveConfigPath(tmpDir);
    expect(result).toBe(localConfig);
  });

  it('resolveConfigPath returns null if no config found', () => {
    // Pass a fake homeDir so the function cannot fall through to the real
    // ~/.claude/omni-link.json that may exist on the developer's machine.
    const fakeHome = path.join(os.tmpdir(), 'omni-link-test-fake-home');
    const result = resolveConfigPath(tmpDir, fakeHome);
    expect(result).toBeNull();
  });

  it('validateConfig rejects empty repos array', () => {
    const result = validateConfig({ repos: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('repos: must have at least 1 repo');
  });

  it('validateConfig rejects more than 4 repos', () => {
    const repos = Array.from({ length: 5 }, (_, i) => ({
      name: `repo-${i}`, path: `/tmp/repo-${i}`, language: 'typescript', role: 'backend',
    }));
    const result = validateConfig({ repos });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('repos: maximum 4 repos allowed');
  });

  it('validateConfig accepts valid config', () => {
    const result = validateConfig({
      repos: [{ name: 'test', path: '/tmp/test', language: 'typescript', role: 'backend' }],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('loadConfig merges with defaults', () => {
    const configPath = path.join(tmpDir, '.omni-link.json');
    fs.writeFileSync(configPath, JSON.stringify({
      repos: [{ name: 'test', path: '/tmp/test', language: 'typescript', role: 'backend' }],
    }));
    const config = loadConfig(configPath);
    expect(config.repos).toHaveLength(1);
    expect(config.evolution.aggressiveness).toBe(DEFAULT_CONFIG.evolution.aggressiveness);
    expect(config.context.tokenBudget).toBe(DEFAULT_CONFIG.context.tokenBudget);
  });

  it('loadConfig throws on invalid JSON', () => {
    const configPath = path.join(tmpDir, '.omni-link.json');
    fs.writeFileSync(configPath, 'not json');
    expect(() => loadConfig(configPath)).toThrow();
  });
});
