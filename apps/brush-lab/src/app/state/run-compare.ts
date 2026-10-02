import { capturedStrokeToFixture } from "../../bench/fixtures/fixture-schema";
import { buildFixture } from "../../bench/fixtures/stroke-fixtures";
import { SumiError } from "../../engine/core/errors";
import { presetById } from "../../engine/presets/catalog";
import { brushConfigHashSync } from "../../engine/presets/program-schema";
import { unavailableReport } from "../../lanes/lane";

import { applyOverrides } from "./apply-overrides";
import { findDescriptor } from "./lane-helpers";

import type { BenchRunner, BuildReportInput, ReportReference } from "./bench-runner";
import type { RunResult } from "./bench-types";
import type { LabActions, LabResults, LabState, LabStore } from "./lab-store";
import type { StrokeFixture } from "../../bench/fixtures/stroke-fixtures";
import type { BrushCertificationReport } from "../../bench/report/report-schema";
import type { LabImage } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
} from "../../lanes/lane";

/**
 * A/B 비교 실행 컨트롤러. 뷰는 이 모듈의 함수만 호출하고 bench 러너·레인 생명주기는 여기서만 다룬다.
 * 레인 unavailable·초기화 실패는 오류 목록에 사유 코드로 올리고 다른 레인으로 자동 전환하지 않는다(ADR-0018).
 */

export interface CompareDeps {
  registry: readonly LaneDescriptor[];
  env: LaneEnvironment;
  runner: BenchRunner;
  store: LabStore;
  actions: LabActions;
}

