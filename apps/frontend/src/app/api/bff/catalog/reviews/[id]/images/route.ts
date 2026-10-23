import { z } from "zod";
import { publicReviewImagesBff } from "@/features/catalog/server/public-catalog.server";

export async function GET(
  request: Request,
  context: RouteContext<"/api/bff/catalog/reviews/[id]/images">,
) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success)
    return Response.json(
      { code: "catalog_not_found", message: "catalog_not_found", request_id: crypto.randomUUID() },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return publicReviewImagesBff(request, parsed.data);
}
