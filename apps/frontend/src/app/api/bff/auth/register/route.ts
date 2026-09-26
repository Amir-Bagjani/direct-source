import { registerAccount } from "@/features/accounts/server/registration.server";

export async function POST(request: Request) {
  return registerAccount(request);
}
