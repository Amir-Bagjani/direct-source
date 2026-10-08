import { z } from "zod";
import { wholesaleProductBff } from "@/features/catalog/server/wholesale-catalog.server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success)
    return Response.json(
      { code: "catalog_not_found", message: "catalog_not_found", request_id: crypto.randomUUID() },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  return wholesaleProductBff(request, parsed.data);
}
