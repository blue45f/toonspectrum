import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Scissors,
  Smartphone,
  Type,
  Palette,
  Timer,
  Maximize,
  Search,
  Copy,
  Check,
  ChevronDown,
  Play,
  Pause,
  Sparkles,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";

import {
  WebtoonColorHarmonyAssistant,
  type SkinToneId,
} from "./assistant/webtoon-color-harmony-assistant";
import { WebtoonCroquisPoseGuide } from "./assistant/webtoon-croquis-pose-guide";
import {
  WebtoonFocusTimerEngine,
  PRODUCTION_STAGES,
} from "./assistant/webtoon-focus-timer";
import {
  WebtoonPlatformSpecValidator,
  WEBTOON_PLATFORM_SPECS,
  type WebtoonPlatformId,
} from "./assistant/webtoon-platform-spec-validator";
import { WebtoonScrollPacingSimulator } from "./assistant/webtoon-scroll-pacing-simulator";
import {
  WebtoonSfxLexiconEngine,
  type SfxCategory,
} from "./assistant/webtoon-sfx-lexicon";
import { StudioEmptyState, STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "./studio-panel-ui";
import { studioSfxLetteringStyle } from "./studio-sfx-lettering";
import {
  StudioWorkbenchTabStrip,
  studioWorkbenchTabPanelProps,
  type StudioWorkbenchTab,
} from "./studio-workbench-tabs";
import { useStudioCopyFeedback } from "./use-studio-copy-feedback";

import { cn } from "@/lib/utils";

export type AssistantDisplayTab =
  | "spec-slicer"
  | "scroll-pacing"
  | "sfx-lexicon"
  | "color-harmony"
  | "focus-timer"
  | "croquis-pose";

const TAB_ID_PREFIX = "companion-assistant";

const ASSISTANT_TABS: readonly StudioWorkbenchTab[] = [
  { id: "spec-slicer", label: "플랫폼 규격", icon: Scissors },
  { id: "scroll-pacing", label: "스크롤 페이싱", icon: Smartphone },
  { id: "sfx-lexicon", label: "효과음 사전", icon: Type },
  { id: "color-harmony", label: "컬러 조화", icon: Palette },
  { id: "focus-timer", label: "포커스 타이머", icon: Timer },
  { id: "croquis-pose", label: "크로키 가이드", icon: Maximize },
];

/**
 * 컴패니언 창은 좁아서 효과음 카드를 한 번에 다 펼치면 나머지 탭이 화면 밖으로 밀린다.
 * 그래서 6개만 먼저 보여주되, 잘렸다는 사실과 남은 개수를 반드시 드러낸다(예전엔 `slice(0, 6)`
 * 이 조용히 잘라서 7번째 결과가 존재하지 않는 것처럼 보였다).
 */
const SFX_PAGE_SIZE = 6;

/** 모달과 달리 컴패니언 카드는 좁아 3띠만 쓴다. 라벨은 aria-label 에 그대로 반영한다. */
const SKIN_TONE_IDS: readonly SkinToneId[] = [
  "warm-fair",
  "cool-pale",
  "blush-peach",
  "sun-kissed-tan",
  "dark-rich",
];

export interface StudioCompanionAssistantDisplayProps {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly layout?: "embedded" | "dedicated";
}

export function StudioCompanionAssistantDisplay({
  canvasWidth = 690,
  canvasHeight = 15000,
  layout = "embedded",
}: StudioCompanionAssistantDisplayProps) {
  const [activeTab, setActiveTab] = useState<AssistantDisplayTab>("spec-slicer");

  // Tab 1: Spec & Slicer State
  const specValidator = useMemo(() => new WebtoonPlatformSpecValidator(), []);
  const [selectedPlatform, setSelectedPlatform] = useState<WebtoonPlatformId>("naver-webtoon");
  const auditResult = useMemo(
    () =>
      specValidator.audit(selectedPlatform, {
        width: canvasWidth,
        height: canvasHeight,
        format: "jpg",
        panelGuttersPx: [150, 250, 400, 300, 800],
      }),
    [specValidator, selectedPlatform, canvasWidth, canvasHeight],
  );

  // Tab 2: Scroll Pacing State
  const scrollSimulator = useMemo(() => new WebtoonScrollPacingSimulator(), []);
  const samplePanels = useMemo(
    () => [
      { id: "p1", topY: 100, bottomY: 700, heightPx: 600, dialogueCount: 1 },
      { id: "p2", topY: 850, bottomY: 1400, heightPx: 550, dialogueCount: 2 },
      { id: "p3", topY: 1700, bottomY: 2300, heightPx: 600, dialogueCount: 1 },
      { id: "p4", topY: 2800, bottomY: 3400, heightPx: 600, dialogueCount: 2 },
      { id: "p5", topY: 4200, bottomY: 5000, heightPx: 800, dialogueCount: 1 },
    ],
    [],
  );
  const pacingResult = useMemo(
    () => scrollSimulator.analyze(samplePanels, canvasHeight),
    [scrollSimulator, samplePanels, canvasHeight],
  );

  // Tab 3: SFX Lexicon State
  const sfxEngine = useMemo(() => new WebtoonSfxLexiconEngine(), []);
  const [sfxQuery, setSfxQuery] = useState("");
  const [sfxCategory, setSfxCategory] = useState<SfxCategory | "all">("all");
  const filteredSfx = useMemo(
    () => sfxEngine.search(sfxQuery, sfxCategory === "all" ? undefined : sfxCategory),
    [sfxEngine, sfxQuery, sfxCategory],
  );
  const [sfxVisibleCount, setSfxVisibleCount] = useState(SFX_PAGE_SIZE);
  const sfxCopy = useStudioCopyFeedback();

  // 검색어/카테고리가 바뀌면 다시 처음부터 — 이전 "더 보기" 상태가 새 결과에 얹히면
  // 사용자는 자기가 펼친 적 없는 목록을 보게 된다.
  useEffect(() => {
    setSfxVisibleCount(SFX_PAGE_SIZE);
  }, [sfxQuery, sfxCategory]);

  const visibleSfx = filteredSfx.slice(0, sfxVisibleCount);
  const hiddenSfxCount = filteredSfx.length - visibleSfx.length;
  const sfxIsFiltered = sfxQuery.trim().length > 0 || sfxCategory !== "all";
  // 피드백은 항목 id 로 추적하지만 사람에게는 글리프 텍스트를 보여준다. 결과 목록에서 이미
  // 사라진 항목도 이름을 잃지 않도록 필터된 배열이 아니라 엔진에서 되짚는다.
  const copyStatusMessage = !sfxCopy.current
    ? ""
    : `“${sfxEngine.getById(sfxCopy.current.id)?.text ?? sfxCopy.current.id}” ${
        sfxCopy.current.status === "copied"
          ? "복사됨"
          : "복사 실패 — 브라우저가 클립보드를 막았습니다"
      }`;

  // Tab 4: Color Harmony State
  const colorAssistant = useMemo(() => new WebtoonColorHarmonyAssistant(), []);
  const [selectedSkinTone, setSelectedSkinTone] = useState<SkinToneId>("warm-fair");

  // Tab 5: Focus Timer State
  const [timerEngine] = useState(() => new WebtoonFocusTimerEngine("storyboard", "standard-25"));
  const [timerState, setTimerState] = useState(() => timerEngine.getState());

  // 의존성이 `timerState.isRunning`(불리언)이라 매 tick 의 새 상태 객체로는 재실행되지 않고,
  // 정지·언마운트 때만 clearInterval 이 돈다. 탭을 떠나도 인터벌은 유지된다 — 컴포넌트는
  // 언마운트되지 않고 패널만 바뀌므로, 계속 세는 것이 타이머로서 옳은 동작이다.
  useEffect(() => {
    if (!timerState.isRunning) return;
    const interval = setInterval(() => {
      timerEngine.tick(1);
      setTimerState(timerEngine.getState());
    }, 1000);
    return () => clearInterval(interval);
  }, [timerEngine, timerState.isRunning]);

  // Tab 6: Croquis Pose Guide State
  const croquisGuide = useMemo(() => new WebtoonCroquisPoseGuide(), []);
  const [currentPosePrompt, setCurrentPosePrompt] = useState(() => croquisGuide.getRandomPose(1));

  const activeStageLabel =
    PRODUCTION_STAGES.find((s) => s.id === timerState.activeStage)?.label ?? timerState.activeStage;

  return (
    <section
      data-testid="studio-companion-assistant-display"
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-card p-3 text-xs text-fg",
        layout === "dedicated" ? "min-h-full flex-1" : "",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-line pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="truncate font-bold text-sm">웹툰 보조 툴킷 (Companion Toolkit)</span>
        </div>
        <span className="rounded bg-raised px-2 py-0.5 text-[0.62rem] font-bold text-fg-3">
          플랫폼 · 페이싱 · 효과음 · 컬러 · 타이머 · 크로키
        </span>
      </div>

      {/* Toolkit Tabs — 좁은 창에서 줄바꿈해 본문을 밀어내지 않도록 공용 가로 스크롤 스트립을 쓴다. */}
      <StudioWorkbenchTabStrip
        tabs={ASSISTANT_TABS}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as AssistantDisplayTab)}
        ariaLabel="웹툰 보조 툴킷 탭"
        idPrefix={TAB_ID_PREFIX}
        className="rounded-xl border border-line bg-card/60 p-1"
      />

      {/* Tab: Platform Spec & Slicer */}
      {activeTab === "spec-slicer" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "spec-slicer")}
          className={cn("flex flex-col gap-2.5 outline-none", STUDIO_FOCUS_RING)}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(WEBTOON_PLATFORM_SPECS) as WebtoonPlatformId[]).map((pid) => {
              const spec = WEBTOON_PLATFORM_SPECS[pid];
              const isSelected = selectedPlatform === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPlatform(pid)}
                  className={cn(
                    "flex min-w-0 flex-col justify-center rounded-lg border p-2 text-left",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    STUDIO_TOUCH_TARGET,
                    isSelected
                      ? "border-accent bg-accent-soft text-accent shadow-sm"
                      : "border-line bg-card text-fg hover:bg-raised",
                  )}
                >
                  <span className="truncate font-bold text-[0.68rem]">{spec.name}</span>
                  <span className="truncate text-[0.6rem] text-fg-3">
                    폭 {spec.recommendedWidthPx}px 권장
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-2.5",
              auditResult.overallGrade === "pass"
                ? "border-good/35 bg-good/10 text-good"
                : auditResult.overallGrade === "warn"
                  ? "border-warn/35 bg-warn/10 text-warn"
                  : "border-bad/35 bg-bad/10 text-bad",
            )}
          >
            {auditResult.overallGrade === "pass" ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            ) : auditResult.overallGrade === "warn" ? (
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
            ) : (
              <XCircle className="size-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <span className="font-bold text-[0.72rem]">{auditResult.summary}</span>
              {auditResult.issues.map((issue, idx) => (
                <p key={idx} className="mt-0.5 text-[0.62rem] leading-tight">
                  • {issue.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Scroll Pacing */}
      {activeTab === "scroll-pacing" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "scroll-pacing")}
          className={cn("flex flex-col gap-2.5 outline-none", STUDIO_FOCUS_RING)}
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0 rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">페이싱 점수</span>
              <p className="font-mono text-lg font-black text-accent">
                {pacingResult.pacingHealthScore}점
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">평균 간격</span>
              <p className="font-mono text-lg font-black text-fg">{pacingResult.averageGutterPx}px</p>
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">예상 완독</span>
              <p className="font-mono text-lg font-black text-fg">
                {pacingResult.estimatedReadingSeconds.casual}초
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: SFX Lexicon */}
      {activeTab === "sfx-lexicon" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "sfx-lexicon")}
          className={cn("flex flex-col gap-2 outline-none", STUDIO_FOCUS_RING)}
        >
          <div className="flex gap-1 overflow-x-auto pb-1 text-[0.6rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ id: "all", label: "전체" }, ...sfxEngine.listCategories()].map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={sfxCategory === cat.id}
                onClick={() => setSfxCategory(cat.id as SfxCategory | "all")}
                className={cn(
                  "inline-flex shrink-0 items-center whitespace-nowrap rounded px-2 py-0.5 font-semibold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  STUDIO_TOUCH_TARGET,
                  sfxCategory === cat.id
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-card text-fg-3 hover:text-fg",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              type="search"
              value={sfxQuery}
              onChange={(e) => setSfxQuery(e.target.value)}
              aria-label="의성어·의태어 검색"
              placeholder="의성어·의태어 빠른 검색..."
              className={cn(
                "w-full rounded-md border border-line bg-card pl-7 pr-2 text-[0.65rem] text-fg",
                STUDIO_FOCUS_RING,
                STUDIO_TOUCH_TARGET,
              )}
            />
          </div>

          {filteredSfx.length === 0 ? (
            <StudioEmptyState
              icon={<Search className="size-5" aria-hidden />}
              title="검색 결과가 없습니다"
              description="다른 낱말이나 태그로 찾아보세요. 예: 쿵, 심장, 번개, 문, 폭발."
              action={
                sfxIsFiltered ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSfxQuery("");
                      setSfxCategory("all");
                    }}
                    className={cn(
                      "inline-flex items-center rounded-md border border-line bg-card px-3 text-[0.65rem] font-semibold text-fg hover:bg-raised",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      STUDIO_TOUCH_TARGET,
                    )}
                  >
                    검색 초기화
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="text-[0.6rem] text-fg-3">
                총 {filteredSfx.length}개 중 {visibleSfx.length}개 표시
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {visibleSfx.map((item) => {
                  const status = sfxCopy.statusFor(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={
                        status === "copied"
                          ? `${item.text} 복사됨`
                          : status === "failed"
                            ? `${item.text} 복사 실패`
                            : `${item.text} 복사`
                      }
                      onClick={() => sfxCopy.copy(item.id, item.text)}
                      className={cn(
                        "flex items-center justify-between gap-1.5 rounded-lg border border-line bg-card p-2 text-left hover:bg-raised",
                        STUDIO_EASE,
                        STUDIO_FOCUS_RING,
                        STUDIO_TOUCH_TARGET,
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        {/* recommendedColor 는 레터링 데이터라 토큰화하지 않는다. 대신 외곽선을
                            함께 입혀 #ffffff 글리프가 라이트 테마에서 사라지지 않게 한다. */}
                        <span
                          className="truncate font-black text-sm"
                          style={studioSfxLetteringStyle(item)}
                        >
                          {item.text}
                        </span>
                        <span className="truncate text-[0.6rem] text-fg-3">{item.meaning}</span>
                      </span>
                      {status === "copied" ? (
                        <Check className="size-3 shrink-0 text-good" aria-hidden />
                      ) : status === "failed" ? (
                        <XCircle className="size-3 shrink-0 text-bad" aria-hidden />
                      ) : (
                        <Copy className="size-3 shrink-0 text-fg-3" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
              {hiddenSfxCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setSfxVisibleCount((count) => count + SFX_PAGE_SIZE)}
                  className={cn(
                    "flex w-full items-center justify-center gap-1 rounded-lg border border-line bg-card text-[0.65rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    STUDIO_TOUCH_TARGET,
                  )}
                >
                  <ChevronDown className="size-3" aria-hidden />
                  <span>더 보기 (+{hiddenSfxCount})</span>
                </button>
              ) : null}
            </>
          )}

          {/* 아이콘 색만으로 복사 성공/실패를 알리지 않는다. 실패는 특히 조용히 넘어가면 안 된다. */}
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "min-h-3 text-[0.6rem] font-semibold leading-tight",
              sfxCopy.current?.status === "failed" ? "text-bad" : "text-good",
            )}
          >
            {copyStatusMessage}
          </p>
        </div>
      )}

      {/* Tab: Color Harmony */}
      {activeTab === "color-harmony" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "color-harmony")}
          className={cn("flex flex-col gap-2 outline-none", STUDIO_FOCUS_RING)}
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SKIN_TONE_IDS.map((sid) => {
              const pal = colorAssistant.getSkinPalette(sid);
              const isSelected = selectedSkinTone === sid;
              return (
                <button
                  key={sid}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSkinTone(sid)}
                  className={cn(
                    "flex min-w-0 flex-col justify-center rounded-lg border p-2 text-left",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    STUDIO_TOUCH_TARGET,
                    isSelected ? "border-accent bg-accent-soft" : "border-line bg-card",
                  )}
                >
                  <span className="truncate font-bold text-[0.65rem]">{pal.name}</span>
                  {/* 색 띠는 이름이 없으면 스크린리더에 존재하지 않는 것과 같다. */}
                  <span
                    role="img"
                    aria-label={`${pal.name} 밑색·1차 음영·2차 음영`}
                    className="mt-1 flex h-3 w-full overflow-hidden rounded border border-line"
                  >
                    <span className="flex-1" style={{ backgroundColor: pal.base }} title="밑색" />
                    <span
                      className="flex-1"
                      style={{ backgroundColor: pal.shadow1 }}
                      title="1차 음영"
                    />
                    <span
                      className="flex-1"
                      style={{ backgroundColor: pal.shadow2 }}
                      title="2차 음영"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Focus Timer */}
      {activeTab === "focus-timer" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "focus-timer")}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-4 text-center outline-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <span className="rounded bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
            {activeStageLabel}
          </span>
          <div className="my-2 font-mono text-3xl font-black text-fg">
            {String(Math.floor(timerState.currentSecondsRemaining / 60)).padStart(2, "0")}:
            {String(timerState.currentSecondsRemaining % 60).padStart(2, "0")}
          </div>
          <button
            type="button"
            onClick={() => {
              if (timerState.isRunning) {
                timerEngine.pause();
              } else {
                timerEngine.start();
              }
              setTimerState(timerEngine.getState());
            }}
            className={cn(
              "flex items-center gap-1 rounded-md bg-accent px-3 text-xs font-bold text-on-accent",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            {timerState.isRunning ? (
              <Pause className="size-3" aria-hidden />
            ) : (
              <Play className="size-3" aria-hidden />
            )}
            <span>{timerState.isRunning ? "일시정지" : "시작"}</span>
          </button>
        </div>
      )}

      {/* Tab: Croquis Pose */}
      {activeTab === "croquis-pose" && (
        <div
          {...studioWorkbenchTabPanelProps(TAB_ID_PREFIX, "croquis-pose")}
          className={cn(
            "flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent-soft p-3 outline-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="min-w-0 truncate font-bold text-[0.72rem] text-accent">
              추천 포즈: {currentPosePrompt.title}
            </span>
            <span className="shrink-0 font-mono text-xs font-bold text-fg">
              {currentPosePrompt.lineOfActionCurve}
            </span>
          </div>
          <p className="text-[0.62rem] text-fg-2">{currentPosePrompt.description}</p>
          <button
            type="button"
            onClick={() => setCurrentPosePrompt(croquisGuide.getRandomPose(Date.now()))}
            className={cn(
              "mt-1 rounded border border-line bg-card text-[0.6rem] font-semibold text-fg hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            다음 포즈 가져오기
          </button>
        </div>
      )}
    </section>
  );
}
