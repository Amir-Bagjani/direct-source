import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { makeQueryClient } from "@/shared/query/query-client";
import { JsonLd } from "@/shared/seo/json-ld/json-ld";
import { readPublicProductOnServer } from "../../server/public-catalog.server";
import { publicProductOptions } from "../../queries/public-catalog.queries";
import { ProductDetail } from "../product-detail/product-detail";

export async function ProductSection({ id }: { id: string }) {
  const queryClient = makeQueryClient();
  const product = await queryClient.fetchQuery(
    publicProductOptions(id, (productId) => readPublicProductOnServer(productId)),
  );
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description,
          image: product.image_urls,
          sku: product.manufacturer_model || undefined,
          brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
          category: product.category_path.map((category) => category.name).join(" > "),
          manufacturer: {
            "@type": "Organization",
            name: product.manufacturer.name,
          },
        }}
      />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductDetail id={id} />
      </HydrationBoundary>
    </>
  );
}
