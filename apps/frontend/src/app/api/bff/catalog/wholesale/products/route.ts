import { wholesaleProductsBff } from "@/features/catalog/server/wholesale-catalog.server";

export function GET(request: Request) {
  return wholesaleProductsBff(request);
}
