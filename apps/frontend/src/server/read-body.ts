import "server-only";
import { ApiError } from "@/shared/api/unwrap";

export async function readBodyBytes(request: Request, limit = 8192) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel();
        throw new ApiError(413, "payload_too_large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export async function readBodyText(request: Request, limit = 8192) {
  return (await readBodyBytes(request, limit)).toString("utf8");
}

export async function readJsonBody(request: Request, limit = 8192): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ApiError(415, "unsupported_media_type");
  try {
    return JSON.parse(await readBodyText(request, limit)) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_input");
  }
}
