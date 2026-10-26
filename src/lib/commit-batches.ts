/** Splits a studio save into commits the server accepts: at most
 * MAX_FILES files each, of which at most MAX_BINARIES photos or models.
 * A painting's own save is always one commit; only big batches (a
 * reorder, emptying the trash) span several. Mirrors functions/api/commit. */
export const MAX_FILES = 100;
export const MAX_BINARIES = 12;
const TEXT_FILE = /\.(md|txt)$/i;

export function commitBatches<T extends { path: string }>(
  files: readonly T[],
  deletes: readonly string[] = [],
): Array<{ files: T[]; deletes: string[] }> {
  const batches: Array<{ files: T[]; deletes: string[] }> = [];
  let current = { files: [] as T[], deletes: [] as string[] };
  let binaries = 0;
  const flush = (): void => {
    if (current.files.length + current.deletes.length > 0)
      batches.push(current);
    current = { files: [], deletes: [] };
    binaries = 0;
  };
  for (const f of files) {
    const binary = !TEXT_FILE.test(f.path);
    if (
      current.files.length + current.deletes.length >= MAX_FILES ||
      (binary && binaries >= MAX_BINARIES)
    )
      flush();
    current.files.push(f);
    if (binary) binaries += 1;
  }
  for (const d of deletes) {
    if (current.files.length + current.deletes.length >= MAX_FILES) flush();
    current.deletes.push(d);
  }
  flush();
  return batches;
}
