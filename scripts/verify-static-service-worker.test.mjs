import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { verifyStaticServiceWorker } from "./verify-static-service-worker.mjs";

const REGISTRATION_ENTRY = "src/app/service-worker/studio-service-worker-registration.ts";
const temporaryDirectories = [];

function createDist({ registers = true, worker } = {}) {
  const distDirectory = mkdtempSync(join(tmpdir(), "toonstudio-sw-verify-"));
  temporaryDirectories.push(distDirectory);
  mkdirSync(join(distDirectory, ".vite"), { recursive: true });
  const manifest = {
    "index.html": { file: "assets/index-abc.js", isEntry: true },
    ...(registers ? { [REGISTRATION_ENTRY]: { file: "assets/studio-service-worker-registration-abc.js" } } : {}),
  };
  writeFileSync(join(distDirectory, ".vite", "manifest.json"), JSON.stringify(manifest));
  if (worker !== undefined) writeFileSync(join(distDirectory, "sw.js"), worker);
  return distDirectory;
}

const validWorker = `(function(){const m={buildId:"${"a1b2c3".repeat(2)}",shellUrls:["/"]};${"self.addEventListener(`install`,()=>{});".repeat(40)}})();`;

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("정적 배포 서비스 워커 산출물 검증", () => {
  it("등록 코드를 싣는 빌드에서 sw.js가 없으면 배포를 막는다", () => {
    const result = verifyStaticServiceWorker({ distDirectory: createDist() });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/sw.js가 없습니다");
  });

  it("SPA 대체 HTML이 sw.js 자리에 들어가면 막는다", () => {
    const html = `<!doctype html><html lang="ko"><head></head><body>${"<div></div>".repeat(200)}</body></html>`;
    const result = verifyStaticServiceWorker({ distDirectory: createDist({ worker: html }) });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("HTML");
  });

  it("precache 매니페스트가 빠진 워커 번들을 막는다", () => {
    const worker = `(function(){${"self.addEventListener(`fetch`,()=>{});".repeat(60)}})();`;
    const result = verifyStaticServiceWorker({ distDirectory: createDist({ worker }) });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("buildId");
  });

  it("빌드 매니페스트를 주입한 워커 번들은 통과한다", () => {
    expect(verifyStaticServiceWorker({ distDirectory: createDist({ worker: validWorker }) })).toEqual({ ok: true, problems: [] });
  });

  it("압축기가 백틱 리터럴로 바꾼 buildId도 인식한다", () => {
    const worker = validWorker.replace(`buildId:"${"a1b2c3".repeat(2)}"`, "buildId:`0123456789ab`");
    expect(verifyStaticServiceWorker({ distDirectory: createDist({ worker }) }).ok).toBe(true);
  });

  it("등록 코드가 없는 빌드는 워커 파일을 요구하지 않는다", () => {
    expect(verifyStaticServiceWorker({ distDirectory: createDist({ registers: false }) }).ok).toBe(true);
  });

  it("앱 빌드 매니페스트가 없으면 검증 실패로 본다", () => {
    const distDirectory = mkdtempSync(join(tmpdir(), "toonstudio-sw-verify-"));
    temporaryDirectories.push(distDirectory);
    expect(verifyStaticServiceWorker({ distDirectory }).ok).toBe(false);
  });
});
