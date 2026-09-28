import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { ApiError } from "@/shared/api/unwrap";
import { djangoAuth } from "@/server/auth/django";
import {
  createVaultSession,
  decryptTokens,
  encryptTokens,
  tokensSchema,
  withVaultSession,
} from "@/server/auth/vault";
import type { SessionTokens, VaultRow } from "@/server/auth/vault";
import { registeredUserSchema } from "../schemas/registration.schema";

const claimsSchema = z.object({
  exp: z.number().int().positive(),
  sid: z.uuid(),
  user_id: z.uuid(),
});
function claims(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("auth_upstream_invalid");
  // Used only for lifetime/rotation consistency; Django verifies every authorization.
  return claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
}
function validatePair(tokens: SessionTokens, previous?: SessionTokens) {
  const access = claims(tokens.access);
  const refresh = claims(tokens.refresh);
  if (
    access.sid !== refresh.sid ||
    access.user_id !== refresh.user_id ||
    (previous &&
      (claims(previous.refresh).sid !== refresh.sid ||
        claims(previous.refresh).user_id !== refresh.user_id))
  )
    throw new Error("auth_upstream_invalid");
  return refresh.exp;
}
export async function openSession(mobile: string, password: string) {
  const pair = await djangoAuth("login", tokensSchema, { body: { mobile, password } });
  const expiry = validatePair(pair);
  await djangoAuth("me", registeredUserSchema, { access: pair.access });
  const id = randomUUID();
  try {
    await createVaultSession(id, pair, expiry);
  } catch {
    await djangoAuth("logout", z.undefined(), { access: pair.access, body: {} }).catch(() => {});
    throw new Error("auth_unavailable");
  }
  return id;
}

async function rotate(client: PoolClient, id: string, pair: SessionTokens) {
  // This write MUST commit before the network call. Never wrap it in a transaction.
  await client.query("UPDATE web_auth_session SET state='refreshing' WHERE id=$1", [id]);
  const next = await djangoAuth("refresh", tokensSchema, { body: { refresh: pair.refresh } });
  validatePair(next, pair);
  await client.query("UPDATE web_auth_session SET encrypted_tokens=$2,state='ready' WHERE id=$1", [
    id,
    encryptTokens(id, next),
  ]);
  return next;
}
function usable(row: VaultRow | null) {
  return row && row.expires_at.getTime() > Date.now() && row.state === "ready";
}

async function withAccountAccess<T>(
  id: string,
  request: (access: string) => Promise<T>,
  retryUnauthorized: boolean,
) {
  return withVaultSession(id, async (client, row) => {
    if (!usable(row) || !row || row.closing) throw new ApiError(401, "session_required");
    let pair = decryptTokens(id, row.encrypted_tokens);
    let refreshed = false;
    try {
      if (claims(pair.access).exp * 1000 <= Date.now() + 10_000) {
        pair = await rotate(client, id, pair);
        refreshed = true;
      }
      try {
        return await request(pair.access);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || refreshed || !retryUnauthorized)
          throw error;
        pair = await rotate(client, id, pair);
        return await request(pair.access);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await client.query("DELETE FROM web_auth_session WHERE id=$1", [id]);
        throw new ApiError(401, "session_required");
      }
      if (error instanceof ApiError) throw new ApiError(error.status, "account_request_failed");
      throw new ApiError(503, "auth_unavailable");
    }
  });
}

export function currentUser(id: string) {
  return withAccountRead(id, (access) => djangoAuth("me", registeredUserSchema, { access }));
}

// Refresh before a write if necessary, but never replay a possibly committed mutation.
export function withAccountMutation<T>(id: string, request: (access: string) => Promise<T>) {
  return withAccountAccess(id, request, false);
}

export async function closeSession(id: string) {
  return withVaultSession(id, async (client, row) => {
    if (!row) return;
    await client.query("UPDATE web_auth_session SET closing=true WHERE id=$1", [id]);
    if (row.expires_at.getTime() <= Date.now()) {
      await client.query("DELETE FROM web_auth_session WHERE id=$1", [id]);
      return;
    }
    if (row.state !== "ready") throw new ApiError(503, "logout_uncertain");
    let pair = decryptTokens(id, row.encrypted_tokens);
    try {
      if (claims(pair.access).exp * 1000 <= Date.now() + 10_000)
        pair = await rotate(client, id, pair);
      await djangoAuth("logout", z.undefined(), { access: pair.access, body: {} });
    } catch (error) {
      // A valid refreshed token rejected by Django means the session is already invalid.
      if (!(error instanceof ApiError) || error.status !== 401)
        throw new ApiError(503, "logout_uncertain");
    }
    await client.query("DELETE FROM web_auth_session WHERE id=$1", [id]);
  });
}

// Reads may refresh and retry one 401; writes continue to use withAccountMutation.
export function withAccountRead<T>(id: string, request: (access: string) => Promise<T>) {
  return withAccountAccess(id, request, true);
}
