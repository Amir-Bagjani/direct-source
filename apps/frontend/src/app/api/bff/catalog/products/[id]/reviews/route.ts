import { z } from "zod";
import { publicReviewsBff } from "@/features/catalog/server/public-catalog.server";

export async function GET(
  request: Request,
  context: RouteContext<"/api/bff/catalog/products/[id]/reviews">,
) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success)
    return Response.json(
      { code: "catalog_not_found", message: "catalog_not_found", request_id: crypto.randomUUID() },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return publicReviewsBff(request, parsed.data);
}
