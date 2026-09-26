import "server-only";
import { apiConfig } from "../api-config";

export function authConfig() {
  const secret = process.env.NEXTAUTH_SECRET;
  const key = process.env.SESSION_VAULT_KEY;
  const database = process.env.FRONTEND_DATABASE_URL;
  if (
    !secret ||
    secret.length < 32 ||
    secret.startsWith("replace-") ||
    !key ||
    !/^[a-f\d]{64}$/i.test(key) ||
    !database
  ) {
    throw new Error("auth_configuration_missing");
  }
  const endpoints = apiConfig();
  const origin = new URL(endpoints.origin);
  const secure = origin.protocol === "https:";
  if (!secure && !["localhost", "127.0.0.1"].includes(origin.hostname))
    throw new Error("auth_https_required");
  return {
    secret,
    key: Buffer.from(key, "hex"),
    database,
    origin: origin.origin,
    backend: endpoints.backend,
    secure,
    cookieName: secure ? "__Secure-ds.session" : "ds.session",
  };
}
