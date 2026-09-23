import { getTranslations } from "next-intl/server";
export async function Loading() {
  const t = await getTranslations("common");
  return (
    <p role="status" aria-busy="true">
      {t("loading")}
    </p>
  );
}
