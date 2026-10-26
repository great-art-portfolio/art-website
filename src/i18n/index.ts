import languages from "../content/languages.json";
import { de } from "./de";
import { en, type Strings } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { cleanLocales, type Locale, type OtherLocale } from "./locales";
import { nl } from "./nl";
import { pa } from "./pa";
import { pl } from "./pl";
import { pt } from "./pt";
import { zh } from "./zh";

const ALL: Record<Locale, Strings> = {
  en,
  fr,
  es,
  pt,
  de,
  it,
  nl,
  pl,
  ja,
  ko,
  zh,
  hi,
  pa,
};

/** The words for a language. */
export function t(locale: Locale): Strings {
  return ALL[locale];
}

/** The languages she has switched on in the studio, besides English. */
export const ENABLED: OtherLocale[] = cleanLocales(languages.languages);

/** English plus every switched-on language: the versions each public
 * page is built in. */
export const SITE_LOCALES: Locale[] = ["en", ...ENABLED];

/** getStaticPaths for the /[locale]/ copies of a page. */
export function localeParams(): Array<{ params: { locale: OtherLocale } }> {
  return ENABLED.map((locale) => ({ params: { locale } }));
}
