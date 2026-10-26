/**
 * GitHub App sign-in for the commit flow. A personal key expires and stops
 * her saves; an App's private key never does. Each call trades it for an
 * hour-long installation token, minted again when that runs low. Setup:
 * `pnpm github:app` (scripts/github-app-setup.mjs). Spec:
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
 */

import { GitHubKeyError } from "./github-key";

const apiBase = "https://api.github.com";
/** Mint a fresh token this long before the current one expires. */
const RENEW_MS = 5 * 60 * 1000;

let cached: { key: string; token: string; expiresAt: number } | null = null;

/** Clears the token cache (tests). */
export function resetAppTokenCache(): void {
  cached = null;
}

function base64Url(bytes: Uint8Array | string): string {
  const raw =
    typeof bytes === "string"
      ? bytes
      : String.fromCharCode(...Array.from(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A PKCS#8 PEM ("BEGIN PRIVATE KEY") as raw bytes. */
function pemBytes(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----[^-]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i += 1) view[i] = bin.charCodeAt(i);
  return buf;
}

/** The App's ten-minute JWT, signed with its private key. */
export async function appJwt(
  appId: string,
  pkcs8Pem: string,
  now = Date.now(),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(pkcs8Pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const iat = Math.floor(now / 1000) - 60; // GitHub allows for clock drift.
  const head = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify({ iat, exp: iat + 540, iss: appId }));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64Url(new Uint8Array(sig))}`;
}

async function asApp(jwt: string, path: string, method = "GET") {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": "barbart-studio",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.ok) return (await res.json()) as Record<string, unknown>;
  const text = await res.text();
  // Uninstalled from the repo, or the App's key was deleted.
  if ([401, 403, 404].includes(res.status) && !/rate limit/i.test(text))
    throw new GitHubKeyError(`GitHub App refused (${res.status}): ${text}`);
  throw new Error(`GitHub App ${res.status}: ${text}`);
}

/** An installation token for `repo` ("owner/name"), reused until it runs
 * low. */
export async function appToken(
  appId: string,
  pkcs8Pem: string,
  repo: string,
  now = Date.now(),
): Promise<string> {
  const cacheKey = `${appId}:${repo}`;
  if (
    cached !== null &&
    cached.key === cacheKey &&
    cached.expiresAt - now > RENEW_MS
  )
    return cached.token;
  const jwt = await appJwt(appId, pkcs8Pem, now);
  const install = await asApp(jwt, `/repos/${repo}/installation`);
  const minted = await asApp(
    jwt,
    `/app/installations/${String(install["id"])}/access_tokens`,
    "POST",
  );
  const token = typeof minted["token"] === "string" ? minted["token"] : "";
  if (token === "") throw new Error("GitHub App minted no token");
  const expires = Date.parse(String(minted["expires_at"] ?? ""));
  cached = {
    key: cacheKey,
    token,
    expiresAt: Number.isFinite(expires) ? expires : now + 60 * 60 * 1000,
  };
  return token;
}
