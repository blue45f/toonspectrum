import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { embeddedKernelBytes } from "../engine/wasm/embedded";
import { SUMI_KERNEL_SHA256 } from "../engine/wasm/kernel-integrity";
import { loadSumiKernel } from "../engine/wasm/loader";
import { WasmSurface } from "../engine/wasm/wasm-surface";

import { emptyLaneStats, unavailableReport } from "./lane";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneInit,
  LaneStats,
  StrokeReceipt,
} from "./lane";
import type { Clock, LabImage, RawSample } from "../engine/core/types";
import type { LatencyRecord } from "../engine/input/input-pipeline";
import type { BrushProgram } from "../engine/presets/program-schema";
import type { SumiKernel } from "../engine/wasm/loader";

/**
 * wasm-cpu 레인: `StrokePipeline`(TS, 입력→물리→dab) → `WasmSurface`(Rust C-ABI wasm 커널이 CSR 비닝과 타일 래스터를 수행).
 * GPU 없이 도는 후보 레인이며 cpu-reference와 같은 수식·순서의 f32 미러다(문서 일치는 `engine/wasm/wasm-surface.test.ts`).
 *
 * - wasm 바이트: `env.wasmBytes`가 `undefined`면 내장 바이트(`engine/wasm/kernel-embedded.ts`), `null`이면 "산출물 없음"으로
 *   간주해 `wasm-artifact-missing`, 바이트가 있으면 그 바이트를 `kernel-integrity.ts`의 SHA-256과 대조한다(변조 → `wasm-integrity-mismatch`).
 * - 범위: 9개 침착 모델 전부. `WasmSurface`는 CPU `Surface`를 상속해 습식 층(수채 안료·유화 물감)·플래튼·표시 합성을 TS 참조 그대로
 *   쓰고 타일 래스터와 CSR 비닝만 wasm으로 바꾼다. 임파스토는 타일을 가로지르는 dab 순서 패스(유화 물감 층)가 wasm 타일 커널 밖이라
 *   TS `applyImpastoDabs`를 호출하고 임파스토 dab는 타일 래스터에서 건너뛴다(CPU와 같다).
 * - 영수증 의미는 cpu-reference와 같다(프레임당 래스터 호출 1회 = `submitCount` 1, 더럽혀진 타일 수 = `dispatchCount`).
 */
export const WASM_CPU_LANE_ID = "wasm-cpu" as const;

function kernelBytesFor(env: LaneEnvironment): Uint8Array {
  if (env.wasmBytes === null) {
    throw new LaneUnavailableError("wasm-artifact-missing", "wasm 산출물이 주입되지 않았다(env.wasmBytes = null)");
  }
  return env.wasmBytes ?? embeddedKernelBytes();
}

/**
 * 환경에서 wasm 커널을 로드한다(wasm-cpu·wasm-gpu-hybrid 레인 공용). 실패는 모두 `LaneUnavailableError`(probe가 사유 코드로 바꾼다).
 * 호출마다 새 인스턴스(별도 선형 메모리)다.
 */
export async function loadWasmKernelForEnv(env: LaneEnvironment): Promise<SumiKernel> {
  const bytes = kernelBytesFor(env);
  return loadSumiKernel(bytes, SUMI_KERNEL_SHA256);
}

/** 커널 로드 실패 → 레인 사유 코드. */
export function wasmReasonOf(error: unknown): LaneUnavailableError["code"] {
  return error instanceof LaneUnavailableError ? error.code : "wasm-artifact-missing";
}

export interface WasmCpuLane extends BrushEngineLane {
  strokeLatency(): readonly LatencyRecord[];
  /** 현재 표면(테스트·검사용). init 전·dispose 후는 null. */
  currentSurface(): WasmSurface | null;
}

