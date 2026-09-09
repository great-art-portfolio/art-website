/**
 * Runtime schemas for every JSON boundary the islands touch. Each one used
 * to be `JSON.parse(...) as unknown` plus hand-rolled guards (or worse, a
 * bare `as T`), so changing a field on one side stayed green on the other
 * and failed silently at runtime — usually as an empty list or a swallowed
 * default. Zod is the enforcer because Astro already ships it (content
 * collections use `astro/zod`), so agents meet the same pattern here they
 * meet in `content.config.ts`, and `z.infer` keeps the type and the check
 * in one place instead of two that can drift.
 *
 * Nothing here throws: `parseJsonWith` and the row-level helpers return
 * null / skip bad rows, matching the old fallbacks (baked list, practice
 * overlay, dev banner preview) while rejecting invented shapes.
 */
import { z } from "zod";

/** Parse JSON text and validate it; null when unparseable or invalid. */
export function parseJsonWith<T>(text: string, schema: z.ZodType<T>): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * One `#local-collection` row, exactly as admin.astro bakes it: dims ride
 * as numbers (or null), not the display strings the dashboard edits with.
 */
const bakedRowSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  price: z.number(),
  sold: z.boolean(),
  alt: z.string(),
  description: z.string(),
  widthIn: z.number().nullable(),
  heightIn: z.number().nullable(),
  depthIn: z.number().nullable(),
  draft: z.boolean(),
  /** Scheduled go-live ("YYYY-MM-DD", "" when none). */
  publishOn: z.string(),
  trash: z.boolean(),
  trashedAt: z.string(),
  image: z.string(),
  order: z.number().int().nullable(),
  mdPath: z.string().min(1),
  views: z.number(),
});

export type BakedRow = z.infer<typeof bakedRowSchema>;

/**
 * Row-list payloads (baked collection, stats seed): invalid rows are
 * dropped, not fatal — one bad painting never blanks the page. Null
 * only when the payload isn't a list at all, so callers keep their
 * fall through to the error branches.
 */
function parseRowList<T>(text: string, rowSchema: z.ZodType<T>): T[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const rows: T[] = [];
  for (const item of raw) {
    const row = rowSchema.safeParse(item);
    if (row.success) rows.push(row.data);
  }
  return rows;
}

/** The baked collection, exactly as admin.astro bakes it. */
export function parseBakedCollection(text: string): BakedRow[] | null {
  return parseRowList(text, bakedRowSchema);
}

/**
 * One `#stats-seed` row, as views.astro bakes it: identity plus status
 * only — counts arrive client-side from the analytics API.
 */
const statsSeedSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  sold: z.boolean(),
  draft: z.boolean(),
  /** Painting photo, so Metrics reads visually instead of as a ledger. */
  image: z.string(),
});

export type StatsSeedRow = z.infer<typeof statsSeedSchema>;

/** The stats seed, exactly as views.astro bakes it. */
export function parseStatsSeed(text: string): StatsSeedRow[] | null {
  return parseRowList(text, statsSeedSchema);
}

/** A practiced painting in the dev overlay (dims as display strings). */
const practicePaintingSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  price: z.number(),
  sold: z.boolean(),
  alt: z.string(),
  description: z.string(),
  widthIn: z.string(),
  heightIn: z.string(),
  depthIn: z.string(),
  medium: z.string(),
  draft: z.boolean(),
  /** Scheduled go-live; absent (older overlays) means none. */
  publishOn: z.string().optional().default(""),
  order: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Gallery position while practicing; absent means unordered."),
});

export type PracticePainting = z.infer<typeof practicePaintingSchema>;

const practiceOverlaySchema = z.object({
  upserts: z.record(z.string(), practicePaintingSchema),
  deletes: z.array(z.string()),
});

export type PracticeOverlay = z.infer<typeof practiceOverlaySchema>;

/** Validate a loaded practice overlay; garbage resets to empty. */
export function parsePracticeOverlay(raw: unknown): PracticeOverlay | null {
  const result = practiceOverlaySchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Dev banner preview kept in this browser. */
const bannerPreviewSchema = z.object({
  text: z.string().min(1).max(280),
  expires: z.string().nullable().optional(),
});

export type BannerPreview = z.infer<typeof bannerPreviewSchema>;

/** Validate a stored banner preview; garbage reads as absent. */
export function parseBannerPreview(raw: unknown): BannerPreview | null {
  const result = bannerPreviewSchema.safeParse(raw);
  if (!result.success) return null;
  return {
    text: result.data.text,
    expires: result.data.expires ?? null,
  };
}

// API responses: one schema per endpoint, so a Functions-side field rename
// breaks the client build instead of arriving as `undefined`.

export const announcementSchema = z.object({ announcement: z.string() });

export const paintingFileSchema = z.object({ content: z.string() });

export const paintingFilesSchema = z.object({ files: z.array(z.string()) });

export const statusSchema = z.object({
  stripe: z.boolean(),
  shippo: z.boolean(),
  socialPost: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  turnstileSiteKey: z.string().optional(),
});

export const viewsSchema = z.object({
  views: z.array(z.object({ slug: z.string(), views: z.number() })),
  unconfigured: z.boolean().optional(),
});

export const notifySchema = z.object({
  sent: z.number(),
  total: z.number(),
  gone: z.number().optional(),
  failed: z.number().optional(),
  emailed: z.boolean(),
  emailTotal: z.number(),
});

export const localBackendSchema = z.object({ local: z.unknown().optional() });

export const pushConfigSchema = z.object({ publicKey: z.string() });

/** Commit POST answer, identical on Pages and the studio sidecar. */
export const commitSchema = z.object({
  ok: z.literal(true),
  commit: z.string(),
});
