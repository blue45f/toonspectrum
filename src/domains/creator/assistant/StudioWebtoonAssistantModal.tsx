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
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";

import {
  WebtoonColorHarmonyAssistant,
  type SkinToneId,
  SCENE_MOOD_PALETTES,
} from "./webtoon-color-harmony-assistant";
import {
  WebtoonCroquisPoseGuide,
  PERSPECTIVE_GUIDES,
  type PerspectiveGuidePreset,
  type CroquisTimerIntervalSec,
} from "./webtoon-croquis-pose-guide";
import {
  WebtoonFocusTimerEngine,
  PRODUCTION_STAGES,
  type PomodoroMode,
} from "./webtoon-focus-timer";
import {
  WebtoonPlatformSpecValidator,
  WEBTOON_PLATFORM_SPECS,
  type WebtoonPlatformId,
} from "./webtoon-platform-spec-validator";
import { WebtoonScrollPacingSimulator } from "./webtoon-scroll-pacing-simulator";
import {
  WebtoonSfxLexiconEngine,
  type SfxCategory,
} from "./webtoon-sfx-lexicon";

export type AssistantActiveTab =
  | "spec-slicer"
  | "scroll-pacing"
  | "sfx-lexicon"
  | "color-harmony"
  | "focus-timer"
  | "croquis-pose";

export interface StudioWebtoonAssistantModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly onInsertSfxText?: (text: string) => void;
}

