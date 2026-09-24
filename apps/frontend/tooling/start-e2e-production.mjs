// Exercise the same standalone output shipped by Docker, with its static assets.
import { cpSync, existsSync, rmSync } from "node:fs";

if (!existsSync(".next/standalone/server.js")) {
  throw new Error("Run pnpm build before production E2E.");
}
for (const [source, target] of [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
]) {
  rmSync(target, { recursive: true, force: true });
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}
process.env.PORT = "3100";
process.env.HOSTNAME = "127.0.0.1";
await import("../.next/standalone/server.js");
