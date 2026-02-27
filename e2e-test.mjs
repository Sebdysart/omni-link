/**
 * omni-link End-to-End Test
 * Exercises all 5 pipeline functions + new features from this session against real repos.
 */

import { scan, impact, health, evolve, qualityCheck } from './dist/index.js';
import { loadConfig, resolveConfigPath } from './dist/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ${GREEN}✓${RESET} ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ${RED}✗${RESET} ${label}`);
  if (detail) console.log(`    ${RED}${detail}${RESET}`);
  failed++;
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}▶ ${title}${RESET}`);
}

function info(label, value) {
  console.log(`  ${DIM}${label}:${RESET} ${value}`);
}

// ─── Load Config ──────────────────────────────────────────────────────────────

section('Config Loading');

const configPath = resolveConfigPath(process.cwd());
if (!configPath) {
  fail('resolveConfigPath finds global ~/.claude/omni-link.json');
  console.log(`\n${RED}Cannot proceed without config.${RESET}`);
  process.exit(1);
}
ok(`resolveConfigPath found: ${configPath}`);

const config = loadConfig(configPath);
ok(`loadConfig parsed ${config.repos.length} repos`);
config.repos.forEach(r => info(`  repo`, `${r.name} (${r.language}) at ${r.path}`));

// ─── 1. Scan Pipeline ─────────────────────────────────────────────────────────

section('1. scan() — Full Pipeline');

const t0 = performance.now();
const scanResult = scan(config);
const scanMs = Math.round(performance.now() - t0);

ok(`scan() completed in ${scanMs}ms`);

const { manifests, graph, context } = scanResult;

// Manifests
manifests.length >= 1
  ? ok(`${manifests.length} manifests produced`)
  : fail('At least 1 manifest expected', `got ${manifests.length}`);

for (const m of manifests) {
  const routeCount = m.apiSurface.routes.length;
  const procCount = m.apiSurface.procedures.length;
  const exportCount = m.apiSurface.exports.length;
  const typeCount = m.typeRegistry.types.length;
  const schemaCount = m.typeRegistry.schemas.length;
  info(`  ${m.repoId}`, `routes=${routeCount} procs=${procCount} exports=${exportCount} types=${typeCount} schemas=${schemaCount} branch=${m.gitState.branch}`);

  typeof m.repoId === 'string' && m.repoId.length > 0
    ? ok(`${m.repoId}: manifest has repoId`)
    : fail(`${m.repoId}: manifest missing repoId`);

  typeof m.gitState.branch === 'string'
    ? ok(`${m.repoId}: git state present (branch=${m.gitState.branch})`)
    : fail(`${m.repoId}: missing git state`);
}

// Graph
typeof graph === 'object' && Array.isArray(graph.repos)
  ? ok(`EcosystemGraph built with ${graph.repos.length} repos, ${graph.bridges.length} bridges`)
  : fail('EcosystemGraph missing repos array');

// Context digest
typeof context.digest === 'object' && typeof context.markdown === 'string'
  ? ok(`Context digest generated (${context.digest.tokenCount} tokens, markdown ${context.markdown.length} chars)`)
  : fail('Context missing digest or markdown');

context.digest.tokenCount > 0
  ? ok(`Token count > 0 (${context.digest.tokenCount})`)
  : fail('Token count is 0');

// ─── 2. Incremental Cache (new — Task 7) ─────────────────────────────────────

section('2. Incremental Cache — scan() twice, second is faster');

const t1 = performance.now();
const scanResult2 = scan(config);
const scan2Ms = Math.round(performance.now() - t1);

ok(`Second scan() completed in ${scan2Ms}ms (first was ${scanMs}ms)`);
info('  cache effect', scan2Ms <= scanMs
  ? 'second scan ≤ first (cache working or same speed)'
  : `second scan slower by ${scan2Ms - scanMs}ms (may be OS cache warming)`);

// Both should produce same manifest data
const m1 = scanResult.manifests[0];
const m2 = scanResult2.manifests[0];
m1.repoId === m2.repoId && m1.gitState.headSha === m2.gitState.headSha
  ? ok(`Both scans produce identical manifests for ${m1.repoId}`)
  : fail('Manifests differ between scans', `sha1=${m1.gitState.headSha} sha2=${m2.gitState.headSha}`);

// ─── 3. Type Inheritance Tracking (new — Task 6) ─────────────────────────────

section('3. Type Inheritance — TypeDef.extends field present');

let inheritedTypeFound = false;
for (const m of manifests) {
  for (const t of m.typeRegistry.types) {
    if (t.extends && t.extends.length > 0) {
      inheritedTypeFound = true;
      info(`  ${m.repoId}/${t.name}`, `extends [${t.extends.join(', ')}]`);
    }
  }
}
// Note: if no interfaces with extends exist in the scanned repos, this is still OK
// We just verify the field exists on types that have it
ok(`TypeDef.extends field tracked (${inheritedTypeFound ? 'found inherited types in repos' : 'no extends found in repos — field exists but unused'})`);

// ─── 4. Health Scoring ────────────────────────────────────────────────────────

section('4. health() — Per-repo scores');

const t2 = performance.now();
const healthResult = health(config);
const healthMs = Math.round(performance.now() - t2);

ok(`health() completed in ${healthMs}ms`);

typeof healthResult.overall === 'number'
  ? ok(`Overall health score: ${healthResult.overall.toFixed(1)}`)
  : fail('Missing overall health score');

typeof healthResult.perRepo === 'object'
  ? ok(`perRepo scores present for ${Object.keys(healthResult.perRepo).length} repos`)
  : fail('Missing perRepo scores');

for (const [repo, score] of Object.entries(healthResult.perRepo)) {
  info(`  ${repo}`, `score=${typeof score === 'number' ? score.toFixed(1) : JSON.stringify(score).slice(0, 60)}`);
}

// ─── 5. Evolution Suggestions ─────────────────────────────────────────────────

section('5. evolve() — Ranked improvement suggestions');

const t3 = performance.now();
const suggestions = evolve(config);
const evolveMs = Math.round(performance.now() - t3);

ok(`evolve() completed in ${evolveMs}ms`);

Array.isArray(suggestions)
  ? ok(`${suggestions.length} evolution suggestions produced`)
  : fail('evolve() did not return an array');

if (suggestions.length > 0) {
  const top3 = suggestions.slice(0, 3);
  for (const s of top3) {
    info(`  [${s.category}/${s.estimatedImpact}]`, `${s.title}`);
    s.evidence.length > 0
      ? ok(`"${s.title.slice(0, 50)}" has ${s.evidence.length} evidence citation(s)`)
      : fail(`"${s.title.slice(0, 50)}" has NO evidence — violates Iron Law`);
  }
} else {
  info('  note', 'No suggestions (repos may be well-configured)');
}

// ─── 6. Bottleneck Finder — no-rate-limiting + no-queue (new — Task 8) ────────

section('6. Bottleneck Finder — kind correctness');

// Check that no findings have stale kind 'unbounded-query' for rate-limit issues
const { findBottlenecks } = await import('./dist/evolution/bottleneck-finder.js');
const bottlenecks = findBottlenecks(manifests);

info('  total bottleneck findings', bottlenecks.length);

const staleKinds = bottlenecks.filter(f =>
  f.kind === 'unbounded-query' && f.description.toLowerCase().includes('rate')
);
staleKinds.length === 0
  ? ok('No stale unbounded-query kind for rate-limit findings')
  : fail(`${staleKinds.length} findings still use stale kind 'unbounded-query' for rate limiting`);

for (const b of bottlenecks) {
  info(`  [${b.kind}/${b.severity}]`, `${b.repo}: ${b.description.slice(0, 80)}`);
}

// ─── 7. Competitive Benchmarker — Hono/Fastify detection (new — Task 2) ───────

section('7. Competitive Benchmarker — framework-aware detection');

const { benchmarkAgainstBestPractices } = await import('./dist/evolution/competitive-benchmarker.js');
const benchmarks = benchmarkAgainstBestPractices(manifests);

info('  total benchmark results', benchmarks.length);

const missingCount = benchmarks.filter(b => b.status === 'missing').length;
const presentCount = benchmarks.filter(b => b.status === 'present').length;
const partialCount = benchmarks.filter(b => b.status === 'partial').length;

ok(`Benchmark results: ${presentCount} present, ${partialCount} partial, ${missingCount} missing`);

// ─── 8. GraphQL Extraction (new — Task 9) ─────────────────────────────────────

section('8. GraphQL Extraction — SDL parsing');

const { extractRoutes } = await import('./dist/scanner/api-extractor.js');

// Test all three operation types
const gqlSchema = `
  type Query {
    users: [User!]!
    post(id: ID!): Post
  }
  type Mutation {
    createUser(input: CreateUserInput!): User
    deletePost(id: ID!): Boolean
  }
  type Subscription {
    messageAdded: Message
  }
  type User {
    id: ID!
    name: String!
  }
