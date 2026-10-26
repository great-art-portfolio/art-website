/** Typed client for the Pages Functions API. */
import { z } from "zod";
import {
  announcementSchema,
  commitSchema,
  localBackendSchema,
  notifySchema,
  notifyStatusSchema,
  countSchema,
  paintingFileSchema,
  paintingFilesSchema,
  statusSchema,
  suggestEnabledSchema,
  suggestionSchema,
  viewsSchema,
} from "./schemas";
import { commitBatches } from "./commit-batches";
import { parsePainting } from "./painting-edit";
import { slugifyTitle } from "./site";

/** Studio API token stored in this browser, or "" when unavailable. */
export function getApiToken(): string {
  try {
    return (
      localStorage.getItem("ADMIN_API_TOKEN") ??
      sessionStorage.getItem("ADMIN_API_TOKEN") ??
      ""
    );
  } catch {
    return "";
  }
}

export function setApiToken(token: string): void {
  try {
    if (token === "") {
      localStorage.removeItem("ADMIN_API_TOKEN");
      sessionStorage.removeItem("ADMIN_API_TOKEN");
    } else {
      localStorage.setItem("ADMIN_API_TOKEN", token);
      sessionStorage.removeItem("ADMIN_API_TOKEN");
    }
  } catch {
    try {
      if (token === "") sessionStorage.removeItem("ADMIN_API_TOKEN");
      else sessionStorage.setItem("ADMIN_API_TOKEN", token);
    } catch {
      // Storage is blocked, so admin features are unavailable.
    }
  }
}

function adminHeaders(): HeadersInit {
  const token = getApiToken();
  return token === "" ? {} : { Authorization: `Bearer ${token}` };
}

/** HTTP failure carrying the status, so callers can tell a 401 from other
 * errors. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Fetches JSON and validates it against the endpoint schema, so a field
 * renamed in Functions fails loudly instead of arriving as `undefined`. */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const notJson = (status: number): ApiError =>
    // Plain `astro dev` has no Functions runtime and serves HTML 404s.
    // Report the status.
    new ApiError(
      status,
      `The site API didn't answer properly (${status}) — use the live /admin to publish.`,
    );
  const res = await fetch(path, init);
  let raw: unknown;
  try {
    raw = (await res.json()) as unknown;
  } catch {
    throw notJson(res.status);
  }
  // A refusal means her day-long email sign-in ran out mid-visit. The
  // studio rooms autosave her words, so a reload keeps them.
  if (res.status === 401)
    throw new ApiError(
      401,
      "Your sign-in has run out. Reload the page and enter the code from your email — your words are kept.",
    );
  if (!res.ok)
    throw new ApiError(
      res.status,
      errorField(raw) ?? `Request failed (${res.status})`,
    );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw notJson(res.status);
  return parsed.data;
}

/** The `{ error }` message on a failure body, when it is one. */
function errorField(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  if (!("error" in raw)) return null;
  return typeof raw.error === "string" ? raw.error : null;
}

