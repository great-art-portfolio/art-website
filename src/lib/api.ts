/** Typed client for the Pages Functions API. */
import { z } from "zod";
import {
  announcementSchema,
  commitSchema,
  localBackendSchema,
  notifySchema,
  paintingFileSchema,
  paintingFilesSchema,
  statusSchema,
  viewsSchema,
} from "./schemas";
import { parsePainting } from "./painting-edit";
import { slugifyTitle } from "./site";

/**
 * Studio token, remembered per browser ("remember this browser"): local
 * storage first, with a session-storage fallback for tokens saved before
 * the sticky change. Never throws (private-mode browsers may block it).
 */
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
      // Storage blocked — admin features stay unavailable here.
    }
  }
}

function adminHeaders(): HeadersInit {
  const token = getApiToken();
  return token === "" ? {} : { Authorization: `Bearer ${token}` };
}

/** HTTP failure with its status, so callers can tell 401 (needs the API
 * token) from unreachable (no Functions runtime) from a real error. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Fetch JSON and validate it against the endpoint's schema. The schema is
 * what turns a Functions-side field rename into a client build error (via
 * the inferred type below) instead of an `undefined` at runtime — the old
 * `request<T>` trusted whatever the caller claimed.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const notJson = (status: number): ApiError =>
    // No Functions runtime here (e.g. plain `astro dev`) — the dev server
    // answers API routes with an HTML 404 page instead of JSON. Live 5xx
    // pages land here too, so name the status, not the cause.
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

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export const api = {
  /** Read a text file from the repo (banner) or list the paintings folder. */
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
  /** Fetch a painting's repo photo (for AR rebuilds); null when unavailable. */
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
    return data.files;
  },
  /**
   * Publish files to the repo (painting .md + photo, banner text, AR
   * models). Pages rebuilds on push — live a few minutes later.
   */
  async commitFiles(
    message: string,
    files: Array<{ path: string; blob: Blob | string }>,
  ): Promise<void> {
    const encoded = await Promise.all(
      files.map(async (f) => ({
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
      body: JSON.stringify({ message, files: encoded }),
    });
  },
  /**
   * Destroy files (.md + photo + models) in one commit — delete forever.
   * Recoverability lives in trash now; this is the empty/purge path.
   * The page vanishes on next rebuild.
   */
  async deleteFiles(message: string, paths: string[]): Promise<void> {
    await request("/api/commit", commitSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ message, files: [], delete: paths }),
    });
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
  /**
   * True only when the studio dev sidecar answers (working-tree backend).
   * Production has no such route, so a missing answer always reads false —
   * the caller practices instead. One localhost round trip per decision;
   * decisions happen on taps, never in a loop.
   */
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
      // 401 means the token is missing/wrong — the caller names that. Every
      // other failure reads as "not configured" downstream, where the local
      // preview check sorts dev from live.
      if (err instanceof ApiError && err.status === 401) throw err;
      return { views: [], unconfigured: true };
    }
  },
  /**
   * Ping subscribers about a new painting. Channels default on — pass
   * { push: false } or { email: false } to send one side only.
   */
  async notifyCollectors(channels?: {
    push?: boolean;
    email?: boolean;
  }): Promise<{
    sent: number;
    total: number;
    emailed: boolean;
    emailTotal: number;
  }> {
    const data = await request("/api/notify", notifySchema, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        push: channels?.push !== false,
        email: channels?.email !== false,
      }),
    });
    return data;
  },
};

/**
 * Titles already in the repo, for the duplicate-title guard (page links
 * key off titles, so filenames can't answer it). Empty when offline or
 * unconfigured — the save proceeds and the commit may still land.
 */
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
  const base = slugifyTitle(title) === "" ? "untitled" : slugifyTitle(title);
  let files: string[] = [];
  try {
    files = await api.listPaintingFiles();
  } catch {
    // Offline or unconfigured — proceed; the commit may still land.
  }
  const taken = new Set(files);
  if (!taken.has(`${base}.md`)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base}-${n}.md`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
