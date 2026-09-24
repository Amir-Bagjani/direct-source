import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-16" id="main">
      <h1>{t("notFound")}</h1>
      <Link href="/">{t("backHome")}</Link>
    </main>
  );
}
