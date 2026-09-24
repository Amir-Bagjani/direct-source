import { getTranslations } from "next-intl/server";
import { Spinner } from "@/shared/ui/spinner/spinner";
export async function Loading() {
  const t = await getTranslations("common");
  return (
    <p className="flex items-center gap-2" role="status" aria-busy="true">
      <Spinner aria-hidden="true" role="presentation" />
      {t("loading")}
    </p>
  );
}
