import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { makeQueryClient } from "@/shared/query/query-client";
import { JsonLd } from "@/shared/seo/json-ld/json-ld";
import {
  readPublicManufacturerOnServer,
  readPublicProductsOnServer,
} from "../../server/public-catalog.server";
import {
  publicManufacturerOptions,
  publicProductsOptions,
} from "../../queries/public-catalog.queries";
import type { CatalogFilters } from "../../utils/catalog-search";
import { ManufacturerProfile } from "../manufacturer-profile/manufacturer-profile";

export async function ManufacturerSection({
  id,
  filters,
}: {
  id: string;
  filters: CatalogFilters;
}) {
  const queryClient = makeQueryClient();
  const [manufacturer] = await Promise.all([
    queryClient.fetchQuery(
      publicManufacturerOptions(id, (manufacturerId) =>
        readPublicManufacturerOnServer(manufacturerId),
      ),
    ),
    queryClient.fetchQuery(publicProductsOptions(filters, readPublicProductsOnServer)),
  ]);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: manufacturer.name,
          description: manufacturer.description,
          logo: manufacturer.logo_url ?? undefined,
          address:
            manufacturer.province || manufacturer.city
              ? {
                  "@type": "PostalAddress",
                  addressRegion: manufacturer.province ?? undefined,
                  addressLocality: manufacturer.city ?? undefined,
                  addressCountry: "IR",
                }
              : undefined,
        }}
      />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ManufacturerProfile id={id} filters={filters} />
      </HydrationBoundary>
    </>
  );
}
