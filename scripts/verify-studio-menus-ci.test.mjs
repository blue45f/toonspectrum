import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const wrapperSource = readFileSync(new URL("./verify-studio-menus-ci.mjs", import.meta.url), "utf8");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");

for (const guarded of [false, true]) for (const exitCode of [0, 23]) {
  test(`CI wrapper actually invokes ${guarded ? "guarded" : "legacy"} verifier once and preserves exit ${exitCode}`, (t) => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "studio-menu-ci-entry-")));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(join(directory, "verify-studio-menus-ci.mjs"), wrapperSource);
    mkdirSync(join(directory, "node_modules", "playwright"), { recursive: true });
    writeFileSync(join(directory, "node_modules", "playwright", "package.json"), JSON.stringify({ type: "module", exports: "./index.mjs" }));
    writeFileSync(join(directory, "node_modules", "playwright", "index.mjs"), `
      export const chromium = { launch: async () => {
        globalThis.originalBrowserLaunches = (globalThis.originalBrowserLaunches ?? 0) + 1;
        return { newContext: async () => ({}) };
      } };
    `);
    writeFileSync(join(directory, "verify-studio-menus.mts"), `
      import { pathToFileURL } from "node:url";
      import { chromium } from "playwright";
      async function main() {
        await chromium.launch({ headless: true });
        console.log(JSON.stringify({ verified: true, launches: globalThis.originalBrowserLaunches,
          entry: process.argv[1], arguments: process.argv.slice(2) }));
        process.exitCode = ${exitCode};
      }
      ${guarded ? 'if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { void main(); }' : 'void main();'}
    `);
    const result = spawnSync(process.execPath, ["--import", tsxLoader, join(directory, "verify-studio-menus-ci.mjs"), "--receipt-test"], {
      cwd: repository, encoding: "utf8", timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, exitCode, result.stderr);
    const receipts = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(receipts.length, 1, "A successful process must contain one actual verifier receipt; an import-only no-op is not a pass");
    assert.deepEqual(receipts[0], { verified: true, launches: 1,
      entry: join(directory, "verify-studio-menus.mts"), arguments: ["--receipt-test"] });
  });
}
