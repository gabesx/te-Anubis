import { z } from 'zod';

/**
 * Matches the on-disk `.anubis.yml` shape exactly (snake_case, per the
 * product spec's example config) — this is the file format, not the internal
 * runtime shape. `load-config.ts` maps the parsed output to core's camelCase
 * `AnubisConfig` (core/types/config.ts).
 *
 * Kept extensible on purpose: nested objects use `.default({})` (every field
 * optional, merged over defaults) and the schema avoids `.strict()` so
 * unrecognized keys (future functionality) don't hard-fail validation — per
 * the requirement that `.anubis.yml` must stay extensible.
 */
export const AnubisConfigFileSchema = z.object({
  version: z.number().default(1),
  ai: z
    .object({
      // "auto" (the default) picks whichever provider's API key is actually set in the
      // environment, checked in PROVIDER_AUTO_DETECT_PRIORITY order (core/providers/provider.ts) —
      // Gemini first. An explicit value here always wins over auto-detection.
      provider: z.enum(['auto', 'anthropic', 'openai', 'gemini']).default('auto'),
      model: z.string().optional(),
    })
    .default({}),
  review: z
    .object({
      minimum_confidence: z.number().min(0).max(1).default(0.7),
      max_comments: z.number().int().positive().default(15),
      max_files: z.number().int().positive().default(50),
    })
    .default({}),
  skills: z
    .object({
      auto_detect: z.boolean().default(true),
      enabled: z.array(z.string()).default(['code-convention']),
    })
    .default({}),
  github: z
    .object({
      inline_comments: z.boolean().default(true),
      summary: z.boolean().default(true),
    })
    .default({}),
  fix: z
    .object({
      enabled: z.boolean().default(false),
      auto_commit: z.boolean().default(false),
      allowed: z.array(z.enum(['SAFE', 'REVIEW_REQUIRED', 'UNSAFE'])).default(['SAFE']),
    })
    .default({}),
});

export type AnubisConfigFileInput = z.input<typeof AnubisConfigFileSchema>;
export type AnubisConfigFile = z.output<typeof AnubisConfigFileSchema>;
