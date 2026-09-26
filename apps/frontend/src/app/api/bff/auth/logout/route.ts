import { sessionBff } from "@/features/accounts/server/session-bff.server";
export async function POST(request: Request) {
  return sessionBff(request, true);
}
