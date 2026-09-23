import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("Oxlint enforces architecture, React, Next.js and accessibility policies", async () => {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "directsourcing-lint-")));
  const config = join(fixture, ".oxlintrc.json");
  const cli = fileURLToPath(new URL("../node_modules/oxlint/bin/oxlint", import.meta.url));
  async function file(path, content) {
    const target = join(fixture, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  function lint() {
    const result = spawnSync(
      process.execPath,
      [cli, "--config", config, "--format", "json", "src"],
      {
        cwd: fixture,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, null, result.stderr);
    return { status: result.status, diagnostics: JSON.parse(result.stdout).diagnostics };
  }
  try {
    const settings = JSON.parse(
      await readFile(new URL("../.oxlintrc.json", import.meta.url), "utf8"),
    );
    for (const override of settings.overrides) {
      override.jsPlugins = override.jsPlugins?.map((path) =>
        fileURLToPath(new URL(`../${path}`, import.meta.url)),
      );
    }
    await file(".oxlintrc.json", JSON.stringify(settings));
    await file(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await file("src/shared/value.ts", "export const value = 1;");
    await file(
      "src/app/value.ts",
      'import {value} from "@/shared/value"; export const page = value;',
    );
    await file(
      "src/features/value.ts",
      'import {value} from "../shared/value"; export const feature = value;',
    );
    assert.deepEqual(lint(), { status: 0, diagnostics: [] });

    const cases = [
      ["src/shared/alias.ts", 'import "@/app/value";', "architecture(dependencies)"],
      ["src/shared/relative.ts", 'import "../app/value";', "architecture(dependencies)"],
      ["src/shared/normalized.ts", 'import "@/shared/../app/value";', "architecture(dependencies)"],
      ["src/shared/dynamic.ts", 'void import("../app/value");', "architecture(dependencies)"],
      ["src/shared/require.ts", 'require("../app/value");', "architecture(dependencies)"],
      [
        "src/shared/type-import.ts",
        'import type {Page} from "@/app/value"; export type Value = Page;',
        "architecture(dependencies)",
      ],
      [
        "src/shared/import-type.ts",
        'export type Value = typeof import("@/app/value");',
        "architecture(dependencies)",
      ],
      ["src/i18n/invalid.ts", 'import "@/features/value";', "architecture(dependencies)"],
      ["src/server/invalid.ts", 'import "@/app/value";', "architecture(dependencies)"],
      ["src/features/invalid.ts", 'import "@/app/value";', "architecture(dependencies)"],
      ["src/shared/star.ts", 'export * from "./value";', "architecture(no-reexports)"],
      ["src/shared/named.ts", 'export {value} from "./value";', "architecture(no-reexports)"],
      ["src/shared/type.ts", 'export type {Value} from "./value";', "architecture(no-reexports)"],
      [
        "src/shared/cycle-a.ts",
        'import "@/shared/cycle-b"; export const a = 1;',
        "import(no-cycle)",
      ],
      ["src/shared/cycle-b.ts", 'import "./cycle-a"; export const b = 1;', "import(no-cycle)"],
      [
        "src/app/hooks.tsx",
        'import {useState} from "react"; export function Bad({ok}) {if (ok) useState(0); return null;}',
        "react-hooks(rules-of-hooks)",
      ],
      [
        "src/app/deps.tsx",
        'import {useEffect} from "react"; export function Bad({value}) {useEffect(() => {console.log(value);}, []); return null;}',
        "react-hooks(exhaustive-deps)",
      ],
      [
        "src/app/purity.tsx",
        "export function Bad() {return <p>{Math.random()}</p>;}",
        "react(purity)",
      ],
      [
        "src/app/client.tsx",
        '"use client"; export default async function Bad() {return <p>Bad</p>;}',
        "next(no-async-client-component)",
      ],
      [
        "src/app/image.tsx",
        'export function Bad() {return <img src="/x.png" />;}',
        "jsx-a11y(alt-text)",
      ],
    ];
    for (const [path, content] of cases) await file(path, content);
    // Generated OpenAPI is intentionally excluded, even with otherwise-invalid code.
    await file("src/shared/api/openapi.ts", "export type Generated = any;");
    const result = lint();
    assert.equal(result.status, 1);
    for (const [path, , rule] of cases) {
      assert.ok(
        result.diagnostics.some((item) => item.filename === path && item.code === rule),
        `${path} must fail ${rule}: ${JSON.stringify(result.diagnostics)}`,
      );
    }
    assert.ok(!result.diagnostics.some((item) => item.filename.endsWith("openapi.ts")));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
