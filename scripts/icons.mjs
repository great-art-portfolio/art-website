#!/usr/bin/env node
/**
 * Generates PWA icons from the existing touch icon. Run `pnpm icons` after
 * changing it, and commit the output. The manifest needs the 192 and 512
 * sizes for installability, and the maskable variant keeps Android from
 * cropping the artwork.
 */
import sharp from "sharp";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });

const art = sharp(join(root, "public", "apple-touch-icon.png"));

// Standard icons: the artwork fills the icon edge to edge.
await art
  .clone()
  .resize(192, 192, { fit: "cover" })
  .png()
  .toFile(join(out, "icon-192.png"));
await art
  .clone()
  .resize(512, 512, { fit: "cover" })
  .png()
  .toFile(join(out, "icon-512.png"));

// Maskable: artwork at about 80%, centered on the background, so launcher
// masks don't crop the subject.
const padded = await art.clone().resize(410, 410, { fit: "cover" }).toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#faf7f1" },
})
  .composite([{ input: padded, left: 51, top: 51 }])
  .png()
  .toFile(join(out, "maskable-512.png"));

console.log("icons written to public/icons/");
