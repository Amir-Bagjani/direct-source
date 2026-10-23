import { z } from "zod";

// Reuse the authorized, no-store file-content BFF; no storage URL or token crosses the browser boundary.
export function catalogImageUrl(id: string) {
  return `/api/bff/accounts/onboarding/content?id=${z.uuid().parse(id)}`;
}
