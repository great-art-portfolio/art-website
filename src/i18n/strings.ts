/** Every language's words by code. No JSON imports, so node tests and the
 * Pages Functions (the visitor emails) can load it. */
import { de } from "./de";
import { en, type Strings } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { nl } from "./nl";
import { pa } from "./pa";
import { pl } from "./pl";
import { pt } from "./pt";
import { zh } from "./zh";
import type { Locale } from "./locales";

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
