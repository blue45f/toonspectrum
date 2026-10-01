import { DabBatch } from "../core/dab-layout";
import { StrokeBudgetExceededError } from "../core/errors";
import { InputPipeline, resolveInputConfig } from "../input/input-pipeline";
import { PHYSICS_DT_MS, PhysicsModel } from "../physics/physics-model";

import { DabEmitter, MIN_SPACING_PX } from "./dab-emitter";

import type { DabEmitterOptions } from "./dab-emitter";
import type { ContactFootprint, ModeledSample, PreviewSample, RawSample } from "../core/types";
import type { InputPipelineConfig, LatencyRecord } from "../input/input-pipeline";
import type { BrushProgram } from "../presets/program-schema";
import type { PaperField } from "../texture/paper-grain";

/**
 * 모든 레인이 공유하는 프론트엔드(platform-baseline 제외):
 * RawSample → InputPipeline → PhysicsModel(고정 dt) → DabEmitter → DabBatch.
 */
export interface StrokePipelineStats {
  samplesIn: number;
  samplesCommitted: number;
  dabsEmitted: number;
  latency: readonly LatencyRecord[];
}

export class StrokePipeline {
  private readonly program: BrushProgram;
  private readonly input: InputPipeline;
  private readonly physics: PhysicsModel;
  private readonly emitter: DabEmitter;
  private readonly dual: boolean;
  private lastT: number | null = null;
  private samplesIn = 0;
  private samplesCommitted = 0;
  private dabsEmitted = 0;

  constructor(
    program: BrushProgram,
    seed: number,
    inputConfig?: Partial<InputPipelineConfig>,
    paper: PaperField | null = null,
    opts: DabEmitterOptions = {},
  ) {
    this.program = program;
    const cfg = resolveInputConfig({ ...program.input, ...inputConfig });
    this.input = new InputPipeline(cfg);
    this.physics = new PhysicsModel(program.physics, paper, seed, {
      tipRadiusPx: program.tip.sizePx / 2,
      paperSpec: program.paper.enabled ? program.paper : null,
    });
    this.emitter = new DabEmitter(program, seed, opts);
    this.dual = program.deposition.dual !== null;
  }

  /** 이 호출(프레임)에서 방출된 dab. */
  push(raw: readonly RawSample[]): DabBatch {
    this.samplesIn += raw.length;
    const { committed } = this.input.push(raw);
    return this.emitSamples(committed, false);
  }

  preview(): PreviewSample[] {
    return this.input.preview();
  }

  finish(): DabBatch {
    const tail = this.input.finish();
    return this.emitSamples(tail, true);
  }

  stats(): StrokePipelineStats {
    return {
      samplesIn: this.samplesIn,
      samplesCommitted: this.samplesCommitted,
      dabsEmitted: this.dabsEmitted,
      latency: this.input.latency(),
    };
  }

  private emitSamples(samples: ModeledSample[], final: boolean): DabBatch {
    this.samplesCommitted += samples.length;
    const footprints: ContactFootprint[] = [];
    let pathLen = 0;
    let spanMs = 0;
    let prevX: number | null = null;
    let prevY = 0;
    for (const s of samples) {
      const dt = this.lastT === null ? PHYSICS_DT_MS : Math.max(0, s.tMs - this.lastT);
      this.lastT = s.tMs;
      spanMs += dt;
      footprints.push(this.physics.step(s, dt));
      if (prevX !== null) pathLen += Math.hypot(s.x - prevX, s.y - prevY);
      prevX = s.x;
      prevY = s.y;
    }
    // 보류 중인 끝 테이퍼 dab·시간 기반 dab까지 담을 수 있게 넉넉히 잡는다.
    const spacingFloor = Math.max(MIN_SPACING_PX, this.program.deposition.spacing * 0.05);
    const timeDabs = Math.ceil((spanMs * this.program.deposition.timeDabsPerSecond) / 1000) + samples.length;
    const estimate = Math.ceil(pathLen / spacingFloor) + samples.length + timeDabs + 64;
    const extra = final ? Math.ceil(this.program.edge.taperEndPx / spacingFloor) + 16 : 0;
    const capacity = (estimate + extra) * (this.dual ? 2 : 1);
    const batch = new DabBatch(capacity);
    let n = this.emitter.emit(samples, footprints, batch);
    if (final) n += this.emitter.end(batch);
    if (batch.count >= batch.capacity && n > 0) {
      throw new StrokeBudgetExceededError(batch.count + 1, batch.capacity, { stage: "stroke-pipeline" });
    }
    this.dabsEmitted += n;
    return batch;
  }
}
