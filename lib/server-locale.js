import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "./i18n.js";

export async function getServerLocale() {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}
