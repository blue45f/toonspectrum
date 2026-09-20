import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/store-social-login-credentials-macos.zsh");
const tempRoots = [];

async function fakeMacPath() {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-keychain-test-"));
  tempRoots.push(root);
  const bin = join(root, "bin");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin));
  await writeFile(join(bin, "uname"), "#!/bin/sh\necho Darwin\n");
  await writeFile(join(bin, "security"), "#!/bin/sh\nexit 0\n");
  await chmod(join(bin, "uname"), 0o755);
  await chmod(join(bin, "security"), 0o755);
  return { root, bin };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("store-social-login-credentials-macos", () => {
  it.each([
    ["direct pnpm forwarding", ["--status"]],
    ["npm-style separator forwarding", ["--", "--status"]],
  ])("accepts %s", async (_label, args) => {
    const { root, bin } = await fakeMacPath();
    const result = spawnSync("zsh", [script, ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: root, USER: "tester", PATH: `${bin}:${process.env.PATH}` },
    });

    expect(result.error, "zsh must be installed before the actual shell regression runs").toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.match(/: present/g)).toHaveLength(10);
  });

  it("rejects ambiguous extra arguments", async () => {
    const { root, bin } = await fakeMacPath();
    const result = spawnSync("zsh", [script, "first", "second"], {
      encoding: "utf8",
      env: { ...process.env, HOME: root, USER: "tester", PATH: `${bin}:${process.env.PATH}` },
    });

    expect(result.error, "zsh must be installed before the actual shell regression runs").toBeUndefined();
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("Usage:");
  });
});
