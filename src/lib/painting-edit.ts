/** Frontmatter read/patch, shared by both edit flows. Line-based: unknown
 * keys pass through untouched. */

export interface ParsedPainting {
  title: string;
  price: string;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  medium: string;
  draft: boolean;
  sold: boolean;
  /** Scheduled go-live (publishOn: "YYYY-MM-DD", "" when none). */
  publishOn: string;
  /** Old page links, kept working after a rename ("a, b", "" when none). */
  slugHistory: string;
  /** Trash flag + stamp (trashedAt: "YYYY-MM-DD", "" when never trashed). */
  trash: boolean;
  trashedAt: string;
  /** Photo filename (image:) and AR model refs, for dimension-fix rebuilds. */
  image: string;
  modelGlb: string;
  modelUsdz: string;
  /** Gallery position (order:), null when the painting was never dragged. */
  order: number | null;
}

/** Repo paths a full delete removes (.md + photo + AR models). */
export function paintingFilePaths(mdPath: string, p: ParsedPainting): string[] {
  const paths = [mdPath];
  if (p.image !== "") paths.push(`src/content/paintings/${p.image}`);
  for (const m of [p.modelGlb, p.modelUsdz]) {
    if (m.startsWith("/models/")) paths.push(`public${m}`);
  }
  return paths;
}

export interface PaintingEdits {
  title: string;
  price: string;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  medium: string;
  draft: boolean;
  sold: boolean;
  /** Scheduled go-live: a date sets it, "" clears it, undefined leaves it. */
  publishOn?: string;
  /** Old page links: a history string sets it, "" clears it. */
  slugHistory?: string | undefined;
  /** Set after an AR rebuild; omitted otherwise (existing refs untouched). */
  modelGlb?: string;
  modelUsdz?: string;
}

/** Quote a one-line YAML string ("..." with escapes). */
export function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

export function parsePainting(md: string): ParsedPainting | null {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m === null) return null;
  const frontmatter = m[1] ?? "";
  const data: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i > 0) data[line.slice(0, i).trim()] = unquote(line.slice(i + 1));
  }
  return {
    title: data["title"] ?? "",
    price: data["price"] ?? "",
    alt: data["alt"] ?? "",
    description: (m[2] ?? "").trim(),
    widthIn: data["widthIn"] ?? "",
    heightIn: data["heightIn"] ?? "",
    depthIn: data["depthIn"] ?? "",
    medium: data["medium"] ?? "",
    draft: (data["draft"] ?? "false").trim() === "true",
    sold: (data["sold"] ?? "false").trim() === "true",
    publishOn: normalizePublishOn(data["publishOn"] ?? ""),
    slugHistory: formatSlugHistory(parseSlugHistory(data["slugHistory"] ?? "")),
    trash: (data["trash"] ?? "false").trim() === "true",
    trashedAt: (data["trashedAt"] ?? "").trim(),
    image: data["image"] ?? "",
    modelGlb: data["modelGlb"] ?? "",
    modelUsdz: data["modelUsdz"] ?? "",
    order: parseOrder(data["order"]),
  };
}

/** Gallery position: a plain integer, or null when absent/garbled. */
function parseOrder(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) ? n : null;
}

/** Set (or clear) the gallery `order:` key. No blank lines left behind. */
export function setOrder(md: string, order: number | null): string {
  const re = /^order:.*(\r?\n?)/m;
  if (order === null) return md.replace(re, "");
  const line = `order: ${order}`;
  if (re.test(md)) return md.replace(re, `${line}$1`);
  return md.replace(/^(title:.*)(\r?\n)/m, `$1$2${line}$2`);
}

