// The writing helper's two candidates side by side: DeepSeek (deepseek-flash)
// and Google's Gemini 4 Hydrogen get the helper's real prompt for three of
// her paintings, chosen to differ (a landscape-like one, an odd shape or a
// portrait, an abstract one), and one sheet image shows each painting with
// both models' titles, description and alt text, for the owner to judge on a
// phone (2026-11-16).
//
//   pnpm compare:helpers [--paintings <stem>,<stem>,<stem>] [--out <file.jpg>]
//
// Keys come from z's keychain (service uk.ccez.ai, accounts deepseek and
// gemini, put there by `keys key add` in ccez-keys) and stay in memory: never
// printed, never on a command line. Each painting is shown to the models as
// the studio shows it: no title, her medium and size, the photo shrunk to
// 1024 px, and her other paintings as the voice examples (its own words are
// left out, so neither model can copy them).

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { askDeepSeek, DEEPSEEK_MODEL } from "../functions/_lib/deepseek.ts";
import { GEMINI_MODEL } from "../functions/_lib/gemini.ts";
import {
  parseSuggestInput,
  parseSuggestion,
  suggestFailure,
  suggestWords,
  systemPrompt,
  userText,
  voiceFrom,
} from "../functions/_lib/suggest.ts";
import { parsePainting } from "../src/lib/painting-edit.ts";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TIMEOUT_MS = 90_000;

export const MODELS = [
  { id: "deepseek", label: "DeepSeek", model: DEEPSEEK_MODEL },
  { id: "gemini", label: "Gemini 4 Hydrogen", model: GEMINI_MODEL },
];

/** Her published paintings in `dir`: the parsed .md, its stem, the photo's
 * path, its pixel size and the date it was added. */
export async function readPaintings(dir) {
  const out = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".md"))) {
    const md = await readFile(join(dir, name), "utf8");
    const p = parsePainting(md);
    if (p === null || p.draft || p.trash || p.image === "") continue;
    const photo = join(dir, p.image);
    const meta = await sharp(photo).metadata();
    out.push({
      ...p,
      stem: parse(name).name,
      photo,
      px: { w: meta.width ?? 1, h: meta.height ?? 1 },
      added: /^dateAdded:\s*"?([\d-]+)/m.exec(md)?.[1] ?? "",
    });
  }
  return out.sort((a, b) => a.stem.localeCompare(b.stem));
}

const LANDSCAPE =
  /\b(landscape|horizon|prairie|field|hill|mountain|cliff|moon|sky|lake|river|shore|tree|forest)/gi;
const PORTRAIT = /\b(portrait|face|figure|person|woman|man|girl|boy|head)\b/gi;
/** How many of a kind's words a painting's words hold. */
const hits = (re, text) => (text.match(re) ?? []).length;

/** Three paintings that differ: (portrait-ish, landscape-ish, abstract).
 * Her collection has no portraits, so the first slot falls back to the
 * oddest shape (furthest from square). Each pick says why. */
export function pickPaintings(all) {
  const words = (p) => `${p.title} ${p.alt} ${p.description}`;
  const left = [...all];
  const take = (p, why) => {
    left.splice(left.indexOf(p), 1);
    return { ...p, why };
  };
  const odd = (p) => Math.abs(Math.log(p.px.w / p.px.h));
  const picks = [];
  // The one that says it most (her landscape, not a painting with a shore in it).
  const most = (re, skip) =>
    [...left]
      .filter((p) => p !== skip && hits(re, words(p)) > 0)
      .sort((a, b) => hits(re, words(b)) - hits(re, words(a)))[0];
  const portrait = most(PORTRAIT);
  const landscape = most(LANDSCAPE, portrait);
  if (portrait !== undefined) picks.push(take(portrait, "portrait-like"));
  if (landscape !== undefined) picks.push(take(landscape, "landscape-like"));
  if (portrait === undefined && left.length > 0) {
    const shape = [...left].sort((a, b) => odd(b) - odd(a))[0];
    if (odd(shape) > 0.1) picks.push(take(shape, "an odd shape"));
  }
  // Abstract: the newest left whose words name no place or person.
  const abstract = [...left]
    .sort((a, b) => b.added.localeCompare(a.added))
    .find(
      (p) => hits(LANDSCAPE, words(p)) === 0 && hits(PORTRAIT, words(p)) === 0,
    );
  if (abstract !== undefined) picks.push(take(abstract, "abstract"));
  for (const p of [...left].sort((a, b) => b.added.localeCompare(a.added))) {
    if (picks.length >= 3) break;
    picks.push(take(p, "another one"));
  }
  return picks.slice(0, 3);
}

