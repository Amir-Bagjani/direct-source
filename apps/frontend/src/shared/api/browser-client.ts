"use client";
import type { z } from "zod";
import { unwrap } from "@/shared/api/unwrap";

export async function bffRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  // Validate the pathname before fetch can normalize dot segments or follow redirects.
  // Query values may legitimately contain URLs, dots, or percent-encoded text.
  const pathname = path.split(/[?#]/u)[0] ?? "";
  if (
    !path.startsWith("/api/bff/") ||
    [...pathname].some(
      (character) =>
        character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) ||
    /%(?:2e|2f|5c|25)/iu.test(pathname) ||
    pathname.split("/").some((segment) => segment === "." || segment === "..") ||
    path.includes("#")
  )
    throw new Error("Only BFF paths are allowed");
  return unwrap(
    await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    }),
    schema,
  );
}
