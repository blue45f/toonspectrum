import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { probeWebGpuAdapter, requestSumiDevice } from "../engine/gpu/device";
import { SumiInstancedRuntime } from "../engine/gpu/pipeline-instanced";
import { paperFor } from "../engine/raster/reference-renderer";

import { emptyLaneStats } from "./lane";

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
import type { LabImage, RawSample } from "../engine/core/types";
import type { GpuProbeResult } from "../engine/gpu/device";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * 비교 레인: WebGPU 렌더 인스턴싱(쿼드 1개/dab, rgba16float 하드웨어 블렌드).
 * compute 레인과 같은 StrokePipeline·같은 shade_dab 수식이지만 f16 누적이며 smudge·습식·임파스토는 거부한다(fail-visible).
 */
export const WEBGPU_INSTANCED_LANE_ID = "webgpu-instanced" as const;

/** 인스턴싱 레인 요구 한도(정점 버퍼·속성 4개). */
const INSTANCED_REQUIRED_LIMITS: Readonly<Record<string, number>> = {
  maxVertexBuffers: 1,
  maxVertexAttributes: 4,
  maxTextureDimension2D: 2048,
  maxColorAttachments: 1,
};

function toReport(result: GpuProbeResult): LaneCapabilityReport {
  return {
    laneId: WEBGPU_INSTANCED_LANE_ID,
    status: result.status,
    reasons: result.reasons,
    adapterInfo: result.adapterInfo,
    features: result.features,
    limits: result.limits,
    softwareRenderer: result.softwareRenderer,
  };
}

export function createWebgpuInstancedLane(): BrushEngineLane {
  let env: LaneEnvironment | null = null;
  let probeResult: GpuProbeResult | null = null;
  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;
  let runtime: SumiInstancedRuntime | null = null;
  let pipeline: StrokePipeline | null = null;
  let disposed = false;
  const stats: LaneStats = emptyLaneStats();

  const requireRuntime = (): SumiInstancedRuntime => {
    if (disposed) throw new InvalidStateError("webgpu-instanced 레인은 dispose됐다");
    if (!runtime) throw new InvalidStateError("webgpu-instanced 레인은 init 전이다");
    return runtime;
  };

  return {
    id: WEBGPU_INSTANCED_LANE_ID,
    label: "WebGPU 렌더 인스턴싱(비교)",
    kind: "comparison",
    status: "browser-verification-required",
    engineVersion: SUMI_ENGINE_VERSION,
    async probe(e: LaneEnvironment): Promise<LaneCapabilityReport> {
      env = e;
      const probed = await probeWebGpuAdapter({ gpu: e.gpu ?? null, requiredLimits: INSTANCED_REQUIRED_LIMITS });
      probeResult = probed.result;
      adapter = probed.adapter;
      return toReport(probed.result);
    },
    async init(e: LaneEnvironment, config: LaneInit): Promise<void> {
      if (disposed) throw new InvalidStateError("webgpu-instanced 레인은 dispose됐다");
      if (!probeResult || env !== e) await this.probe(e);
      const result = probeResult;
      if (!result || result.status !== "supported" || !adapter) {
        const code = result?.reasons[0] ?? "adapter-unavailable";
        throw new LaneUnavailableError(code, `webgpu-instanced 레인을 쓸 수 없다: ${result?.reasons.join(", ") ?? code}`);
      }
      const requested = await requestSumiDevice(adapter);
      const created = requested.device;
      device = created;
      try {
        runtime = await SumiInstancedRuntime.create(created, {
          width: config.width,
          height: config.height,
          seed: config.seed,
          features: requested.features,
          clock: e.clock,
          presentCanvas: config.presentCanvas,
          presentFormat: config.presentCanvas && e.gpu ? e.gpu.getPreferredCanvasFormat() : undefined,
        });
      } catch (error) {
        // 장치를 만든 뒤 실패하면 호출자가 dispose하지 않아도 장치가 남지 않게 되돌린다.
        runtime = null;
        created.destroy();
        device = null;
        throw error;
      }
    },
    beginStroke(program: BrushProgram, seed: number): void {
      const rt = requireRuntime();
      rt.beginStroke(program, seed);
      pipeline = new StrokePipeline(program, seed, undefined, program.paper.enabled ? paperFor(program.paper) : null);
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 addSamples를 호출했다");
      const t0 = env?.clock.now() ?? null;
      const receipt = rt.submitBatch(pipeline.push(samples));
      return {
        frameIndex: receipt.frameIndex,
        dabCount: receipt.dabCount,
        submitCount: receipt.submitCount,
        dispatchCount: receipt.drawCount,
        inputToSubmitMs: t0 !== null && env ? env.clock.now() - t0 : null,
      };
    },
    async endStroke(): Promise<StrokeReceipt> {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 endStroke를 호출했다");
      rt.submitBatch(pipeline.finish());
      pipeline = null;
      const r = await rt.endStroke();
      const receipt: StrokeReceipt = {
        dabCount: r.dabCount,
        submitCount: r.submitCount,
        gpuTimeMs: r.gpuTimeMs,
        timingSource: r.timingSource,
        frameTimesMs: r.frameTimesMs,
        overflowDabs: 0,
        poolTilesUsed: 0,
      };
      stats.strokes += 1;
      stats.dabs += receipt.dabCount;
      stats.submits += receipt.submitCount;
      stats.lastReceipt = receipt;
      return receipt;
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
      device?.destroy();
      device = null;
      adapter = null;
    },
  };
}

export const WEBGPU_INSTANCED_LANE: LaneDescriptor = {
  id: WEBGPU_INSTANCED_LANE_ID,
  label: "WebGPU 렌더 인스턴싱(비교)",
  kind: "comparison",
  status: "browser-verification-required",
  nodeVerification: "WGSL 정적 계약·fake 장치로 draw(6,n)·bake/encode 패스·미지원 프로그램 거부",
  browserVerification: "SwiftShader 실측: 실컴파일 오류 0·건식 12종 cpu-reference 대비 ΔE p99 ≤ 0.96(f16 누적)·결정성, smudge·습식·임파스토는 설계상 not-implemented 거부; 실 GPU 미검증",
  create: createWebgpuInstancedLane,
};
