import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { embeddedKernelBytes, loadEmbeddedKernel } from "../engine/wasm/embedded";
import { SUMI_KERNEL_BYTE_LENGTH, SUMI_KERNEL_SHA256 } from "../engine/wasm/kernel-integrity";
import { parseIntegrity } from "../engine/wasm/loader";

/**
 * wasm 커널 산출물 봉인 테스트(파일 시스템 필요 — `engine/**`는 `node:`를 쓰지 않으므로 레인 계층에 둔다).
 * 커밋된 `wasm/sumi-kernel/pkg/INTEGRITY.sha256`이 소스·산출물의 실제 SHA-256과 같고, 생성 파일(kernel-integrity.ts·
 * kernel-embedded.ts)이 같은 빌드에서 나왔음을 고정한다. 재빌드 바이트 동일성은 wasm-kernel-reproducible.test.ts가 본다.
 */
const KERNEL_DIR = new URL("../../wasm/sumi-kernel/", import.meta.url);
const readKernelFile = (rel: string): Buffer => readFileSync(new URL(rel, KERNEL_DIR));
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("wasm 산출물 봉인", () => {
  it("INTEGRITY.sha256이 Cargo.toml·Cargo.lock·src/lib.rs·pkg/sumi_kernel.wasm의 실제 SHA-256과 같다(소스와 산출물이 같은 빌드)", () => {
    const { header, entries } = parseIntegrity(readKernelFile("pkg/INTEGRITY.sha256").toString("utf8"));
    expect(header).toContain("rustc 1.97.0");
    expect(header).toContain("wasm32-unknown-unknown");
    expect([...entries.keys()].sort()).toEqual(["Cargo.lock", "Cargo.toml", "pkg/sumi_kernel.wasm", "src/lib.rs"]);
    for (const [path, hash] of entries) expect(sha256(readKernelFile(path)), path).toBe(hash);
  });

  it("kernel-integrity.ts(생성 파일)가 INTEGRITY의 wasm 해시·바이트 수와 같다", () => {
    const { entries } = parseIntegrity(readKernelFile("pkg/INTEGRITY.sha256").toString("utf8"));
    expect(SUMI_KERNEL_SHA256).toBe(entries.get("pkg/sumi_kernel.wasm"));
    expect(SUMI_KERNEL_BYTE_LENGTH).toBe(readKernelFile("pkg/sumi_kernel.wasm").byteLength);
  });

  it("내장 base64(kernel-embedded.ts)가 pkg/sumi_kernel.wasm과 바이트 동일하고 로드된다", async () => {
    expect(Buffer.from(embeddedKernelBytes()).equals(readKernelFile("pkg/sumi_kernel.wasm"))).toBe(true);
    const embedded = await loadEmbeddedKernel();
    expect(embedded.sha256).toBe(SUMI_KERNEL_SHA256);
  });

  it("산출물 ≤ 64 KiB, 외부 crate 0(Cargo.lock에 패키지 1개), target/ 무시 규칙이 있다", () => {
    expect(statSync(new URL("pkg/sumi_kernel.wasm", KERNEL_DIR)).size).toBeLessThanOrEqual(64 * 1024);
    const lock = readKernelFile("Cargo.lock").toString("utf8");
    expect((lock.match(/\[\[package\]\]/g) ?? []).length).toBe(1);
    // 외부 crate 0 = [dependencies] 테이블에 항목이 없어야 한다. 공백 뒤 한 글자만 보는 정규식은
    // 중첩 양쪽반복이라 ReDoS 위험이 있고, 테이블을 쪼개 직접 세면 선형 시간에 정확히 판정된다.
    const cargoTomlSections = readKernelFile("Cargo.toml")
      .toString("utf8")
      .split(/^\[/m)
      .slice(1);
    const dependencyEntries = cargoTomlSections
      .filter((section) => /^(dependencies\]|dependencies\.)/.test(section))
      .flatMap((section) => section.split("\n").slice(1))
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(dependencyEntries).toEqual([]);
    expect(readKernelFile(".gitignore").toString("utf8")).toContain("/target/");
    expect(readKernelFile("build.sh").toString("utf8")).toContain("CARGO_TARGET_DIR");
  });
});
