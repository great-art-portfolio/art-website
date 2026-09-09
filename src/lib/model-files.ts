/**
 * Build-time model refs for buyer pages. The "Try it on your wall"
 * section renders whenever modelGlb is non-empty, so a dangling ref
 * (deleted or never-built model) would show an empty viewer — resolve
 * refs against public/ and pass "" when the file isn't there.
 *
 * BUILD-TIME ONLY: imports node:fs, so .astro frontmatter may use it
 * but client islands must never import this module (Vite cannot bundle
 * fs for browsers and the build breaks).
 */
import { existsSync } from "node:fs";

/** A /models/*.glb ref, or "" when the file isn't in public/. */
export function modelGlbOrEmpty(ref: string | undefined): string {
  if (ref === undefined || ref === "") return "";
  const name = ref.split("/").pop() ?? "";
  if (name === "" || !existsSync(`public/models/${name}`)) return "";
  return ref;
}
