/**
 * Minimal GitHub contents API client for the admin commit flow.
 *
 * Paintings live in git, so /admin publishes by committing .md + image
 * (+ optional AR models) straight to the repo — no database, no rebuild
 * orchestration. Cloudflare Pages rebuilds on push; a sub-second Astro
 * build means the painting is live about a minute after she taps save.
 *
 * The token lives here, server-side (GITHUB_TOKEN secret). Her phone only
 * ever talks to our own admin endpoint behind Cloudflare Access.
 */

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
}

interface RepoFile {
  path: string;
  /** Raw bytes — text or binary (image, .glb, .usdz). Ignored when deleted. */
  content: ArrayBuffer | string;
  /** True removes the file (git tree entry with null sha). */
  deleted?: boolean;
}

const apiBase = "https://api.github.com";

async function gh(
  config: GitHubConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return (await res.json()) as unknown;
}

function toBase64(content: ArrayBuffer | string): string {
  if (typeof content === "string") {
    return btoa(String.fromCharCode(...new TextEncoder().encode(content)));
  }
  const bytes = new Uint8Array(content);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Read a text file from the repo (null when missing). */
export async function readTextFile(
  config: GitHubConfig,
  path: string,
): Promise<string | null> {
  const data = (await gh(
    config,
    `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
  )) as { content?: string; encoding?: string } | null;
  if (data === null || data.content === undefined || data.encoding !== "base64") return null;
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Read a repo file as bytes (null when missing). */
export async function readBinaryFile(
  config: GitHubConfig,
  path: string,
): Promise<Uint8Array | null> {
  const data = (await gh(
    config,
    `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
  )) as { content?: string; encoding?: string } | null;
  if (data === null || data.content === undefined || data.encoding !== "base64") return null;
  const bin = atob(data.content.replace(/\n/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** List filenames directly inside a repo directory (empty when missing). */
export async function listDir(config: GitHubConfig, path: string): Promise<string[]> {
  const data = (await gh(
    config,
    `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
  )) as Array<{ name?: string }> | { message?: string } | null;
  if (data === null || !Array.isArray(data)) return [];
  return data.map((e) => e.name ?? "").filter((n) => n !== "");
}

/**
 * Commit a batch of files (add, overwrite, or delete) in a single commit.
 * Binary-safe: every written file goes up as a base64 blob; deleted files
 * send a null sha so the path disappears from the tree.
 */
export async function commitFiles(
  config: GitHubConfig,
  message: string,
  files: RepoFile[],
): Promise<string> {
  const ref = (await gh(config, `/repos/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`)) as {
    object: { sha: string };
  };
  const baseSha = ref.object.sha;
  const baseCommit = (await gh(config, `/repos/${config.repo}/git/commits/${baseSha}`)) as {
    tree: { sha: string };
  };

  const tree = (await gh(config, `/repos/${config.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: files.map((f) =>
        f.deleted === true
          ? { path: f.path, mode: "100644", type: "blob", sha: null }
          : {
              path: f.path,
              mode: "100644",
              type: "blob",
              content: toBase64(f.content),
            },
      ),
    }),
  })) as { sha: string };

  const commit = (await gh(config, `/repos/${config.repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  })) as { sha: string };

  await gh(config, `/repos/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}
