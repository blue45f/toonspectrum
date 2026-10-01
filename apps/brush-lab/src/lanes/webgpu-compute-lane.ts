import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { probeWebGpuAdapter, requestSumiDevice } from "../engine/gpu/device";
import { SumiComputeRuntime } from "../engine/gpu/pipeline-compute";
import { paperFor } from "../engine/raster/reference-renderer";

import { emptyLaneStats } from "./lane";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStats,
  LaneStatus,
  StrokeReceipt,
} from "./lane";
import type { LaneReasonCode } from "../engine/core/errors";
import type { LabImage, RawSample } from "../engine/core/types";
import type { GpuProbeResult } from "../engine/gpu/device";
import type { ExternalBinner } from "../engine/gpu/pipeline-compute";
import type { LatencyRecord } from "../engine/input/input-pipeline";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * 주력 레인: Sumi WebGPU compute 타일 파이프라인.
 * RawSample → StrokePipeline(CPU, cpu-reference와 동일) → DabBatch → SumiComputeRuntime(프레임당 submit 1회).
 * - probe는 throw하지 않는다. unavailable 상태에서 init하면 `LaneUnavailableError(code)`(무음 대체 없음).
 * - `StrokeReceipt.submitCount`·`stats.submits`는 획 전체 queue.submit 수(프레임 + 꼬리 프레임 + endStroke, 습식은 건조 청크 포함).
 * - `DabBatchReceipt.inputToSubmitMs`는 cpu-reference와 같은 의미(addSamples 경과 ms).
 * - 픽셀·WGSL 컴파일은 브라우저 프로브(Chromium SwiftShader 소프트웨어 WebGPU)로 cpu-reference와 대조했고, 실 GPU 어댑터에서는
 *   아직 검증되지 않았다(status: browser-verification-required).
 */
export const WEBGPU_COMPUTE_LANE_ID = "webgpu-compute" as const;

function toReport(laneId: LaneId, result: GpuProbeResult, extraReasons: readonly LaneReasonCode[]): LaneCapabilityReport {
  const unavailable = result.status !== "supported" || extraReasons.length > 0;
  return {
    laneId,
    status: unavailable ? "unavailable" : "supported",
    reasons: [...result.reasons, ...extraReasons],
    adapterInfo: result.adapterInfo,
    features: result.features,
    limits: result.limits,
    softwareRenderer: result.softwareRenderer,
  };
}

export interface WebgpuComputeLane extends BrushEngineLane {
  strokeLatency(): readonly LatencyRecord[];
}

/** 호스트 쪽 CSR 비닝 같은 추가 자원(하이브리드 레인의 wasm 커널). */
export interface GpuLaneExtra {
  /** probe에 합칠 사유 코드(비어 있으면 사용 가능). throw하지 않는다. */
  probe(env: LaneEnvironment): Promise<readonly LaneReasonCode[]>;
  /** init에서 자원을 만든다. 실패는 LaneUnavailableError로 던진다. */
  create(env: LaneEnvironment): Promise<{ createBinner(tilesX: number, tilesY: number): ExternalBinner; dispose(): void }>;
}

/** compute 레인 변형(식별자·상태·추가 자원). 기본은 주력 `webgpu-compute`. */
export interface GpuComputeLaneVariant {
  id: LaneId;
  label: string;
  kind: LaneKind;
  status: LaneStatus;
  extra?: GpuLaneExtra;
}

const PRIMARY_VARIANT: GpuComputeLaneVariant = {
  id: WEBGPU_COMPUTE_LANE_ID,
  label: "WebGPU compute (Sumi 타일 파이프라인)",
  kind: "candidate",
  status: "browser-verification-required",
};

export function createWebgpuComputeLane(): WebgpuComputeLane {
  return createGpuComputeLane(PRIMARY_VARIANT);
}

