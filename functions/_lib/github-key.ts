/** GitHub refused the site: an expired or revoked key, or the App removed
 * from the repo. Saving can't work until that's fixed. */
export class GitHubKeyError extends Error {}

/** What she reads when GitHub refuses. Plain words, and who to ask. */
export const KEY_REFUSED =
  "Saving is paused: GitHub turned the site away. Ask Chris to fix it — nothing you've saved is lost.";
