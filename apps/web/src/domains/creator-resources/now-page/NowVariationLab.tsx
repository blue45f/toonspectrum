import { Check, Copy, PenLine, Shuffle, Sparkles, Target } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { cn } from "@/shared/lib/utils";

import type { DailyTheme, DirectingMode, KstDay } from "../now";
import { ACTION_BUTTON, PRIMARY_BUTTON, type SessionPreset } from "./config";
import {
  DIALOGUE_OPTIONS,
  FRAMING_OPTIONS,
  getVariationDayState,
  makeVariationBrief,
  NOW_VARIATION_NOTE_MAX_LENGTH,
  NOW_VARIATION_STORAGE_KEY,
  parseVariationState,
  PRESSURE_OPTIONS,
  serializeVariationState,
  upsertVariationDayState,
  VISUAL_RULE_OPTIONS,
  createEmptyVariationState,
  createVariationCandidates,
  type VariationCandidateId,
  type VariationOption,
  type VariationSelection,
  type VariationState,
} from "./variation";

type CopyStatus = "idle" | "copied" | "error";

function readStoredState(): VariationState {
  if (typeof window === "undefined") return createEmptyVariationState();
  try {
    return parseVariationState(window.localStorage.getItem(NOW_VARIATION_STORAGE_KEY));
  } catch {
    return createEmptyVariationState();
  }
}

