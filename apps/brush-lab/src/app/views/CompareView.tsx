import { useEffect, useMemo, useRef } from "react";

import { LAB_SCHEMA_VERSION } from "../../engine/core/version";
import { presentPreview } from "../../platform/canvas-present";
import { useLab, useLabSelector } from "../shell/lab-context";
import { findDescriptor } from "../state/lane-helpers";
import { LiveStrokeSession } from "../state/live-session";
import { pixelHashOf } from "../state/pixel-hash";
import { codeOf, messageOf, probeLane, resolveProgram, runCompare } from "../state/run-compare";
import { BrushParamPanel } from "../ui/BrushParamPanel";
import { DiffHeatmap } from "../ui/DiffHeatmap";
import { FixturePicker } from "../ui/FixturePicker";
import { LaneCanvas } from "../ui/LaneCanvas";
import { LaneSelector } from "../ui/LaneSelector";
import { MetricsTable } from "../ui/MetricsTable";
import { ReportPanel } from "../ui/ReportPanel";

import type { PreviewPoint } from "../../platform/canvas-present";
import type { RunResult } from "../state/bench-types";
import type { LiveStrokeResult } from "../state/live-session";

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

/** 실시간 세션 통계(마지막 획). */
function LiveStatsPanel() {
  const live = useLabSelector((s) => s.live);
  const receipt = live.lastReceipt;
  const inputToSubmit = live.frames
    .map((f) => f.inputToSubmitMs)
    .filter((v): v is number => typeof v === "number");
  return (
    <dl className="lab-stats" aria-label="실시간 입력 통계">
      <div>
        <dt>획 수</dt>
        <dd>{live.strokes}</dd>
      </div>
      <div>
        <dt>마지막 획 dab</dt>
        <dd>{receipt ? receipt.dabCount : "—"}</dd>
      </div>
      <div>
        <dt>프레임 p50 / p95 (ms)</dt>
        <dd>
          {receipt ? `${fmt(percentile(receipt.frameTimesMs, 50))} / ${fmt(percentile(receipt.frameTimesMs, 95))}` : "—"}
        </dd>
      </div>
      <div>
        <dt>입력→제출 p95 (ms)</dt>
        <dd>{fmt(percentile(inputToSubmit, 95))}</dd>
      </div>
      <div>
        <dt>GPU 시간 / 출처</dt>
        <dd>{receipt ? `${fmt(receipt.gpuTimeMs)} / ${receipt.timingSource}` : "—"}</dd>
      </div>
      <div>
        <dt>비닝 초과 dab</dt>
        <dd className={receipt && receipt.overflowDabs > 0 ? "lab-verdict-FAIL" : undefined}>
          {receipt ? receipt.overflowDabs : "—"}
        </dd>
      </div>
    </dl>
  );
}

/**
 * A/B 비교 탭. fixture 리플레이(A/B 실행)와 실시간 입력(레인 A에 직접 그리기)을 지원한다.
 * 실시간 획이 끝나면 정본 표본을 캡처 획으로 저장하므로 바로 A/B 리플레이 비교로 이어진다.
 */
