import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main id="main">
      <h1>{t("notFound")}</h1>
      <Link href="/">{t("backHome")}</Link>
    </main>
  );
}
