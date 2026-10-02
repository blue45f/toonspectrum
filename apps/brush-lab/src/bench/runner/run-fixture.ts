import { LaneUnavailableError } from "../../engine/core/errors";
import { assertCanvasSize } from "../fixtures/canvas-presets";

import { DEFAULT_FRAME_MS, replayFrames } from "./replay";

import type { LabImage } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  LaneInit,
  StrokeReceipt,
} from "../../lanes/lane";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";

/**
 * fixture 1개를 레인 1개에서 리플레이한다(엔진 중립).
 * probe → init → beginStroke → addSamples(프레임당 1회) → endStroke → readback → dispose.
 * probe가 unavailable이면 `LaneUnavailableError`를 던진다(무음 대체 없음, ADR-0018).
 */
export interface RunOptions {
  lane: BrushEngineLane;
  env: LaneEnvironment;
  fixture: StrokeFixture;
  program: BrushProgram;
  seed: number;
  /** 프레임 분할 간격(ms). 기본 16.67. */
  frameMs?: number;
  /** 리플레이 속도 배율(1 = 실시간 경계). */
  speed?: number;
  /** 끝나면 레인을 dispose할지. 기본 true. */
  disposeLane?: boolean;
  /** 레인 초기화 추가 옵션(용량·표시 캔버스). */
  init?: Partial<Pick<LaneInit, "strokeCapacityTiles" | "wetCapacityTiles" | "presentCanvas">>;
}

export interface RunResult {
  laneId: LaneId;
  engineVersion: string;
  fixtureId: string;
  fixtureSeed: number;
  presetId: string;
  seed: number;
  canvas: { width: number; height: number; dpr: 1 };
  frameMs: number;
  sampleCount: number;
  image: LabImage;
  linear: Float32Array | null;
  receipt: StrokeReceipt;
  frames: DabBatchReceipt[];
  capability: LaneCapabilityReport;
  /** probe 이후 readback까지의 벽시계 경과(ms, env.clock 기준). */
  elapsedMs: number;
}

export async function runFixture(opts: RunOptions): Promise<RunResult> {
  const { lane, env, fixture, program, seed } = opts;
  assertCanvasSize(fixture);
  const frameMs = opts.frameMs ?? DEFAULT_FRAME_MS;
  const speed = opts.speed ?? 1;
  const capability = await lane.probe(env);
  if (capability.status !== "supported") {
    const code = capability.reasons[0] ?? "not-implemented";
    throw new LaneUnavailableError(code, `lane ${lane.id} unavailable: ${capability.reasons.join(", ")}`, {
      laneId: lane.id,
      reasons: capability.reasons,
    });
  }
  const t0 = env.clock.now();
  try {
    await lane.init(env, {
      width: fixture.width,
      height: fixture.height,
      dpr: 1,
      tileSize: 16,
      seed,
      ...opts.init,
    });
    lane.beginStroke(program, seed);
    const frames: DabBatchReceipt[] = [];
    for (const frame of replayFrames(fixture.samples, frameMs, speed)) {
      frames.push(lane.addSamples(frame));
    }
    const receipt = await lane.endStroke();
    const image = await lane.readback();
    const linear = await lane.readbackLinear();
    const elapsedMs = env.clock.now() - t0;
    if (image.width !== fixture.width || image.height !== fixture.height) {
      throw new RangeError(
        `runFixture: lane ${lane.id} returned ${image.width}×${image.height}, fixture is ${fixture.width}×${fixture.height}`,
      );
    }
    return {
      laneId: lane.id,
      engineVersion: lane.engineVersion,
      fixtureId: fixture.id,
      fixtureSeed: fixture.seed,
      presetId: program.id,
      seed,
      canvas: { width: fixture.width, height: fixture.height, dpr: 1 },
      frameMs,
      sampleCount: fixture.samples.length,
      image,
      linear,
      receipt,
      frames,
      capability,
      elapsedMs,
    };
  } finally {
    if (opts.disposeLane ?? true) lane.dispose();
  }
}
