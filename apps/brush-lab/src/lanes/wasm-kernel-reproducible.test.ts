import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * wasm 커널 재현 빌드 테스트(Rust 툴체인 필수).
 *
 * 커밋된 `pkg/sumi_kernel.wasm`이 소스(`src/lib.rs`·`Cargo.toml`·`Cargo.lock`)에서 **빈 타깃 디렉터리의 클린 빌드로**
 * 바이트 단위로 다시 만들어지는지 확인한다(`build.sh --check`: 두 번째 빌드 산출물 ↔ pkg 바이트 비교 + 봉인된 rustc 버전 일치 +
 * INTEGRITY.sha256 검증 + 생성 파일 kernel-integrity.ts·kernel-embedded.ts 일치). 임시 TMPDIR로 서로 다른 두 번의 클린 빌드를 돌려
 * 산출물끼리도 비교한다. 봉인 자체(INTEGRITY ↔ 파일)는 wasm-kernel-seal.test.ts가 항상 검증하지만, 그것만으로는 "소스와 무관한
 * 바이너리를 같은 해시로 다시 봉인한" 변조를 못 잡는다 — 그것을 잡는 것이 이 테스트다.
 *
 * 툴체인(cargo + wasm32-unknown-unknown)이 없을 때(무음 통과 금지 — apps/brush-lab/AGENTS.md "테스트 skip 금지"):
 * - 기본: **실패한다.** 메시지에 설치 방법이 담긴다. skip하지 않는다.
 * - 로컬 한정 옵트아웃: `SUMI_KERNEL_REPRO_OPTIONAL=1`이면 재현 빌드를 실행하지 못했다는 경고를 stderr에 남기고 통과시킨다
 *   (Rust 없이 앱 로컬 테스트만 돌리는 개발 환경용).
 * - CI(`CI` 환경변수가 참)에서는 옵트아웃을 무시하고 항상 실패한다. 그래서 CI에서 재현성이 실행되지 않은 채 녹색이 될 수 없다.
 *   `architecture-boundaries.yml`·`full-test-diagnostic.yml`이 Rust 1.97.0 + wasm32 타깃을 설치하고 이 테스트를 실제로 실행한다.
 */
const KERNEL_DIR = fileURLToPath(new URL("../../wasm/sumi-kernel/", import.meta.url));
const BUILD_SH = path.join(KERNEL_DIR, "build.sh");

const OPT_OUT_ENV = "SUMI_KERNEL_REPRO_OPTIONAL";
const INSTALL_HINT = "rustup toolchain install 1.97.0 --profile minimal --target wasm32-unknown-unknown && rustup default 1.97.0";

/** 툴체인 문제(없으면 null). rustup이 없는 환경(시스템 rustc)이면 타깃 목록을 알 수 없으므로 빌드를 시도해 본다. */
function toolchainProblem(): string | null {
  if (!existsSync(BUILD_SH)) return `build.sh가 없다: ${BUILD_SH}`;
  const cargo = spawnSync("cargo", ["--version"], { encoding: "utf8" });
  if (cargo.error || cargo.status !== 0) return "cargo를 실행할 수 없다(Rust 툴체인 미설치)";
  const targets = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  if (!targets.error && targets.status === 0 && !targets.stdout.includes("wasm32-unknown-unknown")) {
    return "wasm32-unknown-unknown 타깃이 설치돼 있지 않다";
  }
  return null;
}

type ToolchainPolicy = "run" | "fail" | "warn-and-pass";

/**
 * 툴체인 상태에 따른 처리. 무음 통과는 없다: 실행하거나, 실패하거나, (로컬 옵트아웃일 때만) 경고를 남기고 통과한다.
 * CI에서는 옵트아웃이 있어도 실패한다.
 */
function toolchainPolicy(input: { problem: string | null; optOut: boolean; ci: boolean }): ToolchainPolicy {
  if (input.problem === null) return "run";
  return input.optOut && !input.ci ? "warn-and-pass" : "fail";
}

function isCi(env: NodeJS.ProcessEnv): boolean {
  const value = (env.CI ?? "").trim().toLowerCase();
  return value !== "" && value !== "0" && value !== "false";
}

const PROBLEM = toolchainProblem();

