/** Runtime schemas for the Functions boundaries. Validate once at the edge;
 * handlers work with inferred types instead of casts. */
import { z } from "zod";

/** GitHub `contents` answer for a single file. */
const githubFileSchema = z.object({
  content: z.string().optional(),
  encoding: z.string().optional(),
});

export type GitHubFile = z.infer<typeof githubFileSchema>;

export function parseGitHubFile(raw: unknown): GitHubFile | null {
  const result = githubFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** GitHub `contents` answer for a directory listing. */
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

/** Admin commit POST body (the sidecar mirrors this contract). Wrong-typed
 * fields fall back to empty; only a non-object body is invalid JSON. */
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

/** VAPID private key for push signing — all five EC fields required. */
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
  // Exactly the five EC strings crypto.subtle.importKey("jwk") needs —
  // structurally a JsonWebKey, no cast.
  return result.data;
}

/** Push subscribe / unsubscribe POST bodies. Endpoints must be https
 * (and parseable — the VAPID audience reads the origin); keys ride
 * along as strings when the browser sends them. */
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
