/**
 * One error-to-words helper for every island. `catch (err)` is `unknown`
 * under strict mode, and `(err as Error)` trusts that only Errors are ever
 * thrown — a thrown string would read as `undefined` on screen. Narrow
 * once here so a new throw shape becomes a compiler-visible decision
 * instead of a blank toast.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message !== "") return err.message;
  if (typeof err === "string" && err !== "") return err;
  return "Something went wrong.";
}
