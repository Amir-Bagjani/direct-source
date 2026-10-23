import { quoteSchema } from "../schemas/catalog-quote.schema";

export function parseQuoteResponse(text: string) {
  return quoteSchema.parse(
    JSON.parse(text, (key: string, value: unknown, context?: { source: string }) => {
      if (key.endsWith("_irr")) return typeof value === "number" ? context?.source : undefined;
      return value;
    }),
  );
}
