import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { studioWebGpuSoakCommand } from "./studio-webgpu-soak-command.mjs";

const directory = mkdtempSync(join(tmpdir(), "studio-webgpu-soak-command-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
for (const executable of ["pnpm", "xvfb-run"]) {
  writeFileSync(join(directory, executable), `#!${process.execPath}\n${executable === "xvfb-run" ? `
const { spawnSync } = require("node:child_process");
console.log(JSON.stringify({ tool: "xvfb-run", args: process.argv.slice(2), headed: process.env.TOONSPECTRUM_WEBGPU_HEADED }));
const child = spawnSync(process.argv[4], process.argv.slice(5), { stdio: "inherit", env: process.env });
if (child.error) throw child.error;
process.exit(child.status ?? 1);
` : `
console.log(JSON.stringify({ tool: "pnpm", args: process.argv.slice(2), headed: process.env.TOONSPECTRUM_WEBGPU_HEADED ?? null, retained: process.env.QA_RETAINED_ENV }));
process.exit(Number(process.env.QA_CHILD_EXIT ?? 0));
`}`, { mode: 0o755 });
}

function execute(command: string, exitCode = 0) {
  const environment: NodeJS.ProcessEnv = { ...process.env, PATH: `${directory}:/usr/bin:/bin`, QA_RETAINED_ENV: "preserved", QA_CHILD_EXIT: String(exitCode) };
  delete environment.TOONSPECTRUM_WEBGPU_HEADED;
  const child = spawnSync("/bin/bash", ["-c", command], { env: environment, encoding: "utf8" });
  if (child.error) throw child.error;
  expect(child.stderr).toBe("");
  return { status: child.status, calls: child.stdout.trim().split("\n").map((line) => JSON.parse(line)) };
}

// Evaluate the actual registered tables without starting their ten-hour loop or network filing.
// This catches an old runner/config that forgets to route its command through the shared helper.
function registeredCommands(file: string, platform: NodeJS.Platform): string[] {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ["tests", "TESTS"].includes(node.name.getText(source))) initializer = node.initializer;
    else ts.forEachChild(node, visit);
  }
  visit(source);
  if (!initializer) throw new Error(`Missing product soak command table: ${file}`);
  const table = new Function("studioWebGpuSoakCommand", "t", `return (${initializer.getText(source)});`)(
    (script: string) => studioWebGpuSoakCommand(script, platform),
    (id: string, command: string) => ({ id, command }),
  ) as Record<string, (string[] | { id: string; command: string })[]>;
  return table["rendering-brush-3d"]!.map((entry) => Array.isArray(entry) ? entry[1]! : entry.command)
    .filter((command) => /verify:studio-(?:engine-webgpu-brush-parity|professional-bristle-webgpu)\b/u.test(command));
}

const scripts = ["verify:studio-engine-webgpu-brush-parity", "verify:studio-professional-bristle-webgpu"];
describe.each(["./studio-soak-runner.mjs", "./studio-soak-config.mjs"])("registered WebGPU commands in %s", (file) => {
  it.each(["linux", "darwin"] as const)("launches the correct compositor and preserves argv/env on %s", (platform) => {
    const commands = registeredCommands(file, platform);
    expect(commands).toHaveLength(2);
    for (const [index, command] of commands.entries()) {
      const { status, calls } = execute(command);
      expect(status).toBe(0);
      expect(calls.at(-1)).toEqual({ tool: "pnpm", args: ["run", scripts[index]], headed: platform === "linux" ? "1" : null, retained: "preserved" });
      if (platform === "linux") {
        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ tool: "xvfb-run", args: ["-a", "--server-args=-screen 0 1920x1200x24", "pnpm", "run", scripts[index]], headed: "1" });
      } else expect(calls).toHaveLength(1);
    }
  });

  it("propagates a failed GPU verifier instead of reporting a successful wrapper", () => {
    for (const command of registeredCommands(file, "linux")) expect(execute(command, 43).status).toBe(43);
  });
});
