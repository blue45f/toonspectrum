import { beforeAll, describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { LaneUnavailableError } from "../core/errors";
import { Pcg32, hashNoise2D } from "../core/rng";
import { superellipseCoverage } from "../raster/coverage";
import { binDabs } from "../raster/tile-binning";

import { embeddedKernelBytes, loadEmbeddedKernel } from "./embedded";
import { SUMI_KERNEL_ABI_VERSION, SUMI_KERNEL_EXPORTS } from "./kernel-abi";
import { SUMI_KERNEL_BYTE_LENGTH, SUMI_KERNEL_SHA256 } from "./kernel-integrity";
import { SumiKernelSession } from "./kernel-session";
import { loadSumiKernel } from "./loader";

import type { SumiKernel } from "./loader";
import type { DabInstance, DepositionModel } from "../core/types";

/**
 * wasm 커널 계약 테스트(Node `WebAssembly`). 커널은 TS 참조(`raster/coverage.ts`·`tile-binning.ts`·`core/rng.ts`)와
 * 같은 연산 순서의 Rust 구현이며, 여기서는
 * 1) 내장 바이트 로드·ABI·변조 거부, 2) 해시·커버리지·CSR 비닝이 TS 참조와 일치함을 고정한다.
 * 타일 래스터·표면 단위 일치는 wasm-surface.test.ts가 본다. `engine/**`는 `node:`를 쓰지 않으므로(경계 게이트) 파일 시스템이
 * 필요한 봉인 검사(INTEGRITY.sha256 ↔ 실제 파일·소스·내장 base64)와 재현 빌드(`build.sh --check`)는
 * `lanes/wasm-kernel-seal.test.ts`·`lanes/wasm-kernel-reproducible.test.ts`가 맡는다.
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let wasmBytes: Uint8Array;
let kernel: SumiKernel;

beforeAll(async () => {
  wasmBytes = embeddedKernelBytes();
  kernel = await loadSumiKernel(wasmBytes, SUMI_KERNEL_SHA256);
});

describe("내장 wasm 산출물", () => {
  it("내장 바이트의 SHA-256·길이가 kernel-integrity.ts와 같고 로드된다(파일 봉인 검사는 lanes/wasm-kernel-seal.test.ts)", async () => {
    expect(await sha256(wasmBytes)).toBe(SUMI_KERNEL_SHA256);
    expect(wasmBytes.byteLength).toBe(SUMI_KERNEL_BYTE_LENGTH);
    expect(wasmBytes.byteLength).toBeLessThanOrEqual(64 * 1024);
    const embedded = await loadEmbeddedKernel();
    expect(embedded.sha256).toBe(SUMI_KERNEL_SHA256);
    // 호출마다 새 인스턴스(별도 선형 메모리)다.
    const other = await loadEmbeddedKernel();
    expect(other.exports.memory).not.toBe(embedded.exports.memory);
  });
});

describe("loadSumiKernel", () => {
  it("export 집합·ABI 버전이 계약과 같고 import가 없다", () => {
    expect(kernel.abiVersion).toBe(SUMI_KERNEL_ABI_VERSION);
    expect(Object.keys(kernel.exports).sort()).toEqual([...SUMI_KERNEL_EXPORTS].sort());
    expect(kernel.sha256).toBe(SUMI_KERNEL_SHA256);
    expect(kernel.byteLength).toBe(wasmBytes.byteLength);
  });

  it("바이트가 한 비트라도 바뀌면 wasm-integrity-mismatch", async () => {
    const tampered = wasmBytes.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
    const err = await loadSumiKernel(tampered, SUMI_KERNEL_SHA256).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LaneUnavailableError);
    expect((err as LaneUnavailableError).code).toBe("wasm-integrity-mismatch");
  });

  it("기대 해시가 다르거나 잘린 바이트도 같은 코드로 거부한다(무음 대체 없음)", async () => {
    const wrong = await loadSumiKernel(wasmBytes, "0".repeat(64)).catch((e: unknown) => e);
    expect((wrong as LaneUnavailableError).code).toBe("wasm-integrity-mismatch");
    const truncated = wasmBytes.slice(0, 100);
    const cut = await loadSumiKernel(truncated, await sha256(truncated)).catch((e: unknown) => e);
    expect(cut).toBeInstanceOf(LaneUnavailableError);
    expect((cut as LaneUnavailableError).code).toBe("wasm-integrity-mismatch");
  });

  it("export가 다른 wasm(최소 모듈)은 ABI 불일치로 거부한다", async () => {
    // (module (func (export "sk_abi_version") (result i32) i32.const 1))
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x12, 0x01, 0x0e, 0x73, 0x6b, 0x5f,
      0x61, 0x62, 0x69, 0x5f, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x00, 0x00, 0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x01, 0x0b,
    ]);
    const err = await loadSumiKernel(bytes, await sha256(bytes)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LaneUnavailableError);
    expect((err as LaneUnavailableError).code).toBe("wasm-integrity-mismatch");
  });

  it("sk_alloc은 0 초기화 블록을 주고 0 바이트 요청은 널을 준다", () => {
    const ptr = kernel.alloc(64);
    expect(ptr).toBeGreaterThan(0);
    expect(Array.from(kernel.u32(ptr, 16)).every((v) => v === 0)).toBe(true);
    kernel.u32(ptr, 16).fill(7);
    kernel.free(ptr, 64);
    expect(kernel.exports.sk_alloc(0)).toBe(0);
  });
});

const f32 = Math.fround;

/** dab 값은 실제로 Float32Array에 담기는 f32 값이다(`sk_coverage`의 f32 인자와 TS의 f64 입력이 같아지도록 접는다). */
function randomDab(rng: Pcg32, deposition: DepositionModel): DabInstance {
  const rx = f32(0.3 + rng.nextF32() * 14);
  const ry = deposition === "dry-stamp" && rng.nextF32() < 0.5 ? rx : f32(0.3 + rng.nextF32() * 14);
  return {
    x: f32(rng.nextF32() * 200 - 20),
    y: f32(rng.nextF32() * 200 - 20),
    rx,
    ry,
    angle: f32(rng.nextF32() * 6.2),
    hardness: rng.nextF32(),
    flow: f32(0.2 + rng.nextF32() * 0.8),
    shapeExp: rng.nextF32() < 0.7 ? 2 : f32(1.5 + rng.nextF32() * 3),
    r: 0.2,
    g: 0.1,
    b: 0.05,
    a: 1,
    tipKind: "round",
    seed: Math.floor(rng.nextF32() * 1e6),
    grain: 0,
    wet: 0.3,
    pigmentMass: 0.5,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition,
  };
}

describe("wasm 커널 ↔ TS 참조 일치", () => {
  it("hashNoise: 정수 해시라 5,000개 입력에서 비트 동일(음수 좌표·큰 시드 포함)", () => {
    const rng = new Pcg32(11, 3);
    for (let i = 0; i < 5000; i += 1) {
      const x = Math.floor(rng.nextF32() * 4000) - 2000;
      const y = Math.floor(rng.nextF32() * 4000) - 2000;
      const seed = rng.nextU32();
      expect(kernel.hashNoise(x, y, seed), `${x},${y},${seed}`).toBe(hashNoise2D(x, y, seed));
    }
  });

  it("커버리지: 다항식·sqrt 경로(shapeExp 2)는 사실상 비트 동일, pow·exp 경로도 절대 오차 2e-6 이내", () => {
    const rng = new Pcg32(21, 5);
    let exactSquare = 0;
    let squareTotal = 0;
    let worst = 0;
    for (const deposition of ["dry-stamp", "airbrush", "spray", "bristle"] as const) {
      for (let i = 0; i < 1500; i += 1) {
        const dab = randomDab(rng, deposition);
        const dx = f32((rng.nextF32() - 0.5) * 40);
        const dy = f32((rng.nextF32() - 0.5) * 40);
        const expected = superellipseCoverage(dx, dy, dab);
        const actual = kernel.coverage(dx, dy, dab.rx, dab.ry, dab.angle, dab.hardness, dab.shapeExp, deposition === "airbrush" ? 1 : deposition === "spray" ? 2 : deposition === "bristle" ? 3 : 0);
        if (deposition !== "airbrush" && dab.shapeExp === 2) {
          squareTotal += 1;
          if (actual === expected) exactSquare += 1;
        }
        worst = Math.max(worst, Math.abs(actual - expected));
        // pow·exp는 구현(V8 fdlibm 계열 ↔ Rust libm)이 1 ulp 어긋날 수 있고, 가장자리에서 dn의 1 ulp가 rmin/feather(≤ 15)배로 커진다.
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2e-6);
      }
    }
    // sin/cos·sqrt 경로는 fdlibm 계열 구현이라 사실상 전부 비트 동일해야 한다(1% 미만의 예외만 허용).
    expect(exactSquare / squareTotal).toBeGreaterThan(0.99);
    expect(worst).toBeLessThanOrEqual(2e-6);
  });

  it("CSR 비닝: 임의 배치 400개 × 2 격자에서 TS binDabs와 counts·offsets·refs·dirty·overflow가 완전히 같다", () => {
    const session = new SumiKernelSession(kernel);
    const rng = new Pcg32(31, 7);
    for (const [tilesX, tilesY] of [[13, 9], [32, 32]] as const) {
      const batch = new DabBatch(400);
      for (let i = 0; i < 400; i += 1) {
        const deposition: DepositionModel = i % 7 === 0 ? "spray" : i % 5 === 0 ? "airbrush" : "dry-stamp";
        const dab = randomDab(rng, deposition);
        // 일부는 거대 dab(타일 수 상한 초과 → overflow), 일부는 캔버스 밖.
        if (i % 61 === 0) {
          dab.rx = 600;
          dab.ry = 600;
        }
        if (i % 47 === 0) dab.x = -5000;
        batch.push(dab);
      }
      session.uploadDabs(batch.data, batch.count);
      // 상한을 64타일로 낮춰 거대 dab가 실제로 overflow로 건너뛰어지게 한다(기본 4096은 이 격자보다 크다).
      const got = session.bin(tilesX, tilesY, 64);
      const want = binDabs(batch, tilesX, tilesY, 64);
      expect(Array.from(got.counts)).toEqual(Array.from(want.counts));
      expect(Array.from(got.offsets)).toEqual(Array.from(want.offsets));
      expect(Array.from(got.refs)).toEqual(Array.from(want.refs));
      expect(Array.from(got.dirtyTiles)).toEqual(Array.from(want.dirtyTiles));
      expect(got.dirtyCount).toBe(want.dirtyCount);
      expect(got.overflowDabs).toBe(want.overflowDabs);
      expect(want.overflowDabs).toBeGreaterThan(0);
    }
    session.dispose();
  });

  it("CSR 비닝: refs 용량 부족이면 호스트가 키워 다시 부른다(dab 수가 늘어도 결과 동일)", () => {
    const session = new SumiKernelSession(kernel);
    const rng = new Pcg32(41, 9);
    for (const n of [3, 900]) {
      const batch = new DabBatch(n);
      for (let i = 0; i < n; i += 1) batch.push(randomDab(rng, "dry-stamp"));
      session.uploadDabs(batch.data, batch.count);
      const got = session.bin(8, 8, 4096);
      const want = binDabs(batch, 8, 8);
      expect(Array.from(got.refs)).toEqual(Array.from(want.refs));
    }
    session.dispose();
  });

  it("dispose 뒤 세션 호출은 RangeError", () => {
    const session = new SumiKernelSession(kernel);
    session.dispose();
    expect(() => session.uploadDabs(new Float32Array(16), 1)).toThrow(RangeError);
  });
});