export interface ResolvedProgram {
  program: BrushProgram | null;
  /** fnv1a64(canonicalJson) — 패널 즉시 표시용. */
  hash: string | null;
  error: string | null;
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function codeOf(error: unknown): string {
  if (error instanceof SumiError) return error.code;
  if (error instanceof Error) return error.name;
  return "error";
}

/** 프리셋 + 오버라이드 → 검증된 프로그램. 실패 사유는 문자열로 돌려준다(무음 보정 없음). */
export function resolveProgram(state: Pick<LabState, "presetId" | "overrides">): ResolvedProgram {
  let base: BrushProgram;
  try {
    base = presetById(state.presetId);
  } catch (error) {
    return {
      program: null,
      hash: null,
      error: `프리셋 '${state.presetId}'을(를) 찾을 수 없다: ${messageOf(error)}`,
    };
  }
  try {
    const program = applyOverrides(base, state.overrides);
    return { program, hash: brushConfigHashSync(program), error: null };
  } catch (error) {
    return { program: null, hash: null, error: `파라미터가 스키마 범위를 벗어났다: ${messageOf(error)}` };
  }
}

/** 현재 상태의 fixture(내장 또는 캡처 획). 캡처 획은 캡처 당시 캔버스 크기를 유지한다. */
export function resolveFixture(
  state: Pick<LabState, "fixtureId" | "fixtureSource" | "captured" | "canvasSize">,
): StrokeFixture {
  if (state.fixtureSource === "captured" && state.captured) {
    return capturedStrokeToFixture(state.captured, "live");
  }
  return buildFixture(state.fixtureId, { width: state.canvasSize, height: state.canvasSize });
}

/** 레인 1개 probe. reserved 레인과 생성 실패는 `not-implemented`로 보고한다(probe는 throw하지 않는다). */
export async function probeLane(desc: LaneDescriptor, env: LaneEnvironment): Promise<LaneCapabilityReport> {
  if (desc.status === "reserved") return unavailableReport(desc.id, ["not-implemented"]);
  let lane: BrushEngineLane;
  try {
    lane = desc.create();
  } catch {
    return unavailableReport(desc.id, ["not-implemented"]);
  }
  return lane.probe(env);
}

/** 레지스트리의 모든 레인을 probe해 저장소에 기록한다. */
export async function probeAllLanes(deps: Pick<CompareDeps, "registry" | "env" | "actions">): Promise<void> {
  await Promise.all(
    deps.registry.map(async (desc) => {
      const report = await probeLane(desc, deps.env);
      deps.actions.setCapability(desc.id, report);
    }),
  );
}

async function ensureCapability(deps: CompareDeps, desc: LaneDescriptor): Promise<LaneCapabilityReport> {
  const cached = deps.store.get().capability[desc.id];
  if (cached) return cached;
  const report = await probeLane(desc, deps.env);
  deps.actions.setCapability(desc.id, report);
  return report;
}

export interface SlotRun {
  result: RunResult | null;
  report: BrushCertificationReport | null;
}

export interface SlotOptions {
  /** 같은 입력을 새 레인 인스턴스로 한 번 더 실행해 결정성(해시 동일)을 판정한다. */
  rerun: boolean;
  /** 참조 레인 결과(ΔE·IoU·퍼지 불일치 비교 대상). */
  reference?: ReportReference;
}

const EMPTY_SLOT: SlotRun = { result: null, report: null };

/** 슬롯(A 또는 B) 1개를 fixture로 실행하고 인증 리포트를 만든다. 실패는 오류 목록에 남기고 빈 슬롯을 돌려준다. */
export async function runSlot(
  deps: CompareDeps,
  slot: "A" | "B",
  id: LaneId,
  fixture: StrokeFixture,
  program: BrushProgram,
  seed: number,
  opts: SlotOptions = { rerun: false },
): Promise<SlotRun> {
  const desc = findDescriptor(deps.registry, id);
  if (!desc) {
    deps.actions.pushError({ laneId: id, code: "lane-unknown", message: `${slot} 레인 '${id}'이(가) 레지스트리에 없다` });
    return EMPTY_SLOT;
  }
  const capability = await ensureCapability(deps, desc);
  if (capability.status === "unavailable") {
    deps.actions.pushError({
      laneId: id,
      code: capability.reasons[0] ?? "unavailable",
      message: `${slot} 레인 '${desc.label}'을(를) 쓸 수 없다(${capability.reasons.join(", ") || "사유 없음"}). 다른 레인으로 자동 전환하지 않는다.`,
    });
    return EMPTY_SLOT;
  }
  let lane: BrushEngineLane;
  try {
    lane = desc.create();
  } catch (error) {
    deps.actions.pushError({ laneId: id, code: codeOf(error), message: `${slot} 레인 생성 실패: ${messageOf(error)}` });
    return EMPTY_SLOT;
  }
  try {
    // 리포트 생성까지 레인을 살려 두고 finally에서 dispose한다(runFixture 기본값은 dispose).
    const result = await deps.runner.runFixture({ lane, env: deps.env, fixture, program, seed, disposeLane: false });
    const input: BuildReportInput = {
      lane,
      fixture,
      program,
      out: result.image,
      linear: result.linear,
      receipt: result.receipt,
      env: deps.env,
      clock: deps.env.clock,
      frames: result.frames,
      capability: result.capability,
      seed,
      frameMs: result.frameMs,
      elapsedMs: result.elapsedMs,
    };
    if (opts.reference) input.reference = opts.reference;
    if (opts.rerun) {
      const rerun = await rerunSlot(deps, slot, desc, fixture, program, seed);
      if (rerun) input.rerun = rerun;
    }
    const report = await deps.runner.buildReport(input);
    return { result, report };
  } catch (error) {
    deps.actions.pushError({ laneId: id, code: codeOf(error), message: `${slot} 레인 실행 실패: ${messageOf(error)}` });
    return EMPTY_SLOT;
  } finally {
    lane.dispose();
  }
}

/** 결정성 판정용 재실행. 실패는 오류로 남기고 null을 돌려준다(리포트는 rerun 없이 만들어져 UNAVAILABLE로 드러난다). */
async function rerunSlot(
  deps: CompareDeps,
  slot: "A" | "B",
  desc: LaneDescriptor,
  fixture: StrokeFixture,
  program: BrushProgram,
  seed: number,
): Promise<LabImage | null> {
  try {
    const lane = desc.create();
    const result = await deps.runner.runFixture({ lane, env: deps.env, fixture, program, seed });
    return result.image;
  } catch (error) {
    deps.actions.pushError({
      laneId: desc.id,
      code: codeOf(error),
      message: `${slot} 레인 결정성 재실행 실패(리포트는 재실행 없이 생성): ${messageOf(error)}`,
    });
    return null;
  }
}

/**
 * 현재 상태(레인 A/B·fixture·프리셋·오버라이드·시드·결정성 재실행)로 A/B를 순차 실행한다.
 * 결과·리포트는 저장소에 기록하고, 실행 여부(둘 중 하나라도 성공)를 돌려준다.
 */
export async function runCompare(deps: CompareDeps): Promise<boolean> {
  const state = deps.store.get();
  if (state.running) return false;
  const resolved = resolveProgram(state);
  if (!resolved.program) {
    deps.actions.pushError({ laneId: null, code: "program-invalid", message: resolved.error ?? "프로그램 해석 실패" });
    return false;
  }
  const program = resolved.program;
  const fixture = resolveFixture(state);
  deps.actions.setRunning(true);
  try {
    const a = await runSlot(deps, "A", state.laneA, fixture, program, state.seed, { rerun: state.determinismRerun });
    // 슬롯 A가 참조(기준) 레인이다: B 리포트는 A 결과 대비 ΔE·IoU·퍼지 불일치를 측정한다.
    const bOpts: SlotOptions = { rerun: state.determinismRerun };
    if (a.result) bOpts.reference = { laneId: a.result.laneId, image: a.result.image, linear: a.result.linear };
    const b = await runSlot(deps, "B", state.laneB, fixture, program, state.seed, bOpts);
    let comparison: LabResults["comparison"] = null;
    if (a.result && b.result) {
      try {
        comparison = deps.runner.compareLanes(a.result, b.result, program, fixture);
      } catch (error) {
        deps.actions.pushError({ laneId: null, code: codeOf(error), message: `A/B 비교 계산 실패: ${messageOf(error)}` });
      }
    }
    deps.actions.setResults({
      a: a.result,
      b: b.result,
      comparison,
      reportA: a.report,
      reportB: b.report,
      source: "fixture",
    });
    if (a.report) deps.actions.addReport(a.report);
    if (b.report) deps.actions.addReport(b.report);
    return a.result !== null || b.result !== null;
  } finally {
    deps.actions.setRunning(false);
  }
}
