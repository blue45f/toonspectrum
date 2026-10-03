import { CalendarDays, Clock3, PanelsTopLeft, ShieldCheck, Shuffle } from "lucide-react";
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
import { NowCreationBoard, Storyboard } from "./now-page/NowCreationBoard";
import { NowFlowArchive } from "./now-page/NowFlowArchive";
import { FocusSprint, ResearchLaunchpad } from "./now-page/NowFocusResearch";
import { NowPlanning } from "./now-page/NowPlanning";
import { NowSceneHero } from "./now-page/NowSceneHero";
import { NowVariationLab } from "./now-page/NowVariationLab";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteSectionTabs, SiteTabPanel, type SiteSectionTab } from "@/domains/legal/public/site-section-tabs";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type CopyStatus = "idle" | "copied" | "error";
type NowTab = "mission" | "plan" | "variation" | "archive";
const NOW_TABS: readonly NowTab[] = ["mission", "plan", "variation", "archive"];
const NOW_TAB_PREFIX = "now-desk";

/**
 * 예전 섹션 앵커(제작 흐름 줄의 `#storyboard` 등)를 해당 탭으로 연다 — 공유 링크와
 * 머리말의 "다음 단계" 버튼이 탭 뒤에 숨은 목적지로 바로 이어지게 한다.
 */
const NOW_HASH_TABS: Readonly<Record<string, NowTab>> = {
  "#scene-ingredients": "mission",
  "#creation-loop": "mission",
  "#storyboard": "plan",
  "#session-plan": "plan",
  "#directing-mode": "plan",
  "#focus-sprint": "plan",
  "#variation-lab": "variation",
  "#spark-archive": "archive",
};

const COPY_STATUS_RESET_MS = 1800;

function readStoredState(): NowState {
  if (typeof window === "undefined") return createEmptyNowState();
  try {
    return parseNowState(window.localStorage.getItem(NOW_STORAGE_KEY));
  } catch {
    return createEmptyNowState();
  }
}

/** 복사 결과 표시 — 잠깐 "복사됨"을 보여 준 뒤 원래 라벨로 돌아간다(언마운트 시 타이머 정리). */
function useCopyFeedback(): readonly [CopyStatus, (text: string) => Promise<void>] {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus("idle"), COPY_STATUS_RESET_MS);
    } catch {
      setStatus("error");
    }
  };

  return [status, copy] as const;
}

/**
 * 오늘의 영감 — 머리말(오늘의 장면·바로 할 일)과 네 개의 탭(오늘 미션·시간과 연출·변주 실험·지난 영감).
 * 예전에는 브리프·세션·연출·변주·재료·5컷·진행률이 한 줄로 이어져 모바일에서 20화면을 넘었다.
 * 기능은 그대로 두고 "지금 할 일"이 먼저 보이도록 탭으로 묶었다. 5컷 비트 보드는 연출 방식에 따라
 * 달라지므로 연출 탭에 두고, 한 번 연 탭은 숨김만 바꿔 타이머·메모 입력이 탭 전환으로 끊기지 않는다.
 */
