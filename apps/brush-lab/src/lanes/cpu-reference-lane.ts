import { InvalidStateError } from "../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../engine/core/version";
import { StrokePipeline } from "../engine/dynamics/stroke-pipeline";
import { Surface } from "../engine/raster/reference-renderer";

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
import type { Clock, LabImage, RawSample } from "../engine/core/types";
import type { LatencyRecord } from "../engine/input/input-pipeline";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * CPU 참조 레인(기준선). 엔진의 `StrokePipeline`(입력→물리→dab)과 `Surface`(타일 fine 래스터·합성·습식)를
 * 레인 계약으로 감싼다. GPU 레인의 결정성 검증 기준이며 Node에서 전부 검증된다.
 *
 * 영수증 의미(CPU): 프레임당 래스터 호출 1회를 `submitCount` 1로, 더럽혀진 타일 수를 `dispatchCount`로,
 * addSamples 호출의 경과(ms)를 `inputToSubmitMs`로 기록한다. GPU 시간은 없다(timingSource unavailable).
 */
export const CPU_REFERENCE_LANE_ID: LaneId = "cpu-reference";

export class CpuReferenceLane implements BrushEngineLane {
  readonly id: LaneId = CPU_REFERENCE_LANE_ID;
  readonly label = "CPU 참조(Sumi StrokePipeline + Surface)";
  readonly kind: LaneKind = "baseline";
  readonly status: LaneStatus = "implemented";
  readonly engineVersion = SUMI_ENGINE_VERSION;

  private surface: Surface | null = null;
  private clock: Clock | null = null;
  private pipeline: StrokePipeline | null = null;
  private frameIndex = 0;
  private frameTimes: number[] = [];
  private frameDabs = 0;
  private latency: readonly LatencyRecord[] = [];
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    return supportedReport(this.id);
  }

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    const opts: { strokeCapacityTiles?: number; wetCapacityTiles?: number } = {};
    if (config.strokeCapacityTiles !== undefined) opts.strokeCapacityTiles = config.strokeCapacityTiles;
    if (config.wetCapacityTiles !== undefined) opts.wetCapacityTiles = config.wetCapacityTiles;
    this.surface = new Surface(config.width, config.height, opts);
    this.clock = env.clock;
    this.pipeline = null;
  }

  beginStroke(program: BrushProgram, seed: number): void {
    const surface = this.requireSurface("beginStroke");
    if (this.pipeline) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    surface.beginStroke(program, seed);
    this.pipeline = new StrokePipeline(program, seed, undefined, surface.paperField());
    this.frameIndex = 0;
    this.frameTimes = [];
    this.frameDabs = 0;
    this.latency = [];
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    const surface = this.requireSurface("addSamples");
    const pipeline = this.pipeline;
    if (!pipeline) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const batch = pipeline.push(samples);
    const receipt = surface.addDabs(batch);
    const dt = clock ? clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    this.frameDabs += batch.count;
    const out: DabBatchReceipt = {
      frameIndex: this.frameIndex,
      dabCount: batch.count,
      submitCount: 1,
      dispatchCount: receipt.dirtyTiles,
      inputToSubmitMs: clock ? dt : null,
    };
    this.frameIndex += 1;
    return out;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const surface = this.requireSurface("endStroke");
    const pipeline = this.pipeline;
    if (!pipeline) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const tail = pipeline.finish();
    surface.addDabs(tail);
    const cpu = surface.endStroke();
    const dt = clock ? clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    this.latency = pipeline.stats().latency;
    this.pipeline = null;
    const receipt: StrokeReceipt = {
      dabCount: cpu.dabCount,
      submitCount: this.frameTimes.length,
      gpuTimeMs: null,
      timingSource: "unavailable",
      frameTimesMs: [...this.frameTimes],
      overflowDabs: cpu.overflowDabs,
      poolTilesUsed: cpu.poolTilesUsed,
    };
    this.lifetime.strokes += 1;
    this.lifetime.dabs += cpu.dabCount;
    this.lifetime.submits += receipt.submitCount;
    this.lifetime.lastReceipt = receipt;
    return receipt;
  }

  async readback(): Promise<LabImage> {
    return this.requireSurface("readback").toLabImage();
  }

  async readbackLinear(): Promise<Float32Array | null> {
    return this.requireSurface("readbackLinear").toLinear();
  }

  /** 마지막 획의 입력 파이프라인 지연 기록(리포트 `handfeel.latency*`). */
  strokeLatency(): readonly LatencyRecord[] {
    return this.latency;
  }

  /** 현재 표면(테스트·습식 상태 검사용). init 전·dispose 후는 null. */
  currentSurface(): Surface | null {
    return this.surface;
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  dispose(): void {
    this.surface = null;
    this.pipeline = null;
    this.clock = null;
    this.disposed = true;
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireSurface(op: string): Surface {
    this.assertAlive(op);
    if (!this.surface) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return this.surface;
  }
}

export function createCpuReferenceLane(): BrushEngineLane {
  return new CpuReferenceLane();
}