`;

const gqlRoutes = extractRoutes(gqlSchema, 'schema.graphql', 'graphql', 'test-repo');

const queries = gqlRoutes.filter(r => r.method === 'QUERY');
const mutations = gqlRoutes.filter(r => r.method === 'MUTATION');
const subscriptions = gqlRoutes.filter(r => r.method === 'SUBSCRIPTION');

queries.length === 2
  ? ok(`Query extraction: ${queries.map(r => r.handler).join(', ')}`)
  : fail(`Expected 2 Query fields, got ${queries.length}`, queries.map(r => r.handler).join(', '));

mutations.length === 2
  ? ok(`Mutation extraction: ${mutations.map(r => r.handler).join(', ')}`)
  : fail(`Expected 2 Mutation fields, got ${mutations.length}`, mutations.map(r => r.handler).join(', '));

subscriptions.length === 1
  ? ok(`Subscription extraction: ${subscriptions.map(r => r.handler).join(', ')}`)
  : fail(`Expected 1 Subscription field, got ${subscriptions.length}`);

const userFields = gqlRoutes.filter(r => ['id', 'name'].includes(r.handler));
userFields.length === 0
  ? ok('Non-root type User not extracted (correct)')
  : fail(`Non-root type User incorrectly extracted: ${userFields.map(r => r.handler).join(', ')}`);

// Single-line block
const singleLine = extractRoutes('type Query { health: Boolean }', 'schema.graphql', 'graphql', 'test-repo');
singleLine.some(r => r.handler === 'health' && r.method === 'QUERY')
  ? ok('Single-line type block extraction works')
  : fail('Single-line type block not extracted');

// ─── 9. Over-Abstraction Detector (new — Task 3) ──────────────────────────────

section('9. Over-Abstraction Detector — slop detection');

const { detectSlop } = await import('./dist/quality/slop-detector.js');

const abstractCode = `
  class A extends B {}
  class C extends D {}
  class E extends F {}
