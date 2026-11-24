/** Instagram handle parsing and validation, shared by the studio and
 * build-time public pages. Pure module with no DOM or Node dependencies. */

/** Repo path of the artist's Instagram handle. An empty file hides it. */
export const INSTAGRAM_PATH = "src/content/instagram.txt";

export interface ParsedInstagram {
  /** Username without leading @ (1–30 valid characters). */
  username: string;
  /** Display handle with one leading @. */
  handle: string;
  /** Canonical HTTPS Instagram profile URL. */
  url: string;
}

export type InstagramParseResult =
  { ok: true; value: ParsedInstagram | null } | { ok: false; error: string };

const INSTAGRAM_URL_PREFIX =
  /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:instagram\.com|instagr\.am)(?=$|[/?#])/i;

const RESERVED_PATHS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "accounts",
  "direct",
  "stories",
  "about",
  "legal",
  "developer",
  "privacy",
  "terms",
  "web",
  "graphql",
  "api",
  "oauth",
  "challenge",
  "session",
]);

const VALID_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;

/** Parses a typed handle or pasted instagram.com link. Returns null for
 * blank input, or an error string when the input cannot be a real profile. */
export function parseInstagram(raw: string): InstagramParseResult {
  const trimmed = raw.trim();
  if (trimmed === "" || /^@+$/.test(trimmed)) {
    return { ok: true, value: null };
  }
  const withoutAt = trimmed.replace(/^@+/, "").trim();
  if (withoutAt === "") {
    return { ok: true, value: null };
  }

  let candidate: string;
  const igMatch = INSTAGRAM_URL_PREFIX.exec(withoutAt);
  if (igMatch !== null) {
    const rest = withoutAt.slice(igMatch[0].length);
    const pathOnly = rest.split(/[?#]/)[0] ?? "";
    const segments = pathOnly.split("/").filter((seg) => seg !== "");
    const first = segments[0] ?? "";
    if (first === "") {
      return {
        ok: false,
        error: "Add your username after instagram.com/ — e.g. @barbarastraka.",
      };
    }
    const lower = first.toLowerCase();
    if (lower === "stories" && (segments[1] ?? "") !== "") {
      candidate = (segments[1] ?? "").replace(/^@+/, "");
    } else if (RESERVED_PATHS.has(lower)) {
      return {
        ok: false,
        error:
          "That looks like a post or page link — paste your Instagram profile link or @username.",
      };
    } else {
      candidate = first.replace(/^@+/, "");
    }
    if (candidate === "") {
      return {
        ok: false,
        error: "Add your username after instagram.com/ — e.g. @barbarastraka.",
      };
    }
  } else {
    if (
      withoutAt.includes("://") ||
      /^www\./i.test(withoutAt) ||
      withoutAt.includes("/")
    ) {
      return {
        ok: false,
        error: "Enter an Instagram @username or instagram.com profile link.",
      };
    }
    if (withoutAt.includes("@")) {
      return {
        ok: false,
        error:
          "That looks like an email address — enter your Instagram @username instead.",
      };
    }
    candidate = withoutAt;
  }

  if (candidate.length > 30) {
    return {
      ok: false,
      error: "Instagram usernames are 30 characters or fewer.",
    };
  }
  if (/[^A-Za-z0-9._]/.test(candidate)) {
    return {
      ok: false,
      error:
        "Instagram usernames can only use letters, numbers, periods, and underscores.",
    };
  }
  if (
    candidate.startsWith(".") ||
    candidate.endsWith(".") ||
    candidate.includes("..") ||
    !VALID_USERNAME.test(candidate)
  ) {
    return {
      ok: false,
      error:
        "Instagram usernames can't start or end with a period, or have two in a row.",
    };
  }

  return {
    ok: true,
    value: {
      username: candidate,
      handle: `@${candidate}`,
      url: `https://www.instagram.com/${candidate}/`,
    },
  };
}

/** Clean a pasted URL or handle down to "@handle", or "" when blank/invalid. */
export function normalizeInstagramHandle(raw: string): string {
  const res = parseInstagram(raw);
  return res.ok && res.value !== null ? res.value.handle : "";
}

/** Canonical Instagram profile URL, or null when blank/invalid. */
export function instagramProfileUrl(raw: string): string | null {
  const res = parseInstagram(raw);
  return res.ok && res.value !== null ? res.value.url : null;
}
