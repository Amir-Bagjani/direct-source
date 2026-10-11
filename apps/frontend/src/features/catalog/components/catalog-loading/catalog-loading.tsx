import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader } from "@/shared/ui/card/card";
import { Skeleton } from "@/shared/ui/skeleton/skeleton";

export async function CatalogLoading() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-label={t("loading")} aria-busy="true" className="grid gap-6">
      <Skeleton className="h-11 w-full max-w-2xl" />
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden gap-4 lg:grid" aria-hidden="true">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <Card
              key={item}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-0 py-0 sm:flex sm:flex-col"
            >
              <Skeleton className="m-3 aspect-square self-start sm:m-0 sm:aspect-[4/3] sm:w-full" />
              <div>
                <CardHeader className="p-3 sm:p-4">
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-11 w-full" />
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
