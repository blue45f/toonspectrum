#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";

const mode = process.argv.includes("--production") ? "production" : "dry-run";
const approval = process.env.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL;
const rawOrigin = process.env.CLOUDFLARE_CORE_API_ORIGIN
  ?? (mode === "dry-run" ? "https://core.invalid" : "");

function fail(message) {
  console.error(message);
  process.exit(1);
}

let coreOrigin;
try {
  coreOrigin = new URL(rawOrigin);
} catch {
  fail("CLOUDFLARE_CORE_API_ORIGIN must be an absolute HTTPS origin");
}
if (
  coreOrigin.protocol !== "https:"
  || coreOrigin.username !== ""
  || coreOrigin.password !== ""
  || coreOrigin.pathname !== "/"
  || coreOrigin.search !== ""
  || coreOrigin.hash !== ""
) {
  fail("CLOUDFLARE_CORE_API_ORIGIN must be an HTTPS origin without credentials or a path");
}

if (mode === "production") {
  if (approval !== "cloudflare-static-production") {
    fail("production deploy requires TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production");
  }
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  if (branch !== "main") fail(`production deploy requires main (current: ${branch || "detached"})`);
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status !== "") fail("production deploy requires a clean worktree");
}

for (const command of [
  ["pnpm", ["run", "generate:cloudflare-static-rules", "--", "--check"]],
  ["pnpm", ["run", "build"]],
  [
    "pnpm",
    [
      "exec",
      "wrangler",
      "deploy",
      ...(mode === "dry-run" ? ["--dry-run"] : []),
      "--config",
      "deploy/cloudflare-static/wrangler.jsonc",
      "--var",
      `CORE_API_ORIGIN:${coreOrigin.origin}`,
    ],
  ],
]) {
  const result = spawnSync(command[0], command[1], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
