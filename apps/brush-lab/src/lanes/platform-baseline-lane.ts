import { applyStabilizer, modelRawInput, strokeOutlinePath } from "@toonstudio/studio-brush-platform";
import { brushProgramIRSchema, deviceCalibrationIRSchema } from "@toonstudio/studio-project-model";

import { encodeLabImage, srgbToLinear } from "../engine/core/color";
import { InvalidStateError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";

import { emptyLaneStats, supportedReport } from "./lane";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStats,
  LaneStatus,
  StrokeReceipt,
} from "./lane";
import type { Clock, LabImage, RawSample, Rgba } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";
import type {
  BrushProgramIR,
  DeviceCalibrationIR,
  DynamicMappingIR,
  PathIR,
  StabilizerGraphIR,
  StrokeIR,
} from "@toonstudio/studio-project-model";

/**
 * 현행 서비스 기준선 레인. `@toonstudio/studio-brush-platform`의 입력 모델링(`modelRawInput`) →
 * 안정화(`applyStabilizer`) → perfect-freehand 외곽선(`strokeOutlinePath`)을 그대로 쓰고,
 * 폴리곤을 자체 even-odd 스캔라인(4×4 서브샘플 AA)으로 선형 premultiplied 문서에 래스터한다.
 * 서비스 패키지 import는 이 파일(과 지정 테스트)에서만 한다.
 *
 * 의미: 벡터 외곽 1개를 획 종료 시 한 번에 채우므로 dab·타일·습식 개념이 없다. 영수증의 `dabCount`는
 * 모델링된(정본) 표본 수, `submitCount`는 래스터 패스 수(획당 1)다. 프로그램의 질감·물리는 반영하지 않는다
 * (현행 서비스가 그런 것처럼) — 이 레인은 "지금 서비스 품질"의 기준선이다.
 */
export const PLATFORM_BASELINE_LANE_ID: LaneId = "platform-baseline";

/** 서브샘플 격자(한 축). 4×4 = 16 표본/px. */
export const PLATFORM_AA_GRID = 4;

export interface PlatformBaselineOptions {
  /** 서비스 안정화 그래프. 기본은 BrushProgramIR 기본값(ema, strength 0.35). */
  stabilizer?: StabilizerGraphIR;
  /** 장치 교정. 기본은 선형 압력 곡선·오프셋 0. */
  calibration?: DeviceCalibrationIR;
  /** 획 색(sRGB straight). 기본 검정 불투명. */
  color?: Rgba;
}

const IR_DYNAMIC_INPUTS = new Set<DynamicMappingIR["input"]>([
  "pressure",
  "velocity",
  "tiltAltitude",
  "tiltAzimuth",
  "twist",
  "random",
  "constant",
]);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Sumi 프로그램 → 서비스 BrushProgramIR(기하·안정화·크기 동역학만 대응; 질감·물리는 서비스에 없다). */
export function platformProgramOf(program: BrushProgram, opts: PlatformBaselineOptions = {}): BrushProgramIR {
  const sizeDynamics: DynamicMappingIR[] = [];
  for (const m of program.strokeDynamics.size) {
    if (!IR_DYNAMIC_INPUTS.has(m.input as DynamicMappingIR["input"])) continue;
    const curve = m.curve.length >= 2 ? m.curve.map(clamp01) : [clamp01(m.curve[0] ?? 0), clamp01(m.curve[0] ?? 0)];
    sizeDynamics.push({ input: m.input as DynamicMappingIR["input"], curve, min: m.min, max: m.max });
  }
  return brushProgramIRSchema.parse({
    id: `sumi:${program.id}`,
    name: program.name,
    stabilizer: opts.stabilizer ?? { kind: "ema", strength: 0.35, predictionMs: 0 },
    sizeDynamics,
    geometry: {
      kind: "perfect-freehand",
      // 압력 동역학이 있으면 strokeOutlinePath가 thinning을 1로 고정해 표본별 반경을 쓴다.
      thinning: sizeDynamics.length > 0 ? 1 : 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      capStart: true,
      capEnd: true,
    },
    tip: { kind: "round", hardness: clamp01(program.tip.hardness), spacingPct: 10, angleJitterDeg: 0 },
    mixing: { kind: "none", strength: 0 },
    output: { target: "vector-path", bake: "editable-proxy" },
  });
}

export function defaultCalibration(): DeviceCalibrationIR {
  return deviceCalibrationIRSchema.parse({ deviceId: "brush-lab-generic", label: "브러시 랩 기본", pressureCurve: [0, 1] });
}

