#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";

const mode = process.argv.includes("--production") ? "production" : "dry-run";
const approval = process.env.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL;
const rawOrigin = process.env.CLOUDFLARE_CORE_API_ORIGIN
  ?? (mode === "dry-run" ? "https://core.invalid" : "");

const OPTIONAL_SINGLE_ORIGINS = [
  ["CLOUDFLARE_SOCIAL_API_ORIGIN", "SOCIAL_API_ORIGIN"],
  ["CLOUDFLARE_PLAYGROUND_API_ORIGIN", "PLAYGROUND_API_ORIGIN"],
  ["CLOUDFLARE_ADMIN_API_ORIGIN", "ADMIN_API_ORIGIN"],
  ["CLOUDFLARE_REALTIME_API_ORIGIN", "REALTIME_API_ORIGIN"],
];
const MAX_PUBLIC_READ_ORIGINS = 8;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseOrigin(raw, environmentName) {
  let origin;
  try {
    origin = new URL(raw);
  } catch {
    fail(`${environmentName} must be an absolute HTTPS origin`);
  }
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    fail(`${environmentName} must be an HTTPS origin without credentials or a path`);
  }
  return origin.origin;
}

function optionalOriginVariable(environmentName, workerName) {
  const raw = process.env[environmentName]?.trim();
  if (!raw) return [];
  return ["--var", `${workerName}:${parseOrigin(raw, environmentName)}`];
}

function publicReadOriginVariable() {
  const environmentName = "CLOUDFLARE_PUBLIC_READ_API_ORIGINS";
  const raw = process.env[environmentName]?.trim();
  if (!raw) return [];
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0
    || values.length > MAX_PUBLIC_READ_ORIGINS
    || values.some((value) => value === "")
  ) {
    fail(`${environmentName} must contain 1-${MAX_PUBLIC_READ_ORIGINS} comma-separated HTTPS origins`);
  }
  const origins = values.map((value) => parseOrigin(value, environmentName));
  if (new Set(origins).size !== origins.length) {
    fail(`${environmentName} must not contain duplicate origins`);
  }
  return ["--var", `PUBLIC_READ_API_ORIGINS:${origins.join(",")}`];
}

const coreOrigin = parseOrigin(rawOrigin, "CLOUDFLARE_CORE_API_ORIGIN");
const routeVariables = [
  "--var",
  `CORE_API_ORIGIN:${coreOrigin}`,
  ...publicReadOriginVariable(),
  ...OPTIONAL_SINGLE_ORIGINS.flatMap(([environmentName, workerName]) =>
    optionalOriginVariable(environmentName, workerName)),
];

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
      ...routeVariables,
    ],
  ],
]) {
  const result = spawnSync(command[0], command[1], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