export function createWasmCpuLane(): WasmCpuLane {
  let kernel: SumiKernel | null = null;
  let surface: WasmSurface | null = null;
  let pipeline: StrokePipeline | null = null;
  let clock: Clock | null = null;
  let frameIndex = 0;
  let frameTimes: number[] = [];
  let latency: readonly LatencyRecord[] = [];
  let disposed = false;
  const stats: LaneStats = emptyLaneStats();

  const requireSurface = (op: string): WasmSurface => {
    if (disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
    if (!surface) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return surface;
  };

  return {
    id: WASM_CPU_LANE_ID,
    label: "WASM CPU 커널(Rust C-ABI)",
    kind: "candidate",
    status: "implemented",
    engineVersion: SUMI_ENGINE_VERSION,
    async probe(env: LaneEnvironment): Promise<LaneCapabilityReport> {
      try {
        const loaded = await loadWasmKernelForEnv(env);
        return {
          laneId: WASM_CPU_LANE_ID,
          status: "supported",
          reasons: [],
          adapterInfo: null,
          features: [`wasm-abi-${loaded.abiVersion}`],
          limits: { wasmKernelBytes: loaded.byteLength },
          softwareRenderer: null,
        };
      } catch (error) {
        return unavailableReport(WASM_CPU_LANE_ID, [wasmReasonOf(error)]);
      }
    },
    async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
      if (disposed) throw new InvalidStateError("init: dispose된 레인이다");
      if (config.tileSize !== 16) {
        throw new LaneUnavailableError("limit-exceeded", `tileSize ${config.tileSize}는 지원하지 않는다(16만)`);
      }
      try {
        kernel = await loadWasmKernelForEnv(env);
      } catch (error) {
        if (error instanceof LaneUnavailableError) throw error;
        throw new LaneUnavailableError("wasm-artifact-missing", `wasm 커널 로드 실패: ${String(error)}`);
      }
      const opts: { strokeCapacityTiles?: number; wetCapacityTiles?: number } = {};
      if (config.strokeCapacityTiles !== undefined) opts.strokeCapacityTiles = config.strokeCapacityTiles;
      if (config.wetCapacityTiles !== undefined) opts.wetCapacityTiles = config.wetCapacityTiles;
      surface?.dispose();
      surface = new WasmSurface(kernel, config.width, config.height, opts);
      clock = env.clock;
      pipeline = null;
    },
    beginStroke(program: BrushProgram, seed: number): void {
      const s = requireSurface("beginStroke");
      if (pipeline) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
      s.beginStroke(program, seed);
      pipeline = new StrokePipeline(program, seed, undefined, s.paperField());
      frameIndex = 0;
      frameTimes = [];
      latency = [];
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      const s = requireSurface("addSamples");
      if (!pipeline) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
      const t0 = clock ? clock.now() : 0;
      const batch = pipeline.push(samples);
      const receipt = s.addDabs(batch);
      const dt = clock ? clock.now() - t0 : 0;
      frameTimes.push(dt);
      const out: DabBatchReceipt = {
        frameIndex,
        dabCount: batch.count,
        submitCount: 1,
        dispatchCount: receipt.dirtyTiles,
        inputToSubmitMs: clock ? dt : null,
      };
      frameIndex += 1;
      return out;
    },
    async endStroke(): Promise<StrokeReceipt> {
      const s = requireSurface("endStroke");
      if (!pipeline) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
      const t0 = clock ? clock.now() : 0;
      s.addDabs(pipeline.finish());
      const cpu = s.endStroke();
      const dt = clock ? clock.now() - t0 : 0;
      frameTimes.push(dt);
      latency = pipeline.stats().latency;
      pipeline = null;
      const receipt: StrokeReceipt = {
        dabCount: cpu.dabCount,
        submitCount: frameTimes.length,
        gpuTimeMs: null,
        timingSource: "unavailable",
        frameTimesMs: [...frameTimes],
        overflowDabs: cpu.overflowDabs,
        poolTilesUsed: cpu.poolTilesUsed,
      };
      stats.strokes += 1;
      stats.dabs += cpu.dabCount;
      stats.submits += receipt.submitCount;
      stats.lastReceipt = receipt;
      return receipt;
    },
    async readback(): Promise<LabImage> {
      return requireSurface("readback").toLabImage();
    },
    async readbackLinear(): Promise<Float32Array | null> {
      return requireSurface("readbackLinear").toLinear();
    },
    strokeLatency(): readonly LatencyRecord[] {
      return latency;
    },
    currentSurface(): WasmSurface | null {
      return disposed ? null : surface;
    },
    stats(): LaneStats {
      return { ...stats };
    },
    dispose(): void {
      surface?.dispose();
      surface = null;
      pipeline = null;
      kernel = null;
      clock = null;
      disposed = true;
    },
  };
}

export const WASM_CPU_LANE: LaneDescriptor = {
  id: WASM_CPU_LANE_ID,
  label: "WASM CPU 커널(Rust C-ABI)",
  kind: "candidate",
  status: "implemented",
  nodeVerification: "INTEGRITY 봉인·변조 거부·재현 빌드·TS 참조 일치(해시·커버리지·CSR·표면 문서; 임파스토·습식 층 포함)",
  browserVerification: "Chromium 실측: WebAssembly 로드·cpu-reference 패리티(스모크·증빙 대상 전부 ΔE p99 0, 습식·임파스토 포함)·결정성; 실 CPU 성능은 측정하지 않음",
  create: createWasmCpuLane,
};
