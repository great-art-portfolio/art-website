/**
 * Prints D1 INSERT statements for the legacy git-era paintings in
 * src/content/paintings/*.md so they can be migrated into D1:
 *
 *   pnpm db:seed > /tmp/seed.sql
 *   pnpm wrangler d1 execute art-gallery-db --file=/tmp/seed.sql
 *
 * Images still need one upload each via /admin (photo picker), then the
 * printed image_key/image_url placeholders get replaced. New paintings
 * going forward live only in D1 + R2.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dir = new URL("../src/content/paintings/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

function field(md, name) {
  const m = md.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  return m?.[1]?.replace(/^"|"$/g, "").trim() ?? "";
}

for (const file of files) {
  const md = readFileSync(join(dir.pathname, file), "utf8");
  const title = field(md, "title") || file.replace(/\.md$/, "");
  const price = Math.round(Number(field(md, "price") || "0") * 100);
  const alt = field(md, "alt");
  const id = randomUUID();
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${id.slice(0, 8)}`;
  const body = (md.split("---").slice(2).join("---") ?? "").trim().replace(/'/g, "''");
  console.log(
    `INSERT INTO paintings (id, slug, title, price_cents, alt, description, image_key, image_url, status) VALUES ('${id}', '${slug}', '${title.replace(/'/g, "''")}', ${price}, '${alt.replace(/'/g, "''")}', '${body}', '', '', '${field(md, "sold") === "true" ? "sold" : "available"}');`,
  );
}
