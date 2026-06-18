export const LOCALES = ["ru", "kk"];
export const DEFAULT_LOCALE = "ru";
export const LOCALE_COOKIE = "dh_locale";

export function resolveLocale(value) {
  return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

export function pick(locale, ru, kk) {
  return locale === "kk" ? kk : ru;
}