/** Today's stamp for trash and date keys ("YYYY-MM-DD", UTC). */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Scheduled go-live. Only a real calendar date rides through. */
export function normalizePublishOn(raw: string): string {
  const t = raw.trim().replace(/^"|"$/g, "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m === null) return "";
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const back = new Date(Date.UTC(Number(m[1]), month - 1, day));
  if (
    back.getUTCFullYear() !== Number(m[1]) ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return "";
  }
  return t;
}

/** True when a schedule stamp has arrived (lexicographic: YYYY-MM-DD). */
export function isPublishDue(publishOn: string, today: string): boolean {
  const due = normalizePublishOn(publishOn);
  return due !== "" && due <= today;
}

/** Old page links after a rename. Capped at ten, newest first. */
export function parseSlugHistory(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const unquoted =
    raw.trim().startsWith('"') && raw.trim().endsWith('"')
      ? raw.trim().slice(1, -1)
      : raw;
  for (const bit of unquoted.split(",")) {
    const s = bit.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}

export function formatSlugHistory(slugs: string[]): string {
  return parseSlugHistory(slugs.join(", ")).join(", ");
}

/** Fold a retired slug into the history (dedupe, newest first, cap ten). */
export function appendSlugHistory(current: string, oldSlug: string): string {
  return formatSlugHistory([oldSlug, ...parseSlugHistory(current)]);
}

/** Lazy scheduled publishing: flip a due draft live, drop its date. */
export function publishDue(md: string): string {
  const next = md.replace(/^draft:.*$/m, "draft: false");
  return next.replace(/^publishOn:.*(\r?\n?)/m, "");
}

/** Trash flag. Trashing stamps the day; restoring drops both keys. */
export function setTrash(
  md: string,
  trash: boolean,
  date: string | null,
): string {
  const drop = (text: string, key: string): string =>
    text.replace(new RegExp(`^${key}:.*(\r?\n?)`, "m"), "");
  if (!trash) return drop(drop(md, "trash"), "trashedAt");
  let next = patchKey(md, "trash", "true");
  // Quoted: an unquoted date parses as a Date object under Astro's YAML
  // loader and fails the string schema at build time.
  if (date !== null) next = patchKey(next, "trashedAt", yamlQuote(date));
  return next;
}

/** Rewrite one frontmatter key in place, preserving every other line. */
function patchKey(md: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(md)) return md.replace(re, `${key}: ${value}`);
  return md.replace(/^---\r?\n/, `---\n${key}: ${value}\n`);
}

/** Apply edits to a .md file. Empty dimension strings leave keys untouched. */
export function patchPainting(md: string, edits: PaintingEdits): string {
  let next = md;
  next = patchKey(next, "title", yamlQuote(edits.title));
  next = patchKey(next, "price", edits.price);
  next = patchKey(next, "alt", yamlQuote(edits.alt));
  next = patchKey(next, "sold", edits.sold ? "true" : "false");
  next = patchKey(next, "draft", edits.draft ? "true" : "false");
  // Scheduled go-live: undefined callers (older flows) leave the key
  // alone; a date sets it quoted (bare dates break the content schema,
  // like trashedAt); "" removes it with no blank line left behind.
  if (edits.publishOn !== undefined) {
    const due = normalizePublishOn(edits.publishOn);
    if (due === "") {
      next = next.replace(/^publishOn:.*(\r?\n?)/m, "");
    } else {
      next = patchKey(next, "publishOn", yamlQuote(due));
    }
  }
  // Old page links: same set-or-clear shape as the schedule above.
  if (edits.slugHistory !== undefined) {
    const history = formatSlugHistory(parseSlugHistory(edits.slugHistory));
    if (history === "") {
      next = next.replace(/^slugHistory:.*(\r?\n?)/m, "");
    } else {
      next = patchKey(next, "slugHistory", yamlQuote(history));
    }
  }
  // Medium is optional: an emptied field removes the key instead of
  // leaving a blank string buyers would see.
  if (edits.medium.trim() === "") {
    next = next.replace(/^medium:.*\r?$/m, "");
  } else {
    next = patchKey(next, "medium", yamlQuote(edits.medium.trim()));
  }
  // AR model refs after a dimension-fix rebuild (absent otherwise).
  if (edits.modelGlb !== undefined && edits.modelGlb !== "") {
    next = patchKey(next, "modelGlb", yamlQuote(edits.modelGlb));
  }
  if (edits.modelUsdz !== undefined && edits.modelUsdz !== "") {
    next = patchKey(next, "modelUsdz", yamlQuote(edits.modelUsdz));
  }
  for (const [key, raw] of [
    ["widthIn", edits.widthIn],
    ["heightIn", edits.heightIn],
    ["depthIn", edits.depthIn],
  ] as const) {
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n) && n > 0) {
      next = patchKey(next, key, String(Math.round(n * 10) / 10));
    }
  }
  // A blank line after the fence: prettier-clean, like the committed
  // files, so every studio save keeps `format:check` green.
  const fenceAt = next.search(/\r?\n---\r?\n?[\s\S]*$/);
  if (fenceAt >= 0) {
    const body =
      edits.description.trim() === ""
        ? "Fresh from the studio."
        : edits.description.trim();
    next = `${next.slice(0, fenceAt)}\n---\n\n${body}\n`;
  }
  return next;
}

/** Fresh .md for a new painting (draft or published). */
export function buildMarkdown(input: {
  title: string;
  price: number;
  alt: string;
  description: string;
  imageFile: string;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  medium: string;
  draft: boolean;
  /** Scheduled go-live ("" when none). */
  publishOn: string;
  modelGlb: string;
  modelUsdz: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "---",
    `title: ${yamlQuote(input.title)}`,
    `dateAdded: ${today}`,
    `image: ${yamlQuote(input.imageFile)}`,
    `alt: ${yamlQuote(input.alt)}`,
    "sold: false",
    `draft: ${input.draft ? "true" : "false"}`,
    `price: ${input.price.toFixed(2)}`,
  ];
  const due = normalizePublishOn(input.publishOn ?? "");
  if (due !== "") lines.push(`publishOn: ${yamlQuote(due)}`);
  if (input.widthIn !== null) lines.push(`widthIn: ${input.widthIn}`);
  if (input.heightIn !== null) lines.push(`heightIn: ${input.heightIn}`);
  if (input.depthIn !== null) lines.push(`depthIn: ${input.depthIn}`);
  if (input.medium.trim() !== "")
    lines.push(`medium: ${yamlQuote(input.medium.trim())}`);
  if (input.modelGlb !== "")
    lines.push(`modelGlb: ${yamlQuote(input.modelGlb)}`);
  if (input.modelUsdz !== "")
    lines.push(`modelUsdz: ${yamlQuote(input.modelUsdz)}`);
  lines.push(
    "---",
    "",
    input.description === "" ? "Fresh from the studio." : input.description,
    "",
  );
  return lines.join("\n");
}
