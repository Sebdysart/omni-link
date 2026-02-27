// engine/types.ts — Core type definitions for omni-link

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
  source: { repo: string; file: string; line: number };
}

export interface SchemaDef {
  name: string;
  kind: 'zod' | 'joi' | 'yup' | 'codable' | 'pydantic' | 'other';
  fields: TypeField[];
  source: { repo: string; file: string; line: number };
}

export interface ModelDef {
  name: string;
  tableName?: string;
  fields: TypeField[];
  source: { repo: string; file: string; line: number };
}

export type NamingConvention =
  | 'camelCase'
  | 'snake_case'
  | 'PascalCase'
  | 'kebab-case'
  | 'mixed';

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
  consumer: { repo: string; file: string; line: number };
  provider: { repo: string; route: string; handler: string };
  contract: {
    inputType: TypeDef;
    outputType: TypeDef;
    matchStatus: 'exact' | 'compatible' | 'mismatch';
  };
}

export interface TypeLineage {
  concept: string;
  instances: Array<{ repo: string; type: TypeDef }>;
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
  evidence: Array<{ repo: string; file: string; line: number; finding: string }>;
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
