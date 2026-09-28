import { trustBff } from "@/features/accounts/server/trust.server";
async function handle(request: Request, context: RouteContext<"/api/bff/accounts/trust/[action]">) {
  return trustBff(request, (await context.params).action);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