export function CompareView() {
  const ctx = useLab();
  const { registry, env, store, actions } = ctx;
  const laneA = useLabSelector((s) => s.laneA);
  const laneB = useLabSelector((s) => s.laneB);
  const liveCapture = useLabSelector((s) => s.liveCapture);
  const running = useLabSelector((s) => s.running);
  const results = useLabSelector((s) => s.results);
  const canvasSize = useLabSelector((s) => s.canvasSize);
  const seed = useLabSelector((s) => s.seed);
  const presetId = useLabSelector((s) => s.presetId);
  const overrides = useLabSelector((s) => s.overrides);
  const resolved = useMemo(() => resolveProgram({ presetId, overrides }), [presetId, overrides]);
  const program = resolved.program;
  const programHash = resolved.hash;

  const descA = findDescriptor(registry, laneA);
  const descB = findDescriptor(registry, laneB);
  const stageA = useRef<HTMLDivElement | null>(null);
  const previewA = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<LiveStrokeSession | null>(null);
  const trailRef = useRef<PreviewPoint[]>([]);

  // 실시간 세션 생명주기: 토글·레인 A·프로그램 해시·캔버스 크기·시드가 바뀌면 다시 만든다.
  useEffect(() => {
    if (!liveCapture) return;
    if (!program || !programHash) {
      actions.pushError({ laneId: null, code: "program-invalid", message: resolved.error ?? "프로그램 해석 실패" });
      actions.setLiveCapture(false);
      return;
    }
    const desc = findDescriptor(registry, laneA);
    if (!desc || desc.status === "reserved") {
      actions.pushError({ laneId: laneA, code: "not-implemented", message: `실시간 입력: 레인 '${laneA}'은(는) 쓸 수 없다` });
      actions.setLiveCapture(false);
      return;
    }
    let cancelled = false;
    let session: LiveStrokeSession | null = null;
    let detach: (() => void) | null = null;
    const radius = program.tip.sizePx / 2;
    const drawPreview = (predicted: PreviewPoint[]): void => {
      const canvas = previewA.current;
      if (!canvas) return;
      try {
        presentPreview(canvas, [...trailRef.current, ...predicted], radius);
      } catch (error) {
        actions.pushError({ laneId: laneA, code: codeOf(error), message: `미리보기 표시 실패: ${messageOf(error)}` });
      }
    };
    const onStrokeEnd = (res: LiveStrokeResult, strokes: number, lane: { id: typeof laneA; engineVersion: string }): void => {
      trailRef.current = [];
      drawPreview([]);
      const capability = store.get().capability[laneA];
      if (!capability) return;
      const runResult: RunResult = {
        laneId: lane.id,
        engineVersion: lane.engineVersion,
        fixtureId: "captured:live",
        fixtureSeed: 0,
        presetId: program.id,
        seed: res.seed,
        canvas: { width: canvasSize, height: canvasSize, dpr: 1 },
        frameMs: 1000 / 60,
        sampleCount: res.samples.length,
        image: res.image,
        linear: res.linear,
        receipt: res.receipt,
        frames: res.frames,
        capability,
        elapsedMs: res.receipt.frameTimesMs.reduce((acc, v) => acc + v, 0),
      };
      actions.setResults({ a: runResult, b: null, comparison: null, reportA: null, reportB: null, source: "live" });
      actions.setCaptured({
        version: LAB_SCHEMA_VERSION,
        userAgent: env.userAgent ?? "unknown",
        pointerType: res.samples[0]?.pointerType ?? "mouse",
        width: canvasSize,
        height: canvasSize,
        capturedAt: new Date().toISOString(),
        samples: res.samples,
      });
      actions.setLiveStats({ strokes, lastReceipt: res.receipt, frames: res.frames });
    };
    const start = async (): Promise<void> => {
      const capability = store.get().capability[laneA] ?? (await probeLane(desc, env));
      actions.setCapability(laneA, capability);
      if (capability.status === "unavailable") {
        throw new Error(`레인 '${desc.label}' unavailable: ${capability.reasons.join(", ")}`);
      }
      const created = await LiveStrokeSession.create({
        createLane: () => desc.create(),
        env,
        program,
        seed,
        width: canvasSize,
        height: canvasSize,
        onCanonical: (samples) => {
          for (const s of samples) {
            if (s.phase === "down") trailRef.current = [];
            trailRef.current.push({ x: s.x, y: s.y, pressure: s.pressure });
          }
        },
        onPreview: drawPreview,
        onStrokeEnd: (res) => {
          if (!session) return;
          onStrokeEnd(res, session.strokes, session.currentLane);
        },
        onError: (error) =>
          actions.pushError({ laneId: laneA, code: codeOf(error), message: `실시간 세션 오류: ${messageOf(error)}` }),
      });
      if (cancelled) {
        created.dispose();
        return;
      }
      session = created;
      sessionRef.current = created;
      const stage = stageA.current;
      if (stage) detach = created.attach(stage);
    };
    start().catch((error: unknown) => {
      actions.pushError({ laneId: laneA, code: codeOf(error), message: `실시간 세션 시작 실패: ${messageOf(error)}` });
      actions.setLiveCapture(false);
    });
    return () => {
      cancelled = true;
      if (detach) detach();
      if (session) session.dispose();
      sessionRef.current = null;
    };
  }, [liveCapture, laneA, program, programHash, canvasSize, seed, registry, env, store, actions, resolved.error]);

  const onRun = (): void => {
    void runCompare({ registry, env, runner: ctx.runner, store, actions });
  };
  const onClearLive = (): void => {
    const session = sessionRef.current;
    if (!session) return;
    session
      .clear()
      .then(() => actions.clearResults())
      .catch((error: unknown) =>
        actions.pushError({ laneId: laneA, code: codeOf(error), message: `실시간 캔버스 비우기 실패: ${messageOf(error)}` }),
      );
  };

  const hashA = results.reportA?.pixelHash ?? (results.a ? pixelHashOf(results.a.image) : null);
  const hashB = results.reportB?.pixelHash ?? (results.b ? pixelHashOf(results.b.image) : null);
  const labelA = descA ? descA.label : laneA;
  const labelB = descB ? descB.label : laneB;

  return (
    <div className="lab-tabpanel">
      <section className="lab-panel">
        <h2>레인 · 입력</h2>
        <div className="lab-form-grid">
          <LaneSelector slot="a" />
          <LaneSelector slot="b" />
        </div>
        <FixturePicker />
      </section>
      <section className="lab-panel">
        <h2>브러시 파라미터</h2>
        <BrushParamPanel />
      </section>
      <section className="lab-panel">
        <div className="lab-button-row">
          <button type="button" className="lab-button lab-button--primary" disabled={running} onClick={onRun}>
            {running ? "실행 중…" : "A/B 실행"}
          </button>
          <button type="button" className="lab-button" disabled={running} onClick={() => actions.clearResults()}>
            결과 지우기
          </button>
          {liveCapture ? (
            <button type="button" className="lab-button" disabled={running} onClick={onClearLive}>
              실시간 캔버스 비우기
            </button>
          ) : null}
          <span className="lab-muted" aria-live="polite" data-testid="lab-run-status">
            {running
              ? "레인 A → B 순차 실행 중"
              : results.source === "live"
                ? "실시간 획 결과 — 캡처 획이 저장됐다. 'A/B 실행'으로 두 레인에 리플레이한다."
                : results.a || results.b
                  ? "fixture 리플레이 결과"
                  : "대기"}
          </span>
        </div>
        <div className="lab-grid-3">
          <LaneCanvas
            slot="A"
            laneLabel={labelA}
            image={results.a?.image ?? null}
            size={canvasSize}
            pixelHash={hashA}
            live={liveCapture}
            stageRef={(el) => {
              stageA.current = el;
            }}
            previewRef={(el) => {
              previewA.current = el;
            }}
          >
            {liveCapture ? (
              <p className="lab-muted">
                미리보기 레이어에는 입력 궤적과 예측 표본만 그린다(정본 아님). 획을 떼면 레인 readback 결과로 바뀐다.
              </p>
            ) : null}
          </LaneCanvas>
          <LaneCanvas slot="B" laneLabel={labelB} image={results.b?.image ?? null} size={canvasSize} pixelHash={hashB} />
          <DiffHeatmap image={results.comparison?.heatmap ?? null} size={canvasSize} />
        </div>
        {liveCapture ? <LiveStatsPanel /> : null}
      </section>
      <section className="lab-panel">
        <h2>지표 · 임계값 판정</h2>
        <MetricsTable
          reportA={results.reportA}
          reportB={results.reportB}
          comparison={results.comparison}
          laneA={laneA}
          laneB={laneB}
        />
      </section>
      <section className="lab-panel">
        <h2>리포트</h2>
        <ReportPanel />
      </section>
    </div>
  );
}
