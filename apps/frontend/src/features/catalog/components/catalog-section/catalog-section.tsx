import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { makeQueryClient } from "@/shared/query/query-client";
import { readPublicProductsOnServer } from "../../server/public-catalog.server";
import { publicProductsOptions } from "../../queries/public-catalog.queries";
import type { CatalogFilters } from "../../utils/catalog-search";
import { CatalogBrowser } from "../catalog-browser/catalog-browser";

export async function CatalogSection({ filters }: { filters: CatalogFilters }) {
  const queryClient = makeQueryClient();
  await queryClient.fetchQuery(publicProductsOptions(filters, readPublicProductsOnServer));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogBrowser filters={filters} />
    </HydrationBoundary>
  );
}
