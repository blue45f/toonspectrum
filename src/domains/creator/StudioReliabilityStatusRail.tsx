/**
 * 신뢰성 상태 레일 — 저장·GPU·저장소 상태와 Safe Mode 를 사용자가 보는 곳에 띄운다.
 *
 * 감사(ux-audit-v5 §2.11)가 지목한 "숨은 실패" 세 가지(메인 캔버스 GPU 강등,
 * 자동저장 실패, OPFS 쿼터 초과)의 표시 지점이다. 기존 세션 복구 배너와 같은 레일
 * (StudioCanvasStatusRail) 안에 산다.
 *
 * 배선 규율:
 *  - **prop 이 없다.** 스토어를 직접 구독하므로 캔버스 뷰포트(무접촉 파일)의 prop
 *    사슬을 늘리지 않는다.
 *  - 마운트가 Safe Mode 런타임을 세운다(고지 표면이 곧 관측 표면). 언마운트는 런타임을
 *    내리지 않는다 — 세션 단위 상태기계이기 때문.
 *  - 아무 문제도 없을 때는 한 줄짜리 조용한 요약만 남긴다(상시 표시 · 비방해).
 */

import { useEffect } from "react";

import {
  dismissStudioDestructiveActionRecord,
} from "./studio-destructive-action-preview";
import {
  describeStudioSafeModeReason,
  exitStudioSafeModeManually,
} from "./studio-reliability-status-store";
import { ensureStudioSafeModeRuntime } from "./studio-safe-mode-runtime";
import {
  useStudioDestructiveActionRecord,
  useStudioReliabilityStatus,
} from "./use-studio-reliability-status";

import type { StudioReliabilityLevel, StudioReliabilitySignal } from "./studio-reliability-status-store";

/** 되돌릴 수 있는 파괴가 성공했을 때 실행 취소 버튼을 띄워 두는 시간. */
export const STUDIO_DESTRUCTIVE_UNDO_WINDOW_MS = 12_000;

function levelClassName(level: StudioReliabilityLevel): string {
  switch (level) {
    case "failed":
      return "border-danger/40 bg-danger-soft/20 text-danger";
    case "degraded":
      return "border-warning/35 bg-warning-soft/20 text-warning";
    case "ok":
      return "border-cool/35 bg-cool/10 text-cool";
  }
}

function SignalRow({ signal }: { signal: StudioReliabilitySignal }) {
  return (
    <div
      data-studio-reliability-signal={signal.channel}
      data-studio-reliability-level={signal.level}
      role="status"
      aria-live="polite"
      className={`mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${levelClassName(signal.level)}`}
    >
      <span className="min-w-0 flex-1 font-semibold leading-relaxed">{signal.title}</span>
      {signal.detail ? (
        <span className="min-w-0 basis-full text-[0.68rem] font-medium opacity-80">
          {signal.detail}
        </span>
      ) : null}
    </div>
  );
}

export function StudioReliabilityStatusRail() {
  const status = useStudioReliabilityStatus();
  const destructive = useStudioDestructiveActionRecord();

  useEffect(() => {
    // 고지 표면이 마운트되면 로스 관측을 세운다. GPU 디바이스를 미리 잡지는 않는다.
    ensureStudioSafeModeRuntime();
  }, []);

  useEffect(() => {
    // 성공한 파괴는 실행 취소 창이 닫히면 스스로 물러난다. 거절·실패는 사용자가
    // 닫을 때까지 남는다 — 처리되지 않은 실패가 조용히 사라지면 안 된다.
    if (!destructive || destructive.outcome !== "committed") return;
    const recordId = destructive.id;
    const timer = setTimeout(() => {
      dismissStudioDestructiveActionRecord(recordId);
    }, STUDIO_DESTRUCTIVE_UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [destructive]);

  const safeMode = status.safeMode;
  const hasSignal = status.gpu !== null || status.save !== null || status.storage !== null;

  return (
    <div data-studio-reliability-status-rail>
      {safeMode.active ? (
        <div
          data-studio-safe-mode-banner
          role="status"
          aria-live="polite"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning-soft/25 p-2.5 text-xs text-warning"
        >
          <span className="min-w-0 flex-1 leading-relaxed">
            <strong className="font-bold">안전 모드</strong>
            <span className="ml-1.5 font-medium">
              그림과 문서는 그대로예요. 화질과 속도만 낮췄습니다.
            </span>
            <span className="mt-1 block text-[0.68rem] font-medium opacity-85">
              {safeMode.reasons.map(describeStudioSafeModeReason).join(" · ")}
            </span>
          </span>
          <button
            type="button"
            data-studio-safe-mode-exit
            onClick={exitStudioSafeModeManually}
            className="ml-auto min-h-11 shrink-0 rounded-lg bg-accent/20 px-3 py-2 font-bold text-accent hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            안전 모드 해제
          </button>
        </div>
      ) : null}

      {status.gpu ? <SignalRow signal={status.gpu} /> : null}
      {status.save ? <SignalRow signal={status.save} /> : null}
      {status.storage ? <SignalRow signal={status.storage} /> : null}

      {destructive ? (
        <div
          data-studio-destructive-action-notice
          data-studio-destructive-outcome={destructive.outcome}
          role="status"
          aria-live="polite"
          className={`mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${
            destructive.outcome === "committed"
              ? "border-line bg-card text-fg-2"
              : "border-danger/40 bg-danger-soft/20 text-danger"
          }`}
        >
          <span className="min-w-0 flex-1 font-medium leading-relaxed">
            {destructive.summary}
          </span>
          {destructive.undo ? (
            <button
              type="button"
              data-studio-destructive-undo
              onClick={() => {
                destructive.undo?.();
                dismissStudioDestructiveActionRecord(destructive.id);
              }}
              className="ml-auto min-h-11 shrink-0 rounded-lg bg-accent/20 px-3 py-2 font-bold text-accent hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              실행 취소
            </button>
          ) : (
            <button
              type="button"
              onClick={() => dismissStudioDestructiveActionRecord(destructive.id)}
              className="ml-auto min-h-11 shrink-0 rounded-lg bg-line px-3 py-2 font-medium text-fg-3 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              닫기
            </button>
          )}
        </div>
      ) : null}

      {!safeMode.active && !hasSignal ? (
        <p
          data-studio-reliability-idle
          className="mb-2 text-[0.68rem] font-medium leading-relaxed text-fg-3"
        >
          저장·GPU 이상 없음
        </p>
      ) : null}
    </div>
  );
}
