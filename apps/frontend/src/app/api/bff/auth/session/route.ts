import { sessionBff } from "@/features/accounts/server/session-bff.server";
export async function GET(request: Request) {
  return sessionBff(request);
}
