import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  buildStoryBeats,
  calculateStreak,
  createEmptyNowState,
  getKstDay,
  getMode,
  getThemeForDay,
  makeBriefText,
  NOW_PROGRESS_STEPS,
  NOW_STORAGE_KEY,
  parseNowState,
  serializeNowState,
  type NowModeId,
  type NowProgressStepId,
  type NowState,
} from "./now";
import {
  ARCHIVE_DAYS,
  makeShareUrl,
  SESSION_PRESETS,
  trimDates,
  WEEKLY_WINDOW_DAYS,
  type ArchiveEntry,
  type ArchiveFilterId,
  type SessionPresetId,
} from "./now-page/config";
import { NowCreationBoard } from "./now-page/NowCreationBoard";
import { NowFlowArchive } from "./now-page/NowFlowArchive";
import { NowFocusResearch } from "./now-page/NowFocusResearch";
import { NowPlanning } from "./now-page/NowPlanning";
import { NowSceneHero } from "./now-page/NowSceneHero";
import { NowVariationLab } from "./now-page/NowVariationLab";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";

function readStoredState(): NowState {
  if (typeof window === "undefined") return createEmptyNowState();
  try {
    return parseNowState(window.localStorage.getItem(NOW_STORAGE_KEY));
  } catch {
    return createEmptyNowState();
  }
}