function AxisPicker<Id extends string>({
  title,
  description,
  options,
  value,
  onChange,
}: {
  title: string;
  description: string;
  options: readonly VariationOption<Id>[];
  value: Id;
  onChange: (value: Id) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-line bg-canvas/55 p-4 sm:p-5">
      <legend className="px-1 text-sm font-bold text-fg">{title}</legend>
      <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={cn(
                "min-h-20 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                active ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/45",
              )}
            >
              <strong className="block text-sm text-fg">{option.label}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{option.summary}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function NowVariationLab({
  day,
  theme,
  mode,
  sessionPreset,
}: {
  day: KstDay;
  theme: DailyTheme;
  mode: DirectingMode;
  sessionPreset: SessionPreset;
}) {
  const [state, setState] = useState<VariationState>(readStoredState);
  const [storageError, setStorageError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayState = getVariationDayState(state, day.iso, mode.id);
  const candidates = createVariationCandidates({
    day,
    theme,
    mode,
    sessionMinutes: sessionPreset.minutes,
    selection: dayState.selection,
    shuffle: dayState.shuffle,
  });
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === dayState.selectedCandidateId) ?? candidates[0]!;

  useEffect(() => {
    try {
      window.localStorage.setItem(NOW_VARIATION_STORAGE_KEY, serializeVariationState(state));
      setStorageError("");
    } catch {
      setStorageError("변주 선택과 메모를 브라우저에 저장하지 못했습니다. 저장 공간 또는 비공개 모드를 확인하세요.");
    }
  }, [state]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key === NOW_VARIATION_STORAGE_KEY) setState(parseVariationState(event.newValue));
    }
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  function updateDayState(update: (current: typeof dayState) => typeof dayState) {
    setState((current) => {
      const currentDayState = getVariationDayState(current, day.iso, mode.id);
      return upsertVariationDayState(current, day.iso, update(currentDayState));
    });
  }

  function updateSelection<Key extends keyof VariationSelection>(key: Key, value: VariationSelection[Key]) {
    updateDayState((current) => ({
      ...current,
      selection: { ...current.selection, [key]: value },
      selectedCandidateId: "route-1",
    }));
  }

  function shuffleCandidates() {
    updateDayState((current) => ({
      ...current,
      shuffle: (current.shuffle + 1) % 10_000,
      selectedCandidateId: "route-1",
    }));
  }

  function selectCandidate(candidateId: VariationCandidateId) {
    updateDayState((current) => ({ ...current, selectedCandidateId: candidateId }));
  }

  function updateNote(note: string) {
    updateDayState((current) => ({ ...current, note: note.slice(0, NOW_VARIATION_NOTE_MAX_LENGTH) }));
  }

  async function copySelectedBrief() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        makeVariationBrief(
          { day, theme, mode, sessionMinutes: sessionPreset.minutes },
          selectedCandidate,
          dayState.note,
        ),
      );
      setCopyStatus("copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section
      id="variation-lab"
      className="scroll-mt-28 overflow-hidden rounded-3xl border border-line bg-panel"
      aria-labelledby="variation-lab-title"
    >
      <div className="border-b border-line bg-gradient-to-br from-accent-soft/80 via-panel to-panel p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-accent">
              <Sparkles size={16} aria-hidden="true" /> EXPLICIT VARIATION LAB
            </div>
            <h2 id="variation-lab-title" className="mt-2 text-2xl font-bold text-fg sm:text-3xl">
              오늘의 변주 랩
            </h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              더 많은 영감을 무한 스크롤하지 않고, 촬영 거리·서사 압력·대사량·시각 규칙을 직접 정해 같은 소재의 실행 가능한
              3개 제작안으로 좁힙니다. 선택은 추천 알고리즘이 아니라 화면에 보이는 규칙으로만 결정됩니다.
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-canvas/70 px-4 py-3 text-right">
            <strong className="font-display text-2xl tabular-nums text-fg">256</strong>
            <span className="ml-1 text-xs font-bold text-fg-3">COMBINATIONS</span>
            <p className="mt-1 text-xs text-fg-3">4개 축 × 각 4개 선택지</p>
          </div>
        </div>
      </div>

      <div className="space-y-7 p-5 sm:p-7">
        <div className="grid gap-4 xl:grid-cols-2">
          <AxisPicker
            title="1. 촬영 거리"
            description="독자가 처음 받는 정보의 크기와 순서를 정합니다."
            options={FRAMING_OPTIONS}
            value={dayState.selection.framing}
            onChange={(value) => updateSelection("framing", value)}
          />
          <AxisPicker
            title="2. 서사 압력"
            description="평범한 장면을 사건으로 바꾸는 긴장 원인을 고릅니다."
            options={PRESSURE_OPTIONS}
            value={dayState.selection.pressure}
            onChange={(value) => updateSelection("pressure", value)}
          />
          <AxisPicker
            title="3. 대사 예산"
            description="설명 과잉을 막고 그림이 담당할 몫을 명확히 합니다."
            options={DIALOGUE_OPTIONS}
            value={dayState.selection.dialogue}
            onChange={(value) => updateSelection("dialogue", value)}
          />
          <AxisPicker
            title="4. 시각 규칙"
            description="다섯 컷을 하나의 작품처럼 묶어 줄 형식 제약을 선택합니다."
            options={VISUAL_RULE_OPTIONS}
            value={dayState.selection.visualRule}
            onChange={(value) => updateSelection("visualRule", value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-canvas/55 p-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">VARIATION SET</p>
            <p className="mt-1 text-sm font-semibold text-fg">세트 {dayState.shuffle + 1} · 선택 규칙을 유지한 3개 경로</p>
          </div>
          <button type="button" className={ACTION_BUTTON} onClick={shuffleCandidates}>
            <Shuffle size={16} aria-hidden="true" /> 같은 규칙으로 다시 섞기
          </button>
        </div>

        <ol className="grid gap-4 lg:grid-cols-3" aria-label="생성된 변주안">
          {candidates.map((candidate, index) => {
            const active = candidate.id === dayState.selectedCandidateId;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`변주안 ${index + 1} 선택: ${candidate.title}`}
                  onClick={() => selectCandidate(candidate.id)}
                  className={cn(
                    "h-full min-h-72 w-full rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                    active ? "border-accent bg-accent-soft" : "border-line bg-canvas/55 hover:border-accent/45",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold tracking-[0.13em] text-accent">{candidate.routeLabel}</span>
                    <span className="font-display text-3xl font-black tabular-nums text-fg/20">0{index + 1}</span>
                  </span>
                  <strong className="mt-5 block text-lg text-fg">{candidate.title}</strong>
                  <span className="mt-2 block text-xs font-semibold leading-5 text-fg-3">{candidate.signature}</span>
                  <span className="mt-5 block text-sm leading-7 text-fg-2">{candidate.hook}</span>
                  <span className="mt-5 block border-t border-line pt-4 text-xs leading-6 text-fg-3">
                    완료 기준 · {candidate.successCheck}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <article className="rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-6" aria-labelledby="selected-route-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-accent">SELECTED ROUTE</p>
                <h3 id="selected-route-title" className="mt-2 text-xl font-bold text-fg">
                  {selectedCandidate.title}
                </h3>
                <p className="mt-1 text-xs font-semibold text-fg-3">{selectedCandidate.signature}</p>
              </div>
              <Target size={22} className="text-accent" aria-hidden="true" />
            </div>
            <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-bold text-fg-3">5컷 전략</dt>
                <dd className="mt-1 leading-7 text-fg">{selectedCandidate.panelPlan}</dd>
              </div>
              <div>
                <dt className="font-bold text-fg-3">강제 제약</dt>
                <dd className="mt-1 leading-7 text-fg">{selectedCandidate.constraint}</dd>
              </div>
              <div>
                <dt className="font-bold text-fg-3">첫 행동</dt>
                <dd className="mt-1 leading-7 text-fg">{selectedCandidate.startAction}</dd>
              </div>
              <div>
                <dt className="font-bold text-fg-3">독해 점검</dt>
                <dd className="mt-1 leading-7 text-fg">{selectedCandidate.successCheck}</dd>
              </div>
            </dl>
            <button type="button" className={`${PRIMARY_BUTTON} mt-6`} onClick={() => void copySelectedBrief()}>
              {copyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copyStatus === "copied" ? "선택안 복사됨" : "선택안 브리프 복사"}
            </button>
            {copyStatus === "copied" && (
              <span className="sr-only" role="status">
                선택한 변주안과 개인 메모가 클립보드에 복사되었습니다.
              </span>
            )}
            {copyStatus === "error" && (
              <p className="mt-3 text-sm font-semibold text-bad" role="alert">
                선택안을 클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.
              </p>
            )}
          </article>

          <aside className="rounded-2xl border border-line bg-canvas/55 p-5 sm:p-6" aria-labelledby="variation-note-title">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised text-accent">
                <PenLine size={19} aria-hidden="true" />
              </span>
              <div>
                <h3 id="variation-note-title" className="font-bold text-fg">
                  개인 제작 메모
                </h3>
                <p className="mt-1 text-xs leading-5 text-fg-3">캐릭터, 감정, 수정할 단서를 짧게 남겨 복사 브리프에 함께 포함합니다.</p>
              </div>
            </div>
            <label className="mt-5 block" htmlFor={`variation-note-${day.iso}`}>
              <span className="sr-only">개인 제작 메모</span>
              <textarea
                id={`variation-note-${day.iso}`}
                value={dayState.note}
                maxLength={NOW_VARIATION_NOTE_MAX_LENGTH}
                rows={8}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateNote(event.target.value)}
                aria-describedby={`variation-note-count-${day.iso}`}
                placeholder="예: 주인공은 장갑을 이미 알고 있다. 마지막 컷에서만 왼손을 보여주기."
                className="w-full resize-y rounded-xl border border-line bg-panel px-4 py-3 text-sm leading-7 text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>
            <div id={`variation-note-count-${day.iso}`} className="mt-2 flex items-center justify-between gap-3 text-xs text-fg-3">
              <span>이 날짜에만 연결되는 로컬 메모</span>
              <span className="font-display tabular-nums">
                {dayState.note.length}/{NOW_VARIATION_NOTE_MAX_LENGTH}
              </span>
            </div>
            <p className="mt-4 text-xs leading-6 text-fg-3">
              변주 선택과 메모는 계정이나 서버로 전송하지 않고 이 브라우저에만 보관합니다.
            </p>
            {storageError && (
              <p className="mt-3 text-xs font-semibold leading-6 text-bad" role="alert">
                {storageError}
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
