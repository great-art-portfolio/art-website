/** Runtime schemas for JSON boundaries. Parsers return null or skip bad rows
 * instead of throwing. Types come from `z.infer` so they match the checks. */
import { z } from "zod";

/** Parses and validates JSON text. Null when unparseable or invalid. */
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
 * One `#local-collection` row as admin.astro bakes it. Dimensions are numbers
 * or null, not the display strings the dashboard edits.
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
  /** Scheduled publish date ("YYYY-MM-DD", "" when none). */
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
 * Parses a row list such as the baked collection or stats seed. Invalid rows
 * are dropped so one bad painting doesn't blank the page. Returns null only
 * when the payload isn't a list, so callers reach their error branches.
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

/** Parses the collection baked by admin.astro. */
export function parseBakedCollection(text: string): BakedRow[] | null {
  return parseRowList(text, bakedRowSchema);
}

/**
 * One `#stats-seed` row as views.astro bakes it. Counts load client-side from
 * the analytics API.
 */
const statsSeedSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  sold: z.boolean(),
  draft: z.boolean(),
  /** Painting photo shown beside its stats. */
  image: z.string(),
});

export type StatsSeedRow = z.infer<typeof statsSeedSchema>;

/** Parses the stats seed baked by views.astro. */
export function parseStatsSeed(text: string): StatsSeedRow[] | null {
  return parseRowList(text, statsSeedSchema);
}

/** A painting in the dev practice overlay. Dimensions are display strings. */
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
  /** Scheduled publish date. Overlays saved before this field existed omit
   * it. */
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

/** Validates a loaded practice overlay. Invalid data returns null. */
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

/** Validates a stored banner preview. Invalid data returns null. */
export function parseBannerPreview(raw: unknown): BannerPreview | null {
  const result = bannerPreviewSchema.safeParse(raw);
  if (!result.success) return null;
  return {
    text: result.data.text,
    expires: result.data.expires ?? null,
  };
}

// API responses, one schema per endpoint, so a field renamed in Functions
// fails validation instead of arriving as `undefined`.

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
  // Large lists are paged by cursor. Null or missing means done.
  nextCursor: z.number().nullable().optional(),
  emailed: z.boolean(),
  emailTotal: z.number(),
});

/** Admin: how many browsers would a ping reach. */
export const pushCountSchema = z.object({ total: z.number() });

/** Admin: ping reach plus the email a send would deliver. */
export const notifyStatusSchema = z.object({
  total: z.number(),
  emailSubject: z.string(),
  emailText: z.string(),
  emailHtml: z.string(),
});

export const localBackendSchema = z.object({ local: z.unknown().optional() });

export const pushConfigSchema = z.object({ publicKey: z.string() });

/** Commit POST response, the same from Pages and the local content API. */
export const commitSchema = z.object({
  ok: z.literal(true),
  commit: z.string(),
});