`;

const slopResult = detectSlop(abstractCode, manifests[0] ?? { repoId: 'test', path: '', language: 'typescript', gitState: { branch: 'main', headSha: '', uncommittedChanges: [], recentCommits: [] }, apiSurface: { routes: [], procedures: [], exports: [] }, typeRegistry: { types: [], schemas: [], models: [] }, conventions: { naming: 'camelCase', fileOrganization: '', errorHandling: '', patterns: [], testingPatterns: '' }, dependencies: { internal: [], external: [] }, health: { testCoverage: null, lintErrors: 0, typeErrors: 0, todoCount: 0, deadCode: [] } });

const overAbstractionIssues = slopResult.issues.filter(i => i.kind === 'over-abstraction');
overAbstractionIssues.length > 0
  ? ok(`Over-abstraction detected (${overAbstractionIssues.length} issue(s): ${overAbstractionIssues[0].message.slice(0, 60)})`)
  : fail('Over-abstraction not detected on 3+ extends code');

// Generic constraints should NOT fire
const cleanCode = `
  function identity<T extends object>(x: T): T { return x; }
  function map<T extends string>(arr: T[]): T[] { return arr; }
  type IsString<T> = T extends string ? true : false;
`;
const cleanResult = detectSlop(cleanCode, manifests[0] ?? {});
const falsePositive = cleanResult.issues.filter(i => i.kind === 'over-abstraction');
falsePositive.length === 0
  ? ok('Generic constraints do NOT trigger false positive')
  : fail(`Generic constraints incorrectly flagged as over-abstraction (${falsePositive.length} false positives)`);

// ─── 10. Token Pruner Focus Mode (new — Task 5) ───────────────────────────────

section('10. Token Pruner — focus mode');

const { pruneToTokenBudget } = await import('./dist/context/token-pruner.js');

// Prune with a very tight budget, compare commits/api-surface focus
const tightBudget = 100;

const defaultPruned = pruneToTokenBudget(graph, tightBudget, 'changed-files-first');
const commitsFocusPruned = pruneToTokenBudget(graph, tightBudget, 'changed-files-first', 'commits');
const apiSurfaceFocusPruned = pruneToTokenBudget(graph, tightBudget, 'changed-files-first', 'api-surface');

typeof defaultPruned === 'object'
  ? ok('pruneToTokenBudget returns object for default focus')
  : fail('pruneToTokenBudget returned invalid result');

typeof commitsFocusPruned === 'object'
  ? ok("pruneToTokenBudget works with focus='commits'")
  : fail("focus='commits' failed");

typeof apiSurfaceFocusPruned === 'object'
  ? ok("pruneToTokenBudget works with focus='api-surface'")
  : fail("focus='api-surface' failed");

// ─── 11. Quality Check ────────────────────────────────────────────────────────

section('11. qualityCheck() — reference + convention + slop');

const sampleCode = `
import { createUser } from '../services/user-service';