/** true면 재현 빌드를 실행한다. 툴체인이 없으면 정책대로 던지거나(실패) 경고 뒤 false(로컬 옵트아웃)를 돌려준다. */
function requireToolchain(): boolean {
  const ci = isCi(process.env);
  const policy = toolchainPolicy({ problem: PROBLEM, optOut: process.env[OPT_OUT_ENV] === "1", ci });
  if (policy === "run") return true;
  if (policy === "warn-and-pass") {
    console.warn(
      `[wasm-kernel-reproducible] 경고: 재현 빌드를 실행하지 못했다(${PROBLEM}). ${OPT_OUT_ENV}=1 로컬 옵트아웃이라 통과로 처리하지만 ` +
        "커밋된 .wasm의 소스 재현성은 이번 실행에서 검증되지 않았다. CI에서는 이 옵트아웃이 허용되지 않는다.",
    );
    return false;
  }
  throw new Error(
    `wasm 커널 재현 빌드를 실행할 수 없다: ${PROBLEM}. 설치: ${INSTALL_HINT}` +
      (ci ? " (CI에서는 옵트아웃이 허용되지 않는다)" : ` (로컬에서 의도적으로 건너뛰려면 ${OPT_OUT_ENV}=1)`),
  );
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

describe("wasm 커널 재현 빌드(Rust 툴체인 필수)", () => {
  it("빈 타깃 디렉터리 두 곳의 클린 빌드가 서로, 그리고 커밋된 pkg/sumi_kernel.wasm과 바이트 동일하다", () => {
    if (!requireToolchain()) return;
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

  it("build.sh --check는 rustc 버전이 봉인과 다르면 빌드 전에 원인을 밝히며 실패한다(툴체인 없이도 검증)", () => {
    const shimDir = mkdtempSync(path.join(tmpdir(), "sumi-kernel-shim-"));
    try {
      // 존재 확인(`command -v cargo`)만 통과하는 가짜 cargo와, 봉인과 다른 버전을 말하는 가짜 rustc. 실제 빌드는 시도되지 않는다.
      for (const [name, body] of [
        ["cargo", "#!/bin/sh\necho 'cargo 0.0.0 (shim)'\n"],
        ["rustc", "#!/bin/sh\necho 'rustc 0.0.0 (0000000 2000-01-01)'\n"],
      ] as const) {
        const file = path.join(shimDir, name);
        writeFileSync(file, body);
        chmodSync(file, 0o755);
      }
      const run = spawnSync("bash", [BUILD_SH, "--check"], {
        cwd: KERNEL_DIR,
        encoding: "utf8",
        env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}`, TMPDIR: shimDir },
        timeout: 60_000,
      });
      const output = `${run.stdout}${run.stderr}`;
      expect(run.status, output).toBe(1);
      expect(output).toContain("rustc 버전이 봉인과 다르다");
      expect(output).toContain("rustc 0.0.0 (0000000 2000-01-01)");
      // 봉인 헤더(INTEGRITY.sha256 첫 줄)의 버전이 그대로 보고된다.
      const sealed = readFileSync(path.join(KERNEL_DIR, "pkg", "INTEGRITY.sha256"), "utf8").split("\n")[0] ?? "";
      expect(sealed.startsWith("# rustc ")).toBe(true);
      expect(output).toContain(sealed.slice(2, sealed.indexOf(" / target")));
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["툴체인 있음", { problem: null, optOut: false, ci: false }, "run"],
    ["툴체인 있음 + 옵트아웃·CI는 무관", { problem: null, optOut: true, ci: true }, "run"],
    ["툴체인 없음: 기본은 실패(skip 아님)", { problem: "cargo 없음", optOut: false, ci: false }, "fail"],
    ["툴체인 없음 + 로컬 옵트아웃: 경고 뒤 통과", { problem: "cargo 없음", optOut: true, ci: false }, "warn-and-pass"],
    ["툴체인 없음 + CI: 옵트아웃이 있어도 실패", { problem: "cargo 없음", optOut: true, ci: true }, "fail"],
    ["툴체인 없음 + CI, 옵트아웃 없음: 실패", { problem: "cargo 없음", optOut: false, ci: true }, "fail"],
  ] as const)("툴체인 정책: %s", (_name, input, expected) => {
    expect(toolchainPolicy(input)).toBe(expected);
  });

  it.each([
    [{}, false],
    [{ CI: "" }, false],
    [{ CI: "0" }, false],
    [{ CI: "false" }, false],
    [{ CI: "FALSE" }, false],
    [{ CI: "1" }, true],
    [{ CI: "true" }, true],
  ] as const)("CI 환경변수 판정: %j → %s", (env, expected) => {
    expect(isCi(env)).toBe(expected);
  });
});
