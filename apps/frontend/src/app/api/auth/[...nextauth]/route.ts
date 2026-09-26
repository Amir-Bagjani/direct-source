import type { NextRequest } from "next/server";
import { handleNextAuth } from "@/features/accounts/server/nextauth-handler.server";
export async function GET(request: NextRequest, context: RouteContext<"/api/auth/[...nextauth]">) {
  return handleNextAuth(request, context);
}
export async function POST(request: NextRequest, context: RouteContext<"/api/auth/[...nextauth]">) {
  return handleNextAuth(request, context);
}
