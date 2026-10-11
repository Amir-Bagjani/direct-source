import type { ComponentProps, ReactNode } from "react";
import type { CatalogFilters } from "../../utils/catalog-search";

export interface CatalogFiltersFormProps {
  filters: CatalogFilters;
  priceAllowed: boolean;
  id: string;
  onSubmit: ComponentProps<"form">["onSubmit"];
  footer: ReactNode;
}
