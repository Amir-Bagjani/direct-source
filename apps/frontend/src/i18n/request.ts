import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { locale as getRootLocale } from "next/root-params";
import { routing } from "@/i18n/routing";

export default getRequestConfig(async ({ locale: override }) => {
  // Explicit locales also work in Route Handlers/Actions, where root params are unavailable.
  const locale = override ?? (await getRootLocale());
  const selected = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  return { locale: selected, messages: (await import(`../../messages/${selected}.json`)).default };
});
