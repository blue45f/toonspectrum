import { SlidersHorizontal, Target, Timer } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { NOW_MODES, type DirectingMode, type NowModeId } from "../now";
import {
  MODE_SIGNALS,
  SESSION_PRESETS,
  type SessionPreset,
  type SessionPresetId,
} from "./config";

function SessionPlanner({
  sessionPreset,
  onSessionPresetChange,
}: {
  sessionPreset: SessionPreset;
  onSessionPresetChange: (presetId: SessionPresetId) => void;
}) {
  return (
    <section
      id="session-plan"
      className="scroll-mt-28 rounded-3xl border border-line bg-panel p-5 sm:p-7"
      aria-labelledby="session-plan-title"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
        <div>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Timer size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">SESSION PLANNER</p>
              <h2 id="session-plan-title" className="mt-1 text-2xl font-bold text-fg">
                오늘 쓸 시간만 먼저 고르기
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">
                영감을 더 찾기 전에 끝낼 수 있는 범위를 정합니다. 선택한 시간은 아래 집중 타이머와 제작 산출물에 즉시 반영됩니다.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3" role="group" aria-label="제작 세션 길이">
            {SESSION_PRESETS.map((preset) => {
              const active = sessionPreset.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSessionPresetChange(preset.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                    active ? "border-accent bg-accent-soft" : "border-line bg-canvas/60 hover:border-accent/45",
                  )}
                >
                  <span className="font-display text-3xl font-black tabular-nums text-fg">{preset.minutes}</span>
                  <span className="ml-1 text-xs font-bold text-fg-3">MIN</span>
                  <strong className="mt-3 block text-sm text-fg">{preset.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{preset.tagline}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-2xl border border-accent/30 bg-accent-soft p-5" aria-label="선택한 제작 세션 결과">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">EXPECTED OUTPUT</p>
              <p className="mt-1 text-lg font-bold text-fg">{sessionPreset.minutes}분 뒤 남길 것</p>
            </div>
            <Target size={22} className="text-accent" aria-hidden="true" />
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="font-bold text-fg-3">산출물</dt>
              <dd className="mt-1 leading-6 text-fg">{sessionPreset.deliverable}</dd>
            </div>
            <div>
              <dt className="font-bold text-fg-3">오늘의 제약</dt>
              <dd className="mt-1 leading-6 text-fg">{sessionPreset.constraint}</dd>
            </div>
            <div>
              <dt className="font-bold text-fg-3">시작 규칙</dt>
              <dd className="mt-1 leading-6 text-fg">{sessionPreset.start}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function DirectingModePanel({
  mode,
  modeId,
  onModeChange,
}: {
  mode: DirectingMode;
  modeId: NowModeId;
  onModeChange: (modeId: NowModeId) => void;
}) {
  const modeSignals = MODE_SIGNALS[modeId];

  return (
    <section
      id="directing-mode"
      className="scroll-mt-28 rounded-3xl border border-line bg-panel p-5 sm:p-7"
      aria-labelledby="directing-mode-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <SlidersHorizontal size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">DIRECTING MODE</p>
          <h2 id="directing-mode-title" className="mt-1 text-2xl font-bold text-fg">
            같은 소재를 내 방식으로 보기
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            추천을 숨겨진 알고리즘에 맡기지 않고, 오늘 집중할 연출 문법을 직접 선택합니다.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="연출 모드">
        {NOW_MODES.map((candidate) => {
          const active = modeId === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={active}
              onClick={() => onModeChange(candidate.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                active ? "border-accent bg-accent-soft" : "border-line bg-canvas/60 hover:border-accent/45",
              )}
            >
              <strong className="block text-sm text-fg">{candidate.label}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{candidate.tagline}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 border-t border-line pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["렌즈", mode.lens],
            ["색 설계", mode.palette],
            ["패널 리듬", mode.pacing],
          ].map(([label, value]) => (
            <div key={label} className="border-l-2 border-accent/40 pl-4">
              <span className="text-xs font-bold text-accent">{label}</span>
              <p className="mt-2 text-sm font-semibold leading-6 text-fg">{value}</p>
            </div>
          ))}
          <p className="rounded-xl bg-raised/60 p-4 text-sm leading-7 text-fg-2 sm:col-span-3">{mode.note}</p>
        </div>

        <aside aria-label={`${mode.label} 연출 신호`}>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">MODE SIGNAL</p>
          <div className="mt-4 space-y-4">
            {modeSignals.map((signal) => (
              <div key={signal.label}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-fg-2">{signal.label}</span>
                  <span className="font-display font-bold tabular-nums text-fg">{signal.value}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${signal.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function NowPlanning({
  sessionPreset,
  mode,
  modeId,
  onSessionPresetChange,
  onModeChange,
}: {
  sessionPreset: SessionPreset;
  mode: DirectingMode;
  modeId: NowModeId;
  onSessionPresetChange: (presetId: SessionPresetId) => void;
  onModeChange: (modeId: NowModeId) => void;
}) {
  return (
    <>
      <SessionPlanner sessionPreset={sessionPreset} onSessionPresetChange={onSessionPresetChange} />
      <DirectingModePanel mode={mode} modeId={modeId} onModeChange={onModeChange} />
    </>
  );
}
