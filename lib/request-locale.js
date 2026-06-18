import { LOCALE_COOKIE, resolveLocale } from "./i18n";

export function getRequestLocale(req) {
  const raw = req.cookies.get(LOCALE_COOKIE)?.value;
  return resolveLocale(raw);
}
