export function isLoggedIn() {
  const token = localStorage.getItem("GITHUB_OAUTH_TOKEN");
  const expiry = localStorage.getItem("GITHUB_OAUTH_EXPIRY"); // Timestamp in ms
  const refreshToken = localStorage.getItem("GITHUB_REFRESH_TOKEN");
  const refreshExpiry = localStorage.getItem("GITHUB_REFRESH_EXPIRY");

  // Check if token exists and isn't expired
  if (token && expiry && Date.now() < parseInt(expiry)) return true;

  // If token expired but refresh token is valid, refresh it
  if (refreshToken && refreshExpiry && Date.now() < parseInt(refreshExpiry)) {
    // I'd call a refresh function here (e.g., POST to /admin-oauth with refresh_token)
    // For now, just return false to trigger re-auth
    return false;
  }

  return false;
}