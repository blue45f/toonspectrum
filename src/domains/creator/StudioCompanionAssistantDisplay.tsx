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

import { cn } from "@/lib/utils";

export type AssistantDisplayTab =
  | "spec-slicer"
  | "scroll-pacing"
  | "sfx-lexicon"
  | "color-harmony"
  | "focus-timer"
  | "croquis-pose";

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
  const [copiedSfxId, setCopiedSfxId] = useState<string | null>(null);

  // Tab 4: Color Harmony State
  const colorAssistant = useMemo(() => new WebtoonColorHarmonyAssistant(), []);
  const [selectedSkinTone, setSelectedSkinTone] = useState<SkinToneId>("warm-fair");

  // Tab 5: Focus Timer State
  const [timerEngine] = useState(() => new WebtoonFocusTimerEngine("storyboard", "standard-25"));
  const [timerState, setTimerState] = useState(() => timerEngine.getState());

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

  return (
    <section
      data-testid="studio-companion-assistant-display"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 text-xs text-fg",
        layout === "dedicated" ? "min-h-full flex-1" : "",
      )}
    >
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-accent" />
          <span className="font-bold text-sm">웹툰 보조 툴킷 (Companion Toolkit)</span>
        </div>
        <span className="rounded bg-raised px-2 py-0.5 text-[0.62rem] font-bold text-fg-3">
          플랫폼 · 페이싱 · 효과음 · 컬러 · 타이머 · 크로키
        </span>
      </div>

      {/* Toolkit Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card/60 p-1 sm:grid-cols-6 text-[0.68rem] font-bold">
        {[
          { id: "spec-slicer", label: "플랫폼 규격", icon: Scissors },
          { id: "scroll-pacing", label: "스크롤 페이싱", icon: Smartphone },
          { id: "sfx-lexicon", label: "효과음 사전", icon: Type },
          { id: "color-harmony", label: "컬러 조화", icon: Palette },
          { id: "focus-timer", label: "포커스 타이머", icon: Timer },
          { id: "croquis-pose", label: "크로키 가이드", icon: Maximize },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AssistantDisplayTab)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 transition-all",
                isSelected
                  ? "bg-accent text-on-accent shadow-sm"
                  : "text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              <Icon className="size-3" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Platform Spec & Slicer */}
      {activeTab === "spec-slicer" && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(WEBTOON_PLATFORM_SPECS) as WebtoonPlatformId[]).map((pid) => {
              const spec = WEBTOON_PLATFORM_SPECS[pid];
              const isSelected = selectedPlatform === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setSelectedPlatform(pid)}
                  className={cn(
                    "flex flex-col rounded-lg border p-2 text-left transition-all",
                    isSelected
                      ? "border-accent bg-accent/15 text-accent shadow-sm"
                      : "border-line bg-card text-fg hover:bg-raised",
                  )}
                >
                  <span className="font-bold text-[0.68rem]">{spec.name}</span>
                  <span className="text-[0.6rem] text-fg-3">폭 {spec.recommendedWidthPx}px 권장</span>
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-2.5",
              auditResult.overallGrade === "pass"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : auditResult.overallGrade === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
            )}
          >
            {auditResult.overallGrade === "pass" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : auditResult.overallGrade === "warn" ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <XCircle className="size-4 shrink-0" />
            )}
            <div className="flex-1">
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
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">페이싱 점수</span>
              <p className="font-mono text-lg font-black text-accent">{pacingResult.pacingHealthScore}점</p>
            </div>
            <div className="rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">평균 간격</span>
              <p className="font-mono text-lg font-black text-fg">{pacingResult.averageGutterPx}px</p>
            </div>
            <div className="rounded-lg border border-line bg-card/60 p-2">
              <span className="text-[0.6rem] text-fg-3">예상 완독</span>
              <p className="font-mono text-lg font-black text-emerald-500">
                {pacingResult.estimatedReadingSeconds.casual}초
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: SFX Lexicon */}
      {activeTab === "sfx-lexicon" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 overflow-x-auto pb-1 text-[0.6rem]">
            {[{ id: "all", label: "전체" }, ...sfxEngine.listCategories()].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSfxCategory(cat.id as SfxCategory | "all")}
                className={cn(
                  "whitespace-nowrap rounded px-1.5 py-0.5 font-semibold",
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
            <Search className="absolute left-2 top-2 size-3 text-fg-3" />
            <input
              type="search"
              value={sfxQuery}
              onChange={(e) => setSfxQuery(e.target.value)}
              placeholder="의성어·의태어 빠른 검색..."
              className="min-h-7 w-full rounded-md border border-line bg-card pl-7 pr-2 text-[0.65rem] text-fg focus-visible:outline-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {filteredSfx.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(item.text);
                  setCopiedSfxId(item.id);
                  setTimeout(() => setCopiedSfxId(null), 1500);
                }}
                className="flex items-center justify-between rounded-lg border border-line bg-card p-2 text-left hover:bg-raised"
              >
                <div className="flex flex-col">
                  <span className="font-black text-sm" style={{ color: item.recommendedColor }}>
                    {item.text}
                  </span>
                  <span className="truncate text-[0.6rem] text-fg-3">{item.meaning}</span>
                </div>
                {copiedSfxId === item.id ? (
                  <Check className="size-3 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="size-3 text-fg-3 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Color Harmony */}
      {activeTab === "color-harmony" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5">
            {(["warm-fair", "cool-pale", "blush-peach", "sun-kissed-tan"] as SkinToneId[]).map((sid) => {
              const pal = colorAssistant.getSkinPalette(sid);
              const isSelected = selectedSkinTone === sid;
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => setSelectedSkinTone(sid)}
                  className={cn(
                    "flex flex-col rounded-lg border p-2 text-left",
                    isSelected ? "border-accent bg-accent/15" : "border-line bg-card",
                  )}
                >
                  <span className="font-bold text-[0.65rem]">{pal.name}</span>
                  <div className="mt-1 flex h-3 w-full overflow-hidden rounded">
                    <div className="flex-1" style={{ backgroundColor: pal.base }} />
                    <div className="flex-1" style={{ backgroundColor: pal.shadow1 }} />
                    <div className="flex-1" style={{ backgroundColor: pal.shadow2 }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Focus Timer */}
      {activeTab === "focus-timer" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-4 text-center">
          <span className="rounded bg-accent/15 px-2 py-0.5 text-[0.62rem] font-bold text-accent">
            {PRODUCTION_STAGES.find((s) => s.id === timerState.activeStage)?.label}
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
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-on-accent"
          >
            {timerState.isRunning ? <Pause className="size-3" /> : <Play className="size-3" />}
            <span>{timerState.isRunning ? "일시정지" : "시작"}</span>
          </button>
        </div>
      )}

      {/* Tab: Croquis Pose */}
      {activeTab === "croquis-pose" && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[0.72rem] text-accent">
              추천 포즈: {currentPosePrompt.title}
            </span>
            <span className="font-mono text-xs font-bold text-fg">
              {currentPosePrompt.lineOfActionCurve}
            </span>
          </div>
          <p className="text-[0.62rem] text-fg-2">{currentPosePrompt.description}</p>
          <button
            type="button"
            onClick={() => setCurrentPosePrompt(croquisGuide.getRandomPose(Date.now()))}
            className="mt-1 rounded border border-line bg-card py-1 text-[0.6rem] font-semibold text-fg hover:bg-raised"
          >
            다음 포즈 가져오기
          </button>
        </div>
      )}
    </section>
  );
}
