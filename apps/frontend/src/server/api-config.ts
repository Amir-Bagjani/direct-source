import "server-only";

// Public registration needs trusted destinations, but not session-vault credentials.
export function apiConfig() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.NEXTAUTH_URL || !process.env.DJANGO_API_URL)
  )
    throw new Error("api_configuration_missing");
  const origin = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  const backend = new URL(process.env.DJANGO_API_URL ?? "http://127.0.0.1:8000");
  for (const url of [origin, backend]) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("api_configuration_invalid");
  }
  return { origin: origin.origin, backend: backend.origin };
}