/** A key from z's keychain, in memory only. */
export async function keychainKey(account) {
  try {
    const { stdout } = await run("/usr/bin/security", [
      "find-generic-password",
      "-s",
      "uk.ccez.ai",
      "-a",
      account,
      "-w",
    ]);
    const key = stdout.trim();
    if (key !== "") return key;
  } catch {
    // Not there: said below, without the tool's own output.
  }
  throw new Error(
    `No ${account} key in z's keychain: copy it and run keys key add ${account} (ccez-keys).`,
  );
}

/** The photo as the studio sends it: at most 1024 px, JPEG 80. */
async function smallJpeg(photo) {
  const buf = await sharp(photo)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** DeepSeek as the helper asked it until 2026-11-16: the same prompt, the
 * photo as an image_url part, thinking off. */
async function askDeepSeekIdeas(key, input, voice) {
  const text = await askDeepSeek(
    { DEEPSEEK_API_KEY: key },
    [
      { role: "system", content: systemPrompt(voice) },
      {
        role: "user",
        content: [
          { type: "text", text: userText(input) },
          { type: "image_url", image_url: { url: input.image } },
        ],
      },
    ],
    TIMEOUT_MS,
  );
  const ideas = text === null ? null : parseSuggestion(text);
  if (ideas === null) throw new Error("DeepSeek sent no usable ideas");
  return ideas;
}

/** Both models on each painting: [{ painting, image, answers: { deepseek,
 * gemini } }], each answer { ideas, seconds } or { error }. */
export async function compare(paintings, all, keys) {
  const rows = [];
  for (const p of paintings) {
    const image = await smallJpeg(p.photo);
    const input = parseSuggestInput({
      image,
      title: "",
      medium: p.medium,
      widthIn: Number(p.widthIn) || null,
      heightIn: Number(p.heightIn) || null,
      notes: "",
    });
    if (input === null) throw new Error(`${p.stem}: the photo is too big`);
    const voice = voiceFrom(
      all
        .filter((o) => o.stem !== p.stem)
        .map((o) => ({
          title: o.title,
          description: o.description,
          added: o.added,
        })),
    );
    const answers = {};
    for (const m of MODELS) {
      const started = Date.now();
      try {
        const ideas =
          m.id === "deepseek"
            ? await askDeepSeekIdeas(keys.deepseek, input, voice)
            : await suggestWords({ GEMINI_API_KEY: keys.gemini }, input, voice);
        answers[m.id] = {
          ideas,
          seconds: Math.round((Date.now() - started) / 100) / 10,
        };
      } catch (err) {
        // What she would read, plus the agent's detail (no key is in it).
        const detail = err instanceof Error ? err.message : String(err);
        const said = suggestFailure(err);
        answers[m.id] = {
          error: m.id === "gemini" ? `${said} (${detail})` : detail,
        };
      }
    }
    rows.push({ painting: p, image, answers });
  }
  return rows;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The sheet as one page, 430 px wide (a phone), both models in columns. */
export function sheetHtml(rows, when = new Date()) {
  const column = (m, a) => `
    <div class="col">
      <h3>${esc(m.label)}<small>${esc(m.model)}${a.seconds === undefined ? "" : ` · ${a.seconds} s`}</small></h3>
      ${
        a.error !== undefined
          ? `<p class="err">${esc(a.error)}</p>`
          : `<ol>${a.ideas.titles.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
             <p class="desc">${esc(a.ideas.description)}</p>
             <p class="alt"><b>Alt</b> ${esc(a.ideas.alt || "(none)")}</p>`
      }
    </div>`;
  const cards = rows
    .map(
      ({ painting: p, image, answers }) => `
    <section>
      <img src="${image}" alt="">
      <p class="her">Her title: <b>${esc(p.title)}</b> · ${esc(p.why)}${p.widthIn && p.heightIn ? ` · ${esc(p.widthIn)} × ${esc(p.heightIn)} in` : ""}</p>
      <div class="cols">${MODELS.map((m) => column(m, answers[m.id])).join("")}</div>
    </section>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 12px 18px; width: 430px; background: #f6f1ea; color: #231c16;
         font: 13px/1.38 -apple-system, "Helvetica Neue", Arial, sans-serif; }
  h1 { font: 600 17px/1.2 Georgia, serif; margin: 0 0 2px; }
  .sub { color: #6b5d50; margin: 0 0 12px; font-size: 11.5px; }
  section { background: #fff; border-radius: 10px; padding: 10px; margin: 0 0 14px;
            box-shadow: 0 1px 4px rgb(0 0 0 / 0.08); }
  img { display: block; width: 100%; max-height: 250px; object-fit: contain; background: #eee6dc;
        border-radius: 6px; }
  .her { margin: 6px 0 8px; color: #6b5d50; font-size: 11.5px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .col { background: #faf7f3; border-radius: 8px; padding: 8px; }
  .col:nth-child(1) h3 { color: #2b5c8a; }
  .col:nth-child(2) h3 { color: #a2531c; }
  h3 { margin: 0 0 6px; font-size: 13px; }
  h3 small { display: block; font-weight: 400; color: #8a7b6d; font-size: 10.5px; }
  ol { margin: 0 0 6px; padding-left: 17px; font-weight: 600; }
  p { margin: 0 0 6px; }
  .alt { color: #4d4238; font-size: 12px; }
  .alt b { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #8a7b6d; }
  .err { color: #a3261b; }
</style></head><body>
  <h1>Writing helper: DeepSeek or Gemini?</h1>
  <p class="sub">Same prompt, same photo, her other paintings as examples · ${esc(when.toISOString().slice(0, 10))}</p>
  ${cards}
</body></html>`;
}

/** The page as a JPEG, through Playwright's Chromium (3× for a phone). */
export async function renderSheet(html, out) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 430, height: 800 },
      deviceScaleFactor: 3,
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({
      path: out,
      fullPage: true,
      type: "jpeg",
      quality: 85,
    });
  } finally {
    await browser.close();
  }
}

/** The whole run; `deps` swaps the keychain and the renderer in tests. */
export async function main(argv, deps = {}) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const dir = deps.dir ?? join(ROOT, "src/content/paintings");
  const out = arg("--out") ?? join(tmpdir(), "helper-compare.jpg");
  const all = await readPaintings(dir);
  const wanted = arg("--paintings")?.split(",");
  const picks =
    wanted === undefined
      ? pickPaintings(all)
      : wanted.map((stem) => {
          const p = all.find((x) => x.stem === stem);
          if (p === undefined) throw new Error(`No published painting ${stem}`);
          return { ...p, why: "picked" };
        });
  const key = deps.key ?? keychainKey;
  const keys = { deepseek: await key("deepseek"), gemini: await key("gemini") };
  for (const p of picks) console.log(`${p.title} (${p.stem}): ${p.why}`);
  const rows = await compare(picks, all, keys);
  for (const { painting, answers } of rows)
    for (const m of MODELS)
      console.log(
        `${painting.title} · ${m.label}: ${answers[m.id].error ?? answers[m.id].ideas.titles.join(" / ")}`,
      );
  const html = sheetHtml(rows);
  await (deps.render ?? renderSheet)(html, out);
  console.log(`Sheet: ${out}`);
  return { out, rows, html };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
