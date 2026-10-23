// Exercise the same standalone output shipped by Docker, with its static assets.
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = process.env.NEXT_DIST_DIR ?? ".next";
const server = resolve(directory, "standalone/server.js");
if (!existsSync(server)) throw new Error("Run pnpm build before production E2E.");
for (const [source, target] of [
  [`${directory}/static`, `${directory}/standalone/${directory}/static`],
  ["public", `${directory}/standalone/public`],
]) {
  rmSync(target, { recursive: true, force: true });
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}
process.env.PORT ??= "3100";
process.env.HOSTNAME ??= "localhost";
await import(pathToFileURL(server).href);
