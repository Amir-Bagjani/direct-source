import { publicDiscoveryBff } from "@/features/catalog/server/public-catalog.server";

export function GET(request: Request) {
  return publicDiscoveryBff(request);
}
