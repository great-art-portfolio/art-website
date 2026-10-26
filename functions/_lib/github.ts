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
import { parseGitHubDir } from "./validation";

export { GitHubKeyError, KEY_REFUSED } from "./github-key";

export interface GitHubConfig {
  /** The bearer token for the next call. The App mints and renews its own. */
  token: () => Promise<string>;
  /** True for a personal key, the kind that expires. */
  expiring: boolean;
  repo: string; // "owner/name"
  branch: string;
}

export type RepoFile =
  /** UTF-8 text (.md, banner), written inline in the tree: no upload. */
  | { path: string; text: string }
  /** Binary (photo, .glb, .usdz) already in base64, uploaded as a blob
   * untouched, so the Worker never decodes it. */
  | { path: string; base64: string }
  /** Removes the file with a null sha. */
  | { path: string; deleted: true };

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

/** A repo file's raw bytes as a response, or null when missing. The raw
 * media type serves files up to 100MB; the JSON form drops `content` past
 * 1MB, and decoding it costs Worker CPU. */
export async function fetchRawFile(
  config: GitHubConfig,
  path: string,
): Promise<Response | null> {
  const res = await fetch(
    `${apiBase}/repos/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers: {
        Accept: "application/vnd.github.raw",
        Authorization: `Bearer ${await config.token()}`,
        "User-Agent": "barbart-studio",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || (res.status === 403 && !/rate limit/i.test(text)))
      throw new GitHubKeyError(
        `GitHub refused the key (${res.status}): ${text}`,
      );
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res;
}

/** Reads a text file from the repo. Null when missing. */
export async function readTextFile(
  config: GitHubConfig,
  path: string,
): Promise<string | null> {
  const res = await fetchRawFile(config, path);
  return res === null ? null : await res.text();
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
 * Adds, overwrites, or deletes a batch of files in a single commit. Text
 * goes inline in the tree (GitHub stores inline `content` as literal UTF-8
 * text); binary goes up as a base64 blob first. Deleted files get a null
 * sha.
 *
 * `rebase` retries on top of a commit that landed meanwhile (GitHub
 * refuses a ref update that isn't a fast-forward). The studio wants that:
 * its background translation commits can race her saves, and they touch
 * different files. The sale webhook doesn't: there a refusal is how a
 * second buyer of the same painting is caught.
 */
export async function commitFiles(
  config: GitHubConfig,
  message: string,
  files: RepoFile[],
  opts: { rebase?: boolean } = {},
): Promise<string> {
  const entries = await Promise.all(
    files.map(async (f) => {
      const entry = { path: f.path, mode: "100644", type: "blob" };
      if ("deleted" in f) return { ...entry, sha: null };
      if ("text" in f) return { ...entry, content: f.text };
      const blob = (await gh(config, `/repos/${config.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: f.base64, encoding: "base64" }),
      })) as { sha: string };
      return { ...entry, sha: blob.sha };
    }),
  );
  const tries = opts.rebase === true ? 3 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await commitTree(config, message, entries);
    } catch (err) {
      const raced = err instanceof Error && /^GitHub API 422/.test(err.message);
      if (!raced || attempt >= tries) throw err;
    }
  }
}

async function commitTree(
  config: GitHubConfig,
  message: string,
  entries: Array<Record<string, unknown>>,
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
