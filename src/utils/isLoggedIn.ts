/** Client helpers for the admin area. Auth is enforced by Cloudflare Access. */
export function getAdminToken(): string {
  return sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem("ADMIN_API_TOKEN", token.trim());
}
