import { buildReport } from "../../bench/report/build-report";
import { labImageToPngBytes, reportFileName, serializeReport } from "../../bench/report/serialize";
import { compareLanes } from "../../bench/runner/ab-compare";
import { runFixture } from "../../bench/runner/run-fixture";

import type { AbComparison, RunResult } from "./bench-types";
import type { StrokeFixture } from "../../bench/fixtures/stroke-fixtures";
import type { BrushCertificationReport } from "../../bench/report/report-schema";
import type { Clock, LabImage } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  StrokeReceipt,
} from "../../lanes/lane";

/**
 * UI가 쓰는 bench 러너·리포트 함수 묶음. 셸이 실제 bench 모듈로 한 번 구성하고
 * 테스트는 같은 인터페이스의 모의 구현(`app/testing/mock-runner.ts`)을 넣는다.
 * `runFixture` 입력은 bench 시그니처에서 유도하고, `buildReport` 입력은 스펙 §16 계약을 여기서 명시한다
 * (bench 구현이 더 넓은 입력을 받아도 호환되며, 좁아지면 `createBenchRunner`에서 typecheck가 드러낸다).
 */
export type RunFixtureOptions = Parameters<typeof runFixture>[0];

/** 참조 레인 결과(ΔE·IoU·퍼지 비교 대상). */
export interface ReportReference {
  laneId: LaneId;
  image: LabImage;
  linear: Float32Array | null;
}

/**
 * `buildReport` 입력(스펙 §16 + bench 선택 입력).
 * - `reference`: 참조 레인 결과(ΔE·IoU·퍼지 불일치) — UI는 슬롯 A를 B의 참조로 넘긴다.
 * - `rerun`: 같은 입력 재실행 이미지(결정성 = 해시 동일 1/0) — UI는 "결정성 재실행" 옵션으로 만든다.
 * - `frames`·`capability`·`seed`·`frameMs`·`elapsedMs`: 러너 결과를 그대로 넘겨 지연·환경·성능 지표를 채운다.
 */
export interface BuildReportInput {
  lane: BrushEngineLane;
  fixture: StrokeFixture;
  program: BrushProgram;
  out: LabImage;
  linear: Float32Array | null;
  receipt: StrokeReceipt;
  env: LaneEnvironment;
  clock: Clock;
  reference?: ReportReference;
  rerun?: LabImage;
  frames?: readonly DabBatchReceipt[];
  capability?: LaneCapabilityReport;
  seed?: number;
  frameMs?: number;
  elapsedMs?: number;
}

export interface BenchRunner {
  runFixture(opts: RunFixtureOptions): Promise<RunResult>;
  compareLanes(a: RunResult, b: RunResult, program: BrushProgram, fixture: StrokeFixture): AbComparison;
  buildReport(input: BuildReportInput): Promise<BrushCertificationReport>;
  /** 정규 직렬화(키 정렬) JSON 문자열. */
  serializeReport(report: BrushCertificationReport): string;
  /** `<presetId>-<laneId>-<YYYYMMDD>.json`. */
  reportFileName(report: BrushCertificationReport): string;
  /** 의존성 0 PNG 인코딩. */
  labImageToPngBytes(img: LabImage): Uint8Array;
}

export function createBenchRunner(): BenchRunner {
  return {
    runFixture,
    compareLanes,
    buildReport,
    serializeReport,
    reportFileName,
    labImageToPngBytes,
  };
}
