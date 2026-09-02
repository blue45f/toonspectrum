import {
  Sparkles,
  Sun,
  Palette,
  Clapperboard,
  MessageCircle,
  Copy,
  Check,
  Compass,
  X,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";

import { StudioAiEmotionBubbleMatcher } from "./studio-ai-emotion-bubble-matcher";
import { StudioAiPromptEnhancer } from "./studio-ai-prompt-enhancer";
import {
  StudioAiShadingAssistEngine,
  type LightDirectionPreset,
  type AmbientLightingTemperature,
} from "./studio-ai-shading-assist";
import { StudioAiStoryboardDirector } from "./studio-ai-storyboard-director";
import {
  StudioAiWebtoonStyleFilterEngine,
  type WebtoonArtStyleId,
} from "./studio-ai-webtoon-style-filter";

import { cn } from "@/lib/utils";

export type AiSuperSuiteTab =
  | "style-filter"
  | "shading-assist"
  | "prompt-enhancer"
  | "storyboard-director"
  | "emotion-bubble";

export interface StudioAiSuperSuiteModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onApplyPrompt?: (prompt: string) => void;
}

export function StudioAiSuperSuiteModal({
  open,
  onClose,
  onApplyPrompt,
}: StudioAiSuperSuiteModalProps) {
  const [activeTab, setActiveTab] = useState<AiSuperSuiteTab>("style-filter");

  // Tab 1: Style Filter
  const styleEngine = useMemo(() => new StudioAiWebtoonStyleFilterEngine(), []);
  const [selectedStyleId, setSelectedStyleId] = useState<WebtoonArtStyleId>("romance-manhwa");
  const [userConceptPrompt, setUserConceptPrompt] = useState("주인공이 신비로운 유적에서 푸른 보석을 발견한다");
  const compiledStylePrompt = useMemo(
    () => styleEngine.compilePrompt(selectedStyleId, userConceptPrompt),
    [styleEngine, selectedStyleId, userConceptPrompt],
  );

  // Tab 2: Shading Assist
  const shadingEngine = useMemo(() => new StudioAiShadingAssistEngine(), []);
  const [lightDirection, setLightDirection] = useState<LightDirectionPreset>("top-left");
  const [lightIntensity, setLightIntensity] = useState(80);
  const [lightTemperature, setLightTemperature] = useState<AmbientLightingTemperature>("warm-dawn");
  const [enableRim, setEnableRim] = useState(true);
  const computedShading = useMemo(
    () =>
      shadingEngine.compute({
        direction: lightDirection,
        intensityPercent: lightIntensity,
        softnessPercent: 15,
        temperature: lightTemperature,
        enableRimLight: enableRim,
      }),
    [shadingEngine, lightDirection, lightIntensity, lightTemperature, enableRim],
  );

  // Tab 3: Prompt Enhancer
  const promptEnhancer = useMemo(() => new StudioAiPromptEnhancer(), []);
  const [rawPromptInput, setRawPromptInput] = useState("검을 들고 적진으로 질주하는 소년 검사");
  const enhancedResult = useMemo(
    () => promptEnhancer.enhance(rawPromptInput),
    [promptEnhancer, rawPromptInput],
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tab 4: Storyboard Director
  const storyboardDirector = useMemo(() => new StudioAiStoryboardDirector(), []);
  const [scriptInput, setScriptInput] = useState(
    `주인공이 무너진 성벽 위에 서서 "드디어 찾았다..."라고 나지막이 읊조린다.
성문 너머에서 거대한 마수가 포효하며 지면을 뒤흔든다.
경악하는 기사단의 흔들리는 동공과 굳어버린 표정.
주인공이 등 뒤의 대검을 뽑아들며 적을 향해 단독 돌진한다.`,
  );
  const storyboardResult = useMemo(
    () => storyboardDirector.direct(scriptInput),
    [storyboardDirector, scriptInput],
  );

  // Tab 5: Emotion Bubble Matcher
  const bubbleMatcher = useMemo(() => new StudioAiEmotionBubbleMatcher(), []);
  const [testDialogue, setTestDialogue] = useState("절대... 용서하지 않을 거야!!");
  const bubbleRecommendation = useMemo(
    () => bubbleMatcher.match(testDialogue),
    [bubbleMatcher, testDialogue],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-super-suite-title"
      data-testid="studio-ai-super-suite-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent animate-pulse" />
            <div>
              <h2 id="ai-super-suite-title" className="text-sm font-bold text-fg">
                AI 웹툰 생성 슈퍼 스위트 (Webtoon AI Super Suite)
              </h2>
              <p className="text-[0.68rem] text-fg-3">
                네이버 툰필터 화풍 변환 · CSP 음영 어시스트 · 프롬프트 증강 · TooNat 콘티 디렉터 · 투닝 감정 말풍선
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="슈퍼 스위트 닫기"
            className="rounded-lg p-1.5 text-fg-3 hover:bg-card hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-line bg-card/60 px-2 py-1 gap-1 overflow-x-auto text-xs font-semibold">
          {[
            { id: "style-filter", label: "화풍 변환 툰필터", icon: Palette },
            { id: "shading-assist", label: "AI 음영 어시스트", icon: Sun },
            { id: "prompt-enhancer", label: "프롬프트 증강기", icon: Zap },
            { id: "storyboard-director", label: "콘티 자동 디렉터", icon: Clapperboard },
            { id: "emotion-bubble", label: "감정-말풍선 매처", icon: MessageCircle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AiSuperSuiteTab)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-all",
                  isSelected
                    ? "bg-accent text-on-accent shadow-sm"
                    : "text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 text-xs text-fg">
          {/* TAB 1: Style Filter */}
          {activeTab === "style-filter" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {styleEngine.listStyles().map((st) => {
                  const isSelected = selectedStyleId === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyleId(st.id)}
                      className={cn(
                        "flex flex-col rounded-xl border p-2.5 text-left transition-all",
                        isSelected
                          ? "border-accent bg-accent/15 text-accent shadow-sm"
                          : "border-line bg-card text-fg hover:bg-raised",
                      )}
                    >
                      <span className="font-bold text-[0.72rem]">{st.name}</span>
                      <span className="mt-1 text-[0.62rem] text-fg-3 line-clamp-2">{st.description}</span>
                    </button>
                  );
                })}
              </div>

              {/* Concept Input */}
              <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.72rem]">원하는 장면 아이디어 입력:</span>
                <input
                  type="text"
                  value={userConceptPrompt}
                  onChange={(e) => setUserConceptPrompt(e.target.value)}
                  placeholder="예: 주인공이 거대한 용을 마주하고 선다..."
                  className="min-h-8 w-full rounded-md border border-line bg-card px-3 text-xs text-fg focus-visible:outline-accent"
                />
              </div>

              {/* Compiled Prompt Card */}
              <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[0.75rem] text-accent">
                    생성형 AI 최종 합성 프롬프트
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(compiledStylePrompt.positivePrompt);
                      setCopiedKey("positive");
                      setTimeout(() => setCopiedKey(null), 1500);
                    }}
                    className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[0.62rem] font-bold text-on-accent"
                  >
                    {copiedKey === "positive" ? <Check className="size-3" /> : <Copy className="size-3" />}
                    <span>복사</span>
                  </button>
                </div>
                <p className="font-mono text-[0.68rem] leading-relaxed text-fg break-words">
                  {compiledStylePrompt.positivePrompt}
                </p>

                <div className="mt-2 border-t border-line/50 pt-2">
                  <span className="font-bold text-[0.68rem] text-fg-3">네거티브 프롬프트:</span>
                  <p className="font-mono text-[0.62rem] text-fg-3 leading-tight mt-0.5">
                    {compiledStylePrompt.negativePrompt}
                  </p>
                </div>

                {onApplyPrompt && (
                  <button
                    type="button"
                    onClick={() => onApplyPrompt(compiledStylePrompt.positivePrompt)}
                    className="mt-2 flex items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-bold text-on-accent shadow-sm"
                  >
                    <Sparkles className="size-3.5" />
                    <span>스튜디오 AI 배경/캐릭터 생성기에 즉시 전송</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Shading Assist */}
          {activeTab === "shading-assist" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 8-Direction Compass */}
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-[0.75rem]">
                    <Compass className="size-4 text-accent" />
                    <span>가상 광원 방향 (Light Direction)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[0.68rem] font-bold">
                    {(
                      [
                        { id: "top-left", label: "↖ 좌상단" },
                        { id: "top", label: "↑ 상단 정면" },
                        { id: "top-right", label: "↗ 우상단" },
                        { id: "left", label: "← 좌측광" },
                        { id: "backlight-rim", label: "☼ 역광/림" },
                        { id: "right", label: "→ 우측광" },
                        { id: "bottom-left", label: "↙ 좌하단" },
                        { id: "bottom", label: "↓ 하단 언더" },
                        { id: "bottom-right", label: "↘ 우하단" },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setLightDirection(btn.id)}
                        className={cn(
                          "rounded-lg border p-2 transition-all",
                          lightDirection === btn.id
                            ? "border-accent bg-accent text-on-accent shadow-sm"
                            : "border-line bg-card text-fg hover:bg-raised",
                        )}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Light Parameters */}
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-card/60 p-3">
                  <span className="font-bold text-[0.75rem]">광원 파라미터 조절</span>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[0.68rem]">
                      <span className="text-fg-3">빛 강도:</span>
                      <span className="font-mono font-bold">{lightIntensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={lightIntensity}
                      onChange={(e) => setLightIntensity(Number(e.target.value))}
                      className="accent-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[0.68rem] text-fg-3">환경광 색온도:</span>
                    <div className="grid grid-cols-2 gap-1 text-[0.65rem] font-bold">
                      {(
                        [
                          { id: "warm-dawn", label: "새벽 웜톤" },
                          { id: "neutral-day", label: "대낮 뉴트럴" },
                          { id: "cool-moon", label: "달빛 쿨톤" },
                          { id: "sunset-golden", label: "석양 골든" },
                        ] as const
                      ).map((temp) => (
                        <button
                          key={temp.id}
                          type="button"
                          onClick={() => setLightTemperature(temp.id)}
                          className={cn(
                            "rounded border p-1.5",
                            lightTemperature === temp.id
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line bg-card text-fg",
                          )}
                        >
                          {temp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[0.68rem] font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableRim}
                      onChange={(e) => setEnableRim(e.target.checked)}
                      className="accent-accent"
                    />
                    <span>외곽선 림라이트 (Rim Light) 강조 활성화</span>
                  </label>
                </div>
              </div>

              {/* Shading Vector & Swatches Result */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3.5">
                <span className="font-bold text-[0.75rem]">계산된 셀 음영 벡터 & 컬러 스펙</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">1차 셀 음영 (투명도 {computedShading.shadow1Opacity})</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: computedShading.shadow1ColorHex }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{computedShading.shadow1ColorHex}</span>
                  </div>

                  <div className="flex flex-col items-center rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">2차 딥 음영 (투명도 {computedShading.shadow2Opacity})</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: computedShading.shadow2ColorHex }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">{computedShading.shadow2ColorHex}</span>
                  </div>

                  <div className="flex flex-col items-center rounded-lg border border-line bg-card p-2 text-center">
                    <span className="text-[0.62rem] text-fg-3">림라이트 컬러</span>
                    <div
                      className="my-1.5 h-6 w-full rounded border border-line/40"
                      style={{ backgroundColor: computedShading.rimLightColorHex ?? "#ffffff" }}
                    />
                    <span className="font-mono text-[0.62rem] font-bold">
                      {computedShading.rimLightColorHex ?? "없음"}
                    </span>
                  </div>
                </div>

                <div className="mt-2 rounded bg-raised p-2 font-mono text-[0.65rem] text-fg-2">
                  {computedShading.promptInstruction}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Prompt Enhancer */}
          {activeTab === "prompt-enhancer" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[0.75rem]">자연어 아이디어 입력</span>
                  <span className="rounded bg-accent/20 px-2 py-0.5 font-bold text-[0.62rem] text-accent">
                    감지된 장르: {enhancedResult.detectedGenre.toUpperCase()}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={rawPromptInput}
                  onChange={(e) => setRawPromptInput(e.target.value)}
                  placeholder="아이디어를 입력하세요 (예: 빗속에서 마법 지팡이를 들고 결의에 찬 표정으로 서 있는 주인공)..."
                  className="w-full rounded-md border border-line bg-card p-2.5 text-xs text-fg focus-visible:outline-accent resize-none"
                />
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[0.75rem] text-accent">증강된 포지티브 프롬프트</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(enhancedResult.enhancedPositivePrompt);
                        setCopiedKey("enhanced-pos");
                        setTimeout(() => setCopiedKey(null), 1500);
                      }}
                      className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[0.62rem] font-bold text-on-accent"
                    >
                      {copiedKey === "enhanced-pos" ? <Check className="size-3" /> : <Copy className="size-3" />}
                      <span>복사</span>
                    </button>
                  </div>
                  <p className="mt-1.5 font-mono text-[0.68rem] leading-relaxed text-fg break-words">
                    {enhancedResult.enhancedPositivePrompt}
                  </p>
                </div>

                <div className="border-t border-line/40 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[0.75rem] text-fg-3">작화 붕괴 방지 네거티브 프롬프트</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(enhancedResult.recommendedNegativePrompt);
                        setCopiedKey("enhanced-neg");
                        setTimeout(() => setCopiedKey(null), 1500);
                      }}
                      className="flex items-center gap-1 rounded border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg"
                    >
                      {copiedKey === "enhanced-neg" ? <Check className="size-3" /> : <Copy className="size-3" />}
                      <span>복사</span>
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[0.62rem] text-fg-3 leading-tight break-words">
                    {enhancedResult.recommendedNegativePrompt}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Storyboard Director */}
          {activeTab === "storyboard-director" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">대본 / 시나리오 줄글 입력</span>
                <textarea
                  rows={4}
                  value={scriptInput}
                  onChange={(e) => setScriptInput(e.target.value)}
                  className="w-full rounded-md border border-line bg-card p-2 text-xs text-fg focus-visible:outline-accent resize-none font-mono"
                />
              </div>

              {/* Storyboard Cuts Table */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[0.75rem]">
                    자동 생성된 컷별 콘티 ({storyboardResult.totalCuts}개 컷)
                  </span>
                  <span className="font-mono text-[0.65rem] text-fg-3">
                    예상 모바일 완독: 약 {storyboardResult.estimatedEpisodeReadingSec}초
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {storyboardResult.cuts.map((cut) => (
                    <div
                      key={cut.cutNumber}
                      className="flex flex-col rounded-lg border border-line bg-card p-2.5 text-[0.68rem] gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold">
                          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-accent">
                            컷 #{cut.cutNumber}
                          </span>
                          <span className="rounded bg-raised px-1.5 py-0.5 text-fg-2">
                            {cut.shotScale} · {cut.cameraAngle}
                          </span>
                          <span className="rounded bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5">
                            감정: {cut.emotion}
                          </span>
                        </div>
                        {cut.suggestedSfx && (
                          <span className="rounded bg-rose-500/15 font-black text-rose-500 px-2 py-0.5">
                            효과음: {cut.suggestedSfx}
                          </span>
                        )}
                      </div>

                      <p className="text-fg">{cut.summary}</p>
                      {cut.dialogue && (
                        <p className="font-semibold text-accent pl-2 border-l-2 border-accent">
                          대사: "{cut.dialogue}"
                        </p>
                      )}
                      <p className="text-[0.62rem] text-fg-3">배경 프롬프트: {cut.backgroundPrompt}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Emotion Bubble Matcher */}
          {activeTab === "emotion-bubble" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3">
                <span className="font-bold text-[0.75rem]">대사 문장 입력 및 감정 테스트</span>
                <input
                  type="text"
                  value={testDialogue}
                  onChange={(e) => setTestDialogue(e.target.value)}
                  placeholder="예: 닥쳐! 절대 용서 못 해!!"
                  className="min-h-8 w-full rounded-md border border-line bg-card px-3 text-xs text-fg focus-visible:outline-accent"
                />
              </div>

              {/* Match Result Display */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-card/80 p-8 text-center shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent/20 px-3 py-1 font-bold text-accent text-xs">
                    감정 분석: {bubbleRecommendation.detectedEmotion} (신뢰도 {bubbleRecommendation.confidenceScore}%)
                  </span>
                  <span className="rounded-full bg-raised px-3 py-1 font-bold text-fg text-xs">
                    추천 말풍선: {bubbleRecommendation.recommendedBubbleShape}
                  </span>
                </div>

                {/* Visual Bubble Simulation */}
                <div
                  className="my-6 max-w-sm rounded-2xl p-5 text-center shadow-md transition-all"
                  style={{
                    backgroundColor: bubbleRecommendation.fillColor,
                    borderColor: bubbleRecommendation.strokeColor,
                    borderWidth: `${bubbleRecommendation.strokeWidthPx}px`,
                    borderStyle: bubbleRecommendation.isDashedBorder ? "dashed" : "solid",
                  }}
                >
                  <p
                    className="text-base"
                    style={{
                      color: bubbleRecommendation.textColor,
                      fontWeight: bubbleRecommendation.recommendedFontWeight,
                    }}
                  >
                    {bubbleRecommendation.dialogue || "대사를 입력하세요"}
                  </p>
                </div>

                <div className="flex gap-4 text-[0.68rem] text-fg-3">
                  <span>선 두께: {bubbleRecommendation.strokeWidthPx}px</span>
                  <span>폰트 굵기: {bubbleRecommendation.recommendedFontWeight}</span>
                  <span>아이콘: {bubbleRecommendation.suggestedEmoteIcon}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
