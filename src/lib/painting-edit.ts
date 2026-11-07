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
  /** Alerts to send when a scheduled painting goes live: "push", "email",
   * "push,email", or "" (see formatAlerts). */
  alertOnPublish: string;
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
  /** Alerts for the scheduled day (formatAlerts), "" clears them, and
   * undefined leaves them. Clearing the schedule clears them too. */
  alertOnPublish?: string;
  /** A history string sets the previous slugs, and "" clears them. */
  slugHistory?: string | undefined;
  /** Set after an AR rebuild. When omitted, existing refs are kept. */
  modelGlb?: string;
  modelUsdz?: string;
}

/** Quotes a one-line YAML string with escapes. Line breaks of any kind,
 * including the U+2028/U+2029 separators pasted text can carry, become
 * spaces: one would end the line in some readers and not others, and
 * corrupt the file on the next save. */
export function yamlQuote(s: string): string {
  const oneLine = s.replace(/[\r\n\u2028\u2029]+/g, " ");
  return `"${oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Runs `edit` on the frontmatter only (between the --- fences), so a
 * description line that happens to start with "medium:" or "order:" is
 * never touched. Files without frontmatter pass through. */
function inFront(md: string, edit: (front: string) => string): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(md);
  if (m === null) return md;
  const [whole, open = "", front = "", close = ""] = m;
  return open + edit(front) + close + md.slice(whole.length);
}

/** A whole frontmatter line for `key`, with its line break. */
const keyLine = (key: string): RegExp =>
  new RegExp(`^${key}:[^\\r\\n]*(\\r?\\n)?`, "m");

/** Removes a frontmatter key's line. */
function dropKey(md: string, key: string): string {
  return inFront(md, (front) =>
    front.replace(keyLine(key), "").replace(/\r?\n$/, ""),
  );
}

/** Whether the frontmatter has `key`. */
function hasKey(md: string, key: string): boolean {
  let found = false;
  inFront(md, (front) => {
    found = keyLine(key).test(front);
    return front;
  });
  return found;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

/** What a painting saved without a description says on its page. */
export const DEFAULT_DESCRIPTION = "Fresh from the studio.";

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
    alertOnPublish: formatAlerts(parseAlerts(data["alertOnPublish"] ?? "")),
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
  if (order === null) return dropKey(md, "order");
  const line = `order: ${order}`;
  if (hasKey(md, "order")) return patchKey(md, "order", String(order));
  return inFront(md, (front) =>
    front.replace(
      /^(title:[^\r\n]*)(\r?\n)/m,
      (_, t: string, nl: string) => `${t}${nl}${line}${nl}`,
    ),
  );
}

/** The studio's time zone. A "Publish on" date means her calendar day,
 * whatever zone the device (or the nightly publish job) runs in. */
export const STUDIO_TIME_ZONE = "America/Edmonton";

/** The studio's date as "YYYY-MM-DD". */
export function todayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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

/** Which alerts a scheduled painting sends on its day. Older files may
 * also say "push" (browser alerts, since removed); it's ignored. */
export interface AlertChoice {
  email: boolean;
}

export function parseAlerts(raw: string): AlertChoice {
  const bits = raw.split(",").map((b) => b.trim());
  return { email: bits.includes("email") };
}

export function formatAlerts(choice: AlertChoice): string {
  return choice.email ? "email" : "";
}

/** Publishes a due draft and removes its schedule and remembered alerts
 * (read them first with parsePainting). Runs when the studio loads, and
 * nightly from scripts/publish-due.mjs; whichever publishes it sends the
 * alerts. */
export function publishDue(md: string, today: string = todayKey()): string {
  let next = hasKey(md, "draft") ? patchKey(md, "draft", "false") : md;
  // Dated the day it goes live, so the homepage features it as her newest
  // painting rather than as of the day she drafted it.
  if (hasKey(next, "dateAdded")) next = patchKey(next, "dateAdded", today);
  return dropKey(dropKey(next, "publishOn"), "alertOnPublish");
}

/** Sets the trash flag. Trashing records today's date, and restoring
 * removes both keys. */
export function setTrash(
  md: string,
  trash: boolean,
  date: string | null,
): string {
  if (!trash) return dropKey(dropKey(md, "trash"), "trashedAt");
  let next = patchKey(md, "trash", "true");
  // Quoted because Astro's YAML loader parses a bare date as a Date, which
  // fails the string schema at build time.
  if (date !== null) next = patchKey(next, "trashedAt", yamlQuote(date));
  return next;
}

/** Marks a painting sold after an online payment. Other keys are kept. */
export function markSold(md: string, session = ""): string {
  const sold = patchKey(md, "sold", "true");
  return session === ""
    ? sold
    : patchKey(sold, "soldSession", yamlQuote(session));
}

/** The Stripe checkout session that sold the painting, or "". */
export function soldSessionOf(md: string): string {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = m?.[1]?.match(/^soldSession:(.*)$/m);
  return line === null || line === undefined ? "" : unquote(line[1] ?? "");
}

/** Rewrites one frontmatter key in place, preserving the other lines. */
function patchKey(md: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:[^\\r\\n]*`, "m");
  // Replacer functions, so a "$'" or "$&" in her text stays literal instead
  // of splicing the file into the line.
  const line = `${key}: ${value}`;
  return inFront(md, (front) =>
    re.test(front)
      ? front.replace(re, () => line)
      : front === ""
        ? line
        : `${line}\n${front}`,
  );
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
      next = dropKey(next, "publishOn");
      // Alerts only wait for a scheduled day.
      next = dropKey(next, "alertOnPublish");
    } else {
      next = patchKey(next, "publishOn", yamlQuote(due));
    }
  }
  if (edits.alertOnPublish !== undefined && hasKey(next, "publishOn")) {
    const alerts = formatAlerts(parseAlerts(edits.alertOnPublish));
    next =
      alerts === ""
        ? dropKey(next, "alertOnPublish")
        : patchKey(next, "alertOnPublish", yamlQuote(alerts));
  }
  // Same set-or-clear handling as publishOn.
  if (edits.slugHistory !== undefined) {
    const history = formatSlugHistory(parseSlugHistory(edits.slugHistory));
    if (history === "") {
      next = dropKey(next, "slugHistory");
    } else {
      next = patchKey(next, "slugHistory", yamlQuote(history));
    }
  }
  // Medium is optional. An empty field removes the key rather than storing
  // a blank string.
  if (edits.medium.trim() === "") {
    next = dropKey(next, "medium");
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
    // Rounded before the check: 0.04 would round to 0, which the content
    // schema rejects and the whole build with it.
    const n = Math.round(Number(raw) * 10) / 10;
    if (raw.trim() !== "" && Number.isFinite(n) && n > 0) {
      next = patchKey(next, key, String(n));
    }
  }
  // Keep a blank line after the closing fence so saved files pass
  // `format:check`.
  const fenceAt = next.search(/\r?\n---\r?\n?[\s\S]*$/);
  if (fenceAt >= 0) {
    const body =
      edits.description.trim() === ""
        ? DEFAULT_DESCRIPTION
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
  /** Alerts for the scheduled day (formatAlerts). Kept only with a date. */
  alertOnPublish?: string;
  modelGlb: string;
  modelUsdz: string;
}): string {
  // Her calendar day: in the evening UTC is already tomorrow.
  const today = todayKey();
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
  const alerts = formatAlerts(parseAlerts(input.alertOnPublish ?? ""));
  if (due !== "" && alerts !== "")
    lines.push(`alertOnPublish: ${yamlQuote(alerts)}`);
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
    input.description === "" ? DEFAULT_DESCRIPTION : input.description,
    "",
  );
  return lines.join("\n");
}
