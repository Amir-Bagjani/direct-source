import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { z } from "zod";
import { authConfig } from "./config";

export const tokensSchema = z.object({
  access: z.string().max(4096),
  refresh: z.string().max(4096),
});
export type SessionTokens = z.infer<typeof tokensSchema>;
const rowSchema = z.object({
  encrypted_tokens: z.string(),
  state: z.enum(["ready", "refreshing"]),
  closing: z.boolean(),
  expires_at: z.date(),
});
export type VaultRow = z.infer<typeof rowSchema>;

let pool: Pool | undefined;
function database() {
  if (!pool) {
    pool = new Pool({
      connectionString: authConfig().database,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    // Never log connection errors: drivers may include connection strings.
    pool.on("error", () => {});
  }
  return pool;
}

export function encryptTokens(id: string, tokens: SessionTokens) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", authConfig().key, nonce);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptTokens(id: string, value: string) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", authConfig().key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return tokensSchema.parse(
    JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
    ),
  );
}

export async function createVaultSession(id: string, tokens: SessionTokens, expires: number) {
  await database().query(
    "INSERT INTO web_auth_session (id, encrypted_tokens, state, expires_at) VALUES ($1,$2,'ready',$3)",
    [id, encryptTokens(id, tokens), new Date(expires * 1000)],
  );
}

export async function withVaultSession<T>(
  id: string,
  work: (client: PoolClient, row: VaultRow | null) => Promise<T>,
): Promise<T> {
  if (!z.uuid().safeParse(id).success) throw new Error("invalid_session_id");
  const client = await database().connect();
  let locked = false;
  let broken = false;
  // A dropped connection releases the lock; durable 'refreshing' blocks any replay.
  const onError = () => {
    broken = true;
  };
  client.on("error", onError);
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [id]);
    locked = true;
    const result = await client.query<{ [key: string]: unknown }>(
      "SELECT encrypted_tokens,state,closing,expires_at FROM web_auth_session WHERE id=$1",
      [id],
    );
    const row = result.rows[0] ? rowSchema.parse(result.rows[0]) : null;
    return await work(client, row);
  } finally {
    if (locked && !broken) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [id]);
      } catch {
        broken = true;
      }
    }
    client.removeListener("error", onError);
    client.release(broken);
  }
}
