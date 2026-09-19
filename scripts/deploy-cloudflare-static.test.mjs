import {
  existsSync,
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

const approvedSha = "abcdef0123456789abcdef0123456789abcdef01";

function createFakeProcesses() {
  const directory = mkdtempSync(join(tmpdir(), "toonspectrum-cloudflare-deploy-"));
  temporaryDirectories.push(directory);
  const commandLog = join(directory, "commands.ndjson");
  const preload = join(directory, "mock-processes.cjs");
  writeFileSync(
    preload,
    `const { appendFileSync } = require("node:fs");
const childProcess = require("node:child_process");
function log(entry) { appendFileSync(process.env.COMMAND_LOG, JSON.stringify(entry) + "\\n"); }
childProcess.execFileSync = (executable, args) => {
  log({ executable, args });
  if (executable !== "git") throw new Error("Unexpected executable");
  if (args.join(" ") === "branch --show-current") return process.env.FAKE_BRANCH + "\\n";
  if (args.join(" ") === "status --porcelain") return process.env.FAKE_STATUS;
  if (args.join(" ") === "rev-parse HEAD") return process.env.FAKE_HEAD + "\\n";
  throw new Error("Unexpected git command");
};
let call = 0;
childProcess.spawnSync = (executable, args, options) => {
  log({ executable, args, catalogSource: options.env.VITE_CATALOG_SOURCE ?? null });
  if (executable !== "pnpm") throw new Error("Unexpected executable");
  return { status: ++call === Number(process.env.FAKE_FAIL_CALL) ? 17 : 0 };
};
for (const name of ["spawn", "exec", "execSync", "execFile", "fork"]) {
  childProcess[name] = () => { throw new Error("Unmocked process call: " + name); };
}
require("node:module").syncBuiltinESMExports();
`,
  );
  return { directory, preload, commandLog };
}

function runDeploy(environment = {}, args = []) {
  const fake = createFakeProcesses();
  const result = spawnSync(process.execPath, ["--require", fake.preload, deployScript, ...args], {
    cwd: fake.directory,
    env: {
      COMMAND_LOG: fake.commandLog,
      FAKE_BRANCH: "main",
      FAKE_STATUS: "",
      FAKE_HEAD: approvedSha,
      CLOUDFLARE_CORE_API_ORIGIN: "https://core.example.test",
      ...environment,
    },
    encoding: "utf8",
  });
  const allCommands = existsSync(fake.commandLog)
    ? readFileSync(fake.commandLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    : [];
  return { result, allCommands, commands: allCommands.filter((command) => command.executable === "pnpm") };
}

function runProduction(environment = {}) {
  return runDeploy({
    TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-static-production",
    TOONSPECTRUM_APPROVED_MAIN_SHA: approvedSha,
    ...environment,
  }, ["--production"]);
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
      CLOUDFLARE_LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    });

    expect(result.status).toBe(0);
    expect(commands).toHaveLength(5);
    expect(commands[1]).toMatchObject({ catalogSource: "static" });
    expect(commands[2].args).toEqual(["run", "prepare:cloudflare-static-assets"]);
    expect(commands[3].args).toEqual(["run", "sync:cloudflare-r2-assets:dry-run"]);
    expect(commands[4].args).toEqual(expect.arrayContaining([
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
      "LARGE_ASSET_ORIGIN:https://large-assets.example.test",
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
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
      "https://user:opaque@social.example.test",
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

  it("allows an explicit API catalog build for compatibility rollbacks", () => {
    const { result, commands } = runDeploy({ VITE_CATALOG_SOURCE: "api" });

    expect(result.status).toBe(0);
    expect(commands[1]).toMatchObject({ catalogSource: "api" });
  });

  it("rejects an unknown catalog source before invoking pnpm", () => {
    const { result, commands } = runDeploy({ VITE_CATALOG_SOURCE: "hybrid" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_CATALOG_SOURCE must be static or api");
    expect(commands).toEqual([]);
  });
});

describe("Cloudflare production release gates (all child process calls mocked)", () => {
  it.each([
    ["missing", undefined], ["empty", ""], ["short", "abcdef0"],
    ["branch", "main"], ["tag", "v1.0.0"], ["uppercase", approvedSha.toUpperCase()],
    ["suffix", `${approvedSha}suffix`], ["injection", `${approvedSha}; pnpm deploy`],
    ["leading whitespace", ` ${approvedSha}`], ["trailing whitespace", `${approvedSha} `],
    ["newline", `${approvedSha}\n`], ["nonhex", "g".repeat(40)],
  ])("rejects %s approved SHA before any process call", (_label, sha) => {
    const { result, commands, allCommands } = runProduction({ TOONSPECTRUM_APPROVED_MAIN_SHA: sha });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lowercase 40-hex SHA");
    expect(commands).toEqual([]);
    expect(allCommands).toEqual([]);
  });

  it.each([
    ["missing approval", { TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: undefined }, "MANUAL_DEPLOY_APPROVAL", 0],
    ["wrong approval", { TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "yes" }, "MANUAL_DEPLOY_APPROVAL", 0],
    ["non-main", { FAKE_BRANCH: "feature/release" }, "requires main", 1],
    ["detached", { FAKE_BRANCH: "" }, "requires main", 1],
    ["dirty tracked", { FAKE_STATUS: " M package.json\n" }, "clean worktree", 2],
    ["dirty staged", { FAKE_STATUS: "M  package.json\n" }, "clean worktree", 2],
    ["dirty untracked", { FAKE_STATUS: "?? new.txt\n" }, "clean worktree", 2],
    ["different HEAD", { FAKE_HEAD: "0".repeat(40) }, "HEAD to equal", 3],
  ])("rejects %s without invoking pnpm", (_label, environment, error, gitCount) => {
    const { result, commands, allCommands } = runProduction(environment);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(commands).toEqual([]);
    expect(allCommands).toHaveLength(gitCount);
  });

  it("preserves origin and catalog gates before pnpm in production", () => {
    for (const environment of [
      { CLOUDFLARE_CORE_API_ORIGIN: "" },
      { CLOUDFLARE_SOCIAL_API_ORIGIN: "http://insecure.test" },
      { VITE_CATALOG_SOURCE: "invalid" },
    ]) {
      const { result, commands } = runProduction(environment);
      expect(result.status).toBe(1);
      expect(commands).toEqual([]);
    }
  });

  it("binds clean main to the exact approved HEAD before all build and publication gates", () => {
    const { result, allCommands, commands } = runProduction();
    expect(result.status).toBe(0);
    expect(allCommands.slice(0, 3)).toEqual([
      { executable: "git", args: ["branch", "--show-current"] },
      { executable: "git", args: ["status", "--porcelain"] },
      { executable: "git", args: ["rev-parse", "HEAD"] },
    ]);
    expect(commands.map((command) => command.args)).toEqual([
      ["run", "generate:cloudflare-static-rules", "--", "--check"],
      ["run", "build"],
      ["run", "prepare:cloudflare-static-assets"],
      ["run", "sync:cloudflare-r2-assets"],
      ["exec", "wrangler", "deploy", "--config", "deploy/cloudflare-static/wrangler.jsonc", "--var", "CORE_API_ORIGIN:https://core.example.test"],
    ]);
  });

  it.each([1, 2, 3, 4, 5])("stops after failing build/publication stage %i", (stage) => {
    const { result, commands } = runProduction({ FAKE_FAIL_CALL: String(stage) });
    expect(result.status).toBe(17);
    expect(commands).toHaveLength(stage);
  });

  it("keeps nonproduction independent of approval, SHA, branch and status", () => {
    const { result, commands, allCommands } = runDeploy({
      TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "invalid",
      TOONSPECTRUM_APPROVED_MAIN_SHA: "invalid",
      FAKE_BRANCH: "feature/test",
      FAKE_STATUS: " M file",
    });
    expect(result.status).toBe(0);
    expect(allCommands).toEqual(commands);
    expect(commands[4].args).toContain("--dry-run");
  });
});
