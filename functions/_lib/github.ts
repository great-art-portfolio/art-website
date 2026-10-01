/**
 * Minimal GitHub API client for the admin commit flow.
 *
 * Paintings live in git, so /admin publishes by committing the .md, image,
 * and optional AR models directly to the repo. Cloudflare Pages rebuilds on
 * push, so changes are live about a minute later.
 *
 * The GITHUB_TOKEN secret stays server-side. Clients only call the admin
 * endpoint behind Cloudflare Access.
 */

import { parseGitHubDir, parseGitHubFile } from "./validation";

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
}

interface RepoFile {
  path: string;
  /** File content, text or binary (image, .glb, .usdz). Ignored when
   * deleted. */
  content: ArrayBuffer | string;
  /** Removes the file by writing a tree entry with a null sha. */
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

/** Reads a text file from the repo. Null when missing. */
export async function readTextFile(
  config: GitHubConfig,
  path: string,
): Promise<string | null> {
  const data = parseGitHubFile(
    await gh(
      config,
      `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
    ),
  );
  if (data === null || data.content === undefined || data.encoding !== "base64")
    return null;
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Reads a repo file as bytes. Null when missing. */
export async function readBinaryFile(
  config: GitHubConfig,
  path: string,
): Promise<Uint8Array | null> {
  const data = parseGitHubFile(
    await gh(
      config,
      `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
    ),
  );
  if (data === null || data.content === undefined || data.encoding !== "base64")
    return null;
  const bin = atob(data.content.replace(/\n/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Lists filenames directly inside a repo directory. Empty when missing. */
export async function listDir(
  config: GitHubConfig,
  path: string,
): Promise<string[]> {
  const data = parseGitHubDir(
    await gh(
      config,
      `/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
    ),
  );
  return data.map((e) => e.name ?? "").filter((n) => n !== "");
}

/**
 * Adds, overwrites, or deletes a batch of files in a single commit. Written
 * files are uploaded as base64 blobs, so binary content is safe. Deleted
 * files get a null sha.
 */
export async function commitFiles(
  config: GitHubConfig,
  message: string,
  files: RepoFile[],
): Promise<string> {
  const ref = (await gh(
    config,
    `/repos/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,
  )) as {
    object: { sha: string };
  };
  const baseSha = ref.object.sha;
  const baseCommit = (await gh(
    config,
    `/repos/${config.repo}/git/commits/${baseSha}`,
  )) as {
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

  await gh(
    config,
    `/repos/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    },
  );
  return commit.sha;
}
