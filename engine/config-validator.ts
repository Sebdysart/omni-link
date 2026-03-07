import { z } from 'zod';

const repoLanguageSchema = z.enum([
  'typescript',
  'tsx',
  'javascript',
  'swift',
  'python',
  'go',
  'rust',
  'java',
  'graphql',
]);

const evolutionCategorySchema = z.enum([
  'feature',
  'performance',
  'monetization',
  'scale',
  'security',
]);

function normalizeCategory(category: string): string {
  return category === 'features' ? 'feature' : category;
}

const categoryArraySchema = z
  .array(z.string().min(1))
  .transform((categories, ctx) =>
    categories.map((category, index) => {
      const normalized = normalizeCategory(category);
      const parsed = evolutionCategorySchema.safeParse(normalized);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid evolution category at index ${index}: ${category}`,
        });
      }
      return normalized;
    }),
  )
  .pipe(z.array(evolutionCategorySchema));

export const repoConfigSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  language: repoLanguageSchema,
  role: z.string().min(1),
});

const DEFAULT_EVOLUTION = {
  aggressiveness: 'aggressive' as const,
  maxSuggestionsPerSession: 5,
  categories: ['feature', 'performance', 'monetization', 'scale', 'security'] as Array<
    z.infer<typeof evolutionCategorySchema>
  >,
};

const DEFAULT_QUALITY = {
  blockOnFailure: true,
  requireTestsForNewCode: true,
  conventionStrictness: 'strict' as const,
};

const DEFAULT_CONTEXT = {
  tokenBudget: 8000,
  prioritize: 'changed-files-first' as const,
  includeRecentCommits: 20,
};

const DEFAULT_CACHE = {
  directory: '.omni-link-cache',
  maxAgeDays: 7,
};

export const omniLinkConfigSchema = z.object({
  repos: z.array(repoConfigSchema).min(1).max(10),
  evolution: z
    .object({
      aggressiveness: z.enum(['aggressive', 'moderate', 'on-demand']).default('aggressive'),
      maxSuggestionsPerSession: z.number().int().min(1).max(20).default(5),
      categories: categoryArraySchema.default(DEFAULT_EVOLUTION.categories),
    })
    .default(DEFAULT_EVOLUTION),
  quality: z
    .object({
      blockOnFailure: z.boolean().default(true),
      requireTestsForNewCode: z.boolean().default(true),
      conventionStrictness: z.enum(['strict', 'moderate', 'relaxed']).default('strict'),
    })
    .default(DEFAULT_QUALITY),
  context: z
    .object({
      tokenBudget: z.number().int().min(100).max(50000).default(8000),
      prioritize: z
        .enum(['changed-files-first', 'api-surface-first'])
        .default('changed-files-first'),
      includeRecentCommits: z.number().int().min(0).max(100).default(20),
      focus: z.enum(['commits', 'types', 'api-surface', 'mismatches', 'auto']).optional(),
    })
    .default(DEFAULT_CONTEXT),
  cache: z
    .object({
      directory: z.string().min(1).default(DEFAULT_CACHE.directory),
      maxAgeDays: z.number().int().min(1).max(30).default(7),
    })
    .default(DEFAULT_CACHE),
  simulateOnly: z.boolean().optional(),
});

export type ParsedOmniLinkConfig = z.infer<typeof omniLinkConfigSchema>;

export function parseConfig(raw: unknown): ParsedOmniLinkConfig {
  return omniLinkConfigSchema.parse(raw);
}

export function safeParseConfig(raw: unknown): ReturnType<typeof omniLinkConfigSchema.safeParse> {
  return omniLinkConfigSchema.safeParse(raw);
}
