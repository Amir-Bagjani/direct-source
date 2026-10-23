import { z } from "zod";
import { wholesaleQuoteBff } from "@/features/catalog/server/wholesale-catalog.server";

export async function POST(
  request: Request,
  context: RouteContext<"/api/bff/catalog/wholesale/products/[id]/quote">,
) {
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success)
    return Response.json(
      { code: "catalog_not_found", message: "catalog_not_found", request_id: crypto.randomUUID() },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  return wholesaleQuoteBff(request, id.data);
}