export function NowPage() {
  const bt = useBilingual("NowPage");
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
  const [briefCopyStatus, copyBriefText] = useCopyFeedback();
  const [linkCopyStatus, copyLinkText] = useCopyFeedback();
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterId>("all");
  const [sessionPresetId, setSessionPresetId] = useState<SessionPresetId>("focus");
  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({ ids: NOW_TABS, fallback: "mission", param: "view" });
  const { openAnchor } = useSiteTabAnchors(NOW_HASH_TABS, activeTab, selectTab);

  const requestedDay = searchParams.get("day");
  const requestedOffset = requestedDay ? archive.findIndex(({ day }) => day.iso === requestedDay) : 0;
  const selectedOffset = requestedOffset >= 0 ? requestedOffset : 0;
  const [todayEntry] = archive;
  const selected = archive[selectedOffset] ?? todayEntry;
  if (!selected || !todayEntry) throw new Error("오늘의 영감 아카이브가 비어 있습니다.");
  const today = todayEntry.day;
  const theme = selected.theme;
  const mode = getMode(state.mode);
  const storyBeats = buildStoryBeats(theme, mode);
  const selectedProgress = state.progressByDate[selected.day.iso] ?? [];
  const progressPercent = Math.round((selectedProgress.length / NOW_PROGRESS_STEPS.length) * 100);
  const nextProgressStep = NOW_PROGRESS_STEPS.find((step) => !selectedProgress.includes(step.id));
  const nextStepLabel = nextProgressStep?.label ?? bt("완주 리뷰", "Wrap-up review");
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

  function selectArchiveOffset(offset: number) {
    const entry = archive[offset];
    if (!entry) return;
    // 탭(`view`) 등 다른 주소 값은 그대로 두고 날짜만 바꾼다.
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (offset === 0) nextParams.delete("day");
      else nextParams.set("day", entry.day.iso);
      return nextParams;
    });
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

  const copyBrief = () => void copyBriefText(makeBriefText(selected.day, theme, mode));
  const copyShareLink = () => void copyLinkText(makeShareUrl(selected.day.iso, today.iso));

  const tabs: readonly SiteSectionTab<NowTab>[] = [
    { id: "mission", icon: PanelsTopLeft, label: bt("오늘 미션", "Today's mission"), badge: `${progressPercent}%` },
    { id: "plan", icon: Clock3, label: bt("시간·연출", "Time & directing") },
    { id: "variation", icon: Shuffle, label: bt("변주 실험", "Variations") },
    { id: "archive", icon: CalendarDays, label: bt("지난 영감", "Past sparks"), badge: savedInArchive || undefined },
  ];

  return (
    <ResourceLayout
      title={bt("오늘의 영감", "Daily spark")}
      intro={bt(
        "매일 바뀌는 한 장면을 5컷 미션으로 그려 보세요. 저장·완주 기록은 이 브라우저에만 남습니다.",
        "Draw one new scene a day as a five-panel mission. Saves and streaks stay in this browser.",
      )}
      width="wide"
      compact
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
        onCopyBrief={copyBrief}
        onToggleSaved={toggleSaved}
        onCopyShareLink={copyShareLink}
        onOpenNextStep={() => openAnchor("#creation-loop")}
        onBackToToday={selectedOffset > 0 ? () => selectArchiveOffset(0) : undefined}
      />

      <section className="scroll-mt-24 space-y-5" aria-label={bt("오늘의 영감 작업 영역", "Daily spark workspace")}>
        <SiteSectionTabs tabs={tabs} value={activeTab} onChange={selectTab} label={bt("오늘의 영감 작업 영역", "Daily spark workspace")} idPrefix={NOW_TAB_PREFIX} />

        <SiteTabPanel idPrefix={NOW_TAB_PREFIX} id="mission" active={activeTab === "mission"} mounted={isMounted("mission")} className="space-y-6">
          <NowCreationBoard
            day={selected.day}
            theme={theme}
            mode={mode}
            sessionPreset={sessionPreset}
            selectedProgress={selectedProgress}
            progressPercent={progressPercent}
            nextStepLabel={nextStepLabel}
            onToggleProgress={toggleProgress}
          />
          <ResearchLaunchpad assetHref={assetHref} bookHref={bookHref} />
        </SiteTabPanel>

        <SiteTabPanel idPrefix={NOW_TAB_PREFIX} id="plan" active={activeTab === "plan"} mounted={isMounted("plan")} className="space-y-6">
          <NowPlanning
            sessionPreset={sessionPreset}
            mode={mode}
            modeId={state.mode}
            onSessionPresetChange={setSessionPresetId}
            onModeChange={setMode}
          />
          <Storyboard mode={mode} storyBeats={storyBeats} onCopyBrief={copyBrief} />
          <FocusSprint key={sessionPreset.id} preset={sessionPreset} />
        </SiteTabPanel>

        <SiteTabPanel idPrefix={NOW_TAB_PREFIX} id="variation" active={activeTab === "variation"} mounted={isMounted("variation")}>
          <NowVariationLab day={selected.day} theme={theme} mode={mode} sessionPreset={sessionPreset} />
        </SiteTabPanel>

        <SiteTabPanel idPrefix={NOW_TAB_PREFIX} id="archive" active={activeTab === "archive"} mounted={isMounted("archive")}>
          <NowFlowArchive
            archive={archive}
            selectedOffset={selectedOffset}
            state={state}
            archiveFilter={archiveFilter}
            onArchiveFilterChange={setArchiveFilter}
            onSelectOffset={selectArchiveOffset}
          />
        </SiteTabPanel>
      </section>

      <SiteDisclosure
        icon={ShieldCheck}
        title={bt("기록·출처 안내", "Records & sources")}
        summary={`${bt("기준일", "Issue date")}: ${selected.day.iso} · ${bt("기록은 이 브라우저에만 저장돼요.", "Records stay in this browser.")}`}
      >
        <p className="break-keep text-sm leading-6 text-fg-2">
          {bt(
            "주제·미션·연출 가이드는 ToonStudio 오리지널 에디토리얼입니다. 외부 자료는 Studio에 자동으로 넣지 않으니 원문·출처·이용조건을 확인한 뒤 쓰세요.",
            "Themes, missions and directing guides are ToonStudio originals. External sources are never inserted into Studio automatically — check the source and its terms first.",
          )}
        </p>
        <div className="mt-3">
          <LocalSaveNotice error={storageError || undefined} writable={!storageError} />
        </div>
      </SiteDisclosure>
    </ResourceLayout>
  );
}
