import type { Quote, QuoteInput } from "../../schemas/catalog-quote.schema";
import type { WholesaleProduct } from "../../schemas/public-catalog.schema";

export interface SelectionPreviewProps {
  scope: string;
  productId: string;
  plan: Pick<NonNullable<WholesaleProduct["wholesale"]>, "free_mix_min" | "packs" | "tiers">;
  variants: Pick<WholesaleProduct["variants"][number], "id" | "sku" | "orderable" | "supply">[];
  quote: (id: string, selection: QuoteInput) => Promise<Quote>;
}
