import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.unknown().optional(),
  request_id: z.string(),
});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly fields?: unknown,
  ) {
    // UI maps codes to localized messages; raw server messages may contain private data.
    super(code);
    this.name = "ApiError";
  }
}

export async function unwrap<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.code : "request_failed",
      parsed.success ? parsed.data.request_id : (response.headers.get("x-request-id") ?? undefined),
      parsed.success ? parsed.data.fields : undefined,
    );
  }
  const data: unknown = response.status === 204 ? undefined : await response.json();
  return schema.parse(data);
}
