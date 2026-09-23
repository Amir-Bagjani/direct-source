import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("pre-commit formats staged content, preserves unstaged edits and blocks lint failures", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "directsourcing-hooks-")));
  const frontend = join(root, "apps/frontend");
  const project = fileURLToPath(new URL("../", import.meta.url));
  const env = { ...process.env, CI: "", NODE_ENV: "development", HUSKY: "1" };
  async function file(path, content) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  function run(command, args, cwd = root) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, null, result.stderr);
    return result;
  }
  function git(...args) {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  }
  const target = "apps/frontend/src/app/[locale]/staged name.ts";
  const baseline = "export const value = 1;\n" + "// unchanged context\n".repeat(8);
  try {
    await file(".gitignore", "node_modules/\n**/.husky/_/\n");
    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    await file(
      "apps/frontend/package.json",
      JSON.stringify({
        private: true,
        type: "module",
        packageManager: manifest.packageManager,
        scripts: { "lint:staged": manifest.scripts["lint:staged"] },
      }),
    );
    for (const path of [
      ".husky/install.mjs",
      ".husky/pre-commit",
      ".lintstagedrc.json",
      ".oxfmtrc.json",
      ".oxlintrc.json",
      "tooling/architecture-plugin.mjs",
    ]) {
      await file(`apps/frontend/${path}`, await readFile(join(project, path), "utf8"));
    }
    await file(target, baseline);
    await file("apps/frontend/src/shared/api/openapi.ts", "export type Generated=any;\n");
    await file("backend/example.py", "# original\n");
    await symlink(join(project, "node_modules"), join(frontend, "node_modules"), "dir");
    git("init", "--quiet");
    git("config", "user.name", "Hook test");
    git("config", "user.email", "hook-test@example.invalid");
    git("config", "commit.gpgSign", "false");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture baseline");
    const install = run(process.execPath, [".husky/install.mjs"], frontend);
    assert.equal(install.status, 0, install.stderr);
    assert.equal(git("config", "--get", "core.hooksPath").trim(), "apps/frontend/.husky/_");

    const staged = baseline.replace("value = 1", "value=2");
    await file(target, staged);
    git("add", "--", target);
    await file("apps/frontend/messages/demo.json", '{"value":1}');
    git("add", "apps/frontend/messages/demo.json");
    await file(target, staged + "export const unstaged = 3;\n");
    git("commit", "--quiet", "-m", "partial staging");
    const committed = git("show", `HEAD:${target}`);
    assert.ok(committed.includes("value = 2;"));
    assert.ok(!committed.includes("unstaged"));
    assert.equal(git("show", "HEAD:apps/frontend/messages/demo.json"), '{ "value": 1 }\n');
    assert.ok((await readFile(join(root, target), "utf8")).includes("unstaged = 3;"));
    assert.ok(git("diff", "--", target).includes("unstaged"));

    // Failed lint must abort the commit and roll back formatter/index changes.
    const invalid = "export const invalid:any=1;\n";
    await file("apps/frontend/src/shared/invalid.ts", invalid);
    git("add", "apps/frontend/src/shared/invalid.ts");
    const head = git("rev-parse", "HEAD");
    const index = git("diff", "--cached");
    const failed = run("git", ["commit", "--quiet", "-m", "must not commit"]);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stdout + failed.stderr, /no-explicit-any/);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(git("diff", "--cached"), index);
    assert.equal(await readFile(join(frontend, "src/shared/invalid.ts"), "utf8"), invalid);
    git("restore", "--staged", "apps/frontend/src/shared/invalid.ts");

    // Generated files retain generator formatting and bypass lint rules.
    const generated = "export type Generated=any;\n// generator update\n";
    await file("apps/frontend/src/shared/api/openapi.ts", generated);
    git("add", "apps/frontend/src/shared/api/openapi.ts");
    git("commit", "--quiet", "-m", "generated file");
    assert.equal(git("show", "HEAD:apps/frontend/src/shared/api/openapi.ts"), generated);

    // Backend-only commits must not invoke a broken/uninstalled frontend toolchain.
    await file(
      "apps/frontend/package.json",
      JSON.stringify({ scripts: { "lint:staged": "exit 99" } }),
    );
    await file("backend/example.py", "# updated\n");
    git("add", "backend/example.py");
    git("commit", "--quiet", "-m", "backend only");
    git("rm", "apps/frontend/src/shared/api/openapi.ts");
    git("commit", "--quiet", "-m", "deletion only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
