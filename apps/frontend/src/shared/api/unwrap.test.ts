import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, unwrap } from "@/shared/api/unwrap";

describe("API error boundary", () => {
  it("retains correlation and field errors without exposing server messages", async () => {
    const response = Response.json(
      {
        code: "invalid",
        message: "Private server message",
        fields: { name: ["Required"] },
        request_id: "req-123",
      },
      { status: 400 },
    );
    await expect(unwrap(response, z.never())).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid",
      status: 400,
      requestId: "req-123",
      message: "invalid",
    });
  });
  it("handles non-JSON upstream failures", async () => {
    await expect(
      unwrap(new Response("<html>Error</html>", { status: 502 }), z.never()),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("validates successful response data at the trust boundary", async () => {
    const schema = z.object({ id: z.number().int().positive() });
    await expect(unwrap(Response.json({ id: "42" }), schema)).rejects.toMatchObject({
      name: "ZodError",
    });
  });
});