export function StudioWebtoonAssistantModal({
  open,
  onClose,
  canvasWidth = 690,
  canvasHeight = 15000,
  onInsertSfxText,
}: StudioWebtoonAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<AssistantActiveTab>("spec-slicer");

  // Tab 1: Spec & Slicer State
  const specValidator = useMemo(() => new WebtoonPlatformSpecValidator(), []);
  const [selectedPlatform, setSelectedPlatform] = useState<WebtoonPlatformId>("naver-webtoon");
  const [sliceTargetHeight, setSliceTargetHeight] = useState(
    WEBTOON_PLATFORM_SPECS["naver-webtoon"].recommendedSliceHeightPx,
  );
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
  const slicePlan = useMemo(
    () =>
      specValidator.planAutoSlices(canvasHeight, sliceTargetHeight, [
        { top: 2900, bottom: 3200, label: "인물 얼굴 컷" },
        { top: 6200, bottom: 6600, label: "액션 컷" },
        { top: 9800, bottom: 10200, label: "클리프행어 컷" },
      ]),
    [specValidator, canvasHeight, sliceTargetHeight],
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
  const [customBaseColor, setCustomBaseColor] = useState("#ffedd5");
  const generatedShadows = useMemo(
    () => colorAssistant.generateHueShiftShadow(customBaseColor),
    [colorAssistant, customBaseColor],
  );

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
  const [selectedPerspective, setSelectedPerspective] =
    useState<PerspectiveGuidePreset>("eye-level");
  const [croquisInterval, setCroquisInterval] = useState<CroquisTimerIntervalSec>(60);
  const [croquisSecondsRemaining, setCroquisSecondsRemaining] = useState(60);
  const [croquisRunning, setCroquisRunning] = useState(false);
  const [currentPosePrompt, setCurrentPosePrompt] = useState(() => croquisGuide.getRandomPose(1));

  useEffect(() => {
    if (!croquisRunning) return;
    const interval = setInterval(() => {
      setCroquisSecondsRemaining((prev) => {
        if (prev <= 1) {
          setCurrentPosePrompt(croquisGuide.getRandomPose(Date.now()));
          return croquisInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [croquisRunning, croquisInterval, croquisGuide]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-modal-title"
      data-testid="studio-webtoon-assistant-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent" />
            <div>
              <h2 id="assistant-modal-title" className="text-sm font-bold text-fg">
                웹툰 창작 보조 센터 (Webtoon Creator Assistant)
              </h2>
              <p className="text-[0.68rem] text-fg-3">
                플랫폼 규격 검사 · 자동 슬라이서 · 스크롤 페이싱 · 효과음 사전 · 컬러 조화 · 포커스 타이머 · 크로키
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="보조 센터 닫기"
            className="rounded-lg p-1.5 text-fg-3 hover:bg-card hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Tabs Rail */}
        <div className="flex border-b border-line bg-card/60 px-2 py-1 gap-1 overflow-x-auto text-xs font-semibold">
          {[
            { id: "spec-slicer", label: "플랫폼 규격 & 슬라이서", icon: Scissors },
            { id: "scroll-pacing", label: "스크롤 페이싱 시뮬레이터", icon: Smartphone },
            { id: "sfx-lexicon", label: "효과음·의성어 사전", icon: Type },
            { id: "color-harmony", label: "피부/그림자 컬러 조화", icon: Palette },
            { id: "focus-timer", label: "마감 & 포커스플로우", icon: Timer },
            { id: "croquis-pose", label: "인체 크로키 & 구도 가이드", icon: Maximize },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AssistantActiveTab)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-all ${
                  isSelected
                    ? "bg-accent text-on-accent shadow-sm"
                    : "text-fg-3 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-4 text-xs text-fg">
          {/* TAB 1: Platform Spec & Auto Slicer */}
          {activeTab === "spec-slicer" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(WEBTOON_PLATFORM_SPECS) as WebtoonPlatformId[]).map((pid) => {
                  const spec = WEBTOON_PLATFORM_SPECS[pid];
                  const isSelected = selectedPlatform === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        setSelectedPlatform(pid);
                        setSliceTargetHeight(spec.recommendedSliceHeightPx);
                      }}
                      className={`flex flex-col rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? "border-accent bg-accent/15 text-accent shadow-sm"
                          : "border-line bg-card text-fg hover:bg-raised"
                      }`}
                    >
                      <span className="font-bold">{spec.name}</span>
                      <span className="text-[0.65rem] text-fg-3">
                        가로 {spec.recommendedWidthPx}px · 세로 최대 {spec.maxSliceHeightPx.toLocaleString()}px
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Audit Status Card */}
              <div
                className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                  auditResult.overallGrade === "pass"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : auditResult.overallGrade === "warn"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                }`}
              >
                {auditResult.overallGrade === "pass" ? (
                  <CheckCircle2 className="size-5 shrink-0" />
                ) : auditResult.overallGrade === "warn" ? (
                  <AlertTriangle className="size-5 shrink-0" />
                ) : (
                  <XCircle className="size-5 shrink-0" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[0.8rem]">{auditResult.summary}</span>
                    <span className="font-mono text-[0.68rem] text-fg-3">
                      현재 캔버스: {canvasWidth}px × {canvasHeight}px
                    </span>
                  </div>
                  {auditResult.issues.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-[0.68rem]">
                      {auditResult.issues.map((issue, idx) => (
                        <li key={idx} className="flex flex-col">
                          <span className="font-semibold">• {issue.message}</span>
                          <span className="text-fg-3 pl-2">↳ 권장 조치: {issue.recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Auto Slicer Plan (ToonSlicer-inspired) */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Scissors className="size-4 text-accent" />
                    <span>ToonSlicer 컷 안전 분할 계획 (Auto Slice Plan)</span>
                  </div>
                  <span className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[0.68rem] font-bold text-accent">
                    안전 분할 성공률 {slicePlan.safeSplitSuccessRate}%
                  </span>
                </div>
                <p className="text-[0.65rem] text-fg-3">
                  인물 얼굴, 대사 말풍선, 컷 테두리가 절단되지 않도록 컷 사이 빈 여백(Gutter)을 자동 감지하여 분할합니다.
                </p>

                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {slicePlan.slices.map((slice) => (
                    <div
                      key={slice.sliceIndex}
                      className="flex items-center justify-between rounded-lg border border-line bg-card p-2 text-[0.68rem]"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold">
                          #{slice.sliceIndex} 파일 ({slice.heightPx.toLocaleString()}px)
                        </span>
                        <span className="font-mono text-[0.62rem] text-fg-3">
                          Y: {slice.topY.toLocaleString()} ~ {slice.bottomY.toLocaleString()}
                        </span>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${
                          slice.isGutterCut
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-amber-500/15 text-amber-500"
                        }`}
                      >
                        {slice.isGutterCut ? "안전 여백 절단" : "비여백 절단"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Scroll Pacing Simulator */}
          {activeTab === "scroll-pacing" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-3 text-center">
                  <span className="text-[0.68rem] text-fg-3">페이싱 건강도 점수</span>
                  <span className="mt-1 font-mono text-2xl font-black text-accent">
                    {pacingResult.pacingHealthScore}점
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-3 text-center">
                  <span className="text-[0.68rem] text-fg-3">평균 컷 간격</span>
                  <span className="mt-1 font-mono text-2xl font-black text-fg">
                    {pacingResult.averageGutterPx}px
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-3 text-center">
                  <span className="text-[0.68rem] text-fg-3">표준 완독 예상 시간</span>
                  <span className="mt-1 font-mono text-2xl font-black text-emerald-500">
                    약 {pacingResult.estimatedReadingSeconds.casual}초
                  </span>
                </div>
              </div>

              {/* Reading Profile Comparison */}
              <div className="rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">독자 독서 성향별 체감 시간</span>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[0.68rem]">
                  <div className="rounded-lg border border-line bg-card p-2">
                    <span className="text-fg-3">빠른 정주행 (속독 700px/s)</span>
                    <p className="mt-1 font-mono font-bold text-fg">
                      {pacingResult.estimatedReadingSeconds.skimmer}초
                    </p>
                  </div>
                  <div className="rounded-lg border border-accent/40 bg-accent/10 p-2">
                    <span className="font-bold text-accent">표준 독자 (350px/s)</span>
                    <p className="mt-1 font-mono font-black text-accent">
                      {pacingResult.estimatedReadingSeconds.casual}초
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-card p-2">
                    <span className="text-fg-3">작화/대사 몰입 (정독 180px/s)</span>
                    <p className="mt-1 font-mono font-bold text-fg">
                      {pacingResult.estimatedReadingSeconds.immersive}초
                    </p>
                  </div>
                </div>
              </div>

              {/* Pacing Beat Visual Breakdown */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">컷 구간별 호흡 & 리듬 분석</span>
                <div className="flex flex-col gap-1.5">
                  {pacingResult.beats.map((beat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-line bg-card p-2 text-[0.68rem]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.6rem] font-bold">
                          #{beat.fromPanelIndex} → #{beat.toPanelIndex}
                        </span>
                        <span className="font-bold text-fg">{beat.label}</span>
                        <span className="text-fg-3">({beat.gutterDistancePx}px)</span>
                      </div>
                      <span className="text-[0.62rem] text-fg-3">{beat.guidance}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SFX Lexicon */}
          {activeTab === "sfx-lexicon" && (
            <div className="flex flex-col gap-3">
              {/* Category Filter Pills & Search */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[0.65rem]">
                  {[{ id: "all", label: "전체 효과음" }, ...sfxEngine.listCategories()].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSfxCategory(cat.id as SfxCategory | "all")}
                      className={`whitespace-nowrap rounded-md px-2 py-1 font-bold transition-all ${
                        sfxCategory === cat.id
                          ? "bg-accent text-on-accent shadow-sm"
                          : "border border-line bg-card text-fg-3 hover:text-fg"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-fg-3" />
                  <input
                    type="search"
                    value={sfxQuery}
                    onChange={(e) => setSfxQuery(e.target.value)}
                    placeholder="상황별 의성어·의태어 검색 (예: 쿵, 쾅, 심장, 번개, 문, 폭발)..."
                    className="min-h-8 w-full rounded-md border border-line bg-card pl-8 pr-3 text-xs text-fg focus-visible:outline-accent"
                  />
                </div>
              </div>

              {/* SFX Cards Grid */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSfx.map((item) => {
                  const isCopied = copiedSfxId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-xl border border-line bg-card p-3 transition-all hover:border-accent/40"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className="font-black text-xl tracking-tight"
                            style={{
                              color: item.recommendedColor,
                              textShadow: `0 0 1px ${item.strokeColor}, 1px 1px 0 ${item.strokeColor}`,
                            }}
                          >
                            {item.text}
                          </span>
                          <span className="rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">
                            {item.categoryLabel}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[0.65rem] text-fg-2">{item.meaning}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-line/50 px-1 py-0.2 text-[0.58rem] text-fg-3"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-line/60">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.text);
                            setCopiedSfxId(item.id);
                            setTimeout(() => setCopiedSfxId(null), 1500);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line bg-raised py-1 text-[0.62rem] font-bold text-fg hover:bg-card"
                        >
                          {isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                          <span>{isCopied ? "복사됨" : "텍스트 복사"}</span>
                        </button>
                        {onInsertSfxText && (
                          <button
                            type="button"
                            onClick={() => onInsertSfxText(item.text)}
                            className="flex items-center justify-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent shadow-sm hover:opacity-90"
                          >
                            <Type className="size-3" />
                            <span>캔버스 삽입</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Color Harmony & Skin Palette */}
          {activeTab === "color-harmony" && (
            <div className="flex flex-col gap-4">
              {/* 5 Skin Tone Archetypes */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">웹툰 캐릭터 5대 표준 피부톤 팔레트</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(["warm-fair", "cool-pale", "blush-peach", "sun-kissed-tan", "dark-rich"] as SkinToneId[]).map(
                    (sid) => {
                      const pal = colorAssistant.getSkinPalette(sid);
                      const isSelected = selectedSkinTone === sid;
                      return (
                        <button
                          key={sid}
                          type="button"
                          onClick={() => {
                            setSelectedSkinTone(sid);
                            setCustomBaseColor(pal.base);
                          }}
                          className={`flex flex-col rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-accent bg-accent/15 text-accent shadow-sm"
                              : "border-line bg-card text-fg hover:bg-raised"
                          }`}
                        >
                          <span className="font-bold text-[0.7rem]">{pal.name}</span>
                          <span className="mt-0.5 text-[0.62rem] text-fg-3">{pal.description}</span>
                          <div className="mt-2 flex h-5 w-full overflow-hidden rounded-md border border-line">
                            <div className="flex-1" style={{ backgroundColor: pal.highlight }} title="하이라이트" />
                            <div className="flex-1" style={{ backgroundColor: pal.base }} title="기본 밑색" />
                            <div className="flex-1" style={{ backgroundColor: pal.shadow1 }} title="1차 셀 음영" />
                            <div className="flex-1" style={{ backgroundColor: pal.shadow2 }} title="2차 딥 음영" />
                            <div className="flex-1" style={{ backgroundColor: pal.blushTint }} title="볼터치 틴트" />
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Algorithmic Hue-Shift Shadow Generator */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Palette className="size-4 text-accent" />
                    <span>만화 색상환 쿨톤 음영 자동 생성기 (Hue-Shift Shadow Generator)</span>
                  </div>
                  <span className="rounded bg-accent/20 px-2 py-0.5 text-[0.62rem] font-bold text-accent">
                    탁한 회색 방지 (Anti-Muddy)
                  </span>
                </div>
                <p className="text-[0.65rem] text-fg-3">
                  기본 밑색을 기준으로 채도를 올리고 색상환을 파랑/보라 방향으로 자연스럽게 회전시켜 맑은 그림자를 생성합니다.
                </p>

                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.68rem] font-semibold text-fg-2">밑색 선택:</span>
                    <input
                      type="color"
                      value={customBaseColor}
                      onChange={(e) => setCustomBaseColor(e.target.value)}
                      className="size-7 cursor-pointer rounded border border-line bg-card"
                    />
                    <span className="font-mono text-[0.68rem] font-bold">{customBaseColor}</span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  <div className="flex flex-col rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">하이라이트</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: generatedShadows.highlight }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{generatedShadows.highlight}</span>
                  </div>
                  <div className="flex flex-col rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">기본 밑색</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: customBaseColor }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{customBaseColor}</span>
                  </div>
                  <div className="flex flex-col rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">1차 셀 음영 (+25° 쉬프트)</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: generatedShadows.shadow1 }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{generatedShadows.shadow1}</span>
                  </div>
                  <div className="flex flex-col rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">2차 딥 음영 (+40° 쉬프트)</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: generatedShadows.shadow2 }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{generatedShadows.shadow2}</span>
                  </div>
                </div>
              </div>

              {/* 4 Scene Mood Palettes */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">장르별 조명 및 환경 무드 팔레트</span>
                <div className="grid grid-cols-2 gap-2">
                  {SCENE_MOOD_PALETTES.map((mood) => (
                    <div key={mood.id} className="rounded-lg border border-line bg-card p-2 text-[0.68rem]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-fg">{mood.name}</span>
                        <span className="text-[0.6rem] text-fg-3">{mood.genre}</span>
                      </div>
                      <div className="mt-1.5 flex h-4 w-full overflow-hidden rounded border border-line">
                        <div className="flex-1" style={{ backgroundColor: mood.skyTint }} title="하늘" />
                        <div className="flex-1" style={{ backgroundColor: mood.ambientLight }} title="환경광" />
                        <div className="flex-1" style={{ backgroundColor: mood.directSun }} title="태양광" />
                        <div className="flex-1" style={{ backgroundColor: mood.shadowCast }} title="그림자" />
                        <div className="flex-1" style={{ backgroundColor: mood.rimLight }} title="림라이트" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FocusFlow Pomodoro Timer */}
          {activeTab === "focus-timer" && (
            <div className="flex flex-col gap-4">
              {/* Production Stages Selector */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">현재 작업 공정 선택</span>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {PRODUCTION_STAGES.map((st) => {
                    const isSelected = timerState.activeStage === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          timerEngine.setStage(st.id);
                          setTimerState(timerEngine.getState());
                        }}
                        className={`flex flex-col items-center rounded-lg border p-2 text-center transition-all ${
                          isSelected
                            ? "border-accent bg-accent/15 text-accent shadow-sm font-bold"
                            : "border-line bg-card text-fg-3 hover:text-fg"
                        }`}
                      >
                        <span className="text-[0.68rem]">{st.label}</span>
                        <span className="mt-0.5 font-mono text-[0.6rem]">
                          {Math.floor(timerState.stageSecondsMap[st.id] / 60)}분 기록
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Timer Display */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-card/70 p-6 text-center shadow-inner">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold ${
                    timerState.isResting ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
                  }`}
                >
                  {timerState.isResting ? "휴식 시간 (Rest Cycle)" : "집중 작업 중 (Focus Mode)"}
                </span>

                <div className="my-3 font-mono text-5xl font-black tracking-wider text-fg">
                  {String(Math.floor(timerState.currentSecondsRemaining / 60)).padStart(2, "0")}:
                  {String(timerState.currentSecondsRemaining % 60).padStart(2, "0")}
                </div>

                <div className="flex items-center gap-2">
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
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-on-accent shadow-sm transition-all hover:opacity-90"
                  >
                    {timerState.isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
                    <span>{timerState.isRunning ? "일시정지" : "타이머 시작"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      timerEngine.setPomodoroMode(timerState.pomodoroMode);
                      setTimerState(timerEngine.getState());
                    }}
                    className="flex items-center gap-1 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-fg hover:bg-card"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>리셋</span>
                  </button>
                </div>

                {/* Pomodoro Mode Pills */}
                <div className="mt-4 flex gap-1.5 text-[0.65rem]">
                  {[
                    { id: "standard-25", label: "25/5분 표준" },
                    { id: "deep-flow-50", label: "50/10분 몰입" },
                    { id: "sprint-15", label: "15/3분 스프린트" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        timerEngine.setPomodoroMode(m.id as PomodoroMode);
                        setTimerState(timerEngine.getState());
                      }}
                      className={`rounded-md px-2 py-1 font-semibold ${
                        timerState.pomodoroMode === m.id
                          ? "bg-raised text-fg border border-line"
                          : "text-fg-3 hover:text-fg"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Croquis & Perspective Pose Guide */}
          {activeTab === "croquis-pose" && (
            <div className="flex flex-col gap-4">
              {/* Croquis Timer Bar */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-card/60 p-3">
                <div className="flex items-center gap-2">
                  <Timer className="size-4 text-accent" />
                  <span className="font-bold text-[0.75rem]">인체 크로키 인터벌 트레이닝</span>
                  <div className="flex gap-1">
                    {[30, 60, 180].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setCroquisInterval(sec as CroquisTimerIntervalSec);
                          setCroquisSecondsRemaining(sec);
                        }}
                        className={`rounded px-1.5 py-0.5 font-mono text-[0.62rem] font-bold ${
                          croquisInterval === sec
                            ? "bg-accent text-on-accent"
                            : "border border-line bg-card text-fg-3"
                        }`}
                      >
                        {sec}초
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-black text-accent">
                    {croquisSecondsRemaining}s
                  </span>
                  <button
                    type="button"
                    onClick={() => setCroquisRunning(!croquisRunning)}
                    className="rounded bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent"
                  >
                    {croquisRunning ? "정지" : "시작"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPosePrompt(croquisGuide.getRandomPose(Date.now()));
                      setCroquisSecondsRemaining(croquisInterval);
                    }}
                    className="rounded border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold text-fg hover:bg-raised"
                  >
                    다음 포즈
                  </button>
                </div>
              </div>

              {/* Active Pose Prompt Card */}
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[0.8rem] text-accent">
                    추천 크로키 포즈: {currentPosePrompt.title}
                  </span>
                  <span className="rounded bg-card px-2 py-0.5 font-mono text-[0.62rem] font-bold text-fg">
                    핵심 동세선: {currentPosePrompt.lineOfActionCurve}
                  </span>
                </div>
                <p className="mt-1 text-[0.68rem] text-fg">{currentPosePrompt.description}</p>
                <div className="mt-2 text-[0.62rem] text-fg-3">
                  <span className="font-bold text-accent">해부학/구조 주의점:</span> {currentPosePrompt.keyAnatomyFocus}
                </div>
              </div>

              {/* 4 Perspective Guide Overlays */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">투시 원근 및 카메라 앵글 가이드</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["eye-level", "low-angle", "high-angle", "dutch-tilt"] as PerspectiveGuidePreset[]).map(
                    (preset) => {
                      const g = PERSPECTIVE_GUIDES[preset];
                      const isSelected = selectedPerspective === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSelectedPerspective(preset)}
                          className={`flex flex-col rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-accent bg-accent/15 text-accent shadow-sm"
                              : "border-line bg-card text-fg hover:bg-raised"
                          }`}
                        >
                          <span className="font-bold text-[0.72rem]">{g.label}</span>
                          <span className="mt-1 text-[0.62rem] text-fg-3">{g.tip}</span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
