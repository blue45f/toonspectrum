import { linearToSrgb } from "../engine/core/color";
import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { paperFor } from "../engine/raster/reference-renderer";

import { emptyLaneStats, supportedReport, unavailableReport } from "./lane";

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
import type { Clock, DabInstance, LabImage, RawSample } from "../engine/core/types";
import type { LatencyRecord } from "../engine/input/input-pipeline";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * Canvas2D 기준 레인(비교용, 사용자가 명시 선택). 같은 StrokePipeline의 dab를 받아 타원 스탬프
 * (`setTransform`으로 단위 원 변환 + `arc` 1회, radial gradient로 경도, globalAlpha = flow·a)로 획 캔버스에 찍고
 * endStroke에서 문서 캔버스에 opacity·블렌드로 `drawImage` 1회 합성한다.
 * 한계(명시): 팁 질감·종이 그레인·smudge 픽업·습식·KM은 없다(타원 스탬프만). 선형 readback 없음(null).
 * 영수증: dispatchCount = 프레임에 찍은 dab 수. `up` 표본이 든 프레임은 꼬리(테이퍼) dab까지 그 프레임에서 방출한다.
 */
export const CANVAS2D_LANE_ID: LaneId = "canvas2d";

/** 레인이 쓰는 2D 컨텍스트 부분집합(모의 컨텍스트로 Node 검증). */
export interface Canvas2dContextLike {
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string | CanvasGradient;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

const REQUIRED_METHODS: readonly (keyof Canvas2dContextLike)[] = [
  "save",
  "restore",
  "setTransform",
  "beginPath",
  "arc",
  "fill",
  "createRadialGradient",
  "clearRect",
  "drawImage",
  "getImageData",
];

/** 캔버스에서 2D 컨텍스트를 얻는다. 필요한 메서드가 하나라도 없으면 null(무음 대체 없이 호출자가 사유를 돌려준다). */
export function acquire2dContext(canvas: CanvasLike): Canvas2dContextLike | null {
  const getter = (canvas as { getContext?: (id: string) => unknown }).getContext;
  if (typeof getter !== "function") return null;
  const ctx = getter.call(canvas, "2d");
  if (!ctx || typeof ctx !== "object") return null;
  const bag = ctx as Record<string, unknown>;
  for (const name of REQUIRED_METHODS) {
    if (typeof bag[name] !== "function") return null;
  }
  return ctx as Canvas2dContextLike;
}

const COMPOSITE_OP: Record<BrushProgram["deposition"]["blend"], string> = {
  normal: "source-over",
  multiply: "multiply",
  erase: "destination-out",
  max: "lighten",
};

/** 선형 premultiplied dab 색 → sRGB `rgb(r,g,b)`와 straight 알파. */
export function dabCssColor(dab: DabInstance): { css: string; alpha: number } {
  const a = dab.a > 0 ? Math.min(1, dab.a) : 0;
  const to255 = (c: number): number => Math.round(linearToSrgb(a > 0 ? c / a : 0) * 255);
  return { css: `rgb(${to255(dab.r)},${to255(dab.g)},${to255(dab.b)})`, alpha: a };
}

function rgba(css: string, alpha: number): string {
  return css.replace(/^rgb\(/, "rgba(").replace(/\)$/, `,${alpha})`);
}

/** dab 1개를 단위 원 변환으로 찍는다(arc 1회, createRadialGradient 1회). */
export function stampDab(ctx: Canvas2dContextLike, dab: DabInstance): void {
  const rx = Math.max(0.25, dab.rx);
  const ry = Math.max(0.25, dab.ry);
  const cos = Math.cos(dab.angle);
  const sin = Math.sin(dab.angle);
  ctx.save();
  // [a c e; b d f] = translate(x, y) · rotate(angle) · scale(rx, ry)
  ctx.setTransform(rx * cos, rx * sin, -ry * sin, ry * cos, dab.x, dab.y);
  const inner = Math.max(0, Math.min(0.999, dab.hardness));
  const g = ctx.createRadialGradient(0, 0, inner, 0, 0, 1);
  const color = dab.erase ? { css: "rgb(0,0,0)", alpha: 1 } : dabCssColor(dab);
  g.addColorStop(0, rgba(color.css, 1));
  g.addColorStop(inner, rgba(color.css, 1));
  g.addColorStop(1, rgba(color.css, 0));
  ctx.fillStyle = g;
  const flow = dab.deposition === "airbrush" ? dab.flow * 0.5 : dab.flow;
  ctx.globalAlpha = Math.max(0, Math.min(1, flow * color.alpha));
  ctx.globalCompositeOperation = dab.erase ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class Canvas2dLane implements BrushEngineLane {
  readonly id: LaneId = CANVAS2D_LANE_ID;
  readonly label = "Canvas2D 스탬프(arc + radial gradient)";
  readonly kind: LaneKind = "baseline";
  readonly status: LaneStatus = "browser-verification-required";
  readonly engineVersion = SUMI_ENGINE_VERSION;

  private clock: Clock | null = null;
  private width = 0;
  private height = 0;
  private docCtx: Canvas2dContextLike | null = null;
  private strokeCanvas: CanvasLike | null = null;
  private strokeCtx: Canvas2dContextLike | null = null;
  private pipeline: StrokePipeline | null = null;
  private pipelineFinished = false;
  private program: BrushProgram | null = null;
  private frameIndex = 0;
  private frameTimes: number[] = [];
  private strokeDabs = 0;
  private latency: readonly LatencyRecord[] = [];
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  async probe(env: LaneEnvironment): Promise<LaneCapabilityReport> {
    if (!env.createCanvas) return unavailableReport(this.id, ["dom-unavailable"]);
    try {
      if (!acquire2dContext(env.createCanvas(1, 1))) return unavailableReport(this.id, ["dom-unavailable"]);
    } catch {
      return unavailableReport(this.id, ["dom-unavailable"]);
    }
    return supportedReport(this.id);
  }

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    if (!env.createCanvas) {
      throw new LaneUnavailableError("dom-unavailable", "canvas2d 레인을 쓸 수 없다(createCanvas 없음)");
    }
    const created = ((): { doc: Canvas2dContextLike; stroke: CanvasLike; strokeCtx: Canvas2dContextLike } | null => {
      try {
        const docContext = acquire2dContext(env.createCanvas(config.width, config.height));
        const strokeCanvas = env.createCanvas(config.width, config.height);
        const strokeContext = acquire2dContext(strokeCanvas);
        return docContext && strokeContext ? { doc: docContext, stroke: strokeCanvas, strokeCtx: strokeContext } : null;
      } catch {
        return null;
      }
    })();
    if (!created) {
      throw new LaneUnavailableError("dom-unavailable", "canvas2d 레인을 쓸 수 없다(2D 컨텍스트 생성 실패)");
    }
    const { doc, stroke, strokeCtx } = created;
    this.clock = env.clock;
    this.width = config.width;
    this.height = config.height;
    this.docCtx = doc;
    this.strokeCanvas = stroke;
    this.strokeCtx = strokeCtx;
    this.pipeline = null;
  }

  beginStroke(program: BrushProgram, seed: number): void {
    this.requireContexts("beginStroke");
    if (this.pipeline) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    this.program = program;
    this.pipeline = new StrokePipeline(program, seed, undefined, program.paper.enabled ? paperFor(program.paper) : null);
    this.pipelineFinished = false;
    this.frameIndex = 0;
    this.frameTimes = [];
    this.strokeDabs = 0;
    this.latency = [];
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    const { strokeCtx } = this.requireContexts("addSamples");
    const pipeline = this.pipeline;
    if (!pipeline) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    if (this.pipelineFinished) throw new InvalidStateError("addSamples: up 표본 뒤에 다시 호출됐다");
    const t0 = this.clock ? this.clock.now() : 0;
    const batch = pipeline.push(samples);
    let n = 0;
    for (let i = 0; i < batch.count; i += 1) {
      stampDab(strokeCtx, batch.at(i));
      n += 1;
    }
    // up 표본이 든 프레임: 꼬리(테이퍼) dab도 이 프레임에서 찍는다(프레임 dispatch 합 = 획 dab 수).
    const last = samples[samples.length - 1];
    if (last && last.phase === "up") {
      const tail = pipeline.finish();
      for (let i = 0; i < tail.count; i += 1) {
        stampDab(strokeCtx, tail.at(i));
        n += 1;
      }
      this.pipelineFinished = true;
    }
    const dt = this.clock ? this.clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    this.strokeDabs += n;
    const out: DabBatchReceipt = {
      frameIndex: this.frameIndex,
      dabCount: n,
      submitCount: 1,
      dispatchCount: n,
      inputToSubmitMs: this.clock ? dt : null,
    };
    this.frameIndex += 1;
    return out;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const { docCtx, strokeCtx, strokeCanvas } = this.requireContexts("endStroke");
    const pipeline = this.pipeline;
    const program = this.program;
    if (!pipeline || !program) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const t0 = this.clock ? this.clock.now() : 0;
    try {
      if (!this.pipelineFinished) {
        const tail = pipeline.finish();
        for (let i = 0; i < tail.count; i += 1) {
          stampDab(strokeCtx, tail.at(i));
          this.strokeDabs += 1;
        }
        this.pipelineFinished = true;
      }
      docCtx.save();
      try {
        docCtx.globalAlpha = program.deposition.opacity;
        docCtx.globalCompositeOperation = COMPOSITE_OP[program.deposition.blend];
        docCtx.drawImage(strokeCanvas as CanvasImageSource, 0, 0);
      } finally {
        docCtx.restore();
      }
    } finally {
      // 어디서 실패해도 획 상태를 초기화한다: pipeline이 남으면 다음 beginStroke가 '이전 획이 endStroke되지 않았다'로
      // 영구히 실패하고, 획 캔버스가 비워지지 않으면 실패한 획의 잔여가 다음 획에 합성된다.
      this.pipeline = null;
      strokeCtx.clearRect(0, 0, this.width, this.height);
    }
    const dt = this.clock ? this.clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    this.latency = pipeline.stats().latency;
    const receipt: StrokeReceipt = {
      dabCount: this.strokeDabs,
      submitCount: this.frameTimes.length,
      gpuTimeMs: null,
      timingSource: "unavailable",
      frameTimesMs: [...this.frameTimes],
      overflowDabs: 0,
      poolTilesUsed: 0,
    };
    this.lifetime.strokes += 1;
    this.lifetime.dabs += this.strokeDabs;
    this.lifetime.submits += receipt.submitCount;
    this.lifetime.lastReceipt = receipt;
    return receipt;
  }

  async readback(): Promise<LabImage> {
    const { docCtx } = this.requireContexts("readback");
    const image = docCtx.getImageData(0, 0, this.width, this.height);
    return { width: this.width, height: this.height, data: new Uint8ClampedArray(image.data) };
  }

  async readbackLinear(): Promise<Float32Array | null> {
    this.requireContexts("readbackLinear");
    return null;
  }

  /** 마지막 획의 입력 파이프라인 지연 기록. */
  strokeLatency(): readonly LatencyRecord[] {
    return this.latency;
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  dispose(): void {
    this.disposed = true;
    this.pipeline = null;
    this.docCtx = null;
    this.strokeCtx = null;
    this.strokeCanvas = null;
    this.clock = null;
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireContexts(op: string): { docCtx: Canvas2dContextLike; strokeCtx: Canvas2dContextLike; strokeCanvas: CanvasLike } {
    this.assertAlive(op);
    if (!this.docCtx || !this.strokeCtx || !this.strokeCanvas) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return { docCtx: this.docCtx, strokeCtx: this.strokeCtx, strokeCanvas: this.strokeCanvas };
  }
}

export function createCanvas2dLane(): BrushEngineLane {
  return new Canvas2dLane();
}

export const CANVAS2D_LANE: LaneDescriptor = {
  id: CANVAS2D_LANE_ID,
  label: "Canvas2D 스탬프(arc + radial gradient)",
  kind: "baseline",
  status: "browser-verification-required",
  nodeVerification: "probe dom-unavailable 경로·모의 2D 컨텍스트 호출 계약(dab당 arc 1회·globalAlpha = flow)",
  browserVerification: "헤드리스 Chromium의 실제 CanvasRenderingContext2D에서 실행·결정성 확인(기준선이라 cpu-reference와 픽셀이 다른 것이 정상: ΔE p99 24~100); 실기기 브라우저별 차이는 미검증",
  create: createCanvas2dLane,
};
