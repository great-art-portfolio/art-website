/**
 * Build-time model refs for buyer pages. The AR section renders whenever
 * modelGlb is non-empty, so a ref to a missing file would show an empty
 * viewer. These helpers check public/ and return "" when the file is absent.
 *
 * Build time only. This imports node:fs, so client scripts can't import
 * it. Vite can't bundle fs for the browser.
 */
import { existsSync } from "node:fs";

/** A /models/*.glb ref, or "" when the file isn't in public/. */
export function modelGlbOrEmpty(ref: string | undefined): string {
  if (ref === undefined || ref === "") return "";
  const name = ref.split("/").pop() ?? "";
  if (name === "" || !existsSync(`public/models/${name}`)) return "";
  return ref;
}
