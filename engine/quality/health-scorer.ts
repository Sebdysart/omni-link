// engine/quality/health-scorer.ts — Per-repo and ecosystem code health metrics

import type { RepoManifest, EcosystemGraph, HealthScore as RawHealthScore } from '../types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface HealthScoreResult {
  /** TODO burden: 100 = no TODOs, decreases with more */
  todoScore: number;
  /** Dead code: 100 = no dead exports, decreases with dead code ratio */
  deadCodeScore: number;
  /** Test quality: based on test coverage percentage */
  testScore: number;
  /** Code quality: based on lint + type errors */
  qualityScore: number;
  /** Overall weighted score: 0-100 */
  overall: number;
}

export interface EcosystemHealthResult {
  perRepo: Record<string, HealthScoreResult>;
  overall: number;
}

// ─── Scoring Weights ─────────────────────────────────────────────────────────

/**
 * Weight distribution for the overall score (must sum to 1.0):
 * - Test coverage/quality: 30%
 * - Code quality (lint + type errors): 25%
 * - Dead code: 25%
 * - TODO burden: 20%
 */
const WEIGHTS = {
  test: 0.3,
  quality: 0.25,
  deadCode: 0.25,
  todo: 0.2,
};

// ─── Score Calculators ───────────────────────────────────────────────────────

/**
 * Score the TODO burden.
 * 0 TODOs = 100, scales down logarithmically.
 * 1 TODO = ~93, 5 = ~75, 10 = ~60, 20 = ~45, 50 = ~20
 */
function scoreTodos(todoCount: number): number {
  if (todoCount <= 0) return 100;
  // Logarithmic decay
  const penalty = Math.min(100, Math.round(30 * Math.log2(todoCount + 1)));
  return Math.max(0, 100 - penalty);
}

/**
 * Score dead code based on the ratio of dead exports to total exports.
 * 0% dead = 100, 50% dead = 50, 100% dead = 0
 */
function scoreDeadCode(deadCodeCount: number, totalExports: number): number {
  if (totalExports === 0) return 100; // No exports = no dead code
  if (deadCodeCount === 0) return 100;

  const ratio = deadCodeCount / totalExports;
  return Math.max(0, Math.round(100 * (1 - ratio)));
}

/**
 * Score test quality based on coverage percentage.
 * null coverage = 40 (unknown but penalized).
 * 0% = 0, 50% = 50, 80% = 80, 100% = 100
 */
function scoreTests(testCoverage: number | null): number {
  if (testCoverage === null) return 40; // Unknown coverage
  return Math.max(0, Math.min(100, Math.round(testCoverage)));
}

/**
 * Score code quality based on lint and type errors.
 * 0 errors = 100, scales down with more errors.
 * Each lint error costs 2 points, each type error costs 4 points (type errors are more serious).
 */
function scoreQuality(lintErrors: number, typeErrors: number): number {
  const penalty = (lintErrors * 2) + (typeErrors * 4);
  return Math.max(0, Math.min(100, 100 - penalty));
}

// ─── Main Functions ──────────────────────────────────────────────────────────

/**
 * Compute a health score for a single repository.
 */
export function scoreHealth(manifest: RepoManifest): HealthScoreResult {
  const { health, apiSurface } = manifest;

  const todoScore = scoreTodos(health.todoCount);
  const deadCodeScore = scoreDeadCode(
    health.deadCode.length,
    apiSurface.exports.length,
  );
  const testScore = scoreTests(health.testCoverage);
  const qualityScore = scoreQuality(health.lintErrors, health.typeErrors);

  // Weighted overall score
  const overall = Math.round(
    todoScore * WEIGHTS.todo +
    deadCodeScore * WEIGHTS.deadCode +
    testScore * WEIGHTS.test +
    qualityScore * WEIGHTS.quality,
  );

  return {
    todoScore,
    deadCodeScore,
    testScore,
    qualityScore,
    overall: Math.max(0, Math.min(100, overall)),
  };
}

/**
 * Compute per-repo and ecosystem-wide health scores.
 */
export function scoreEcosystemHealth(graph: EcosystemGraph): EcosystemHealthResult {
  if (graph.repos.length === 0) {
    return { perRepo: {}, overall: 0 };
  }

  const perRepo: Record<string, HealthScoreResult> = {};

  for (const repo of graph.repos) {
    perRepo[repo.repoId] = scoreHealth(repo);
  }

  // Overall ecosystem score is the average of all repo scores
  const repoScores = Object.values(perRepo);
  const sumOverall = repoScores.reduce((sum, s) => sum + s.overall, 0);
  const overall = Math.round(sumOverall / repoScores.length);

  return { perRepo, overall };
}
