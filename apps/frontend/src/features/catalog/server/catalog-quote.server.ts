import "server-only";
import { unwrap } from "@/shared/api/unwrap";
import { quoteSchema } from "../schemas/catalog-quote.schema";
import { parseQuoteResponse } from "../utils/catalog-quote";

export async function readQuoteResponse(response: Response) {
  if (!response.ok) return unwrap(response, quoteSchema);
  return parseQuoteResponse(await response.text());
}
