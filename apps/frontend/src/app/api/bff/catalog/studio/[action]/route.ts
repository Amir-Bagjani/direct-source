import { catalogManagementBff } from "@/features/catalog/server/catalog-management.server";

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  return catalogManagementBff(request, (await context.params).action);
}

export async function POST(request: Request, context: Context) {
  return catalogManagementBff(request, (await context.params).action);
}
