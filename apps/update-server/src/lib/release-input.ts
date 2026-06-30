import { z } from 'zod';

export const createDesktopReleaseSchema = z.object({
  version: z.string().min(1),
  channel: z.string().min(1).default('stable'),
  enabled: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  pubDate: z.string().datetime().optional(),
  assets: z.array(z.object({
    target: z.string().min(1),
    arch: z.string().min(1),
    url: z.string().url(),
    signature: z.string().min(1),
    sha256: z.string().min(1).nullable().optional(),
    enabled: z.boolean().default(true)
  })).min(1)
});

export type CreateDesktopReleaseInput = z.infer<typeof createDesktopReleaseSchema>;
