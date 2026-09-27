#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_CONSUMERS = [
  "package.json", "apps/api/package.json", "packages/contracts/package.json",
  "packages/studio-project-model/package.json",
  "packages/studio-format-gateway/package.json",
  "packages/studio-engine-registry/package.json",
];

export function compareFrozenMigrationChecksums(expected, current) {
  const actual = new Map(current.map((entry) => [entry.id, entry.sha256]));
  return expected.flatMap((entry) => actual.get(entry.id) === entry.sha256
    ? [] : [`기배포 마이그레이션 원문 불일치: ${entry.id}`]);
}

export function compareSchemaVersions(consumers) {
  const expected = consumers[0]?.declared;
  if (!expected || !/^\d+\.\d+\.\d+$/u.test(expected)) {
    return ["공유 Zod 런타임은 정확한 버전으로 고정해야 합니다."];
  }
  return consumers.flatMap((consumer) =>
    consumer.declared === expected && consumer.installed === expected
      ? [] : [`공유 Zod 런타임 버전 불일치: ${consumer.path}`]);
}

export function collectProductionCompatibilityIssues(root = ROOT) {
  const baseline = JSON.parse(readFileSync(resolve(root,
    "config/production-migration-baseline.json"), "utf8"));
  const current = baseline.migrations.map((entry) => {
    if (!/^\d{4}_[a-z0-9_]+$/u.test(entry.id) || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      throw new Error("마이그레이션 기준 원장의 식별자 또는 체크섬이 올바르지 않습니다.");
    }
    const path = resolve(root, "apps/api/src/platform/database/migrations", `${entry.id}.sql`);
    return { id: entry.id, sha256: existsSync(path)
      ? createHash("sha256").update(readFileSync(path)).digest("hex") : null };
  });
  const consumers = SCHEMA_CONSUMERS.map((path) => {
    const manifest = resolve(root, path);
    const declared = JSON.parse(readFileSync(manifest, "utf8")).dependencies?.zod;
    const installed = createRequire(manifest)("zod/package.json").version;
    return { path, declared, installed };
  });
  const issues = [
    ...compareFrozenMigrationChecksums(baseline.migrations, current),
    ...compareSchemaVersions(consumers),
  ];
  // 제품 표기는 ToonStudio지만 기존 운영 리소스와 영속 데이터의 ID는 바꾸지 않는다.
  const worker = JSON.parse(readFileSync(resolve(root,
    "deploy/cloudflare-static/wrangler.jsonc"), "utf8"));
  if (worker.name !== "toonspectrum-web" || worker.keep_vars !== true
    || worker.r2_buckets?.length !== 1
    || worker.r2_buckets[0].binding !== "LARGE_ASSETS"
    || worker.r2_buckets[0].bucket_name !== "toonspectrum-public-assets") {
    issues.push("기존 Cloudflare 운영 Worker 또는 R2 버킷 식별자가 변경되었습니다.");
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const issues = collectProductionCompatibilityIssues();
    if (issues.length > 0) throw new Error(issues.join("\n"));
    console.log("운영 호환성 통과: 기배포 SQL 원문, 공유 Zod 런타임, 기존 Worker·R2 식별자");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "운영 호환성 검사 실패");
    process.exitCode = 1;
  }
}
