import type { WholesaleProduct } from "../../schemas/public-catalog.schema";

export interface PriceTableProps {
  tiers: NonNullable<WholesaleProduct["wholesale"]>["tiers"];
  variants: Pick<WholesaleProduct["variants"][number], "id" | "sku">[];
  caption: string;
}
