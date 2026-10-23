import { mutationOptions } from "@tanstack/react-query";
import { catalogKeys } from "./catalog.keys";
import type { Quote } from "../schemas/catalog-quote.schema";

export function quoteMutationOptions(scope: string, id: string, submit: () => Promise<Quote>) {
  return mutationOptions({
    mutationKey: catalogKeys.quote(scope, id),
    mutationFn: submit,
    gcTime: 0,
    retry: false,
  });
}
