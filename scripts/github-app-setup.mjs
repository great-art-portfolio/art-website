#!/usr/bin/env node
// One-time: creates the site's GitHub App and hands its key to Cloudflare,
// so studio saves never depend on a personal key that expires.
//
//   pnpm github:app
//
// Opens a local page that sends GitHub a filled-in App form (the manifest
// flow), takes GitHub's answer, stores GITHUB_APP_ID and GITHUB_APP_KEY as
// Pages secrets without printing them, then opens the install page: pick
// "Only select repositories" → art-website. The secrets take effect on the
// next deployment.
// https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
import { spawnSync } from "node:child_process";
import { createPrivateKey, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const ORG = "great-art-portfolio";
const PROJECT = "art-website";
const PORT = 4340;
const state = randomBytes(16).toString("hex");

const manifest = {
  name: "Barbart studio saver",
  url: "https://barbart.ca",
  description: "Saves paintings from the barbart.ca studio into this repo.",
  hook_attributes: { url: "https://barbart.ca", active: false },
  redirect_url: `http://localhost:${PORT}/done`,
  public: false,
  default_permissions: { contents: "write", metadata: "read" },
  default_events: [],
};

function putSecret(name, value) {
  const run = spawnSync(
    "npx",
    ["wrangler", "pages", "secret", "put", name, "--project-name", PROJECT],
    { input: value, stdio: ["pipe", "ignore", "inherit"] },
  );
  if (run.status !== 0) throw new Error(`wrangler couldn't store ${name}`);
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const formPage = `<!doctype html><meta charset="utf-8"><title>GitHub App</title>
<body style="font:16px system-ui;margin:3rem">
<p>Sending you to GitHub to create the site's app…</p>
<form id="f" method="post"
  action="https://github.com/organizations/${ORG}/settings/apps/new?state=${state}">
<input type="hidden" name="manifest" value='${escape(JSON.stringify(manifest))}'>
<button>Continue to GitHub</button></form>
<script>document.getElementById("f").submit()</script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" }).end(formPage);
    return;
  }
  if (url.pathname !== "/done") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("state") !== state || code === "") {
    res.writeHead(400).end("That answer didn't come from this setup.");
    return;
  }
  try {
    const conv = await fetch(
      `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: "POST",
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!conv.ok) throw new Error(`GitHub answered ${conv.status}`);
    const app = await conv.json();
    // GitHub hands out PKCS#1; Workers' WebCrypto imports PKCS#8.
    const pkcs8 = createPrivateKey(app.pem)
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    putSecret("GITHUB_APP_ID", String(app.id));
    putSecret("GITHUB_APP_KEY", pkcs8);
    console.log(`Created ${app.slug} (id ${app.id}); both secrets stored.`);
    res
      .writeHead(302, {
        Location: `https://github.com/apps/${app.slug}/installations/new`,
      })
      .end();
  } catch (err) {
    console.error(err);
    res.writeHead(500).end(`Setup failed: ${String(err)}`);
  } finally {
    setTimeout(() => server.close(), 1000);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Open http://localhost:${PORT}/ in your browser.`);
});
