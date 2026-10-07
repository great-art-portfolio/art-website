/** Runtime schemas for the Functions boundaries. Input is validated once at
 * the edge, and handlers use the inferred types instead of casts. */
import { z } from "zod";

/** GitHub `contents` response for a single file. */
const githubFileSchema = z.object({
  content: z.string().optional(),
  encoding: z.string().optional(),
});

export type GitHubFile = z.infer<typeof githubFileSchema>;

export function parseGitHubFile(raw: unknown): GitHubFile | null {
  const result = githubFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** GitHub `contents` response for a directory listing. */
const githubDirEntrySchema = z.object({ name: z.string().optional() });

export function parseGitHubDir(
  raw: unknown,
): Array<{ name?: string | undefined }> {
  if (!Array.isArray(raw)) return [];
  const entries: Array<{ name?: string | undefined }> = [];
  for (const item of raw) {
    const entry = githubDirEntrySchema.safeParse(item);
    if (entry.success) entries.push(entry.data);
  }
  return entries;
}

/** Admin commit POST body. The local content API accepts the same shape.
 * Fields of the wrong type fall back to empty. Only a non-object body is
 * rejected. */
const commitBodySchema = z.object({
  message: z.string().catch(""),
  files: z
    .array(z.object({ path: z.unknown(), contentBase64: z.unknown() }))
    .catch([]),
  delete: z.array(z.unknown()).catch([]),
});

export interface CommitBody {
  message: string;
  inputs: Array<{ path: unknown; contentBase64: unknown }>;
  deletes: unknown[];
}

export function parseCommitBody(raw: unknown): CommitBody | null {
  const result = commitBodySchema.safeParse(raw);
  if (!result.success) return null;
  return {
    message: result.data.message,
    inputs: result.data.files,
    deletes: result.data.delete,
  };
}

/** VAPID private key for push signing. All five EC fields are required. */
const jwkSchema = z.object({
  kty: z.string(),
  crv: z.string(),
  x: z.string(),
  y: z.string(),
  d: z.string(),
});

export function parseJwk(raw: unknown): JsonWebKey | null {
  const result = jwkSchema.safeParse(raw);
  if (!result.success) return null;
  // The five EC fields crypto.subtle.importKey("jwk") needs. The type is
  // structurally a JsonWebKey, so no cast is needed.
  return result.data;
}

/** Push subscribe and unsubscribe POST bodies. Endpoints must be valid
 * https URLs because the VAPID audience uses their origin. Keys are
 * strings when the browser sends them. */
const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().refine(
      (url) => {
        if (!url.startsWith("https://")) return false;
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: "A valid subscription is required" },
    ),
    keys: z
      .object({ p256dh: z.unknown(), auth: z.unknown() })
      .partial()
      .optional(),
  }),
});

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function parsePushSubscribe(raw: unknown): PushSubscription | null {
  const result = pushSubscribeSchema.safeParse(raw);
  if (!result.success) return null;
  const keys = result.data.subscription.keys ?? {};
  return {
    endpoint: result.data.subscription.endpoint,
    p256dh: typeof keys.p256dh === "string" ? keys.p256dh : "",
    auth: typeof keys.auth === "string" ? keys.auth : "",
  };
}

const pushUnsubscribeSchema = z.object({ endpoint: z.string().min(1) });

export function parsePushUnsubscribe(raw: unknown): string | null {
  const result = pushUnsubscribeSchema.safeParse(raw);
  return result.success ? result.data.endpoint : null;
}

/** /catalog.json, built from the paintings collection. Malformed rows are
 * dropped, so a bad entry can't be bought. */
const catalogItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  priceCents: z.number().int().positive(),
  sold: z.boolean(),
  file: z.string(),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;

export function parseCatalog(raw: unknown): CatalogItem[] {
  const list = z.object({ paintings: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return [];
  const items: CatalogItem[] = [];
  for (const row of list.data.paintings) {
    const item = catalogItemSchema.safeParse(row);
    if (item.success) items.push(item.data);
  }
  return items;
}

/** Checkout POST body from a painting page. */
const checkoutBodySchema = z.object({
  slug: z.string().max(200),
  title: z.string().max(200),
  priceCents: z.number(),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

export function parseCheckoutBody(raw: unknown): CheckoutBody | null {
  const result = checkoutBodySchema.safeParse(raw);
  return result.success ? result.data : null;
}

const addressSchema = z
  .object({
    line1: z.string().nullish(),
    line2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postal_code: z.string().nullish(),
    country: z.string().nullish(),
  })
  .nullish();

/** The parts of a Stripe Checkout Session event the webhook reads. */
const stripeEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
      payment_status: z.string().nullish(),
      amount_total: z.number().nullish(),
      currency: z.string().nullish(),
      livemode: z.boolean().nullish(),
      metadata: z.record(z.string(), z.string()).nullish(),
      total_details: z.object({ amount_tax: z.number().nullish() }).nullish(),
      customer_details: z
        .object({
          name: z.string().nullish(),
          email: z.string().nullish(),
          phone: z.string().nullish(),
          address: addressSchema,
        })
        .nullish(),
      collected_information: z
        .object({
          shipping_details: z
            .object({ name: z.string().nullish(), address: addressSchema })
            .nullish(),
        })
        .nullish(),
    }),
  }),
});

export type StripeEvent = z.infer<typeof stripeEventSchema>;
export type StripeAddress = z.infer<typeof addressSchema>;

export function parseStripeEvent(raw: unknown): StripeEvent | null {
  const result = stripeEventSchema.safeParse(raw);
  return result.success ? result.data : null;
}
