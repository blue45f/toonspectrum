#!/usr/bin/env node
/** Local-only regression gate: existing manuscript contracts plus every V5/V6 brush-lab test. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;
const command = scripts["test:studio-material-brush"];
if (typeof command !== "string" || !command.startsWith("vitest run ")) {
  throw new Error("Update the artistry gate for the changed test:studio-material-brush contract.");
}
const files = command.trim().split(/\s+/u).slice(2);
if (files.some((file) => !file.endsWith(".ts") && !file.endsWith(".tsx"))) {
  throw new Error("The material regression script must be a plain list of Vitest test files.");
}
const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run",
  ...new Set([...files, "apps/web/src/domains/creator/brush-lab"]), "--maxWorkers=2", ...process.argv.slice(2),
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
