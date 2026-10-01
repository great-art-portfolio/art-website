/** Frontmatter parsing and patching, shared by both edit flows. Edits are
 * line-based, so unknown keys pass through untouched. */

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
  /** Scheduled publish date ("YYYY-MM-DD", "" when none). */
  publishOn: string;
  /** Previous slugs that still resolve after a rename ("a, b", "" when
   * none). */
  slugHistory: string;
  /** trashedAt is "YYYY-MM-DD", or "" when never trashed. */
  trash: boolean;
  trashedAt: string;
  /** Photo filename and AR model refs, used when rebuilding models after a
   * dimension change. */
  image: string;
  modelGlb: string;
  modelUsdz: string;
  /** Gallery position from `order:`. Null until first reordered. */
  order: number | null;
}

/** Repo paths a permanent delete removes: the .md, photo, and AR models. */
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
  /** A date sets the schedule, "" clears it, and undefined leaves it. */
  publishOn?: string;
  /** A history string sets the previous slugs, and "" clears them. */
  slugHistory?: string | undefined;
  /** Set after an AR rebuild. When omitted, existing refs are kept. */
  modelGlb?: string;
  modelUsdz?: string;
}

/** Quotes a one-line YAML string with escapes. */
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

/** Parses the gallery position. Null when absent or not an integer. */
function parseOrder(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) ? n : null;
}

/** Sets or clears the gallery `order:` key without leaving a blank line. */
export function setOrder(md: string, order: number | null): string {
  const re = /^order:.*(\r?\n?)/m;
  if (order === null) return md.replace(re, "");
  const line = `order: ${order}`;
  if (re.test(md)) return md.replace(re, `${line}$1`);
  return md.replace(/^(title:.*)(\r?\n)/m, `$1$2${line}$2`);
}

/** Today's date as "YYYY-MM-DD" in UTC. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalizes a publish date. Anything but a valid calendar date becomes "". */
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

/** True when the publish date is today or earlier. YYYY-MM-DD strings
 * compare correctly as text. */
export function isPublishDue(publishOn: string, today: string): boolean {
  const due = normalizePublishOn(publishOn);
  return due !== "" && due <= today;
}

/** Parses previous slugs, newest first, capped at ten. */
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

/** Adds an old slug to the history, deduped, newest first, capped at ten. */
export function appendSlugHistory(current: string, oldSlug: string): string {
  return formatSlugHistory([oldSlug, ...parseSlugHistory(current)]);
}

/** Publishes a due draft and removes its schedule. Runs when the studio
 * loads rather than on a timer. */
export function publishDue(md: string): string {
  const next = md.replace(/^draft:.*$/m, "draft: false");
  return next.replace(/^publishOn:.*(\r?\n?)/m, "");
}

/** Sets the trash flag. Trashing records today's date, and restoring
 * removes both keys. */
export function setTrash(
  md: string,
  trash: boolean,
  date: string | null,
): string {
  const drop = (text: string, key: string): string =>
    text.replace(new RegExp(`^${key}:.*(\r?\n?)`, "m"), "");
  if (!trash) return drop(drop(md, "trash"), "trashedAt");
  let next = patchKey(md, "trash", "true");
  // Quoted because Astro's YAML loader parses a bare date as a Date, which
  // fails the string schema at build time.
  if (date !== null) next = patchKey(next, "trashedAt", yamlQuote(date));
  return next;
}

/** Rewrites one frontmatter key in place, preserving the other lines. */
function patchKey(md: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(md)) return md.replace(re, `${key}: ${value}`);
  return md.replace(/^---\r?\n/, `---\n${key}: ${value}\n`);
}

/** Applies edits to a .md file. Empty dimension strings leave keys
 * untouched. */
export function patchPainting(md: string, edits: PaintingEdits): string {
  let next = md;
  next = patchKey(next, "title", yamlQuote(edits.title));
  next = patchKey(next, "price", edits.price);
  next = patchKey(next, "alt", yamlQuote(edits.alt));
  next = patchKey(next, "sold", edits.sold ? "true" : "false");
  next = patchKey(next, "draft", edits.draft ? "true" : "false");
  // Undefined leaves the key alone. A date is quoted, since bare dates
  // break the content schema. "" removes the line.
  if (edits.publishOn !== undefined) {
    const due = normalizePublishOn(edits.publishOn);
    if (due === "") {
      next = next.replace(/^publishOn:.*(\r?\n?)/m, "");
    } else {
      next = patchKey(next, "publishOn", yamlQuote(due));
    }
  }
  // Same set-or-clear handling as publishOn.
  if (edits.slugHistory !== undefined) {
    const history = formatSlugHistory(parseSlugHistory(edits.slugHistory));
    if (history === "") {
      next = next.replace(/^slugHistory:.*(\r?\n?)/m, "");
    } else {
      next = patchKey(next, "slugHistory", yamlQuote(history));
    }
  }
  // Medium is optional. An empty field removes the key rather than storing
  // a blank string.
  if (edits.medium.trim() === "") {
    next = next.replace(/^medium:.*\r?$/m, "");
  } else {
    next = patchKey(next, "medium", yamlQuote(edits.medium.trim()));
  }
  // AR model refs, present only after a rebuild.
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
  // Keep a blank line after the closing fence so saved files pass
  // `format:check`.
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

/** Builds the .md for a new painting, draft or published. */
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
  /** Scheduled publish date, "" when none. */
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
