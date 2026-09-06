/** Typed client for the Pages Functions API. */

function adminHeaders(): HeadersInit {
  const token = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    // No Functions runtime here (e.g. plain `astro dev`) — the dev server
    // answers API routes with an HTML 404 page instead of JSON.
    throw new ApiError(
      res.status,
      `The site API isn't running here — use the live /admin to publish. (${res.status})`,
    );
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
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
      const data = await request<{ announcement: string }>("/api/commit", {
        headers: adminHeaders(),
      });
      return data.announcement;
    } catch {
      return "";
    }
  },
  async getPaintingFile(path: string): Promise<string | null> {
    try {
      const data = await request<{ content: string }>(
        `/api/commit?path=${encodeURIComponent(path)}`,
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
      const token = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
      const headers: HeadersInit = token === "" ? {} : { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/photo?path=${encodeURIComponent(path)}`, {
        headers,
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  },
  async listPaintingFiles(): Promise<string[]> {
    const data = await request<{ files: string[] }>("/api/commit", {
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
          typeof f.blob === "string" ? textToBase64(f.blob) : await blobToBase64(f.blob),
      })),
    );
    await request("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ message, files: encoded }),
    });
  },
  /**
   * Delete a painting's files (.md + photo + models) in one commit.
   * Recoverable from repo history; the page vanishes on next rebuild.
   */
  async deleteFiles(message: string, paths: string[]): Promise<void> {
    await request("/api/commit", {
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
    return await request("/api/status", { headers: adminHeaders() });
  },
  async autoPost(input: { text: string; imageUrl: string }): Promise<void> {
    await request("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify(input),
    });
  },
  async paintingViews(): Promise<
    { views: Array<{ slug: string; views: number }>; unconfigured: boolean }
  > {
    try {
      const data = await request<{
        views: Array<{ slug: string; views: number }>;
        unconfigured?: boolean;
      }>("/api/analytics", { headers: adminHeaders() });
      return { views: data.views, unconfigured: data.unconfigured === true };
    } catch (err) {
      // 401 means the token is missing/wrong — the caller names that. Every
      // other failure reads as "not configured" downstream, where the local
      // preview check sorts dev from live.
      if (err instanceof ApiError && err.status === 401) throw err;
      return { views: [], unconfigured: true };
    }
  },
  async collectorCount(): Promise<number> {
    try {
      const data = await request<{ total: number }>("/api/notify", {
        headers: adminHeaders(),
      });
      return data.total;
    } catch {
      return 0;
    }
  },
  async notifyCollectors(): Promise<{ sent: number; total: number }> {
    const data = await request<{ sent: number; total: number }>("/api/notify", {
      method: "POST",
      headers: adminHeaders(),
    });
    return data;
  },
};
