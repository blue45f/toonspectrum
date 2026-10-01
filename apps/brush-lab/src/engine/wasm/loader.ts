import { LaneUnavailableError } from "../core/errors";
import { sha256Hex } from "../core/hash";

import { SUMI_KERNEL_ABI_VERSION, SUMI_KERNEL_EXPORTS } from "./kernel-abi";

import type { SumiKernelExports } from "./kernel-abi";

/**
 * Sumi wasm 커널 로더. 호스트(앱·테스트)가 `.wasm` 바이트와 기대 SHA-256을 주입한다 — 엔진은 `fetch`·`fs`를 쓰지 않는다.
 * - 바이트 변조(SHA-256 불일치) → `LaneUnavailableError("wasm-integrity-mismatch")`
 * - export 집합·ABI 버전·import 유무가 계약과 다름 → 같은 코드(다른 산출물)
 * - 컴파일·인스턴스화 실패 → 같은 코드에 원인 메시지
 * 무음 대체는 없다: 로드 실패 시 레인은 unavailable로 드러난다(ADR-0018).
 */

/** 로드된 커널. 뷰는 호출마다 만든다(선형 메모리가 `sk_alloc`에서 늘어나면 이전 ArrayBuffer가 분리된다). */
export interface SumiKernel {
  readonly exports: SumiKernelExports;
  readonly sha256: string;
  readonly byteLength: number;
  readonly abiVersion: number;
  /** 0 초기화 블록. 메모리 부족이면 `LaneUnavailableError`. */
  alloc(bytes: number): number;
  free(ptr: number, bytes: number): void;
  f32(ptr: number, count: number): Float32Array;
  f64(ptr: number, count: number): Float64Array;
  u32(ptr: number, count: number): Uint32Array;
  /** `hashNoise2D` 미러(TS와 비트 비교 가능). */
  hashNoise(x: number, y: number, seed: number): number;
  /** `superellipseCoverage` 미러. */
  coverage(dx: number, dy: number, rx: number, ry: number, angle: number, hardness: number, shapeExp: number, deposition: number): number;
}

function mismatch(message: string, details: Record<string, unknown> = {}): LaneUnavailableError {
  return new LaneUnavailableError("wasm-integrity-mismatch", message, details);
}

/** INTEGRITY.sha256(`# 주석` + `sha256  path` 줄들)에서 경로별 해시를 읽는다. */
export function parseIntegrity(text: string): { header: string; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  let header = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) {
      if (header === "") header = line.slice(1).trim();
      continue;
    }
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!m) throw new RangeError(`INTEGRITY 줄 형식 오류: ${line}`);
    entries.set(m[2] ?? "", m[1] ?? "");
  }
  return { header, entries };
}

export async function loadSumiKernel(bytes: Uint8Array, expectedSha256: string): Promise<SumiKernel> {
  const actual = await sha256Hex(bytes);
  if (actual !== expectedSha256.toLowerCase()) {
    throw mismatch(`wasm SHA-256 불일치: 기대 ${expectedSha256}, 실제 ${actual}`, { expected: expectedSha256, actual, byteLength: bytes.byteLength });
  }
  let module: WebAssembly.Module;
  try {
    // 복사본을 넘긴다(공유 버퍼·오프셋 뷰 문제를 피한다).
    module = await WebAssembly.compile(bytes.slice());
  } catch (error) {
    throw mismatch(`wasm 컴파일 실패: ${String(error)}`, { stage: "compile" });
  }
  const imports = WebAssembly.Module.imports(module);
  if (imports.length > 0) {
    throw mismatch(`wasm이 import ${imports.length}개를 요구한다(커널은 import가 없어야 한다)`, { imports: imports.map((i) => `${i.module}.${i.name}`) });
  }
  const names = WebAssembly.Module.exports(module).map((e) => e.name);
  const expectedNames = [...SUMI_KERNEL_EXPORTS].sort();
  if (names.slice().sort().join(",") !== expectedNames.join(",")) {
    throw mismatch("wasm export 집합이 ABI 계약과 다르다", { exports: names.slice().sort(), expected: expectedNames });
  }
  let instance: WebAssembly.Instance;
  try {
    instance = await WebAssembly.instantiate(module, {});
  } catch (error) {
    throw mismatch(`wasm 인스턴스화 실패: ${String(error)}`, { stage: "instantiate" });
  }
  const exports = instance.exports as unknown as SumiKernelExports;
  const abiVersion = exports.sk_abi_version();
  if (abiVersion !== SUMI_KERNEL_ABI_VERSION) {
    throw mismatch(`wasm ABI 버전 ${abiVersion} ≠ ${SUMI_KERNEL_ABI_VERSION}`, { abiVersion });
  }
  const memory = exports.memory;
  return {
    exports,
    sha256: actual,
    byteLength: bytes.byteLength,
    abiVersion,
    alloc(size: number): number {
      const ptr = exports.sk_alloc(size);
      if (ptr === 0 && size > 0) {
        throw new LaneUnavailableError("wasm-artifact-missing", `wasm 메모리 할당 실패(${size} B)`, { bytes: size });
      }
      return ptr;
    },
    free(ptr: number, size: number): void {
      exports.sk_free(ptr, size);
    },
    f32: (ptr, count) => new Float32Array(memory.buffer, ptr, count),
    f64: (ptr, count) => new Float64Array(memory.buffer, ptr, count),
    u32: (ptr, count) => new Uint32Array(memory.buffer, ptr, count),
    hashNoise: (x, y, seed) => exports.sk_hash_noise(x | 0, y | 0, seed >>> 0),
    coverage: (dx, dy, rx, ry, angle, hardness, shapeExp, deposition) =>
      exports.sk_coverage(dx, dy, rx, ry, angle, hardness, shapeExp, deposition >>> 0),
  };
}