/**
 * 폴리곤(PathIR의 M/L/Z 서브패스) → 커버리지(0..1, width·height). even-odd 규칙, 4×4 서브샘플.
 * 베지에 verb는 이 레인이 만들지 않으므로 거부한다(RangeError).
 */
export function rasterizeEvenOdd(path: PathIR, width: number, height: number, grid = PLATFORM_AA_GRID): Float32Array {
  const coverage = new Float32Array(width * height);
  const edges: number[] = []; // x0,y0,x1,y1 ...
  let startX = 0;
  let startY = 0;
  let curX = 0;
  let curY = 0;
  let open = false;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const pushEdge = (x0: number, y0: number, x1: number, y1: number): void => {
    if (y0 === y1) return;
    edges.push(x0, y0, x1, y1);
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    if (lo < minY) minY = lo;
    if (hi > maxY) maxY = hi;
  };
  for (const verb of path.verbs) {
    if (verb.v === "M") {
      if (open) pushEdge(curX, curY, startX, startY);
      startX = verb.x;
      startY = verb.y;
      curX = verb.x;
      curY = verb.y;
      open = true;
    } else if (verb.v === "L") {
      pushEdge(curX, curY, verb.x, verb.y);
      curX = verb.x;
      curY = verb.y;
    } else if (verb.v === "Z") {
      if (open) pushEdge(curX, curY, startX, startY);
      curX = startX;
      curY = startY;
      open = false;
    } else {
      throw new RangeError(`rasterizeEvenOdd: unsupported path verb '${verb.v}'`);
    }
  }
  if (open) pushEdge(curX, curY, startX, startY);
  if (edges.length === 0) return coverage;
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(height - 1, Math.ceil(maxY));
  const sub = 1 / grid;
  const weight = 1 / (grid * grid);
  const rowHits = new Uint16Array(width);
  const xs: number[] = [];
  for (let py = yStart; py <= yEnd; py += 1) {
    rowHits.fill(0);
    let any = false;
    for (let k = 0; k < grid; k += 1) {
      const sy = py + (k + 0.5) * sub;
      xs.length = 0;
      for (let e = 0; e < edges.length; e += 4) {
        const x0 = edges[e] ?? 0;
        const y0 = edges[e + 1] ?? 0;
        const x1 = edges[e + 2] ?? 0;
        const y1 = edges[e + 3] ?? 0;
        // 반개구간 [min, max)로 정점 이중 계산을 피한다.
        if ((y0 <= sy && sy < y1) || (y1 <= sy && sy < y0)) {
          xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = xs[i] ?? 0;
        const xb = xs[i + 1] ?? 0;
        // 서브컬럼 중심 (s + 0.5)/grid ∈ [xa, xb)
        const s0 = Math.max(0, Math.ceil(xa * grid - 0.5));
        const s1 = Math.min(width * grid - 1, Math.floor(xb * grid - 0.5 - 1e-9));
        for (let s = s0; s <= s1; s += 1) {
          const px = (s / grid) | 0;
          rowHits[px] = (rowHits[px] ?? 0) + 1;
          any = true;
        }
      }
    }
    if (!any) continue;
    const row = py * width;
    for (let px = 0; px < width; px += 1) {
      const h = rowHits[px] ?? 0;
      if (h > 0) coverage[row + px] = h * weight;
    }
  }
  return coverage;
}

export class PlatformBaselineLane implements BrushEngineLane {
  readonly id: LaneId = PLATFORM_BASELINE_LANE_ID;
  readonly label = "현행 서비스 기준선(studio-brush-platform 외곽선 → even-odd 래스터)";
  readonly kind: LaneKind = "baseline";
  readonly status: LaneStatus = "implemented";
  readonly engineVersion = `${SUMI_ENGINE_VERSION}+platform-baseline`;

  private readonly opts: PlatformBaselineOptions;
  private readonly calibration: DeviceCalibrationIR;
  private readonly colorLinear: [number, number, number, number];
  private width = 0;
  private height = 0;
  private document: Float32Array | null = null;
  private clock: Clock | null = null;
  private program: BrushProgram | null = null;
  private programIr: BrushProgramIR | null = null;
  private seed = 0;
  private samples: RawSample[] = [];
  private frameIndex = 0;
  private frameTimes: number[] = [];
  private outline: PathIR | null = null;
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  constructor(opts: PlatformBaselineOptions = {}) {
    this.opts = opts;
    this.calibration = opts.calibration ?? defaultCalibration();
    const c = opts.color ?? [0, 0, 0, 1];
    this.colorLinear = [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2]), c[3]];
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    return supportedReport(this.id);
  }

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    if (!Number.isInteger(config.width) || !Number.isInteger(config.height) || config.width <= 0 || config.height <= 0) {
      throw new RangeError(`platform-baseline: invalid canvas ${config.width}×${config.height}`);
    }
    this.width = config.width;
    this.height = config.height;
    this.document = new Float32Array(config.width * config.height * 4);
    this.clock = env.clock;
    this.program = null;
    this.programIr = null;
  }

  beginStroke(program: BrushProgram, seed: number): void {
    this.requireDocument("beginStroke");
    if (this.program) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    this.program = program;
    this.programIr = platformProgramOf(program, this.opts);
    this.seed = seed;
    this.samples = [];
    this.frameIndex = 0;
    this.frameTimes = [];
    this.outline = null;
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    this.requireDocument("addSamples");
    if (!this.program) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    let accepted = 0;
    for (const s of samples) {
      if (s.source === "predicted") continue;
      this.samples.push(s);
      accepted += 1;
    }
    const dt = clock ? clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    const receipt: DabBatchReceipt = {
      frameIndex: this.frameIndex,
      dabCount: accepted,
      submitCount: 0,
      dispatchCount: 0,
      inputToSubmitMs: null,
    };
    this.frameIndex += 1;
    return receipt;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const doc = this.requireDocument("endStroke");
    const program = this.program;
    const ir = this.programIr;
    if (!program || !ir) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const modeled = applyStabilizer(modelRawInput(this.samples, this.calibration), ir.stabilizer);
    const stroke: StrokeIR = {
      id: `bench-${this.seed}`,
      brushPresetId: program.id,
      seed: this.seed,
      color: { r: 0, g: 0, b: 0, a: 1 },
      baseSizePx: program.tip.sizePx,
      samples: modeled,
    };
    const outline = modeled.length > 0 ? strokeOutlinePath(ir, stroke) : { verbs: [] };
    this.outline = outline;
    const coverage = rasterizeEvenOdd(outline, this.width, this.height);
    const [lr, lg, lb, la] = this.colorLinear;
    const opacity = program.deposition.opacity * la;
    for (let i = 0; i < coverage.length; i += 1) {
      const a = (coverage[i] ?? 0) * opacity;
      if (a <= 0) continue;
      const o = i * 4;
      const inv = 1 - a;
      doc[o] = Math.fround(lr * a + (doc[o] ?? 0) * inv);
      doc[o + 1] = Math.fround(lg * a + (doc[o + 1] ?? 0) * inv);
      doc[o + 2] = Math.fround(lb * a + (doc[o + 2] ?? 0) * inv);
      doc[o + 3] = Math.fround(a + (doc[o + 3] ?? 0) * inv);
    }
    const dt = clock ? clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    const receipt: StrokeReceipt = {
      dabCount: modeled.length,
      submitCount: 1,
      gpuTimeMs: null,
      timingSource: "unavailable",
      frameTimesMs: [...this.frameTimes],
      overflowDabs: 0,
      poolTilesUsed: 0,
    };
    this.program = null;
    this.programIr = null;
    this.samples = [];
    this.lifetime.strokes += 1;
    this.lifetime.dabs += modeled.length;
    this.lifetime.submits += 1;
    this.lifetime.lastReceipt = receipt;
    return receipt;
  }

  async readback(): Promise<LabImage> {
    const doc = this.requireDocument("readback");
    return encodeLabImage(doc, this.width, this.height);
  }

  async readbackLinear(): Promise<Float32Array | null> {
    return new Float32Array(this.requireDocument("readbackLinear"));
  }

  /** 마지막 획의 서비스 외곽선(테스트·시각화용). */
  lastOutline(): PathIR | null {
    return this.outline;
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  dispose(): void {
    this.document = null;
    this.program = null;
    this.programIr = null;
    this.samples = [];
    this.clock = null;
    this.disposed = true;
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireDocument(op: string): Float32Array {
    this.assertAlive(op);
    if (!this.document) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return this.document;
  }
}

export function createPlatformBaselineLane(opts: PlatformBaselineOptions = {}): BrushEngineLane {
  return new PlatformBaselineLane(opts);
}
