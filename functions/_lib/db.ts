import type { AppEnv } from "./env";

export type PaintingStatus = "available" | "reserved" | "sold";
export type InquiryStatus = "new" | "contacted" | "sold" | "closed";

export interface PaintingRow {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  alt: string;
  description: string;
  image_key: string;
  image_url: string;
  status: PaintingStatus;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  model_glb_url: string;
  model_usdz_url: string;
  created_at: string;
  updated_at: string;
}

export async function getSetting(env: AppEnv, key: string): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? "";
}

export async function setSetting(env: AppEnv, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
    .bind(key, value)
    .run();
}

export interface InquiryRow {
  id: string;
  painting_id: string;
  buyer_name: string;
  buyer_email: string;
  message: string;
  status: InquiryStatus;
  created_at: string;
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base === "" ? `painting-${Date.now().toString(36)}` : base;
}

export async function listPaintings(env: AppEnv): Promise<PaintingRow[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM paintings ORDER BY created_at DESC",
  ).all<PaintingRow>();
  return res.results ?? [];
}

export async function getPainting(env: AppEnv, id: string): Promise<PaintingRow | null> {
  return await env.DB.prepare("SELECT * FROM paintings WHERE id = ? OR slug = ?")
    .bind(id, id)
    .first<PaintingRow>();
}

export interface NewPainting {
  title: string;
  priceCents: number;
  alt: string;
  description: string;
  imageKey: string;
  imageUrl: string;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  modelGlbUrl: string;
  modelUsdzUrl: string;
}

export async function createPainting(env: AppEnv, input: NewPainting): Promise<PaintingRow> {
  const id = crypto.randomUUID();
  const slug = `${slugify(input.title)}-${id.slice(0, 8)}`;
  await env.DB.prepare(
    `INSERT INTO paintings (id, slug, title, price_cents, alt, description, image_key, image_url, width_in, height_in, depth_in, model_glb_url, model_usdz_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      slug,
      input.title,
      input.priceCents,
      input.alt,
      input.description,
      input.imageKey,
      input.imageUrl,
      input.widthIn,
      input.heightIn,
      input.depthIn,
      input.modelGlbUrl,
      input.modelUsdzUrl,
    )
    .run();
  const row = await getPainting(env, id);
  if (row === null) throw new Error("Failed to read back painting");
  return row;
}

export async function updatePainting(
  env: AppEnv,
  id: string,
  patch: Partial<
    Pick<
      PaintingRow,
      | "title"
      | "price_cents"
      | "alt"
      | "description"
      | "status"
      | "image_key"
      | "image_url"
      | "width_in"
      | "height_in"
      | "depth_in"
      | "model_glb_url"
      | "model_usdz_url"
    >
  >,
): Promise<PaintingRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return await getPainting(env, id);
  fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
  await env.DB.prepare(`UPDATE paintings SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return await getPainting(env, id);
}

export async function deletePainting(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM paintings WHERE id = ?").bind(id).run();
}

export interface NewInquiry {
  paintingId: string;
  buyerName: string;
  buyerEmail: string;
  message: string;
}

export async function createInquiry(env: AppEnv, input: NewInquiry): Promise<InquiryRow> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO inquiries (id, painting_id, buyer_name, buyer_email, message)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, input.paintingId, input.buyerName, input.buyerEmail, input.message)
    .run();
  const row = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?")
    .bind(id)
    .first<InquiryRow>();
  if (row === null) throw new Error("Failed to read back inquiry");
  return row;
}

export async function listInquiries(env: AppEnv): Promise<(InquiryRow & { painting_title: string })[]> {
  const res = await env.DB.prepare(
    `SELECT i.*, p.title AS painting_title FROM inquiries i
     JOIN paintings p ON p.id = i.painting_id
     ORDER BY i.created_at DESC LIMIT 200`,
  ).all<InquiryRow & { painting_title: string }>();
  return res.results ?? [];
}
