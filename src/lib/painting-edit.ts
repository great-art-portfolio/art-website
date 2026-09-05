/**
 * Frontmatter read/patch for painting .md files. Shared by the admin
 * Collection editor and the edit-in-context toolbar on painting pages —
 * one implementation so both stay in sync. Patching is line-based:
 * unknown keys (modelGlb, dateAdded, comments) pass through untouched.
 */

export interface ParsedPainting {
  title: string;
  price: string;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  sold: boolean;
  /** Photo filename (image:) and AR model refs, for dimension-fix rebuilds. */
  image: string;
  modelGlb: string;
  modelUsdz: string;
}

export interface PaintingEdits {
  title: string;
  price: string;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  sold: boolean;
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
    sold: (data["sold"] ?? "false").trim() === "true",
    image: data["image"] ?? "",
    modelGlb: data["modelGlb"] ?? "",
    modelUsdz: data["modelUsdz"] ?? "",
  };
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
  const bodyMatch = next.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  const oldBody = bodyMatch?.[1] ?? null;
  if (oldBody !== null) {
    const body = edits.description.trim() === "" ? "Fresh from the studio." : edits.description.trim();
    next = `${next.slice(0, next.length - oldBody.length)}${body}\n`;
  }
  return next;
}
