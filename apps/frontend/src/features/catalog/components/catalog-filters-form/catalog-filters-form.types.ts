import type { ComponentProps, ReactNode } from "react";
import type { CatalogFilters } from "../../utils/catalog-search";
import type { PublicDiscovery } from "../../schemas/public-catalog.schema";

export interface CatalogFiltersFormProps {
  filters: CatalogFilters;
  discovery: PublicDiscovery;
  priceAllowed: boolean;
  id: string;
  onSubmit: ComponentProps<"form">["onSubmit"];
  footer: ReactNode;
}
