import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { detectSoftwareRenderer } from "../engine/gpu/device";
import { paperFor } from "../engine/raster/reference-renderer";
import { WEBGL2_REQUIRED_EXTENSION, Webgl2InstancedRuntime } from "../engine/webgl2/instanced-dab";

import { emptyLaneStats, supportedReport, unavailableReport } from "./lane";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneStats,
  StrokeReceipt,
} from "./lane";
import type { GpuAdapterInfo, LabImage, RawSample } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * WebGL2 인스턴스 dab 레인(명시 선택 비교 레인). `createCanvas`로 얻은 캔버스의 webgl2 컨텍스트에서 돈다.
 * probe: 컨텍스트 없음 → `webgl2-unavailable`, EXT_color_buffer_float 없음 → `feature-missing`.
 * 표시 캔버스(`presentCanvas`)가 있으면 그 캔버스의 컨텍스트를 쓰고 기본 프레임버퍼에도 그린다.
 */
export const WEBGL2_INSTANCED_LANE_ID: LaneId = "webgl2-instanced";

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function getWebgl2(canvas: CanvasLike): WebGL2RenderingContext | null {
  const getter = (canvas as { getContext?: (id: string, attrs?: unknown) => unknown }).getContext;
  if (typeof getter !== "function") return null;
  const ctx = getter.call(canvas, "webgl2", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!ctx || typeof ctx !== "object" || !("drawArraysInstanced" in ctx) || !("getExtension" in ctx)) return null;
  return ctx as WebGL2RenderingContext;
}

/**
 * WebGL2 컨텍스트의 비마스킹 공급자·렌더러(`WEBGL_debug_renderer_info`)를 어댑터 정보로 옮긴다. 확장이 없거나 브라우저가 문자열을 숨기면 null
 * (소프트웨어 렌더러 여부를 모르는 것이지 하드웨어라는 뜻이 아니다). 렌더러 문자열이 SwiftShader·llvmpipe 등이면 `softwareRenderer: true`다.
 */
function webglAdapterInfo(gl: WebGL2RenderingContext): GpuAdapterInfo | null {
  const ext = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number } | null;
  if (!ext) return null;
  const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
  const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  if (typeof vendor !== "string" && typeof renderer !== "string") return null;
  return {
    vendor: typeof vendor === "string" ? vendor : "",
    architecture: "webgl2",
    device: typeof renderer === "string" ? renderer : "",
    description: String(gl.getParameter(gl.VERSION) ?? ""),
  };
}

/** 1×1 프로브 캔버스에서 WebGL2 컨텍스트를 얻는다. 캔버스를 못 만들거나 컨텍스트가 없으면 null(호출자가 사유를 돌려준다). */
function probeWebgl2(env: LaneEnvironment): WebGL2RenderingContext | null {
  if (!env.createCanvas) return null;
  try {
    return getWebgl2(env.createCanvas(1, 1));
  } catch {
    return null;
  }
}

export function createWebgl2InstancedLane(): BrushEngineLane {
  let env: LaneEnvironment | null = null;
  let runtime: Webgl2InstancedRuntime | null = null;
  let pipeline: StrokePipeline | null = null;
  let disposed = false;
  const stats: LaneStats = emptyLaneStats();

  const requireRuntime = (): Webgl2InstancedRuntime => {
    if (disposed) throw new InvalidStateError("webgl2-instanced 레인은 dispose됐다");
    if (!runtime) throw new InvalidStateError("webgl2-instanced 레인은 init 전이다");
    return runtime;
  };

  return {
    id: WEBGL2_INSTANCED_LANE_ID,
    label: "WebGL2 인스턴스 dab(명시 선택)",
    kind: "comparison",
    status: "browser-verification-required",
    engineVersion: SUMI_ENGINE_VERSION,
    async probe(e: LaneEnvironment): Promise<LaneCapabilityReport> {
      env = e;
      const gl = probeWebgl2(e);
      if (!gl) return unavailableReport(WEBGL2_INSTANCED_LANE_ID, ["webgl2-unavailable"]);
      const report = supportedReport(WEBGL2_INSTANCED_LANE_ID);
      if (!gl.getExtension(WEBGL2_REQUIRED_EXTENSION)) {
        return { ...unavailableReport(WEBGL2_INSTANCED_LANE_ID, ["feature-missing"]), features: [] };
      }
      report.features = [WEBGL2_REQUIRED_EXTENSION];
      report.adapterInfo = webglAdapterInfo(gl);
      report.softwareRenderer = detectSoftwareRenderer(report.adapterInfo, undefined);
      return report;
    },
    async init(e: LaneEnvironment, config: LaneInit): Promise<void> {
      if (disposed) throw new InvalidStateError("webgl2-instanced 레인은 dispose됐다");
      env = e;
      const canvas: CanvasLike | null = config.presentCanvas ?? (e.createCanvas ? e.createCanvas(config.width, config.height) : null);
      if (!canvas) throw new LaneUnavailableError("webgl2-unavailable", "webgl2-instanced 레인을 쓸 수 없다(캔버스 생성 불가)");
      const gl = getWebgl2(canvas);
      if (!gl) throw new LaneUnavailableError("webgl2-unavailable", "WebGL2 컨텍스트를 만들 수 없다");
      runtime = Webgl2InstancedRuntime.create(gl, {
        width: config.width,
        height: config.height,
        clock: e.clock,
        presentToCanvas: Boolean(config.presentCanvas),
      });
    },
    beginStroke(program: BrushProgram, seed: number): void {
      const rt = requireRuntime();
      rt.beginStroke(program);
      pipeline = new StrokePipeline(program, seed, undefined, program.paper.enabled ? paperFor(program.paper) : null);
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 addSamples를 호출했다");
      const t0 = env?.clock.now() ?? null;
      const r = rt.submitBatch(pipeline.push(samples));
      return {
        frameIndex: r.frameIndex,
        dabCount: r.dabCount,
        submitCount: r.submitCount,
        dispatchCount: r.drawCount,
        inputToSubmitMs: t0 !== null && env ? env.clock.now() - t0 : null,
      };
    },
    async endStroke(): Promise<StrokeReceipt> {
      const rt = requireRuntime();
      if (!pipeline) throw new InvalidStateError("beginStroke 전에 endStroke를 호출했다");
      rt.submitBatch(pipeline.finish());
      pipeline = null;
      const r = rt.endStroke();
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
      stats.dabs += r.dabCount;
      stats.submits += r.submitCount;
      stats.lastReceipt = receipt;
      return receipt;
    },
    async readback(): Promise<LabImage> {
      return requireRuntime().readbackImage();
    },
    async readbackLinear(): Promise<Float32Array | null> {
      return requireRuntime().readbackLinear();
    },
    stats(): LaneStats {
      return { ...stats };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pipeline = null;
      runtime?.dispose();
      runtime = null;
    },
  };
}

export const WEBGL2_INSTANCED_LANE: LaneDescriptor = {
  id: WEBGL2_INSTANCED_LANE_ID,
  label: "WebGL2 인스턴스 dab(명시 선택)",
  kind: "comparison",
  status: "browser-verification-required",
  nodeVerification: "GLSL 정적 검사·모의 WebGL2로 프레임당 drawArraysInstanced 1회·bake/encode·확장 부재 feature-missing",
  browserVerification: "SwiftShader(ANGLE) 실측: GLSL 실컴파일·EXT_color_buffer_float·결정성, 건식 12종 cpu-reference 대비 ΔE p99 0~4.9(f16 누적, halftone 최대, 비교 레인); 실 GPU 미검증",
  create: createWebgl2InstancedLane,
};