export function createGpuComputeLane(variant: GpuComputeLaneVariant): WebgpuComputeLane {
  let env: LaneEnvironment | null = null;
  let probeResult: GpuProbeResult | null = null;
  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;
  let runtime: SumiComputeRuntime | null = null;
  let pipeline: StrokePipeline | null = null;
  let latency: readonly LatencyRecord[] = [];
  let disposed = false;
  let extraReasons: readonly LaneReasonCode[] = [];
  let binner: ExternalBinner | null = null;
  let extraResource: { createBinner(tilesX: number, tilesY: number): ExternalBinner; dispose(): void } | null = null;
  const stats: LaneStats = emptyLaneStats();

  const requireRuntime = (): SumiComputeRuntime => {
    if (disposed) throw new InvalidStateError(`${variant.id} 레인은 dispose됐다`);
    if (!runtime) throw new InvalidStateError(`${variant.id} 레인은 init 전이다`);
    return runtime;
  };

  return {
    id: variant.id,
    label: variant.label,
    kind: variant.kind,
    status: variant.status,
    engineVersion: SUMI_ENGINE_VERSION,
    async probe(e: LaneEnvironment): Promise<LaneCapabilityReport> {
      env = e;
      const probed = await probeWebGpuAdapter({ gpu: e.gpu ?? null });
      probeResult = probed.result;
      adapter = probed.adapter;
      extraReasons = variant.extra ? await variant.extra.probe(e) : [];
      return toReport(variant.id, probed.result, extraReasons);
    },
    async init(e: LaneEnvironment, config: LaneInit): Promise<void> {
      if (disposed) throw new InvalidStateError(`${variant.id} 레인은 dispose됐다`);
      if (!probeResult || env !== e) await this.probe(e);
      const result = probeResult;
      if (!result || result.status !== "supported" || !adapter) {
        const code = result?.reasons[0] ?? "adapter-unavailable";
        throw new LaneUnavailableError(code, `${variant.id} 레인을 쓸 수 없다: ${result?.reasons.join(", ") ?? code}`, {
          limitShortfalls: result?.limitShortfalls ?? [],
        });
      }
      if (extraReasons.length > 0) {
        throw new LaneUnavailableError(extraReasons[0] ?? "not-implemented", `${variant.id} 레인의 추가 자원을 쓸 수 없다: ${extraReasons.join(", ")}`);
      }
      if (config.tileSize !== 16) {
        throw new LaneUnavailableError("limit-exceeded", `tileSize ${config.tileSize}는 지원하지 않는다(16만)`);
      }
      const requested = await requestSumiDevice(adapter);
      device = requested.device;
      const gpu = e.gpu;
      runtime = await SumiComputeRuntime.create(device, {
        width: config.width,
        height: config.height,
        seed: config.seed,
        strokeCapacityTiles: config.strokeCapacityTiles,
        wetCapacityTiles: config.wetCapacityTiles,
        features: requested.features,
        clock: e.clock,
        limits: result.limits,
        presentCanvas: config.presentCanvas,
        presentFormat: config.presentCanvas && gpu ? gpu.getPreferredCanvasFormat() : undefined,
      });
      if (variant.extra) {
        extraResource?.dispose();
        extraResource = await variant.extra.create(e);
        binner = extraResource.createBinner(runtime.tilesX, runtime.tilesY);
      }
    },
    beginStroke(program: BrushProgram, seed: number): void {
      const rt = requireRuntime();
      rt.beginStroke(program, seed);
      const paper = program.paper.enabled ? paperFor(program.paper) : null;
      pipeline = new StrokePipeline(program, seed, undefined, paper);
      latency = [];
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 addSamples를 호출했다");
      const t0 = env?.clock.now() ?? null;
      const batch = pipeline.push(samples);
      const receipt = rt.submitBatch(batch, binner ?? undefined);
      return {
        frameIndex: receipt.frameIndex,
        dabCount: receipt.dabCount,
        submitCount: receipt.submitCount,
        dispatchCount: receipt.dispatchCount,
        // CPU 참조 레인과 같은 의미: addSamples(encode + submit) 경과(ms).
        inputToSubmitMs: t0 !== null && env ? env.clock.now() - t0 : null,
      };
    },
    async endStroke(): Promise<StrokeReceipt> {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 endStroke를 호출했다");
      const tail = pipeline.finish();
      rt.submitBatch(tail, binner ?? undefined);
      latency = pipeline.stats().latency;
      pipeline = null;
      const r = await rt.endStroke();
      const receipt: StrokeReceipt = {
        dabCount: r.dabCount,
        submitCount: r.submitCount,
        gpuTimeMs: r.gpuTimeMs,
        timingSource: r.timingSource,
        frameTimesMs: r.frameTimesMs,
        overflowDabs: r.overflowDabs,
        poolTilesUsed: r.poolTilesUsed,
      };
      stats.strokes += 1;
      stats.dabs += receipt.dabCount;
      // frames + 꼬리 프레임 + endStroke 제출(습식은 건조 청크 포함) = 획 동안의 queue.submit 수.
      stats.submits += receipt.submitCount;
      stats.lastReceipt = receipt;
      return receipt;
    },
    /** 마지막 획의 입력 파이프라인 지연 기록(cpu-reference 레인과 같은 보조 API). */
    strokeLatency(): readonly LatencyRecord[] {
      return latency;
    },
    // async: dispose·init 전 호출도 계약대로 rejection으로 드러난다(동기 throw 아님).
    async readback(): Promise<LabImage> {
      return requireRuntime().readbackImage();
    },
    async readbackLinear(): Promise<Float32Array | null> {
      return requireRuntime().readbackLinear();
    },
    stats(): LaneStats {
      return stats;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pipeline = null;
      runtime?.dispose();
      runtime = null;
      extraResource?.dispose();
      extraResource = null;
      binner = null;
      device?.destroy();
      device = null;
      adapter = null;
    },
  };
}

export const WEBGPU_COMPUTE_LANE: LaneDescriptor = {
  id: WEBGPU_COMPUTE_LANE_ID,
  label: "WebGPU compute (Sumi 타일 파이프라인)",
  kind: "candidate",
  status: "browser-verification-required",
  nodeVerification: "WGSL 정적 계약·fake 장치 바인딩/디스패치/제출 계약·예산·오류 표면화",
  browserVerification: "SwiftShader(소프트웨어 렌더러) 실측: WGSL 10모듈 실컴파일 오류 0·카탈로그 30종 중 26종 cpu-reference 패리티(δ48 0%, ΔE p99 < 1.0)·재실행 결정성(128²·1024²·100² 캔버스); 습식 4종(watercolor-wet·watercolor-dry·gouache·oil-impasto)은 GPU 미러 대기; 실 GPU(softwareRenderer false) 미검증(scripts/browser-probe.mjs)",
  create: createWebgpuComputeLane,
};
