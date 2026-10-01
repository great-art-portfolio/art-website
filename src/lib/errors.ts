/**
 * Converts a caught value to a display message. `catch (err)` is `unknown`
 * under strict mode, and casting to Error would show `undefined` for a
 * thrown string.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message !== "") return err.message;
  if (typeof err === "string" && err !== "") return err;
  return "Something went wrong.";
}