export function NowPage() {
  const nowRef = useRef(new Date());
  const archive = useMemo<ArchiveEntry[]>(
    () =>
      Array.from({ length: ARCHIVE_DAYS }, (_, offset) => {
        const day = getKstDay(nowRef.current, offset);
        return { day, theme: getThemeForDay(day) };
      }),
    [],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<NowState>(readStoredState);
  const [storageError, setStorageError] = useState("");
  const [briefCopyStatus, setBriefCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [linkCopyStatus, setLinkCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterId>("all");
  const [sessionPresetId, setSessionPresetId] = useState<SessionPresetId>("focus");
  const briefCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestedDay = searchParams.get("day");
  const requestedOffset = requestedDay ? archive.findIndex(({ day }) => day.iso === requestedDay) : 0;
  const selectedOffset = requestedOffset >= 0 ? requestedOffset : 0;
  const selected = archive[selectedOffset] ?? archive[0]!;
  const today = archive[0]!.day;
  const theme = selected.theme;
  const mode = getMode(state.mode);
  const storyBeats = buildStoryBeats(theme, mode);
  const selectedProgress = state.progressByDate[selected.day.iso] ?? [];
  const progressPercent = Math.round((selectedProgress.length / NOW_PROGRESS_STEPS.length) * 100);
  const nextProgressStep = NOW_PROGRESS_STEPS.find((step) => !selectedProgress.includes(step.id));
  const nextStepLabel = nextProgressStep?.label ?? "완주 리뷰";
  const streak = calculateStreak(state.completedDates, today.iso);
  const isSaved = state.savedDates.includes(selected.day.iso);
  const completedThisWeek = archive
    .slice(0, WEEKLY_WINDOW_DAYS)
    .filter(({ day }) => state.completedDates.includes(day.iso)).length;
  const savedInArchive = archive.filter(({ day }) => state.savedDates.includes(day.iso)).length;
  const sessionPreset = SESSION_PRESETS.find((preset) => preset.id === sessionPresetId) ?? SESSION_PRESETS[1];
  const assetHref = `/research/assets?q=${encodeURIComponent(theme.assetQuery)}&page=1`;
  const bookHref = `/research/books?q=${encodeURIComponent(theme.bookQuery)}&page=1`;

  useEffect(() => {
    try {
      window.localStorage.setItem(NOW_STORAGE_KEY, serializeNowState(state));
      setStorageError("");
    } catch {
      setStorageError("브라우저 저장 공간에 기록하지 못했습니다. 비공개 모드 또는 저장 용량을 확인하세요.");
    }
  }, [state]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key === NOW_STORAGE_KEY) setState(parseNowState(event.newValue));
    }
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  useEffect(
    () => () => {
      if (briefCopyTimerRef.current) clearTimeout(briefCopyTimerRef.current);
      if (linkCopyTimerRef.current) clearTimeout(linkCopyTimerRef.current);
    },
    [],
  );

  function selectArchiveOffset(offset: number) {
    const entry = archive[offset];
    if (!entry) return;
    const nextParams = new URLSearchParams(searchParams);
    if (offset === 0) nextParams.delete("day");
    else nextParams.set("day", entry.day.iso);
    setSearchParams(nextParams);
  }

  function setMode(modeId: NowModeId) {
    setState((current) => ({ ...current, mode: modeId }));
  }

  function toggleSaved() {
    setState((current) => {
      const saved = current.savedDates.includes(selected.day.iso)
        ? current.savedDates.filter((date) => date !== selected.day.iso)
        : trimDates([...current.savedDates, selected.day.iso], 60);
      return { ...current, savedDates: saved };
    });
  }

  function toggleProgress(stepId: NowProgressStepId) {
    setState((current) => {
      const completedSteps = new Set(current.progressByDate[selected.day.iso] ?? []);
      if (completedSteps.has(stepId)) completedSteps.delete(stepId);
      else completedSteps.add(stepId);

      const nextSteps = NOW_PROGRESS_STEPS.map((step) => step.id).filter((id) => completedSteps.has(id));
      const progressByDate = { ...current.progressByDate };
      if (nextSteps.length > 0) progressByDate[selected.day.iso] = nextSteps;
      else delete progressByDate[selected.day.iso];

      const completedDates = new Set(current.completedDates);
      if (nextSteps.length === NOW_PROGRESS_STEPS.length) completedDates.add(selected.day.iso);
      else completedDates.delete(selected.day.iso);

      return {
        ...current,
        progressByDate,
        completedDates: trimDates([...completedDates], 400),
      };
    });
  }

  async function copyBrief() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(makeBriefText(selected.day, theme, mode));
      setBriefCopyStatus("copied");
      if (briefCopyTimerRef.current) clearTimeout(briefCopyTimerRef.current);
      briefCopyTimerRef.current = setTimeout(() => setBriefCopyStatus("idle"), 1800);
    } catch {
      setBriefCopyStatus("error");
    }
  }

  async function copyShareLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(makeShareUrl(selected.day.iso, today.iso));
      setLinkCopyStatus("copied");
      if (linkCopyTimerRef.current) clearTimeout(linkCopyTimerRef.current);
      linkCopyTimerRef.current = setTimeout(() => setLinkCopyStatus("idle"), 1800);
    } catch {
      setLinkCopyStatus("error");
    }
  }

  return (
    <ResourceLayout
      title="오늘의 영감"
      intro="매일 한 장면을 발견하고, 연출 모드·제작 시간·명시적 변주 규칙을 고른 뒤 5컷으로 실행하는 데일리 창작 데스크입니다. 저장·완주·개인 메모는 이 브라우저에만 남습니다."
      width="wide"
    >
      <NowSceneHero
        selectedOffset={selectedOffset}
        day={selected.day}
        theme={theme}
        mode={mode}
        streak={streak}
        completedThisWeek={completedThisWeek}
        savedInArchive={savedInArchive}
        progressPercent={progressPercent}
        nextStepLabel={nextStepLabel}
        isSaved={isSaved}
        briefCopyStatus={briefCopyStatus}
        linkCopyStatus={linkCopyStatus}
        onCopyBrief={() => void copyBrief()}
        onToggleSaved={toggleSaved}
        onCopyShareLink={() => void copyShareLink()}
      />

      <NowFlowArchive
        archive={archive}
        selectedOffset={selectedOffset}
        state={state}
        progressPercent={progressPercent}
        nextStepLabel={nextStepLabel}
        archiveFilter={archiveFilter}
        onArchiveFilterChange={setArchiveFilter}
        onSelectOffset={selectArchiveOffset}
      />

      <NowPlanning
        sessionPreset={sessionPreset}
        mode={mode}
        modeId={state.mode}
        onSessionPresetChange={setSessionPresetId}
        onModeChange={setMode}
      />

      <NowVariationLab day={selected.day} theme={theme} mode={mode} sessionPreset={sessionPreset} />

      <NowCreationBoard
        day={selected.day}
        theme={theme}
        mode={mode}
        sessionPreset={sessionPreset}
        selectedProgress={selectedProgress}
        progressPercent={progressPercent}
        nextStepLabel={nextStepLabel}
        storyBeats={storyBeats}
        onToggleProgress={toggleProgress}
        onCopyBrief={() => void copyBrief()}
      />

      <NowFocusResearch sessionPreset={sessionPreset} assetHref={assetHref} bookHref={bookHref} />

      <LocalSaveNotice error={storageError || undefined} writable={!storageError} />

      <aside className="flex items-start gap-3 rounded-2xl border border-line bg-card/40 p-5 text-sm leading-7 text-fg-2">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
        <p>
          오늘의 주제·미션·연출 가이드는 ToonStudio의 오리지널 에디토리얼 콘텐츠입니다. 외부 자료는 Studio에 자동 삽입하지 않으며,
          원문·출처·현재 이용조건을 확인한 뒤 사용해야 합니다. 기준일: {selected.day.iso}
        </p>
      </aside>
    </ResourceLayout>
  );
}