function bytesToBase64(view: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    bin += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** "Reorder gallery (2 of 3)" when a big save spans several commits. */
function partMessage(message: string, i: number, count: number): string {
  return count === 1 ? message : `${message} (${i + 1} of ${count})`;
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

let keyExpires: string | null = null;

/** The site's GitHub key's last day, from the latest collection listing,
 * or null when it never expires or hasn't been asked yet. */
export function publishingKeyExpiry(): string | null {
  return keyExpires;
}

export const api = {
  /** Reads the banner text from the repo. */
  async getBanner(): Promise<string> {
    try {
      const data = await request("/api/commit", announcementSchema, {
        headers: adminHeaders(),
      });
      return data.announcement;
    } catch {
      return "";
    }
  },
  async getPaintingFile(path: string): Promise<string | null> {
    try {
      const data = await request(
        `/api/commit?path=${encodeURIComponent(path)}`,
        paintingFileSchema,
        { headers: adminHeaders() },
      );
      return data.content;
    } catch {
      return null;
    }
  },
  /** Fetches a painting's photo from the repo for AR rebuilds. Null when
   * unavailable. */
  async getPhoto(path: string): Promise<Blob | null> {
    try {
      const res = await fetch(`/api/photo?path=${encodeURIComponent(path)}`, {
        headers: adminHeaders(),
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  },
  async listPaintingFiles(): Promise<string[]> {
    const data = await request("/api/commit", paintingFilesSchema, {
      method: "PUT",
      headers: adminHeaders(),
    });
    keyExpires = data.keyExpires ?? null;
    return data.files;
  },
  /**
   * Commits files to the repo: painting .md and photo, banner text, or AR
   * models. Pages rebuilds on push, so changes go live a few minutes later.
   */
  async commitFiles(
    message: string,
    files: Array<{ path: string; blob: Blob | string }>,
  ): Promise<void> {
    const batches = commitBatches(files);
    for (const [i, batch] of batches.entries()) {
      const encoded = await Promise.all(
        batch.files.map(async (f) => ({
          path: f.path,
          contentBase64:
            typeof f.blob === "string"
              ? textToBase64(f.blob)
              : await blobToBase64(f.blob),
        })),
      );
      await request("/api/commit", commitSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          message: partMessage(message, i, batches.length),
          files: encoded,
        }),
      });
    }
  },
  /** Permanently deletes files. Recoverable deletes go through trash
   * instead. */
  async deleteFiles(message: string, paths: string[]): Promise<void> {
    const batches = commitBatches([], paths);
    for (const [i, batch] of batches.entries()) {
      await request("/api/commit", commitSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          message: partMessage(message, i, batches.length),
          files: [],
          delete: batch.deletes,
        }),
      });
    }
  },
  async status(): Promise<{
    stripe: boolean;
    shippo: boolean;
    socialPost: boolean;
    email: boolean;
    push: boolean;
  }> {
    return await request("/api/status", statusSchema, {
      headers: adminHeaders(),
    });
  },
  /** True when the writing helper is set up (its key is on the server). */
  async suggestEnabled(): Promise<boolean> {
    try {
      const data = await request("/api/suggest", suggestEnabledSchema, {
        headers: adminHeaders(),
      });
      return data.enabled;
    } catch {
      return false;
    }
  },
  /** Title, description, and alt text ideas from a small photo. */
  async suggest(input: {
    image: string;
    title: string;
    medium: string;
    widthIn: number | null;
    heightIn: number | null;
    notes: string;
  }): Promise<{ titles: string[]; description: string; alt: string }> {
    return await request("/api/suggest", suggestionSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify(input),
    });
  },
  /** True when the local studio content API responds. Checked per action,
   * not polled. */
  async localBackend(): Promise<boolean> {
    try {
      const res = await fetch("/api/studio-dev", {
        headers: adminHeaders(),
      });
      if (!res.ok) return false;
      const raw = (await res.json()) as unknown;
      const parsed = localBackendSchema.safeParse(raw);
      return parsed.success && parsed.data.local === true;
    } catch {
      return false;
    }
  },
  async paintingViews(): Promise<{
    views: Array<{ slug: string; views: number }>;
    unconfigured: boolean;
  }> {
    try {
      const data = await request("/api/analytics", viewsSchema, {
        headers: adminHeaders(),
      });
      return { views: data.views, unconfigured: data.unconfigured === true };
    } catch (err) {
      // A 401 means a bad token. Callers treat other errors as unconfigured.
      if (err instanceof ApiError && err.status === 401) throw err;
      return { views: [], unconfigured: true };
    }
  },
  /** Emails the list the standard new-painting note (a publish alert). */
  async notifyCollectors(): Promise<{ emailed: boolean; emailTotal: number }> {
    return await request("/api/notify", notifySchema, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: true }),
    });
  },
  /**
   * Emails the whole list. Blank fields use the standard text. The server
   * fans out the send and reports how many addresses it reached.
   */
  async sendCollectorEmail(copy: {
    subject: string;
    body: string;
  }): Promise<{ emailed: boolean; emailTotal: number }> {
    const data = await request("/api/notify", notifySchema, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        email: { subject: copy.subject, body: copy.body },
      }),
    });
    return data;
  },
  /**
   * The email a send would deliver, including the drafted subject and body.
   * Returns null instead of throwing when the preview can't load.
   */
  async emailPreview(copy: {
    subject: string;
    body: string;
  }): Promise<{ subject: string; text: string; html: string } | null> {
    try {
      const query =
        `?subject=${encodeURIComponent(copy.subject)}` +
        `&body=${encodeURIComponent(copy.body)}`;
      const data = await request(`/api/notify${query}`, notifyStatusSchema, {
        headers: adminHeaders(),
      });
      return {
        subject: data.emailSubject,
        text: data.emailText,
        html: data.emailHtml,
      };
    } catch {
      return null;
    }
  },
  async emailSubscriberCount(): Promise<number | null> {
    try {
      const data = await request("/api/collectors", countSchema, {
        headers: adminHeaders(),
      });
      return data.total;
    } catch {
      return null;
    }
  },
};

/** Painting titles in the repo, for the duplicate-title check. Empty when
 * offline, which lets saves proceed. */
export async function existingTitles(): Promise<string[]> {
  let files: string[];
  try {
    files = await api.listPaintingFiles();
  } catch {
    return [];
  }
  const titles: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const content = await api.getPaintingFile(`src/content/paintings/${f}`);
    const title = content === null ? "" : (parsePainting(content)?.title ?? "");
    if (title !== "") titles.push(title);
  }
  return titles;
}

/** Unique slug for a new painting, checking the repo's paintings folder. */
export async function uniqueSlug(title: string): Promise<string> {
  const base = slugifyTitle(title);
  let files: string[] = [];
  try {
    files = await api.listPaintingFiles();
  } catch {
    // Offline or unconfigured. Proceed, since the commit may still succeed.
  }
  const taken = new Set(files);
  if (!taken.has(`${base}.md`)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base}-${n}.md`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
