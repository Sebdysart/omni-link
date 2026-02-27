// engine/grapher/type-flow.ts — Cross-repo type lineage detection

import type {
  RepoManifest,
  TypeLineage,
  TypeDef,
  TypeField,
} from '../types.js';

// Suffixes that are commonly added to a base concept name
const CONCEPT_SUFFIXES = [
  'DTO', 'Dto', 'dto',
  'Model', 'model',
  'Entity', 'entity',
  'Schema', 'schema',
  'Response', 'response',
  'Request', 'request',
  'Input', 'input',
  'Output', 'output',
  'Payload', 'payload',
  'Data', 'data',
  'Type', 'type',
  'Params', 'params',
  'Args', 'args',
  'Form', 'form',
  'FormData',
];

/**
 * Identify the same conceptual type across repos.
 *
 * Matching heuristics (in order of priority):
 * 1. Exact name match (case-insensitive)
 * 2. Name with DTO/Model/Entity/etc. suffix stripped
 * 3. Field similarity (Jaccard index on field names) > 0.5
 *
 * Returns TypeLineage[] where each entry represents one "concept" that appears
 * in multiple repos.
 */
export function mapTypeFlows(manifests: RepoManifest[]): TypeLineage[] {
  if (manifests.length < 2) return [];

  // Collect all types from all repos (include schemas and models as TypeDefs)
  const typesByRepo = new Map<string, TypeDef[]>();
  for (const manifest of manifests) {
    const allTypes: TypeDef[] = [];

    for (const t of manifest.typeRegistry.types) {
      allTypes.push(t);
    }

    for (const s of manifest.typeRegistry.schemas) {
      allTypes.push({
        name: s.name,
        fields: s.fields,
        source: s.source,
      });
    }

    for (const m of manifest.typeRegistry.models) {
      allTypes.push({
        name: m.name,
        fields: m.fields,
        source: m.source,
      });
    }

    typesByRepo.set(manifest.repoId, allTypes);
  }

  // Build concept groups: concept name -> { repo, type }[]
  const conceptMap = new Map<string, Array<{ repo: string; type: TypeDef }>>();

  const repoIds = [...typesByRepo.keys()];

  // Phase 1 & 2: Name-based matching (exact and suffix-stripped)
  for (const [repoId, types] of typesByRepo.entries()) {
    for (const typeDef of types) {
      const conceptNames = getConceptNames(typeDef.name);

      for (const conceptName of conceptNames) {
        const existing = conceptMap.get(conceptName) ?? [];
        // Avoid duplicate entries for the same repo and type
        if (!existing.some(e => e.repo === repoId && e.type.name === typeDef.name)) {
          existing.push({ repo: repoId, type: typeDef });
        }
        conceptMap.set(conceptName, existing);
      }
    }
  }

  // Phase 3: Field similarity matching for types not yet grouped
  // Collect ungrouped types (those that appear in a concept group with only one repo)
  const ungroupedByRepo = new Map<string, TypeDef[]>();
  for (const [repoId, types] of typesByRepo.entries()) {
    const ungrouped: TypeDef[] = [];
    for (const typeDef of types) {
      const conceptNames = getConceptNames(typeDef.name);
      const isGrouped = conceptNames.some(cn => {
        const group = conceptMap.get(cn);
        if (!group) return false;
        const repos = new Set(group.map(g => g.repo));
        return repos.size > 1;
      });
      if (!isGrouped) {
        ungrouped.push(typeDef);
      }
    }
    if (ungrouped.length > 0) {
      ungroupedByRepo.set(repoId, ungrouped);
    }
  }

  // Compare ungrouped types across repos using field similarity
  const ungroupedRepos = [...ungroupedByRepo.keys()];
  for (let i = 0; i < ungroupedRepos.length; i++) {
    for (let j = i + 1; j < ungroupedRepos.length; j++) {
      const typesA = ungroupedByRepo.get(ungroupedRepos[i])!;
      const typesB = ungroupedByRepo.get(ungroupedRepos[j])!;

      for (const typeA of typesA) {
        if (typeA.fields.length === 0) continue; // Skip empty types

        for (const typeB of typesB) {
          if (typeB.fields.length === 0) continue;

          const similarity = jaccardSimilarity(typeA.fields, typeB.fields);
          if (similarity > 0.5) {
            // Create a concept name from the shorter/simpler name
            const conceptName = pickConceptName(typeA.name, typeB.name);
            const existing = conceptMap.get(conceptName) ?? [];
            if (!existing.some(e => e.repo === ungroupedRepos[i] && e.type.name === typeA.name)) {
              existing.push({ repo: ungroupedRepos[i], type: typeA });
            }
            if (!existing.some(e => e.repo === ungroupedRepos[j] && e.type.name === typeB.name)) {
              existing.push({ repo: ungroupedRepos[j], type: typeB });
            }
            conceptMap.set(conceptName, existing);
          }
        }
      }
    }
  }

  // Filter to only concepts that span multiple repos
  const lineages: TypeLineage[] = [];
  const emitted = new Set<string>();

  for (const [concept, instances] of conceptMap.entries()) {
    const repos = new Set(instances.map(i => i.repo));
    if (repos.size < 2) continue;
    if (emitted.has(concept)) continue;

    // Deduplicate instances
    const deduped: Array<{ repo: string; type: TypeDef }> = [];
    const seen = new Set<string>();
    for (const inst of instances) {
      const key = `${inst.repo}:${inst.type.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(inst);
      }
    }

    const alignment = determineAlignment(deduped.map(i => i.type));
    emitted.add(concept);

    lineages.push({
      concept,
      instances: deduped,
      alignment,
    });
  }

  return lineages;
}

// ─── Concept Name Resolution ────────────────────────────────────────────────

/**
 * Get all possible concept names for a type name.
 *
 * Returns the original name (lowercased) plus any suffix-stripped variants.
 */
function getConceptNames(typeName: string): string[] {
  const names = new Set<string>();
  names.add(typeName); // Keep original casing for concept name

  // Try stripping suffixes
  for (const suffix of CONCEPT_SUFFIXES) {
    if (typeName.endsWith(suffix) && typeName.length > suffix.length) {
      const stripped = typeName.slice(0, -suffix.length);
      if (stripped.length >= 2) {
        names.add(stripped);
      }
    }
  }

  return [...names];
}

/**
 * Pick the best concept name from two type names.
 * Prefers the shorter name, or the one without common suffixes.
 */
function pickConceptName(nameA: string, nameB: string): string {
  const strippedA = stripAllSuffixes(nameA);
  const strippedB = stripAllSuffixes(nameB);

  // If they strip to the same thing, use that
  if (strippedA.toLowerCase() === strippedB.toLowerCase()) {
    return strippedA;
  }

  // Otherwise prefer the shorter one
  return nameA.length <= nameB.length ? stripAllSuffixes(nameA) : stripAllSuffixes(nameB);
}

function stripAllSuffixes(name: string): string {
  let result = name;
  for (const suffix of CONCEPT_SUFFIXES) {
    if (result.endsWith(suffix) && result.length > suffix.length) {
      result = result.slice(0, -suffix.length);
    }
  }
  return result;
}

// ─── Field Similarity ───────────────────────────────────────────────────────

/**
 * Compute Jaccard similarity coefficient between two sets of fields.
 * Compares by field name only (ignoring types, since cross-language types differ).
 */
function jaccardSimilarity(fieldsA: TypeField[], fieldsB: TypeField[]): number {
  const setA = new Set(fieldsA.map(f => f.name.toLowerCase()));
  const setB = new Set(fieldsB.map(f => f.name.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const name of setA) {
    if (setB.has(name)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Alignment Determination ────────────────────────────────────────────────

/**
 * Determine the alignment status for a set of type instances.
 *
 * - `aligned`: all instances have the same fields (by name)
 * - `subset`: one instance's fields are a strict subset of another's
 * - `diverged`: instances have differing fields not explainable by subset
 */
function determineAlignment(types: TypeDef[]): 'aligned' | 'diverged' | 'subset' {
  if (types.length < 2) return 'aligned';

  const fieldSets = types.map(t => new Set(t.fields.map(f => f.name)));

  // Check if all field sets are equal
  const allEqual = fieldSets.every(set => {
    if (set.size !== fieldSets[0].size) return false;
    for (const field of set) {
      if (!fieldSets[0].has(field)) return false;
    }
    return true;
  });

  if (allEqual) return 'aligned';

  // Check if any set is a strict subset of another
  for (let i = 0; i < fieldSets.length; i++) {
    for (let j = 0; j < fieldSets.length; j++) {
      if (i === j) continue;
      if (isSubset(fieldSets[i], fieldSets[j]) && fieldSets[i].size < fieldSets[j].size) {
        return 'subset';
      }
    }
  }

  return 'diverged';
}

/**
 * Check if setA is a subset of setB.
 */
function isSubset(setA: Set<string>, setB: Set<string>): boolean {
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
