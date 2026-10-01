import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * wasm 커널 재현 빌드 테스트(Rust 툴체인이 있을 때만).
 *
 * 커밋된 `pkg/sumi_kernel.wasm`이 소스(`src/lib.rs`·`Cargo.toml`·`Cargo.lock`)에서 **빈 타깃 디렉터리의 클린 빌드로**
 * 바이트 단위로 다시 만들어지는지 확인한다(`build.sh --check`: 두 번째 빌드 산출물 ↔ pkg 바이트 비교 + INTEGRITY.sha256 검증 +
 * 생성 파일 kernel-integrity.ts·kernel-embedded.ts 일치). 임시 TMPDIR로 서로 다른 두 번의 클린 빌드를 돌려 산출물끼리도 비교한다.
 * `cargo` 또는 `wasm32-unknown-unknown` 타깃이 없는 환경(CI 일부)에서는 건너뛴다 — 봉인 자체(INTEGRITY ↔ 파일)는 wasm-kernel-seal.test.ts가 항상 검증한다.
 */
const KERNEL_DIR = fileURLToPath(new URL("../../wasm/sumi-kernel/", import.meta.url));
const BUILD_SH = path.join(KERNEL_DIR, "build.sh");

function toolchainAvailable(): boolean {
  if (!existsSync(BUILD_SH)) return false;
  const cargo = spawnSync("cargo", ["--version"], { encoding: "utf8" });
  if (cargo.status !== 0) return false;
  const targets = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  // rustup이 없는 환경(시스템 rustc)이면 타깃 목록을 알 수 없으므로 빌드를 시도해 본다.
  return targets.status !== 0 || targets.stdout.includes("wasm32-unknown-unknown");
}

const sha256 = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

function cleanBuildCheck(tmp: string): { status: number | null; output: string; builtWasm: string } {
  const run = spawnSync("bash", [BUILD_SH, "--check"], {
    cwd: KERNEL_DIR,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: tmp },
    timeout: 240_000,
  });
  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`,
    builtWasm: path.join(tmp, "sumi-kernel-target", "wasm32-unknown-unknown", "release", "sumi_kernel.wasm"),
  };
}

describe.skipIf(!toolchainAvailable())("wasm 커널 재현 빌드(Rust 툴체인 필요)", () => {
  it("빈 타깃 디렉터리 두 곳의 클린 빌드가 서로, 그리고 커밋된 pkg/sumi_kernel.wasm과 바이트 동일하다", () => {
    const dirs = [mkdtempSync(path.join(tmpdir(), "sumi-kernel-repro-a-")), mkdtempSync(path.join(tmpdir(), "sumi-kernel-repro-b-"))];
    try {
      const committed = sha256(path.join(KERNEL_DIR, "pkg", "sumi_kernel.wasm"));
      const hashes: string[] = [];
      for (const dir of dirs) {
        const result = cleanBuildCheck(dir);
        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("ok: 재빌드 바이트 동일");
        hashes.push(sha256(result.builtWasm));
      }
      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[0]).toBe(committed);
    } finally {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it("빌드가 저장소 안에 target/ 디렉터리를 만들지 않는다(CARGO_TARGET_DIR은 임시 디렉터리)", () => {
    expect(existsSync(path.join(KERNEL_DIR, "target"))).toBe(false);
  });
});
