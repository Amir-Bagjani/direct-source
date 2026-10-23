"use client";
import { bffRequest } from "@/shared/api/browser-client";
import { quoteInputSchema, quoteSchema, type QuoteInput } from "../schemas/catalog-quote.schema";

export function quoteWholesaleProduct(id: string, input: QuoteInput) {
  return bffRequest(
    `/api/bff/catalog/wholesale/products/${encodeURIComponent(id)}/quote`,
    quoteSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quoteInputSchema.parse(input)),
    },
  );
}
export function quoteProducerProduct(id: string, input: QuoteInput) {
  return bffRequest(
    `/api/bff/catalog/studio/quote?product=${encodeURIComponent(id)}`,
    quoteSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quoteInputSchema.parse(input)),
    },
  );
}
