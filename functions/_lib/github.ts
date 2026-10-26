/**
 * Minimal GitHub API client for the admin commit flow.
 *
 * Paintings live in git, so /admin publishes by committing the .md, image,
 * and optional AR models directly to the repo. Cloudflare Pages rebuilds on
 * push, so changes are live about a minute later.
 *
 * The site signs in as a GitHub App (GITHUB_APP_ID + GITHUB_APP_KEY), whose
 * key never expires. A personal GITHUB_TOKEN still works as a fallback.
 * Both stay server-side. Clients only call the admin endpoints.
 */

import type { AppEnv } from "./env";
import { appToken } from "./github-app";
import { GitHubKeyError } from "./github-key";
import { parseGitHubDir, parseGitHubFile } from "./validation";

export { GitHubKeyError, KEY_REFUSED } from "./github-key";

export interface GitHubConfig {
  /** The bearer token for the next call. The App mints and renews its own. */
  token: () => Promise<string>;
  /** True for a personal key, the kind that expires. */
  expiring: boolean;
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

/** Repo access from the environment. Null when publishing isn't set up. */
export function gitConfig(env: AppEnv): GitHubConfig | null {
  const repo = env.GITHUB_REPO ?? "";
  if (repo === "") return null;
  const branch = env.GITHUB_BRANCH ?? "main";
  const appId = env.GITHUB_APP_ID ?? "";
  const appKey = env.GITHUB_APP_KEY ?? "";
  if (appId !== "" && appKey !== "")
    return {
      token: () => appToken(appId, appKey, repo),
      expiring: false,
      repo,
      branch,
    };
  const token = env.GITHUB_TOKEN ?? "";
  if (token === "") return null;
  return { token: () => Promise.resolve(token), expiring: true, repo, branch };
}

const apiBase = "https://api.github.com";

let keyExpiry: string | null = null;

/** The key's expiry day ("YYYY-MM-DD") from GitHub's last answer, or null
 * when the key never expires or nothing has been asked yet. GitHub sends
 * it on every call made with a fine-grained or expiring token. */
export function githubKeyExpiry(): string | null {
  return keyExpiry;
}

async function gh(
  config: GitHubConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${await config.token()}`,
      "Content-Type": "application/json",
      "User-Agent": "barbart-studio",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  // App tokens last an hour by design; only a personal key's day matters.
  const expires = config.expiring
    ? res.headers.get("github-authentication-token-expiration")
    : null;
  if (expires !== null && /^\d{4}-\d{2}-\d{2}/.test(expires))
    keyExpiry = expires.slice(0, 10);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    // 403 is also a rate limit, which passes on its own.
    if (res.status === 401 || (res.status === 403 && !/rate limit/i.test(text)))
      throw new GitHubKeyError(
        `GitHub refused the key (${res.status}): ${text}`,
      );
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
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
 * files are uploaded as base64 blobs first, so binary content is safe (a
 * tree entry's inline `content` is stored as literal text). Deleted files
 * get a null sha.
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

  const entries = await Promise.all(
    files.map(async (f) => {
      if (f.deleted === true)
        return { path: f.path, mode: "100644", type: "blob", sha: null };
      const blob = (await gh(config, `/repos/${config.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: toBase64(f.content),
          encoding: "base64",
        }),
      })) as { sha: string };
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );
  const tree = (await gh(config, `/repos/${config.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: entries }),
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
