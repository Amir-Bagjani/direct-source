import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request) => {
  // Correlate failures without logging URLs, query strings, cookies, headers or payloads.
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  console.error(
    JSON.stringify({ event: "frontend.request_error", method: request.method, digest }),
  );
};
