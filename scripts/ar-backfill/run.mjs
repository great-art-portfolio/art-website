#!/usr/bin/env node
/**
 * One-time (and repeatable) AR backfill: builds GLB+USDZ for every painting
 * that has dimensions but no models, using the same buildArModels her
 * devices run — executed here in headless Chromium, since model building
 * needs a browser canvas.
 *
 *   pnpm ar:backfill
 *
 * Writes public/models/<stem>.glb/.usdz and adds modelGlb/modelUsdz to
 * each painting's frontmatter (stem = .md filename). Never commits —
 * review the diff, then commit/push as usual.
 */
import { createServer } from "node:http";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const bundlePath = join(here, ".bundle.js");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".md": "text/markdown",
};

function serve(rootDir) {
  return createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      let file = join(rootDir, decodeURIComponent(url.pathname));
      const data = readFileSync(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("nope");
    }
  });
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0)
      data[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
  }
  return data;
}

const jobs = [];
{
  const { readdirSync } = await import("node:fs");
  const dir = join(root, "src", "content", "paintings");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const raw = readFileSync(join(dir, f), "utf8");
    const fm = parseFrontmatter(raw);
    if (fm.modelGlb !== undefined && fm.modelGlb !== "") continue; // already has models
    const stem = f.replace(/\.md$/, "");
    jobs.push({
      stem,
      file: f,
      image: fm.image ?? "",
      w: Number(fm.widthIn ?? "0"),
      h: Number(fm.heightIn ?? "0"),
      d: Number(fm.depthIn ?? "0"),
    });
  }
}

if (jobs.length === 0) {
  console.log("Every painting already has models — nothing to do.");
  process.exit(0);
}
for (const j of jobs) {
  if (j.image === "" || !(j.w > 0) || !(j.h > 0) || !(j.d > 0)) {
    console.error(
      `SKIP ${j.stem}: needs image + widthIn/heightIn/depthIn in frontmatter`,
    );
    process.exit(1);
  }
}

// Bundle the production builder (three.js included) for the harness page.
execFileSync(
  join(root, "node_modules", ".bin", "esbuild"),
  [
    join(here, "entry.ts"),
    "--bundle",
    "--format=iife",
    `--outfile=${bundlePath}`,
    "--log-level=error",
  ],
  { stdio: "inherit" },
);

const server = serve(root);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("harness error:", err.message));
  await page.goto(`http://127.0.0.1:${port}/scripts/ar-backfill/harness.html`);
  await page.waitForFunction(() => window.__arBackfill !== undefined);

  mkdirSync(join(root, "public", "models"), { recursive: true });
  for (const j of jobs) {
    const imgUrl = `http://127.0.0.1:${port}/src/content/paintings/${encodeURIComponent(j.image)}`;
    console.log(`building ${j.stem} (${j.w}×${j.h}×${j.d} in)…`);
    const out = await page.evaluate(
      ({ url, w, h, d }) => window.__arBackfill.buildFromUrl(url, w, h, d),
      { url: imgUrl, w: j.w, h: j.h, d: j.d },
    );
    const glb = Buffer.from(out.glb, "base64");
    const usdz = Buffer.from(out.usdz, "base64");
    if (glb.subarray(0, 4).toString() !== "glTF")
      throw new Error(`${j.stem}: bad GLB magic`);
    if (usdz.subarray(0, 2).toString() !== "PK")
      throw new Error(`${j.stem}: bad USDZ magic`);
    if (glb.length < 10_000 || usdz.length < 10_000) {
      throw new Error(`${j.stem}: suspiciously small model`);
    }
    writeFileSync(join(root, "public", "models", `${j.stem}.glb`), glb);
    writeFileSync(join(root, "public", "models", `${j.stem}.usdz`), usdz);
    console.log(
      `  photo ${out.imgW}×${out.imgH}px → glb ${(glb.length / 1024).toFixed(0)}KB, usdz ${(usdz.length / 1024).toFixed(0)}KB`,
    );

    // Wire the frontmatter (insert after depthIn, keep the GUESSED comment).
    const mdPath = join(root, "src", "content", "paintings", j.file);
    const raw = readFileSync(mdPath, "utf8");
    if (!raw.includes(`modelGlb: "/models/${j.stem}.glb"`)) {
      const next = raw.replace(
        /^(depthIn:\s*[\d.]+\r?\n)/m,
        `$1modelGlb: "/models/${j.stem}.glb"\nmodelUsdz: "/models/${j.stem}.usdz"\n`,
      );
      if (next === raw)
        throw new Error(
          `${j.stem}: couldn't patch frontmatter (no depthIn line?)`,
        );
      writeFileSync(mdPath, next);
    }
  }
  console.log(
    `\nDone: ${jobs.length} painting(s). Review with git diff, then commit/push.`,
  );
} finally {
  await browser.close();
  server.close();
  if (existsSync(bundlePath)) unlinkSync(bundlePath);
}