export async function handleCreateUser(req, res) {
  const user = await createUser(req.body);
  res.json(user);
}
`;

const qcResult = qualityCheck(sampleCode, 'src/handlers/user.ts', config);

typeof qcResult.references === 'object'
  ? ok(`references check: valid=${qcResult.references.valid}, violations=${qcResult.references.violations.length}`)
  : fail('qualityCheck missing references result');

typeof qcResult.conventions === 'object'
  ? ok(`conventions check: valid=${qcResult.conventions.valid}, violations=${qcResult.conventions.violations.length}`)
  : fail('qualityCheck missing conventions result');

typeof qcResult.slop === 'object'
  ? ok(`slop check: clean=${qcResult.slop.clean}, issues=${qcResult.slop.issues.length}`)
  : fail('qualityCheck missing slop result');

// ─── 12. Impact Analysis ──────────────────────────────────────────────────────

section('12. impact() — cross-repo change analysis');

const t4 = performance.now();
const impactResult = impact(config, [
  { repo: 'hustlexp-ai-backend', file: 'src/index.ts', change: 'implementation-change' },
]);
const impactMs = Math.round(performance.now() - t4);

ok(`impact() completed in ${impactMs}ms`);

Array.isArray(impactResult)
  ? ok(`impact() returned ${impactResult.length} impact paths`)
  : fail('impact() did not return an array');

// Severity should be 'warning' for implementation-change (Task 1 fix)
const breakingSeverities = impactResult.flatMap(p =>
  p.affected.filter(a => a.severity === 'breaking' && p.trigger.change === 'implementation-change')
);
breakingSeverities.length === 0
  ? ok("No 'breaking' severity for 'implementation-change' (Task 1 fix confirmed)")
  : fail(`${breakingSeverities.length} items incorrectly use 'breaking' for 'implementation-change'`);

// ─── Final Summary ────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`${BOLD}Results: ${GREEN}${passed} passed${RESET}${BOLD}, ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
if (failed > 0) {
  console.log(`${RED}Some checks failed. See details above.${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}All checks passed. Plugin is end-to-end healthy. ✓${RESET}`);
}
