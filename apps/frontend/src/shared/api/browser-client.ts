"use client";
import type { z } from "zod";
import { unwrap } from "@/shared/api/unwrap";

export async function bffRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/api/bff/") || path.includes(".."))
    throw new Error("Only BFF paths are allowed");
  return unwrap(
    await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" }),
    schema,
  );
}
