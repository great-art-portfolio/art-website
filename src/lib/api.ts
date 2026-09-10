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

/** Studio token, remembered per browser. Never throws. */
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

/** HTTP failure with status: 401 vs unreachable vs real error. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Fetch JSON validated against the endpoint schema, so a Functions-side
 * rename breaks the build instead of arriving as `undefined`. */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const notJson = (status: number): ApiError =>
    // No Functions runtime (plain `astro dev` serves HTML 404s) — name the status.
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
  /** Delete forever (.md + photo + models). Trash handles recoverability. */
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
  /** True when the studio sidecar answers. Decided per tap, never in a loop. */
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
      // 401 = bad token; everything else reads as unconfigured downstream.
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

/** Repo titles for the duplicate guard. Empty offline — saves proceed anyway. */
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
