# Omni-Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that unifies up to 4 repos into a grounded AI ecosystem with cross-repo intelligence, anti-slop enforcement, and proactive business evolution.

**Architecture:** Superpowers-compatible plugin with a TypeScript analysis engine. Skills (markdown) define workflows, engine (TS) provides code intelligence. Session-start hook boots the engine, injects ecosystem context. SHA-indexed file cache for incremental scanning.

**Tech Stack:** TypeScript, tree-sitter (native Node bindings + language grammars), Node.js 18+, vitest for testing. No external services.

---

## Phase 1: Foundation (Scaffold, Config, Core Types)

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`

**Step 1: Initialize package.json**

```json
{
  "name": "omni-link",
  "version": "0.1.0",
  "description": "Multi-repo AI ecosystem plugin for Claude Code",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "author": "Sebastian Dysart",
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  },
  "dependencies": {
    "tree-sitter": "^0.25.0",
    "tree-sitter-typescript": "^0.23.0",
    "tree-sitter-javascript": "^0.25.0",
    "tree-sitter-swift": "^0.7.0",
    "tree-sitter-python": "^0.25.0",
    "tree-sitter-go": "^0.25.0",
    "tree-sitter-rust": "^0.24.0",
    "tree-sitter-java": "^0.23.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "engine",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["engine/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
cache/repos/
cache/graph.json
cache/digest.json
*.tsbuildinfo
.DS_Store
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
```

**Step 5: Create directory structure**

```bash
mkdir -p engine/{scanner,grapher,context,quality,evolution}
mkdir -p tests/{scanner,grapher,context,quality,evolution}
mkdir -p skills/{ecosystem-grounding,cross-repo-impact,anti-slop-gate,business-evolution,convention-enforcer,dependency-navigator,health-audit,ecosystem-planner,upgrade-executor,using-omni-link}
mkdir -p agents commands hooks .claude-plugin config cache
touch cache/.gitkeep
```

**Step 6: Install dependencies**

Run: `cd ~/Desktop/omni-link && npm install`

**Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold project structure with TS, tree-sitter, vitest"
```

---

### Task 2: Plugin manifests

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

**Step 1: Create plugin.json**

```json
{
  "name": "omni-link",
  "description": "Multi-repo AI ecosystem plugin — cross-repo grounding, anti-slop enforcement, and proactive business evolution for Claude Code",
  "version": "0.1.0",
  "author": {
    "name": "Sebastian Dysart"
  },
  "homepage": "https://github.com/Sebdysart/omni-link",
  "repository": "https://github.com/Sebdysart/omni-link",
  "license": "MIT",
  "keywords": [
    "multi-repo",
    "grounding",
    "anti-slop",
    "ecosystem",
    "cross-repo",
    "code-quality",
    "business-intelligence"
  ]
}
```

**Step 2: Create marketplace.json**

```json
{
  "name": "omni-link",
  "description": "Multi-repo AI ecosystem plugin for Claude Code",
  "plugins": [
    {
      "name": "omni-link",
      "version": "0.1.0",
      "source": "./"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add .claude-plugin/ && git commit -m "chore: add Claude Code plugin manifests"
```

---

### Task 3: Core types

**Files:**
- Create: `engine/types.ts`
- Create: `tests/types.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import type {
  OmniLinkConfig,
  RepoConfig,
  RepoManifest,
  EcosystemGraph,
  ApiBridge,
  ExportDef,
  RouteDefinition,
  TypeDef,
  SchemaDef,
  CommitSummary,
  NamingConvention,
  Mismatch,
  ImpactPath,
  TypeLineage,
  HealthScore,
  EvolutionSuggestion,
  EcosystemDigest,
} from '../engine/types.js';

describe('core types', () => {
  it('OmniLinkConfig is structurally valid', () => {
    const config: OmniLinkConfig = {
      repos: [
        {
          name: 'test-backend',
          path: '/tmp/test-backend',
          language: 'typescript',
          role: 'backend',
        },
      ],
      evolution: {
        aggressiveness: 'aggressive',
        maxSuggestionsPerSession: 5,
        categories: ['features', 'performance'],
      },
      quality: {
        blockOnFailure: true,
        requireTestsForNewCode: true,
        conventionStrictness: 'strict',
      },
      context: {
        tokenBudget: 8000,
        prioritize: 'changed-files-first',
        includeRecentCommits: 20,
      },
      cache: {
        directory: '/tmp/cache',
        maxAgeDays: 7,
      },
    };
    expect(config.repos).toHaveLength(1);
    expect(config.repos[0].name).toBe('test-backend');
  });

  it('RepoManifest is structurally valid', () => {
    const manifest: RepoManifest = {
      repoId: 'test',
      path: '/tmp/test',
      language: 'typescript',
      gitState: {
        branch: 'main',
        headSha: 'abc123',
        uncommittedChanges: [],
        recentCommits: [],
      },
      apiSurface: {
        routes: [],
        procedures: [],
        exports: [],
      },
      typeRegistry: {
        types: [],
        schemas: [],
        models: [],
      },
      conventions: {
        naming: 'camelCase',
        fileOrganization: 'feature-based',
        errorHandling: 'try-catch',
        patterns: [],
        testingPatterns: 'co-located',
      },
      dependencies: {
        internal: [],
        external: [],
      },
      health: {
        testCoverage: null,
        lintErrors: 0,
        typeErrors: 0,
        todoCount: 0,
        deadCode: [],
      },
    };
    expect(manifest.repoId).toBe('test');
  });

  it('EcosystemGraph is structurally valid', () => {
    const graph: EcosystemGraph = {
      repos: [],
      bridges: [],
      sharedTypes: [],
      contractMismatches: [],
      impactPaths: [],
    };
    expect(graph.bridges).toEqual([]);
  });

  it('ApiBridge captures consumer-provider relationship', () => {
    const bridge: ApiBridge = {
      consumer: { repo: 'ios-app', file: 'Services/API.swift', line: 42 },
      provider: { repo: 'backend', route: 'POST /api/users', handler: 'createUser' },
      contract: {
        inputType: { name: 'CreateUserInput', fields: [{ name: 'email', type: 'string' }], source: { repo: 'backend', file: 'types.ts', line: 10 } },
        outputType: { name: 'User', fields: [{ name: 'id', type: 'string' }], source: { repo: 'backend', file: 'types.ts', line: 20 } },
        matchStatus: 'exact',
      },
    };
    expect(bridge.contract.matchStatus).toBe('exact');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

```typescript
// engine/types.ts

// --- Configuration ---

export interface RepoConfig {
  name: string;
  path: string;
  language: string;
  role: string;
}

export interface OmniLinkConfig {
  repos: RepoConfig[];
  evolution: {
    aggressiveness: 'aggressive' | 'moderate' | 'on-demand';
    maxSuggestionsPerSession: number;
    categories: string[];
  };
  quality: {
    blockOnFailure: boolean;
    requireTestsForNewCode: boolean;
    conventionStrictness: 'strict' | 'moderate' | 'relaxed';
  };
  context: {
    tokenBudget: number;
    prioritize: 'changed-files-first' | 'api-surface-first';
    includeRecentCommits: number;
  };
  cache: {
    directory: string;
    maxAgeDays: number;
  };
}

// --- Scanner Output ---

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
}

