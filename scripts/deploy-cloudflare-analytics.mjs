#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

export function analyticsDeploymentConfig(environment, production, gitState) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  if ((production || accountId !== undefined) && !/^[a-f0-9]{32}$/u.test(accountId ?? "")) {
    throw new Error("검토한 계정의 CLOUDFLARE_ACCOUNT_ID를 32자리로 명시하세요.");
  }
  const databaseId = environment.TRAFFIC_ANALYTICS_D1_DATABASE_ID
    ?? (production ? "" : "00000000-0000-0000-0000-000000000000");
  if (!UUID.test(databaseId) || (production && /^0+(?:-0+)*$/u.test(databaseId))) {
    throw new Error("검증된 TRAFFIC_ANALYTICS_D1_DATABASE_ID가 필요합니다.");
  }
  if (production) {
    if (environment.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL !== "cloudflare-analytics-production") {
      throw new Error("분석 Worker의 별도 수동 운영 배포 승인이 필요합니다.");
    }
    const sha = environment.TOONSPECTRUM_APPROVED_MAIN_SHA;
    if (!/^[a-f0-9]{40}$/u.test(sha ?? "") || gitState?.head !== sha
      || gitState.branch !== "main" || gitState.dirty) {
      throw new Error("승인된 정확한 main SHA와 clean worktree가 필요합니다.");
    }
  }
  return {
    name: "toonspectrum-analytics",
    main: resolve(ROOT, "deploy/cloudflare-analytics/src/index.ts"),
    compatibility_date: "2026-07-30",
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: false },
    d1_databases: [{ binding: "ANALYTICS_DB", database_name: "toonspectrum-analytics-buffer", database_id: databaseId }],
    secrets: { required: ["ANALYTICS_RPC_TOKEN"] },
    ...(accountId ? { account_id: accountId } : {}),
    ...(production ? { vars: { RELEASE_SHA: environment.TOONSPECTRUM_APPROVED_MAIN_SHA } } : {}),
  };
}

export function analyticsDeploymentSecrets(environment) {
  const token = environment.TRAFFIC_ANALYTICS_D1_RPC_TOKEN?.trim();
  if (!token || token.length < 32 || token.length > 4_096 || /\s/u.test(token)) {
    throw new Error("Core와 공유할 TRAFFIC_ANALYTICS_D1_RPC_TOKEN 비밀 환경변수를 설정하세요.");
  }
  return { ANALYTICS_RPC_TOKEN: token };
}

export function deployAnalyticsWorker(config, environment, production, runner = spawnSync) {
  const secrets = production ? analyticsDeploymentSecrets(environment) : undefined;
  const directory = mkdtempSync(resolve(tmpdir(), "toonspectrum-analytics-deploy-"));
  try {
    const path = resolve(directory, "wrangler.json");
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
    const args = ["exec", "wrangler", "deploy", "--config", path];
    if (secrets) {
      // 새 Worker는 required secret을 상속할 수 없어 최초 배포에도 비밀을 함께 전달한다.
      const secretsPath = resolve(directory, "secrets.json");
      writeFileSync(secretsPath, JSON.stringify(secrets), { mode: 0o600 });
      args.push("--secrets-file", secretsPath);
    } else args.push("--dry-run");
    const childEnvironment = { ...environment };
    delete childEnvironment.TRAFFIC_ANALYTICS_D1_RPC_TOKEN;
    delete childEnvironment.ANALYTICS_RPC_TOKEN;
    const result = runner("pnpm", args, { cwd: ROOT, stdio: "inherit", env: childEnvironment });
    if (result.status !== 0) throw new Error("분석 Worker 빌드/배포 실패. 자동 재시도하지 않았습니다.");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--production"].includes(args[0])) {
    throw new Error("--dry-run 또는 --production 하나만 지정하세요.");
  }
  const production = args[0] === "--production";
  const readGit = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const config = analyticsDeploymentConfig(process.env, production, production ? {
    head: readGit("rev-parse", "HEAD"), branch: readGit("branch", "--show-current"),
    dirty: readGit("status", "--porcelain") !== "",
  } : undefined);
  deployAnalyticsWorker(config, process.env, production);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { cli(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "분석 Worker 배포 실패"}\n`);
    process.exitCode = 1;
  }
}
