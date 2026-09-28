import { businessBff } from "@/features/accounts/server/business.server";
export function GET(request: Request) {
  return businessBff(request);
}
export function POST(request: Request) {
  return businessBff(request);
}
