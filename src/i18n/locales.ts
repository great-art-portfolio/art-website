/** The languages the public site can be read in. English lives at the
 * root (/paintings/x); every other language under its code
 * (/fr/paintings/x). Which ones are switched on is her choice in the
 * studio (src/content/languages.json); this is everything on offer. The
 * studio itself stays in English. No imports, so node and the Pages
 * Functions can load it. */
export const LOCALES = [
  { code: "en", lang: "en", name: "English", english: "English" },
  { code: "fr", lang: "fr", name: "Français", english: "French" },
  { code: "es", lang: "es", name: "Español", english: "Spanish" },
  { code: "pt", lang: "pt-BR", name: "Português", english: "Portuguese" },
  { code: "de", lang: "de", name: "Deutsch", english: "German" },
  { code: "it", lang: "it", name: "Italiano", english: "Italian" },
  { code: "nl", lang: "nl", name: "Nederlands", english: "Dutch" },
  { code: "pl", lang: "pl", name: "Polski", english: "Polish" },
  { code: "ja", lang: "ja", name: "日本語", english: "Japanese" },
  { code: "ko", lang: "ko", name: "한국어", english: "Korean" },
  {
    code: "zh",
    lang: "zh-Hans",
    name: "简体中文",
    english: "Chinese (Simplified)",
  },
  { code: "hi", lang: "hi", name: "हिन्दी", english: "Hindi" },
  { code: "pa", lang: "pa", name: "ਪੰਜਾਬੀ", english: "Punjabi" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export type OtherLocale = Exclude<Locale, "en">;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}

export function localeInfo(code: Locale): (typeof LOCALES)[number] {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/** Keeps only languages on offer, in the order above, English excluded. */
export function cleanLocales(list: unknown): OtherLocale[] {
  if (!Array.isArray(list)) return [];
  return LOCALES.map((l) => l.code).filter(
    (c): c is OtherLocale => c !== "en" && list.includes(c),
  );
}

/** A site path in a language: ("fr", "/paintings/x") → "/fr/paintings/x",
 * ("fr", "/") → "/fr", ("fr", "/#about") → "/fr#about". English paths
 * pass through. */
export function localePath(locale: Locale, path: string): string {
  if (locale === "en") return path;
  if (path === "/" || path === "") return `/${locale}`;
  if (path.startsWith("/#")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}

/** The language a path is in and the same path in English:
 * "/fr/paintings/x" → { locale: "fr", path: "/paintings/x" }. */
export function splitLocale(pathname: string): {
  locale: Locale;
  path: string;
} {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  if (m !== null && isLocale(m[1]) && m[1] !== "en")
    return { locale: m[1], path: m[2] === "" ? "/" : (m[2] ?? "/") };
  return { locale: "en", path: pathname === "" ? "/" : pathname };
}
