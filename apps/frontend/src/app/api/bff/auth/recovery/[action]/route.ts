import type { NextRequest } from "next/server";
import { recoveryBff } from "@/features/accounts/server/recovery.server";
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/bff/auth/recovery/[action]">,
) {
  return recoveryBff(request, (await context.params).action);
}
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/bff/auth/recovery/[action]">,
) {
  return recoveryBff(request, (await context.params).action);
}
export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/bff/auth/recovery/[action]">,
) {
  return recoveryBff(request, (await context.params).action);
}
