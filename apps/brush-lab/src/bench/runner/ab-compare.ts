import { perfSampleFromReceipts, summarizePerf } from "../metrics/perf-metrics";
import {
  coverageIoU,
  deltaEStatsImages,
  fuzzyMismatchPct,
  pixelHash,
} from "../metrics/render-metrics";

import { diffHeatmap } from "./diff-map";

import type { RunResult } from "./run-fixture";
import type { LabImage } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { LaneId } from "../../lanes/lane";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";
import type { PerfSummary } from "../metrics/perf-metrics";
import type { DeltaEStats } from "../metrics/render-metrics";

/**
 * A/B 레인 비교(동기). 두 실행 결과는 같은 fixture·캔버스여야 하며 다르면 RangeError.
 */
export interface AbComparison {
  laneA: LaneId;
  laneB: LaneId;
  fixtureId: string;
  presetId: string;
  iou: number;
  deltaE: DeltaEStats;
  fuzzyMismatchPct: number;
  hashEqual: boolean;
  hashA: string;
  hashB: string;
  perfA: PerfSummary;
  perfB: PerfSummary;
  heatmap: LabImage;
}

export function compareLanes(
  a: RunResult,
  b: RunResult,
  program: BrushProgram,
  fixture: StrokeFixture,
): AbComparison {
  if (a.image.width !== b.image.width || a.image.height !== b.image.height) {
    throw new RangeError(
      `compareLanes: canvas mismatch ${a.image.width}×${a.image.height} vs ${b.image.width}×${b.image.height}`,
    );
  }
  if (a.fixtureId !== fixture.id || b.fixtureId !== fixture.id) {
    throw new RangeError(
      `compareLanes: fixture mismatch (${a.fixtureId}, ${b.fixtureId}) vs ${fixture.id}`,
    );
  }
  const hashA = pixelHash(a.image);
  const hashB = pixelHash(b.image);
  return {
    laneA: a.laneId,
    laneB: b.laneId,
    fixtureId: fixture.id,
    presetId: program.id,
    iou: coverageIoU(a.image, b.image),
    deltaE: deltaEStatsImages(a.image, b.image),
    fuzzyMismatchPct: fuzzyMismatchPct(a.image.data, b.image.data, a.image.width, a.image.height),
    hashEqual: hashA === hashB,
    hashA,
    hashB,
    perfA: summarizePerf(perfSampleFromReceipts(a.receipt, a.frames, a.elapsedMs)),
    perfB: summarizePerf(perfSampleFromReceipts(b.receipt, b.frames, b.elapsedMs)),
    heatmap: diffHeatmap(a.image, b.image),
  };
}
