#!/usr/bin/env node

// 정적 배포 산출물의 서비스 워커 검증.
// Cloudflare Static Assets는 `not_found_handling: single-page-application`이라 dist에
// sw.js가 없으면 index.html(text/html)을 200으로 돌려준다. 브라우저는 그 응답을 워커로
// 설치하지 못해 업데이트 확인이 조용히 실패하고, "새 버전이 준비됐습니다" 안내도 뜨지 않는다.
// 앱이 /sw.js 등록 코드를 싣고 있다면 워커 파일도 반드시 함께 배포되어야 한다.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRATION_ENTRY = "src/app/service-worker/studio-service-worker-registration.ts";
const MIN_WORKER_BYTES = 1024;
// 빌드가 주입한 precache 매니페스트(buildId: sha256 hex 앞 12자)가 워커 번들에 있어야 한다.
// 압축기는 문자열을 백틱 리터럴로 바꾸기도 한다(`buildId:\`0123456789ab\``).
const BUILD_ID_PATTERN = /["']?buildId["']?\s*:\s*(["'`])[0-9a-f]{8,}\1/u;

export function verifyStaticServiceWorker({ distDirectory }) {
  const problems = [];
  const manifestPath = join(distDirectory, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, problems: [`앱 빌드 매니페스트가 없습니다: ${manifestPath}`] };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { ok: false, problems: [`앱 빌드 매니페스트를 읽지 못했습니다: ${String(error)}`] };
  }
  if (!Object.hasOwn(manifest, REGISTRATION_ENTRY)) {
    // 등록 코드가 없는 빌드라면 워커 파일을 요구하지 않는다.
    return { ok: true, problems };
  }

  const workerPath = join(distDirectory, "sw.js");
  if (!existsSync(workerPath)) {
    problems.push("dist/sw.js가 없습니다. 이대로 배포하면 /sw.js가 index.html로 응답해 PWA 업데이트 안내가 멈춥니다.");
    return { ok: false, problems };
  }
  const bytes = statSync(workerPath).size;
  const source = readFileSync(workerPath, "utf8");
  if (/^\s*</u.test(source)) {
    problems.push("dist/sw.js가 JavaScript가 아니라 HTML입니다.");
  }
  if (bytes < MIN_WORKER_BYTES) {
    problems.push(`dist/sw.js가 너무 작습니다(${bytes} B). 서비스 워커 번들이 비어 있을 수 있습니다.`);
  }
  if (!BUILD_ID_PATTERN.test(source)) {
    problems.push("dist/sw.js에 precache 매니페스트(buildId)가 없습니다.");
  }
  return { ok: problems.length === 0, problems };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const distArgument = process.argv.find((argument) => argument.startsWith("--dist="));
  const distDirectory = distArgument
    ? resolve(distArgument.slice("--dist=".length))
    : join(repositoryRoot, "dist");
  const { ok, problems } = verifyStaticServiceWorker({ distDirectory });
  if (!ok) {
    console.error("서비스 워커 산출물 검증 실패:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`서비스 워커 산출물 확인: ${join(distDirectory, "sw.js")}`);
}