export interface ExportDef {
  name: string;
  kind: 'function' | 'class' | 'constant' | 'type' | 'interface' | 'enum';
  signature: string;
  file: string;
  line: number;
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
  inputType?: string;
  outputType?: string;
}

export interface ProcedureDef {
  name: string;
  kind: 'query' | 'mutation' | 'subscription';
  file: string;
  line: number;
  inputType?: string;
  outputType?: string;
}

export interface TypeField {
  name: string;
  type: string;
  optional?: boolean;
}

export interface TypeDef {
  name: string;
  fields: TypeField[];
  source: {
    repo: string;
    file: string;
    line: number;
  };
}

export interface SchemaDef {
  name: string;
  kind: 'zod' | 'joi' | 'yup' | 'codable' | 'pydantic' | 'other';
  fields: TypeField[];
  source: {
    repo: string;
    file: string;
    line: number;
  };
}

export interface ModelDef {
  name: string;
  tableName?: string;
  fields: TypeField[];
  source: {
    repo: string;
    file: string;
    line: number;
  };
}

export type NamingConvention = 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'mixed';

export interface InternalDep {
  from: string;
  to: string;
  imports: string[];
}

export interface PackageDep {
  name: string;
  version: string;
  dev: boolean;
}

export interface HealthScore {
  testCoverage: number | null;
  lintErrors: number;
  typeErrors: number;
  todoCount: number;
  deadCode: string[];
}

export interface RepoManifest {
  repoId: string;
  path: string;
  language: string;
  gitState: {
    branch: string;
    headSha: string;
    uncommittedChanges: string[];
    recentCommits: CommitSummary[];
  };
  apiSurface: {
    routes: RouteDefinition[];
    procedures: ProcedureDef[];
    exports: ExportDef[];
  };
  typeRegistry: {
    types: TypeDef[];
    schemas: SchemaDef[];
    models: ModelDef[];
  };
  conventions: {
    naming: NamingConvention;
    fileOrganization: string;
    errorHandling: string;
    patterns: string[];
    testingPatterns: string;
  };
  dependencies: {
    internal: InternalDep[];
    external: PackageDep[];
  };
  health: HealthScore;
}

// --- Grapher Output ---

export interface ApiBridge {
  consumer: {
    repo: string;
    file: string;
    line: number;
  };
  provider: {
    repo: string;
    route: string;
    handler: string;
  };
  contract: {
    inputType: TypeDef;
    outputType: TypeDef;
    matchStatus: 'exact' | 'compatible' | 'mismatch';
  };
}

export interface TypeLineage {
  concept: string;
  instances: Array<{
    repo: string;
    type: TypeDef;
  }>;
  alignment: 'aligned' | 'diverged' | 'subset';
}

export interface Mismatch {
  kind: 'missing-field' | 'type-mismatch' | 'extra-field' | 'renamed-field';
  description: string;
  provider: { repo: string; file: string; line: number; field: string };
  consumer: { repo: string; file: string; line: number; field?: string };
  severity: 'breaking' | 'warning' | 'info';
}

export interface ImpactPath {
  trigger: { repo: string; file: string; change: string };
  affected: Array<{
    repo: string;
    file: string;
    line: number;
    reason: string;
    severity: 'breaking' | 'warning' | 'info';
  }>;
}

export interface EcosystemGraph {
  repos: RepoManifest[];
  bridges: ApiBridge[];
  sharedTypes: TypeLineage[];
  contractMismatches: Mismatch[];
  impactPaths: ImpactPath[];
}

// --- Context Output ---

export interface EcosystemDigest {
  generatedAt: string;
  configSha: string;
  repos: Array<{
    name: string;
    language: string;
    branch: string;
    uncommittedCount: number;
    commitsBehind: number;
  }>;
  contractStatus: {
    total: number;
    exact: number;
    compatible: number;
    mismatches: Mismatch[];
  };
  evolutionOpportunities: EvolutionSuggestion[];
  conventionSummary: Record<string, string>;
  apiSurfaceSummary: string;
  recentChangesSummary: string;
  tokenCount: number;
}

