import languages from "../content/languages.json";
import { cleanLocales, type Locale, type OtherLocale } from "./locales";

export { t } from "./strings";

/** The languages she has switched on in the studio, besides English. */
export const ENABLED: OtherLocale[] = cleanLocales(languages.languages);

/** English plus every switched-on language: the versions each public
 * page is built in. */
export const SITE_LOCALES: Locale[] = ["en", ...ENABLED];

/** getStaticPaths for the /[locale]/ copies of a page. */
export function localeParams(): Array<{ params: { locale: OtherLocale } }> {
  return ENABLED.map((locale) => ({ params: { locale } }));
}
