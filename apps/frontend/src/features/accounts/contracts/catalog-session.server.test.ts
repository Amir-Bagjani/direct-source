import { expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";

vi.mock("server-only", () => ({}));
vi.mock("../server/session-cookie.server", () => ({ sessionId: async () => "session" }));
vi.mock("../server/session.server", () => ({
  withAccountRead: vi.fn(),
  withAccountMutation: async (_id: string, command: (access: string) => Promise<unknown>) => {
    try {
      return await command("server-only-test-token");
    } catch {
      throw new ApiError(403, "account_request_failed");
    }
  },
}));
import { withCatalogAccountMutation } from "./catalog-session.server";

it("preserves command validation paths once while retaining session error sanitization", async () => {
  const request = new Request("http://localhost/api/bff/catalog/studio/sales-save");
  const invalid = new ApiError(400, "invalid", undefined, { "tiers.1.min_quantity": ["invalid"] });
  const command = vi.fn().mockRejectedValue(invalid);
  await expect(withCatalogAccountMutation(request, command)).rejects.toBe(invalid);
  expect(command).toHaveBeenCalledTimes(1);
  await expect(
    withCatalogAccountMutation(request, async () => {
      throw new ApiError(403, "private");
    }),
  ).rejects.toMatchObject({ status: 403, code: "account_request_failed" });
  await expect(withCatalogAccountMutation(request, async () => ({ saved: true }))).resolves.toEqual(
    { saved: true },
  );
});
