import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = join(repositoryRoot, "scripts/deploy-cloudflare-static.mjs");
const temporaryDirectories = [];

function createFakePnpm() {
  const directory = mkdtempSync(join(tmpdir(), "toonspectrum-cloudflare-deploy-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  const commandLog = join(directory, "commands.ndjson");
  mkdirSync(binDirectory, { recursive: true });
  const executable = join(binDirectory, "pnpm");
  writeFileSync(
    executable,
    `#!/usr/bin/env node\nconst { appendFileSync } = require("node:fs");\nappendFileSync(process.env.COMMAND_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\n`,
  );
  chmodSync(executable, 0o755);
  return { binDirectory, commandLog };
}

function runDeploy(environment = {}) {
  const fake = createFakePnpm();
  const result = spawnSync(process.execPath, [deployScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: `${fake.binDirectory}:${process.env.PATH ?? ""}`,
      COMMAND_LOG: fake.commandLog,
      CLOUDFLARE_CORE_API_ORIGIN: "https://core.example.test",
      ...environment,
    },
    encoding: "utf8",
  });
  const commands = result.status === 0
    ? readFileSync(fake.commandLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    : [];
  return { result, commands };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("Cloudflare static deployment origin contract", () => {
  it("passes validated workload origins to the Wrangler dry-run", () => {
    const { result, commands } = runDeploy({
      CLOUDFLARE_PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
      CLOUDFLARE_SOCIAL_API_ORIGIN: "https://social.example.test",
      CLOUDFLARE_PLAYGROUND_API_ORIGIN: "https://playground.example.test",
      CLOUDFLARE_ADMIN_API_ORIGIN: "https://admin.example.test",
      CLOUDFLARE_REALTIME_API_ORIGIN: "https://realtime.example.test",
    });

    expect(result.status).toBe(0);
    expect(commands).toHaveLength(3);
    expect(commands[2]).toEqual(expect.arrayContaining([
      "exec",
      "wrangler",
      "deploy",
      "--dry-run",
      "CORE_API_ORIGIN:https://core.example.test",
      "PUBLIC_READ_API_ORIGINS:https://catalog-a.example.test,https://catalog-b.example.test",
      "SOCIAL_API_ORIGIN:https://social.example.test",
      "PLAYGROUND_API_ORIGIN:https://playground.example.test",
      "ADMIN_API_ORIGIN:https://admin.example.test",
      "REALTIME_API_ORIGIN:https://realtime.example.test",
    ]));
  });

  it("rejects duplicate public read origins before invoking pnpm", () => {
    const { result, commands } = runDeploy({
      CLOUDFLARE_PUBLIC_READ_API_ORIGINS:
        "https://catalog.example.test,https://catalog.example.test",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "CLOUDFLARE_PUBLIC_READ_API_ORIGINS must not contain duplicate origins",
    );
    expect(commands).toEqual([]);
  });

  it("rejects insecure or path-bearing isolated authorities", () => {
    for (const origin of [
      "http://social.example.test",
      "https://social.example.test/private",
      "https://user:password@social.example.test",
    ]) {
      const { result, commands } = runDeploy({
        CLOUDFLARE_SOCIAL_API_ORIGIN: origin,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "CLOUDFLARE_SOCIAL_API_ORIGIN must be an HTTPS origin without credentials or a path",
      );
      expect(commands).toEqual([]);
    }
  });
});
