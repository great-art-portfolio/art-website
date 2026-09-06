import { flag, type AppEnv } from "./env";

/**
 * One-click social posting, disabled by default.
 *
 * Direct answer to "does she need a business account?": only for automatic
 * posting through Meta's API. Instagram auto-publish requires a Facebook
 * Page linked to a business/creator Instagram account plus an approved
 * Facebook app — heavy for one person. The admin share kit (caption +
 * native iOS share sheet) needs no account changes at all.
 *
 * If she later wants true one-click posting, the cheapest path is Ayrshare
 * (one API for IG/FB/X/TikTok) — set ENABLE_SOCIAL_POST="true" and
 * AYRSHARE_API_KEY and this function starts working.
 */

export interface SocialPost {
  enabled: boolean;
  id?: string;
}

export async function publishNewPainting(
  env: AppEnv,
  input: { text: string; imageUrl: string; platforms?: string[] },
): Promise<SocialPost> {
  if (!flag(env.ENABLE_SOCIAL_POST)) return { enabled: false };
  if (env.AYRSHARE_API_KEY === undefined || env.AYRSHARE_API_KEY === "") {
    throw new Error(
      "ENABLE_SOCIAL_POST is true but AYRSHARE_API_KEY is missing",
    );
  }
  const res = await fetch("https://app.ayrshare.com/api/social/post", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post: input.text,
      platforms: input.platforms ?? ["instagram", "facebook"],
      mediaUrls: [input.imageUrl],
    }),
  });
  if (!res.ok) throw new Error(`Social post error: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { enabled: true, id: data.id };
}