// --- Evolution Output ---

export interface EvolutionSuggestion {
  id: string;
  category: 'feature' | 'performance' | 'monetization' | 'scale' | 'security';
  title: string;
  description: string;
  evidence: Array<{
    repo: string;
    file: string;
    line: number;
    finding: string;
  }>;
  estimatedEffort: 'small' | 'medium' | 'large';
  estimatedImpact: 'low' | 'medium' | 'high' | 'critical';
  affectedRepos: string[];
}

// --- Scan Cache ---

export interface FileScanResult {
  filePath: string;
  sha: string;
  scannedAt: string;
  exports: ExportDef[];
  imports: InternalDep[];
  types: TypeDef[];
  schemas: SchemaDef[];
  routes: RouteDefinition[];
  procedures: ProcedureDef[];
}

export interface RepoMeta {
  repoId: string;
  lastScanAt: string;
  headSha: string;
  fileCount: number;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add engine/types.ts tests/types.test.ts && git commit -m "feat: define core types for scanner, grapher, context, evolution"
```

---

### Task 4: Config loader

**Files:**
- Create: `engine/config.ts`
- Create: `tests/config.test.ts`
- Create: `config/omni-link.example.json`

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resolveConfigPath, validateConfig, DEFAULT_CONFIG } from '../engine/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('config', () => {
  const tmpDir = path.join(os.tmpdir(), 'omni-link-test-config');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolveConfigPath finds local .omni-link.json first', () => {
    const localConfig = path.join(tmpDir, '.omni-link.json');
    fs.writeFileSync(localConfig, '{}');
    const result = resolveConfigPath(tmpDir);
    expect(result).toBe(localConfig);
  });

  it('resolveConfigPath returns null if no config found', () => {
    const result = resolveConfigPath(tmpDir);
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL

**Step 3: Implement config.ts**

```typescript
// engine/config.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OmniLinkConfig } from './types.js';

export const DEFAULT_CONFIG: Omit<OmniLinkConfig, 'repos'> = {
  evolution: {
    aggressiveness: 'aggressive',
    maxSuggestionsPerSession: 5,
    categories: ['features', 'performance', 'monetization', 'scale', 'security'],
  },
  quality: {
    blockOnFailure: true,
    requireTestsForNewCode: true,
    conventionStrictness: 'strict',
  },
  context: {
    tokenBudget: 8000,
    prioritize: 'changed-files-first',
    includeRecentCommits: 20,
  },
  cache: {
    directory: path.join(os.homedir(), '.claude', 'omni-link-cache'),
    maxAgeDays: 7,
  },
};

export function resolveConfigPath(cwd: string): string | null {
  // Check local first
  const localPath = path.join(cwd, '.omni-link.json');
  if (fs.existsSync(localPath)) return localPath;

  // Check global
  const globalPath = path.join(os.homedir(), '.claude', 'omni-link.json');
  if (fs.existsSync(globalPath)) return globalPath;

  return null;
}

export function validateConfig(raw: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const repos = raw.repos as Array<Record<string, unknown>> | undefined;

  if (!repos || !Array.isArray(repos) || repos.length === 0) {
    errors.push('repos: must have at least 1 repo');
  } else if (repos.length > 4) {
    errors.push('repos: maximum 4 repos allowed');
  } else {
    for (const [i, repo] of repos.entries()) {
      if (!repo.name) errors.push(`repos[${i}]: missing name`);
      if (!repo.path) errors.push(`repos[${i}]: missing path`);
      if (!repo.language) errors.push(`repos[${i}]: missing language`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadConfig(configPath: string): OmniLinkConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const validation = validateConfig(raw);
  if (!validation.valid) {
    throw new Error(`Invalid omni-link config:\n${validation.errors.join('\n')}`);
  }
  return {
    repos: raw.repos,
    evolution: { ...DEFAULT_CONFIG.evolution, ...raw.evolution },
    quality: { ...DEFAULT_CONFIG.quality, ...raw.quality },
    context: { ...DEFAULT_CONFIG.context, ...raw.context },
    cache: { ...DEFAULT_CONFIG.cache, ...raw.cache },
  };
}
```

**Step 4: Create example config**

```json
{
  "repos": [
    {
      "name": "my-backend",
      "path": "/path/to/backend",
      "language": "typescript",
      "role": "backend"
    },
    {
      "name": "my-ios-app",
      "path": "/path/to/ios-app",
      "language": "swift",
      "role": "ios-app"
    }
  ],
  "evolution": {
    "aggressiveness": "aggressive",
    "maxSuggestionsPerSession": 5,
    "categories": ["features", "performance", "monetization", "scale", "security"]
  },
  "quality": {
    "blockOnFailure": true,
    "requireTestsForNewCode": true,
    "conventionStrictness": "strict"
  },
  "context": {
    "tokenBudget": 8000,
    "prioritize": "changed-files-first",
    "includeRecentCommits": 20
  },
  "cache": {
    "directory": "~/.claude/omni-link-cache",
    "maxAgeDays": 7
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add engine/config.ts tests/config.test.ts config/omni-link.example.json && git commit -m "feat: config loader with validation, defaults, and local/global resolution"
```

---

## Phase 2: Scanner Engine

### Task 5: Tree-sitter parser factory

**Files:**
- Create: `engine/scanner/tree-sitter.ts`
- Create: `tests/scanner/tree-sitter.test.ts`

**Step 1: Write the test**

```typescript
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
    expect(tree.rootNode.hasError()).toBe(false);
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanner/tree-sitter.test.ts`
Expected: FAIL

**Step 3: Implement**

```typescript
// engine/scanner/tree-sitter.ts
import Parser from 'tree-sitter';

const LANGUAGE_MAP: Record<string, () => Parser.Language> = {
  typescript: () => require('tree-sitter-typescript').typescript,
  tsx: () => require('tree-sitter-typescript').tsx,
  javascript: () => require('tree-sitter-javascript'),
  swift: () => require('tree-sitter-swift'),
  python: () => require('tree-sitter-python'),
  go: () => require('tree-sitter-go'),
  rust: () => require('tree-sitter-rust'),
  java: () => require('tree-sitter-java'),
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
};

export function createParser(language: string): Parser {
  const loader = LANGUAGE_MAP[language];
  if (!loader) {
    throw new Error(`Unsupported language: ${language}`);
  }
  const parser = new Parser();
  parser.setLanguage(loader());
  return parser;
}

export function detectLanguage(filePath: string): string | null {
  const ext = '.' + filePath.split('.').pop();
  return EXTENSION_MAP[ext] ?? null;
}

export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_MAP);
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/scanner/tree-sitter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add engine/scanner/tree-sitter.ts tests/scanner/tree-sitter.test.ts && git commit -m "feat: tree-sitter parser factory with multi-language support"
```

---

### Task 6: API extractor

**Files:**
- Create: `engine/scanner/api-extractor.ts`
- Create: `tests/scanner/api-extractor.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { extractRoutes, extractExports, extractProcedures } from '../../engine/scanner/api-extractor.js';

describe('api-extractor', () => {
  describe('extractExports (TypeScript)', () => {
    it('extracts exported functions', () => {
      const source = `
export function createUser(input: CreateUserInput): User {
  return db.insert(input);
}
export const deleteUser = (id: string) => db.delete(id);
`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports).toHaveLength(2);
      expect(exports[0].name).toBe('createUser');
      expect(exports[0].kind).toBe('function');
      expect(exports[1].name).toBe('deleteUser');
    });

    it('extracts exported classes', () => {
      const source = `export class UserService { }`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports[0].kind).toBe('class');
      expect(exports[0].name).toBe('UserService');
    });

    it('extracts exported types and interfaces', () => {
      const source = `
export interface User { id: string; name: string; }
export type UserId = string;
`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports).toHaveLength(2);
      expect(exports.find(e => e.name === 'User')?.kind).toBe('interface');
      expect(exports.find(e => e.name === 'UserId')?.kind).toBe('type');
    });
  });

  describe('extractRoutes (TypeScript — Hono/Express)', () => {
    it('extracts Hono route definitions', () => {
      const source = `
app.get('/api/users', (c) => c.json(users));
app.post('/api/users', async (c) => { });
app.delete('/api/users/:id', handler);
`;
      const routes = extractRoutes(source, 'routes.ts', 'typescript');
      expect(routes).toHaveLength(3);
      expect(routes[0]).toMatchObject({ method: 'GET', path: '/api/users' });
      expect(routes[1]).toMatchObject({ method: 'POST', path: '/api/users' });
      expect(routes[2]).toMatchObject({ method: 'DELETE', path: '/api/users/:id' });
    });
  });

  describe('extractProcedures (TypeScript — tRPC)', () => {
    it('extracts tRPC procedure definitions', () => {
      const source = `
export const userRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => { }),
  createUser: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ input }) => { }),
});
`;
      const procs = extractProcedures(source, 'router.ts', 'typescript');
      expect(procs).toHaveLength(2);
      expect(procs[0]).toMatchObject({ name: 'getUser', kind: 'query' });
      expect(procs[1]).toMatchObject({ name: 'createUser', kind: 'mutation' });
    });
  });

  describe('extractExports (Swift)', () => {
    it('extracts Swift functions and structs', () => {
      const source = `
func fetchUser(id: String) async throws -> User {
    return try await api.get("/users/\\(id)")
}
struct UserDTO: Codable {
    let id: String
    let name: String
}
class UserService {
    func create() { }
}
`;
      const exports = extractExports(source, 'User.swift', 'swift');
      expect(exports.find(e => e.name === 'fetchUser')).toBeDefined();
      expect(exports.find(e => e.name === 'UserDTO')?.kind).toBe('class');
      expect(exports.find(e => e.name === 'UserService')?.kind).toBe('class');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanner/api-extractor.test.ts`
Expected: FAIL

**Step 3: Implement api-extractor.ts**

This file uses tree-sitter to parse source and extract exports, routes, and tRPC procedures. For each language, it uses language-specific AST patterns:

- **TypeScript/JS:** `export_statement` → `function_declaration` / `lexical_declaration` / `class_declaration` / `interface_declaration` / `type_alias_declaration`
- **Swift:** `function_declaration` / `struct_declaration` / `class_declaration` / `protocol_declaration` (Swift has no export keyword — all top-level declarations are public by default)
- **Routes:** Match `call_expression` where the function name is `get`/`post`/`put`/`delete`/`patch` on an object, first arg is a string literal
- **tRPC:** Match property assignments inside `router({})` calls where value chains end in `.query()` or `.mutation()`

The implementation should use `tree.rootNode.descendantsOfType()` for simple extractions and `Parser.Query` with S-expressions for complex patterns.

*(Full implementation ~200 lines — the executing agent will write the complete code following these patterns)*

**Step 4: Run tests**

Run: `npx vitest run tests/scanner/api-extractor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add engine/scanner/api-extractor.ts tests/scanner/api-extractor.test.ts && git commit -m "feat: API extractor — exports, routes, tRPC procedures for TS/Swift"
```

---

### Task 7: Type extractor

**Files:**
- Create: `engine/scanner/type-extractor.ts`
- Create: `tests/scanner/type-extractor.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { extractTypes, extractSchemas } from '../../engine/scanner/type-extractor.js';

describe('type-extractor', () => {
  it('extracts TypeScript interfaces with fields', () => {
    const source = `
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
}
`;
    const types = extractTypes(source, 'types.ts', 'typescript', 'backend');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('User');
    expect(types[0].fields).toHaveLength(4);
    expect(types[0].fields[2].optional).toBe(true);
  });

  it('extracts Zod schemas', () => {
    const source = `
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().optional(),
});
`;
    const schemas = extractSchemas(source, 'schemas.ts', 'typescript', 'backend');
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('createUserSchema');
    expect(schemas[0].kind).toBe('zod');
    expect(schemas[0].fields).toHaveLength(3);
  });

  it('extracts Swift Codable structs', () => {
    const source = `
struct UserDTO: Codable {
    let id: String
    let email: String
    var name: String?
}
`;
    const types = extractTypes(source, 'Models.swift', 'swift', 'ios-app');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('UserDTO');
    expect(types[0].fields).toHaveLength(3);
    expect(types[0].fields[2].optional).toBe(true);
  });

  it('extracts Python dataclass/pydantic models', () => {
    const source = `
class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
`;
    const types = extractTypes(source, 'models.py', 'python', 'backend');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('User');
  });
});
```

**Step 2: Run test, verify fail**

Run: `npx vitest run tests/scanner/type-extractor.test.ts`
Expected: FAIL

**Step 3: Implement type-extractor.ts**

Uses tree-sitter to parse:
- **TS interfaces:** `interface_declaration` → iterate `property_signature` children for fields
- **TS type aliases:** `type_alias_declaration` with object types
- **Zod schemas:** `variable_declarator` where value is `z.object({...})` call — extract property names and z.* methods
- **Swift structs:** `struct_declaration` with `Codable` conformance → property declarations
- **Python classes:** `class_definition` inheriting from `BaseModel`/`dataclass` → typed assignments

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add engine/scanner/type-extractor.ts tests/scanner/type-extractor.test.ts && git commit -m "feat: type extractor — TS interfaces, Zod schemas, Swift Codable, Python models"
```

---

### Task 8: Convention detector

**Files:**
- Create: `engine/scanner/convention-detector.ts`
- Create: `tests/scanner/convention-detector.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectConventions } from '../../engine/scanner/convention-detector.js';

describe('convention-detector', () => {
  it('detects camelCase naming in TS', () => {
    const files = [
      { path: 'src/userService.ts', exports: ['createUser', 'deleteUser', 'getUserById'] },
      { path: 'src/jobService.ts', exports: ['createJob', 'listJobs'] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.naming).toBe('camelCase');
  });

  it('detects snake_case naming in Python', () => {
    const files = [
      { path: 'src/user_service.py', exports: ['create_user', 'delete_user'] },
    ];
    const conventions = detectConventions(files, 'python');
    expect(conventions.naming).toBe('snake_case');
  });

  it('detects feature-based file organization', () => {
    const files = [
      { path: 'src/users/service.ts', exports: [] },
      { path: 'src/users/router.ts', exports: [] },
      { path: 'src/jobs/service.ts', exports: [] },
      { path: 'src/jobs/router.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.fileOrganization).toBe('feature-based');
  });

  it('detects layer-based file organization', () => {
    const files = [
      { path: 'src/services/userService.ts', exports: [] },
      { path: 'src/services/jobService.ts', exports: [] },
      { path: 'src/routes/userRoutes.ts', exports: [] },
      { path: 'src/routes/jobRoutes.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.fileOrganization).toBe('layer-based');
  });

  it('detects error handling patterns', () => {
    const sourceSnippets = [
      'try { await doThing(); } catch (e) { logger.error(e); }',
      'try { x(); } catch (err) { throw new AppError(err); }',
    ];
    const conventions = detectConventions([], 'typescript', sourceSnippets);
    expect(conventions.errorHandling).toBe('try-catch');
  });

  it('detects co-located testing pattern', () => {
    const files = [
      { path: 'src/services/user.ts', exports: [] },
      { path: 'src/services/user.test.ts', exports: [] },
      { path: 'src/services/job.ts', exports: [] },
      { path: 'src/services/job.test.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.testingPatterns).toBe('co-located');
  });
});
```

**Step 2-5: Standard TDD cycle, then commit**

```bash
git add engine/scanner/convention-detector.ts tests/scanner/convention-detector.test.ts && git commit -m "feat: convention detector — naming, file org, error handling, testing patterns"
```

---

### Task 9: Full repo scanner orchestrator

**Files:**
- Create: `engine/scanner/index.ts`
- Create: `tests/scanner/index.test.ts`

Wires together tree-sitter, api-extractor, type-extractor, and convention-detector. Walks a repo directory, filters to supported files, parses each, and assembles a `RepoManifest`. Also extracts git state via `child_process.execSync` calls to git.

**Test:** Given a temp directory with known TS files, produces correct RepoManifest.

```bash
git commit -m "feat: repo scanner orchestrator — assembles RepoManifest from all extractors"
```

---

## Phase 3: Grapher Engine

### Task 10: Dependency graph builder

**Files:**
- Create: `engine/grapher/dependency-graph.ts`
- Create: `tests/grapher/dependency-graph.test.ts`

Builds internal dependency graph within a repo (which file imports which) and cross-repo dependency detection (which repo's code references patterns from another repo — URL strings, import paths, shared type names).

```bash
git commit -m "feat: dependency graph builder — internal and cross-repo dep mapping"
```

---

### Task 11: API contract mapper

**Files:**
- Create: `engine/grapher/api-contract-map.ts`
- Create: `tests/grapher/api-contract-map.test.ts`

Takes route definitions from provider repos and matches them against URL patterns/API client calls in consumer repos. Produces `ApiBridge[]`. Compares input/output types across the bridge and flags mismatches.

**Key logic:**
- Match `/api/users` in backend routes to string literals like `"/api/users"` or `"users"` in iOS TRPCClient calls
- Compare TypeDef fields between provider output type and consumer input struct
- Classify as `exact` (all fields match), `compatible` (consumer is subset), or `mismatch` (consumer expects field provider doesn't have)

```bash
git commit -m "feat: API contract mapper — bridge detection and type matching across repos"
```

---

### Task 12: Impact analyzer

**Files:**
- Create: `engine/grapher/impact-analyzer.ts`
- Create: `tests/grapher/impact-analyzer.test.ts`

Given a set of changed files (from git diff), traces through the dependency graph and API bridges to produce `ImpactPath[]`. Each path shows: what changed → what's affected → severity.

```bash
git commit -m "feat: impact analyzer — trace change ripples across repos"
```

---

### Task 13: Type flow mapper

**Files:**
- Create: `engine/grapher/type-flow.ts`
- Create: `tests/grapher/type-flow.test.ts`

Identifies the same conceptual type across repos (e.g., `User` in backend TS ↔ `UserDTO` in iOS Swift). Uses field-name similarity and naming heuristics. Produces `TypeLineage[]`.

```bash
git commit -m "feat: type flow mapper — cross-repo type lineage detection"
```

---

### Task 14: Grapher orchestrator

**Files:**
- Create: `engine/grapher/index.ts`
- Create: `tests/grapher/index.test.ts`

Combines dependency-graph, api-contract-map, type-flow, and impact-analyzer. Takes `RepoManifest[]`, produces `EcosystemGraph`.

```bash
git commit -m "feat: grapher orchestrator — assembles EcosystemGraph from all repo manifests"
```

---

## Phase 4: Context Engine

### Task 15: Cache manager

**Files:**
- Create: `engine/context/cache-manager.ts`
- Create: `tests/context/cache-manager.test.ts`

SHA-indexed file cache. Stores per-file scan results keyed by git blob SHA. On scan, checks if file SHA matches cached SHA — skip if unchanged. Also caches RepoManifest and EcosystemGraph.

**Methods:** `getCachedFile(repo, filePath, sha)`, `setCachedFile(repo, filePath, sha, result)`, `getCachedManifest(repo, headSha)`, `invalidateRepo(repo)`, `pruneOld(maxAgeDays)`.

```bash
git commit -m "feat: SHA-indexed cache manager — skip unchanged files on rescan"
```

---

### Task 16: Token pruner

**Files:**
- Create: `engine/context/token-pruner.ts`
- Create: `tests/context/token-pruner.test.ts`

Takes an EcosystemGraph and a token budget. Prioritizes content by: changed files > their dependents > API surfaces > type mismatches > conventions. Estimates tokens using `content.length / 4` heuristic. Trims lowest-priority content until within budget.

```bash
git commit -m "feat: token pruner — priority-ranked context trimming to token budget"
```

---

### Task 17: Digest formatter

**Files:**
- Create: `engine/context/digest-formatter.ts`
- Create: `tests/context/digest-formatter.test.ts`

Takes pruned context and formats it as the human-readable digest that gets injected into the session. Produces the `OMNI-LINK ECOSYSTEM STATE` block shown in the design doc.

```bash
git commit -m "feat: digest formatter — human-readable ecosystem state for session injection"
```

---

### Task 18: Context builder orchestrator

**Files:**
- Create: `engine/context/index.ts`
- Create: `tests/context/index.test.ts`

Wires cache-manager, token-pruner, digest-formatter. Entry point: `buildContext(graph, config) → EcosystemDigest`.

```bash
git commit -m "feat: context builder orchestrator — scan → prune → format pipeline"
```

---

## Phase 5: Quality Gate Engine

### Task 19: Reference checker

**Files:**
- Create: `engine/quality/reference-checker.ts`
- Create: `tests/quality/reference-checker.test.ts`

Given proposed code and a RepoManifest, verifies every import path resolves to a real file, every imported name exists in that file's exports, and every API call matches a known route/procedure.

Returns: `{ valid: boolean; violations: ReferenceViolation[] }`.

```bash
git commit -m "feat: reference checker — verify imports, calls, and types against actual codebase"
```

---

### Task 20: Convention validator

**Files:**
- Create: `engine/quality/convention-validator.ts`
- Create: `tests/quality/convention-validator.test.ts`

Checks proposed code against the conventions detected in Task 8. Flags: wrong naming convention, wrong file location, wrong error handling pattern, wrong testing pattern.

```bash
git commit -m "feat: convention validator — enforce detected codebase patterns"
```

---

### Task 21: Slop detector

**Files:**
- Create: `engine/quality/slop-detector.ts`
- Create: `tests/quality/slop-detector.test.ts`

Pattern-matches for common AI code generation failures:
- `// TODO` / `// FIXME` / `console.log("implement")` placeholders
- Imports from packages not in package.json/Package.swift
- Unnecessary wrapper functions, excessive abstraction
- Copy-paste patterns (near-duplicate blocks)
- Over-commenting obvious code

```bash
git commit -m "feat: slop detector — catch hallucinated packages, placeholders, over-engineering"
```

---

### Task 22: Health scorer

**Files:**
- Create: `engine/quality/health-scorer.ts`
- Create: `tests/quality/health-scorer.test.ts`

Computes per-repo and ecosystem-wide health scores. Runs: TODO count, dead code detection (exports with no importers), type error count (if tsc/mypy available), test file ratio.

```bash
git commit -m "feat: health scorer — per-repo and ecosystem code health metrics"
```

---

## Phase 6: Evolution Engine

### Task 23: Gap analyzer

**Files:**
- Create: `engine/evolution/gap-analyzer.ts`
- Create: `tests/evolution/gap-analyzer.test.ts`

Scans RepoManifests for: incomplete CRUD sets (e.g., create + read but no delete), screens with no navigation path, routes with no handler, schemas with no consumer, dead exports.

```bash
git commit -m "feat: gap analyzer — find incomplete features, dead routes, orphaned UI"
```

---

### Task 24: Bottleneck finder

**Files:**
- Create: `engine/evolution/bottleneck-finder.ts`
- Create: `tests/evolution/bottleneck-finder.test.ts`

AST-level detection of: nested loops (potential O(n^2)), unbounded array operations without pagination, missing database indexes (inferred from query patterns), synchronous I/O in async contexts.

```bash
git commit -m "feat: bottleneck finder — detect O(n^2), missing pagination, sync I/O"
```

---

### Task 25: Upgrade proposer

**Files:**
- Create: `engine/evolution/upgrade-proposer.ts`
- Create: `tests/evolution/upgrade-proposer.test.ts`

Takes gap analysis + bottleneck findings and generates ranked `EvolutionSuggestion[]`. Each suggestion has: title, description, evidence (file:line), effort estimate, impact estimate, affected repos.

```bash
git commit -m "feat: upgrade proposer — ranked suggestions with ROI and evidence"
```

---

### Task 26: Competitive benchmarker

**Files:**
- Create: `engine/evolution/competitive-benchmarker.ts`
- Create: `tests/evolution/competitive-benchmarker.test.ts`

Checks against known best practices per stack:
- Hono/Express: rate limiting middleware, CORS config, helmet
- tRPC: error formatting, context auth
- Swift/iOS: proper async/await, no force unwraps, accessibility
- General: pagination, retry logic, circuit breakers, caching headers

```bash
git commit -m "feat: competitive benchmarker — compare against stack best practices"
```

---

### Task 27: Evolution orchestrator

**Files:**
- Create: `engine/evolution/index.ts`
- Create: `tests/evolution/index.test.ts`

Wires gap-analyzer, bottleneck-finder, upgrade-proposer, competitive-benchmarker. Entry: `analyzeEvolution(graph, config) → EvolutionSuggestion[]`.

```bash
git commit -m "feat: evolution orchestrator — gap + bottleneck + benchmark → suggestions"
```

---

## Phase 7: CLI & Engine Integration

### Task 28: Engine entry point

**Files:**
- Create: `engine/index.ts`
- Create: `tests/index.test.ts`

Top-level orchestrator. Wires scanner → grapher → context → evolution. Methods: `scan(config)`, `impact(config, changedFiles)`, `health(config)`, `evolve(config)`.

```bash
git commit -m "feat: engine entry point — scan/impact/health/evolve orchestration"
```

---

### Task 29: CLI

**Files:**
- Create: `engine/cli.ts`

Parses CLI args and calls engine methods. Commands:
- `omni-link scan --config <path>` → full scan, outputs digest JSON to stdout
- `omni-link impact --config <path>` → outputs impact report
- `omni-link health --config <path>` → outputs health report
- `omni-link evolve --config <path>` → outputs evolution suggestions

```bash
git commit -m "feat: CLI — scan/impact/health/evolve commands for hook invocation"
```

---

### Task 30: Build and verify

**Step 1:** Run `npm run build` — should produce `dist/` with compiled JS
**Step 2:** Run `node dist/cli.js --help` — should show commands
**Step 3:** Run `npm test` — all tests pass

```bash
git commit -m "chore: verify build and full test suite"
```

---

## Phase 8: Hooks

### Task 31: Session-start hook

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/session-start`
- Create: `hooks/run-hook.cmd`

**hooks.json:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "'${CLAUDE_PLUGIN_ROOT}/hooks/session-start'",
            "async": false
          }
        ]
      }
    ]
  }
}
```

**session-start** (bash script):
1. Find config file (local `.omni-link.json` or global `~/.claude/omni-link.json`)
2. Run `node "${PLUGIN_ROOT}/dist/cli.js" scan --config "$CONFIG_PATH"` → capture digest JSON
3. Read `skills/using-omni-link/SKILL.md` content
4. Combine skill content + digest into `additionalContext` JSON
5. Output as hook response

**run-hook.cmd** (Windows polyglot): same pattern as superpowers.

```bash
git commit -m "feat: session-start hook — boots engine, injects ecosystem context"
```

---

## Phase 9: Skills

### Task 32: using-omni-link skill

**Files:**
- Create: `skills/using-omni-link/SKILL.md`

The meta skill loaded at session start. Sets iron laws, lists all skills and when to invoke them, establishes aggressive evolution posture.

```bash
git commit -m "feat: using-omni-link skill — meta skill with iron laws and skill registry"
```

---

### Task 33: ecosystem-grounding skill

**Files:**
- Create: `skills/ecosystem-grounding/SKILL.md`

Defines the grounding workflow: scan → briefing → contract mismatch acknowledgment gate.

```bash
git commit -m "feat: ecosystem-grounding skill — session-start grounding workflow"
```

---

### Task 34: cross-repo-impact skill

**Files:**
- Create: `skills/cross-repo-impact/SKILL.md`

Defines when and how to run impact analysis. Includes ripple report format.

```bash
git commit -m "feat: cross-repo-impact skill — change ripple analysis workflow"
```

---

### Task 35: anti-slop-gate skill

**Files:**
- Create: `skills/anti-slop-gate/SKILL.md`

The iron law skill. Defines all quality checks, enforcement rules, and rejection behavior.

```bash
git commit -m "feat: anti-slop-gate skill — quality enforcement iron laws"
```

---

### Task 36: convention-enforcer skill

**Files:**
- Create: `skills/convention-enforcer/SKILL.md`

Pattern matching skill. When to invoke, how it presents detected conventions.

```bash
git commit -m "feat: convention-enforcer skill — codebase pattern matching"
```

---

### Task 37: dependency-navigator skill

**Files:**
- Create: `skills/dependency-navigator/SKILL.md`

Cross-repo exploration skill. "Where is X used?" workflows.

```bash
git commit -m "feat: dependency-navigator skill — cross-repo exploration"
```

---

### Task 38: health-audit skill

**Files:**
- Create: `skills/health-audit/SKILL.md`

Health report skill. Report format, scoring criteria, trend comparison.

```bash
git commit -m "feat: health-audit skill — ecosystem health report workflow"
```

---

### Task 39: ecosystem-planner skill

**Files:**
- Create: `skills/ecosystem-planner/SKILL.md`

Multi-repo planning skill. Cross-repo task ordering, coordination points.

```bash
git commit -m "feat: ecosystem-planner skill — multi-repo aware planning"
```

---

### Task 40: business-evolution skill

**Files:**
- Create: `skills/business-evolution/SKILL.md`

Aggressive evolution skill. Session-start analysis, suggestion format, evidence requirements.

```bash
git commit -m "feat: business-evolution skill — proactive upgrade engine"
```

---

### Task 41: upgrade-executor skill

**Files:**
- Create: `skills/upgrade-executor/SKILL.md`

Coordinated execution skill. Multi-repo change orchestration, contract validation at each step.

```bash
git commit -m "feat: upgrade-executor skill — coordinated cross-repo execution"
```

---

## Phase 10: Agents & Commands

### Task 42: Agents

**Files:**
- Create: `agents/repo-analyst.md`
- Create: `agents/cross-repo-reviewer.md`
- Create: `agents/evolution-strategist.md`

Each follows superpowers' agent format with: Name, Trigger conditions, Responsibilities, Iron laws, Output format.

```bash
git commit -m "feat: add repo-analyst, cross-repo-reviewer, evolution-strategist agents"
```

---

### Task 43: Commands

**Files:**
- Create: `commands/scan.md`
- Create: `commands/impact.md`
- Create: `commands/evolve.md`
- Create: `commands/health.md`

Each command has frontmatter with description and `disable-model-invocation: true`.

```bash
git commit -m "feat: add /scan, /impact, /evolve, /health slash commands"
```

---

## Phase 11: Integration & Polish

### Task 44: End-to-end integration test

**Files:**
- Create: `tests/integration/e2e.test.ts`

Sets up 2 temp repos (one TS backend with routes, one Swift iOS with API client), configures omni-link, runs full scan → graph → context → evolution pipeline. Verifies: bridges detected, mismatches found, evolution suggestions generated, digest within token budget.

```bash
git commit -m "test: end-to-end integration test with 2-repo ecosystem"
```

---

### Task 45: README

**Files:**
- Create: `README.md`

Installation (marketplace + manual), configuration guide, skill descriptions, command reference, compatibility with superpowers.

```bash
git commit -m "docs: add README with installation, config, and usage guide"
```

---

### Task 46: Final verification

**Step 1:** `npm run build` — clean build
**Step 2:** `npm test` — all tests pass
**Step 3:** `npx vitest run --coverage` — check coverage
**Step 4:** Verify hooks work: simulate session-start with test config
**Step 5:** Verify plugin.json is valid

```bash
git commit -m "chore: final verification — build, tests, coverage, hook validation"
```

---

## Dependency Graph

```
Phase 1 (Tasks 1-4): Foundation → no deps
Phase 2 (Tasks 5-9): Scanner → depends on Phase 1
Phase 3 (Tasks 10-14): Grapher → depends on Phase 2
Phase 4 (Tasks 15-18): Context → depends on Phase 3
Phase 5 (Tasks 19-22): Quality → depends on Phase 2
Phase 6 (Tasks 23-27): Evolution → depends on Phase 3
Phase 7 (Tasks 28-30): CLI → depends on Phases 4, 5, 6
Phase 8 (Tasks 31): Hooks → depends on Phase 7
Phase 9 (Tasks 32-41): Skills → no code deps (markdown only), but written after engine exists
Phase 10 (Tasks 42-43): Agents/Commands → no deps (markdown only)
Phase 11 (Tasks 44-46): Integration → depends on everything

Note: Phases 5 and 6 can run in parallel after Phase 3 completes.
Note: Phases 9 and 10 can run in parallel with Phase 7.
```

## Execution Estimate

- **46 tasks** across 11 phases
- Foundation + Scanner + Grapher form the critical path
- Skills/Agents/Commands are markdown-only and can be written in parallel with engine work
