import {
  CheckCircle2,
  Circle,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Mic2,
  Palette,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { downloadBlob } from "../export/studio-export";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "../studio-panel-ui";
import { StudioToonProductionBoard } from "./StudioToonProductionBoard";
import {
  scenarioImageReferenceSignature,
  type StudioScenarioImageGenerationRequest,
} from "./studio-scenario-candidate-workflow";
import {
  STUDIO_TOON_AUTOMATION_ASPECT_RATIOS,
  STUDIO_TOON_AUTOMATION_MAX_CHARACTERS,
  STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES,
  STUDIO_TOON_AUTOMATION_MAX_SEGMENTS,
  STUDIO_TOON_AUTOMATION_MODES,
  STUDIO_TOON_AUTOMATION_STYLE_PRESETS,
  STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
  STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS,
  createStudioToonAutomationCharacter,
  studioToonAutomationManifest,
  studioToonAutomationPromptBundle,
  studioToonAutomationReadiness,
  updateStudioToonAutomationDocument,
  type StudioToonAutomationAnimationSegment,
  type StudioToonAutomationCharacter,
  type StudioToonAutomationDocument,
  type StudioToonAutomationPromptRules,
} from "./studio-toon-automation";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

import {
  chooseNaturalKoreanVoice,
  isNaturalBrowserSpeechSupported,
  listNaturalBrowserSpeechVoices,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
} from "@/shared/lib/natural-browser-speech";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { id: "overview", label: "제작 개요", icon: Sparkles },
  { id: "production", label: "장면 제작", icon: Clapperboard },
  { id: "characters", label: "캐릭터", icon: UserRound },
  { id: "prompts", label: "프롬프트", icon: WandSparkles },
  { id: "style", label: "스타일·음성", icon: Palette },
  { id: "animation", label: "30초 애니메이션", icon: Film },
  { id: "artifacts", label: "산출물", icon: Download },
] as const;

type TabId = (typeof TABS)[number]["id"];
type StudioSurface = "comic" | "animation" | "character";

const STYLE_LABELS: Readonly<Record<(typeof STUDIO_TOON_AUTOMATION_STYLE_PRESETS)[number], string>> = {
  webtoon: "웹툰",
  watercolor: "수채화",
  pixel: "픽셀 아트",
  cartoon: "카툰",
  ink: "잉크 드로잉",
  "cinematic-3d": "시네마틱 3D",
  "storybook-animation": "스토리북 애니메이션",
  "hand-painted-animation": "핸드페인티드 애니메이션",
  crayon: "크레용",
  custom: "사용자 정의",
};

const VOICE_LABELS: Readonly<Record<(typeof STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS)[number], string>> = {
  browser: "브라우저 TTS 검수",
  gemini: "연결된 Gemini 음성",
  elevenlabs: "연결된 ElevenLabs 음성",
  typecast: "연결된 Typecast 음성",
  uploaded: "업로드 음원",
};

const CARD = "rounded-2xl border border-line bg-panel p-4";
const INPUT = cn(
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none",
  "placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
);
const TEXTAREA = cn(INPUT, "min-h-24 resize-y py-2 leading-relaxed");
const BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);
const PRIMARY = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);

const PROMPT_FIELDS: readonly {
  readonly id: keyof StudioToonAutomationPromptRules;
  readonly label: string;
  readonly description: string;
  readonly rows: number;
}[] = [
  {
    id: "writingInstructions",
    label: "집필 지침",
    description: "사건 순서, 장면 분할, 감정 변화와 원문 보존 기준",
    rows: 4,
  },
  {
    id: "jsonTemplate",
    label: "장면 JSON 템플릿",
    description: "AI 응답을 편집 가능한 장면으로 해석하기 위한 구조",
    rows: 8,
  },
  {
    id: "baseImagePrompt",
    label: "기본 이미지 프롬프트",
    description: "모든 컷에 공통으로 적용할 작품 정체성",
    rows: 4,
  },
  {
    id: "imagePromptRules",
    label: "이미지 프롬프트 규칙",
    description: "카메라, 행동, 표정, 배경, 광원 기술 방식",
    rows: 4,
  },
  {
    id: "imageGenerationRules",
    label: "이미지 생성 규칙",
    description: "참조 역할 분리, 금지 요소와 후보 생성 정책",
    rows: 4,
  },
  {
    id: "narrationRules",
    label: "나레이션 규칙",
    description: "그림과 대사를 보완하는 지문 작성 기준",
    rows: 3,
  },
  {
    id: "dialogueRules",
    label: "대사 규칙",
    description: "화자별 말투와 말풍선 한 호흡 기준",
    rows: 3,
  },
  {
    id: "narrationDisplayRules",
    label: "나레이션 표시 규칙",
    description: "인물과 행동을 가리지 않는 배치 기준",
    rows: 3,
  },
  {
    id: "finalNotes",
    label: "최종 참고",
    description: "검수, 승인, 외부 공급자 전송과 적용 정책",
    rows: 3,
  },
];

export interface StudioToonAutomationWorkspaceProps {
  readonly sessionId: string;
  readonly title: string;
  readonly storyText: string;
  readonly sceneCount: number;
  readonly scenes: readonly ScenarioPreviewItem[];
  readonly visualBibleEntryCount: number;
  readonly document: StudioToonAutomationDocument;
  readonly onChange: (document: StudioToonAutomationDocument) => void;
  readonly onChangeScene: (index: number, patch: Partial<ScenarioPreviewItem>) => void;
  readonly onReplaceScenes: (scenes: readonly ScenarioPreviewItem[]) => void;
  readonly onGenerateScenes: (request: StudioScenarioImageGenerationRequest) => void;
  readonly onOpenDirector: () => void;
  readonly onOpenSurface: (surface: StudioSurface) => void;
  readonly onOpenUsage: () => void;
  readonly disabled?: boolean;
}

function downloadText(fileName: string, value: string, type: string): void {
  downloadBlob(new Blob([value], { type }), fileName);
}

function fileBase(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized || "toonstudio-production";
}

function patchCharacter(
  character: StudioToonAutomationCharacter,
  patch: Partial<StudioToonAutomationCharacter>,
): StudioToonAutomationCharacter {
  return { ...character, ...patch };
}

function redistributeSegments(
  segments: readonly StudioToonAutomationAnimationSegment[],
): StudioToonAutomationAnimationSegment[] {
  if (segments.length === 0) return [];
  return segments.map((segment, index) => {
    const startMs = Math.round(index * STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS / segments.length);
    const endMs = index === segments.length - 1
      ? STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS
      : Math.round((index + 1) * STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS / segments.length);
    return { ...segment, startMs, endMs };
  });
}

function assetFieldLabel(id: keyof StudioToonAutomationDocument["artifacts"]): string {
  return {
    storySheetAssetId: "스토리 시트",
    frameSheetAssetId: "프레임 시트",
    characterGridAssetId: "캐릭터 통합 시트",
    promptTextAssetId: "프롬프트 TXT",
    finalVideoAssetId: "최종 영상",
  }[id];
}

export function StudioToonAutomationWorkspace({
  sessionId,
  title,
  storyText,
  sceneCount,
  scenes,
  visualBibleEntryCount,
  document,
  onChange,
  onChangeScene,
  onReplaceScenes,
  onGenerateScenes,
  onOpenDirector,
  onOpenSurface,
  onOpenUsage,
  disabled = false,
}: StudioToonAutomationWorkspaceProps): ReactElement {
  const [tab, setTab] = useState<TabId>("overview");
  const [referenceDraft, setReferenceDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const speechSupported = isNaturalBrowserSpeechSupported();
  const speechSessionRef = useRef<NaturalBrowserSpeechSession | null>(null);
  const readiness = useMemo(
    () => studioToonAutomationReadiness({
      document,
      storyTextLength: storyText.trim().length,
      sceneCount,
      visualBibleEntryCount,
    }),
    [document, sceneCount, storyText, visualBibleEntryCount],
  );
  const referenceSignature = useMemo(
    () => scenarioImageReferenceSignature(
      document.scenarioReferenceAssetIds.map((assetId) => ({ assetId })),
    ),
    [document.scenarioReferenceAssetIds],
  );

  useEffect(() => () => {
    speechSessionRef.current?.cancel();
    speechSessionRef.current = null;
  }, []);

  const patch = (
    next: Partial<Omit<StudioToonAutomationDocument, "version" | "revision" | "updatedAt">>,
  ) => onChange(updateStudioToonAutomationDocument(document, next));

  const updateCharacter = (
    characterId: string,
    updater: (character: StudioToonAutomationCharacter) => StudioToonAutomationCharacter,
  ) => {
    patch({
      characters: document.characters.map((character) =>
        character.id === characterId ? updater(character) : character),
    });
  };

  const updateSegment = (
    segmentId: string,
    updater: (segment: StudioToonAutomationAnimationSegment) => StudioToonAutomationAnimationSegment,
  ) => {
    patch({
      animation: {
        ...document.animation,
        segments: document.animation.segments.map((segment) =>
          segment.id === segmentId ? updater(segment) : segment),
      },
    });
  };

  const addScenarioReference = () => {
    const value = referenceDraft.normalize("NFKC").trim().slice(0, 240);
    if (!value || document.scenarioReferenceAssetIds.includes(value)) return;
    patch({
      scenarioReferenceAssetIds: [
        ...document.scenarioReferenceAssetIds,
        value,
      ].slice(0, STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES),
    });
    setReferenceDraft("");
  };

  const addCharacter = () => {
    if (document.characters.length >= STUDIO_TOON_AUTOMATION_MAX_CHARACTERS) return;
    patch({
      characters: [
        ...document.characters,
        createStudioToonAutomationCharacter(`캐릭터 ${document.characters.length + 1}`),
      ],
    });
  };

  const previewNarration = () => {
    const sample = storyText.trim().slice(0, 280)
      || "툰스튜디오 음성 검수입니다. 캐릭터와 장면의 분위기를 확인하세요.";
    const voices = listNaturalBrowserSpeechVoices();
    const configured = document.audio.narrationVoice;
    const explicitlyConfigured = voices.find((candidate) =>
      candidate.voiceURI === configured.voiceId || candidate.name === configured.voiceId
    );
    const voice = explicitlyConfigured ?? chooseNaturalKoreanVoice(voices, {
      gender: "neutral",
      preferLocal: true,
    });
    speechSessionRef.current?.cancel();
    const session = speakNaturalBrowserSpeech({
      text: sample,
      style: "calm",
      rate: configured.rate,
      voice,
      maxSegmentChars: 64,
      onEnd: () => {
        speechSessionRef.current = null;
        setNotice("자연스러운 호흡으로 음성 검수를 마쳤습니다.");
      },
      onError: () => {
        speechSessionRef.current = null;
        setNotice("이 브라우저에서 음성 검수를 재생하지 못했습니다.");
      },
    });
    speechSessionRef.current = session;
    setNotice(session
      ? "별도 과금 없는 시스템 음성으로 발음·호흡을 보정해 대본 일부를 검수합니다."
      : "이 브라우저에서는 음성 검수를 사용할 수 없습니다.");
  };

  const fillAnimationPrompts = () => {
    const cast = document.characters.map((character) => character.name).filter(Boolean).join(", ");
    patch({
      animation: {
        ...document.animation,
        segments: document.animation.segments.map((segment, index) => ({
          ...segment,
          prompt: segment.prompt || [
            `${index + 1}번째 장면`,
            cast ? `등장인물: ${cast}` : "등록된 작품 바이블 인물 유지",
            document.prompts.baseImagePrompt,
            "부드러운 카메라 움직임, 인물 정체성과 의상 연속성 유지",
          ].join(". "),
        })),
      },
    });
  };

  const addSegment = () => {
    if (document.animation.segments.length >= STUDIO_TOON_AUTOMATION_MAX_SEGMENTS) return;
    const next = [
      ...document.animation.segments,
      {
        id: `shot-${createSecureRandomUuid("안전한 애니메이션 구간 ID를 만들 수 없습니다.")}`,
        label: `장면 ${document.animation.segments.length + 1}`,
        startMs: 0,
        endMs: STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
        prompt: "",
        referenceAssetIds: [],
      },
    ];
    patch({
      animation: {
        ...document.animation,
        segments: redistributeSegments(next),
      },
    });
  };

  const removeSegment = (segmentId: string) => {
    if (document.animation.segments.length <= 1) return;
    patch({
      animation: {
        ...document.animation,
        segments: redistributeSegments(
          document.animation.segments.filter((segment) => segment.id !== segmentId),
        ),
      },
    });
  };

  const base = fileBase(title);

  return (
    <section
      aria-label="툰스튜디오 제작 자동화 작업대"
      data-studio-toon-automation-workspace="true"
      className="mt-4 overflow-hidden rounded-2xl border border-line-strong bg-canvas shadow-xl"
    >
      <header className="border-b border-line bg-panel px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-on-accent">
            <Clapperboard size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent">
              Toon Automation
            </p>
            <h2 className="text-lg font-black tracking-tight">웹툰·30초 애니메이션 통합 제작</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              대본, 캐릭터 3면 기준, 프롬프트 규칙, 말풍선·나레이션, 음성·BGM과 애니메이션 구간을 한 세션 revision으로 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-card px-3 py-1.5 text-[0.66rem] font-bold text-fg-2">
              준비 {readiness.ready}/{readiness.total} · {readiness.percentage}%
            </span>
            <button type="button" className={BUTTON} onClick={onOpenDirector}>
              AI 코믹 디렉터
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-card p-1" aria-label="제작 모드">
            {STUDIO_TOON_AUTOMATION_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={document.mode === mode}
                onClick={() => patch({ mode })}
                disabled={disabled}
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs font-bold",
                  STUDIO_FOCUS_RING,
                  document.mode === mode ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-raised",
                )}
              >
                {mode === "webtoon" ? "웹툰" : "30초 애니메이션"}
              </button>
            ))}
          </div>
          <div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
              style={{ width: `${readiness.percentage}%` }}
            />
          </div>
          <span className="text-[0.62rem] text-fg-3">자동화 revision {document.revision}</span>
        </div>
      </header>

      <div className="grid min-h-[42rem] lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="제작 자동화 설정" className="border-b border-line bg-panel/55 p-2 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold lg:w-full",
                    STUDIO_FOCUS_RING,
                    tab === item.id
                      ? "bg-accent-soft text-accent"
                      : "text-fg-3 hover:bg-card hover:text-fg",
                  )}
                >
                  <Icon size={15} aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 p-3 sm:p-5">
          {notice ? (
            <p role="status" className="mb-3 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">
              {notice}
            </p>
          ) : null}

          {tab === "overview" ? (
            <div className="space-y-4">
              <section className={CARD}>
                <div className="flex flex-wrap items-start gap-2">
                  <div>
                    <h3 className="text-sm font-black">제작 준비 상태</h3>
                    <p className="mt-1 text-xs text-fg-3">비어 있는 항목은 저장되지만 최종 생성 전 체크리스트에서 차단됩니다.</p>
                  </div>
                  <button type="button" className={cn(PRIMARY, "ml-auto")} onClick={onOpenDirector}>
                    <Sparkles size={14} aria-hidden /> 컷 구성·이미지 제작
                  </button>
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {readiness.items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-line bg-card p-3">
                      <div className="flex items-center gap-2">
                        {item.ready
                          ? <CheckCircle2 size={15} className="text-good" aria-hidden />
                          : <Circle size={15} className="text-warn" aria-hidden />}
                        <strong className="text-xs">{item.label}</strong>
                      </div>
                      <p className="mt-1 pl-[1.45rem] text-[0.64rem] text-fg-3">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={CARD}>
                <div className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-accent" aria-hidden />
                  <div>
                    <h3 className="text-sm font-black">시나리오 참조 이미지</h3>
                    <p className="text-[0.66rem] text-fg-3">Studio 자산 ID를 최대 {STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES}개 연결합니다. 실제 이미지 bytes는 세션 JSON에 넣지 않습니다.</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-fg-2">
                    <span className="sr-only">참조 자산 ID</span>
                    <input
                      value={referenceDraft}
                      onChange={(event) => setReferenceDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addScenarioReference();
                        }
                      }}
                      disabled={disabled || document.scenarioReferenceAssetIds.length >= STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES}
                      placeholder="asset-id 또는 Studio 자산 경로"
                      className={cn(INPUT, "mt-0")}
                    />
                  </label>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={addScenarioReference}
                    disabled={disabled || !referenceDraft.trim() || document.scenarioReferenceAssetIds.length >= STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES}
                  >
                    <Plus size={14} aria-hidden /> 추가
                  </button>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {document.scenarioReferenceAssetIds.map((assetId) => (
                    <li key={assetId} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-line bg-card pl-3 pr-1 text-[0.66rem]">
                      <span className="truncate font-mono">{assetId}</span>
                      <button
                        type="button"
                        aria-label={`${assetId} 참조 제거`}
                        onClick={() => patch({
                          scenarioReferenceAssetIds: document.scenarioReferenceAssetIds.filter((id) => id !== assetId),
                        })}
                        disabled={disabled}
                        className={cn("grid size-8 place-items-center rounded-full hover:bg-raised", STUDIO_FOCUS_RING)}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={CARD}>
                <h3 className="text-sm font-black">실제 제작 공간 연결</h3>
                <p className="mt-1 text-xs text-fg-3">설정 문서만 흉내 내지 않고 기존 Studio의 편집·캐릭터·애니매틱 엔진으로 이어집니다.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button type="button" className={BUTTON} onClick={() => onOpenSurface("comic")}>
                    웹툰 편집기 열기
                  </button>
                  <button type="button" className={BUTTON} onClick={() => onOpenSurface("character")}>
                    캐릭터 작업대 열기
                  </button>
                  <button type="button" className={BUTTON} onClick={() => onOpenSurface("animation")}>
                    애니매틱·영상 열기
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "production" ? (
            <StudioToonProductionBoard
              items={scenes}
              referenceSignature={referenceSignature}
              disabled={disabled}
              onChangeScene={onChangeScene}
              onReplaceScenes={onReplaceScenes}
              onGenerate={onGenerateScenes}
              onOpenDirector={onOpenDirector}
              onOpenUsage={onOpenUsage}
              onOpenAnimation={() => onOpenSurface("animation")}
            />
          ) : null}

          {tab === "characters" ? (
            <div className="space-y-3">
              <section className={CARD}>
                <div className="flex flex-wrap items-start gap-2">
                  <div>
                    <h3 className="text-sm font-black">캐릭터 후보 → 기준 3면 → 음성</h3>
                    <p className="mt-1 text-xs text-fg-3">후보 갤러리에서 선택한 뒤 캐릭터, 스타일 1, 스타일 2 기준을 고정하고 화자 음성을 연결합니다.</p>
                  </div>
                  <button type="button" className={cn(PRIMARY, "ml-auto")} onClick={addCharacter} disabled={disabled || document.characters.length >= STUDIO_TOON_AUTOMATION_MAX_CHARACTERS}>
                    <Plus size={14} aria-hidden /> 캐릭터 추가
                  </button>
                </div>
              </section>

              {document.characters.map((character, index) => (
                <article key={character.id} className={CARD}>
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-xs font-black text-accent">{index + 1}</span>
                    <strong className="text-sm">{character.name || "이름 미정"}</strong>
                    <button
                      type="button"
                      className={cn(BUTTON, "ml-auto")}
                      onClick={() => patch({ characters: document.characters.filter((item) => item.id !== character.id) })}
                      disabled={disabled}
                    >
                      <Trash2 size={13} aria-hidden /> 제거
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="text-xs font-semibold text-fg-2">
                      캐릭터 이름
                      <input
                        value={character.name}
                        onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, { name: event.target.value.slice(0, 120) }))}
                        disabled={disabled}
                        className={INPUT}
                      />
                    </label>
                    <label className="text-xs font-semibold text-fg-2">
                      후보 자산 ID · 쉼표 구분
                      <input
                        value={character.candidateAssetIds.join(", ")}
                        onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, {
                          candidateAssetIds: [...new Set(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 24),
                        }))}
                        disabled={disabled}
                        className={INPUT}
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    외형·의상·표정·식별 특징
                    <textarea
                      value={character.description}
                      onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, { description: event.target.value.slice(0, 4_000) }))}
                      disabled={disabled}
                      rows={4}
                      className={TEXTAREA}
                    />
                  </label>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {([
                      ["characterAssetId", "Character 기준"],
                      ["styleAssetId", "Style 1 기준"],
                      ["alternateStyleAssetId", "Style 2 기준"],
                    ] as const).map(([field, label]) => (
                      <label key={field} className="text-xs font-semibold text-fg-2">
                        {label}
                        <input
                          value={character.canonicalReferences[field]}
                          onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, {
                            canonicalReferences: {
                              ...current.canonicalReferences,
                              [field]: event.target.value.slice(0, 240),
                            },
                          }))}
                          disabled={disabled}
                          placeholder="Studio asset ID"
                          className={INPUT}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-semibold text-fg-2">
                      화자 공급자
                      <select
                        value={character.voice.provider}
                        onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, {
                          voice: {
                            ...current.voice,
                            provider: event.target.value as StudioToonAutomationCharacter["voice"]["provider"],
                          },
                        }))}
                        disabled={disabled}
                        className={INPUT}
                      >
                        {STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS.map((provider) => (
                          <option key={provider} value={provider}>{VOICE_LABELS[provider]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-fg-2">
                      voice ID
                      <input
                        value={character.voice.voiceId}
                        onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, {
                          voice: { ...current.voice, voiceId: event.target.value.slice(0, 240) },
                        }))}
                        disabled={disabled}
                        className={INPUT}
                      />
                    </label>
                    <label className="text-xs font-semibold text-fg-2">
                      업로드 음원 자산 ID
                      <input
                        value={character.voice.audioAssetId}
                        onChange={(event) => updateCharacter(character.id, (current) => patchCharacter(current, {
                          voice: { ...current.voice, audioAssetId: event.target.value.slice(0, 240) },
                        }))}
                        disabled={disabled}
                        className={INPUT}
                      />
                    </label>
                  </div>
                </article>
              ))}

              {document.characters.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-line p-10 text-center">
                  <UserRound size={28} className="mx-auto text-fg-3" aria-hidden />
                  <p className="mt-3 text-sm font-bold">등록된 캐릭터가 없습니다.</p>
                  <p className="mt-1 text-xs text-fg-3">작품 바이블의 캐릭터 기준과 별도로, 생성 후보·3면 기준·화자 음성을 묶어 관리합니다.</p>
                  <button type="button" className={cn(PRIMARY, "mt-4")} onClick={addCharacter} disabled={disabled}>
                    첫 캐릭터 추가
                  </button>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "prompts" ? (
            <section className={CARD}>
              <div className="flex flex-wrap items-start gap-2">
                <div>
                  <h3 className="text-sm font-black">프로젝트 프롬프트 규칙</h3>
                  <p className="mt-1 text-xs text-fg-3">웹툰과 애니메이션이 같은 캐릭터·장면 규칙을 공유하며, 기본값으로 되돌려도 세션 revision에 기록됩니다.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {PROMPT_FIELDS.map((field) => (
                  <label key={field.id} className="block text-xs font-semibold text-fg-2">
                    {field.label}
                    <span className="mt-0.5 block text-[0.62rem] font-normal text-fg-3">{field.description}</span>
                    <textarea
                      value={document.prompts[field.id]}
                      onChange={(event) => patch({
                        prompts: {
                          ...document.prompts,
                          [field.id]: event.target.value.slice(0, 12_000),
                        },
                      })}
                      disabled={disabled}
                      rows={field.rows}
                      className={TEXTAREA}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {tab === "style" ? (
            <div className="space-y-4">
              <section className={CARD}>
                <div className="flex items-center gap-2">
                  <Palette size={16} className="text-accent" aria-hidden />
                  <div>
                    <h3 className="text-sm font-black">화풍과 디자인 자산</h3>
                    <p className="text-[0.66rem] text-fg-3">프리셋, 사용자 정의 지침, 투명 PNG 디자인 자산 ID를 함께 저장합니다.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold text-fg-2">
                    이미지 화풍
                    <select
                      value={document.design.imageStylePreset}
                      onChange={(event) => patch({
                        design: {
                          ...document.design,
                          imageStylePreset: event.target.value as StudioToonAutomationDocument["design"]["imageStylePreset"],
                        },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    >
                      {STUDIO_TOON_AUTOMATION_STYLE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>{STYLE_LABELS[preset]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    사용자 정의 화풍 지침
                    <input
                      value={document.design.customStylePrompt}
                      onChange={(event) => patch({
                        design: { ...document.design, customStylePrompt: event.target.value.slice(0, 4_000) },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {([
                    ["narration", "나레이션 박스"],
                    ["speechBubble", "말풍선"],
                  ] as const).map(([kind, label]) => {
                    const value = document.design[kind];
                    return (
                      <fieldset key={kind} className="rounded-xl border border-line bg-card p-3">
                        <legend className="px-1 text-xs font-black">{label}</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[0.66rem] font-semibold text-fg-2">
                            프리셋 ID
                            <input
                              value={value.presetId}
                              onChange={(event) => patch({
                                design: {
                                  ...document.design,
                                  [kind]: { ...value, presetId: event.target.value.slice(0, 80) },
                                },
                              })}
                              disabled={disabled}
                              className={INPUT}
                            />
                          </label>
                          <label className="text-[0.66rem] font-semibold text-fg-2">
                            사용자 PNG 자산 ID
                            <input
                              value={value.customAssetId}
                              onChange={(event) => patch({
                                design: {
                                  ...document.design,
                                  [kind]: { ...value, customAssetId: event.target.value.slice(0, 240) },
                                },
                              })}
                              disabled={disabled}
                              className={INPUT}
                            />
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {([
                            ["fill", "배경"],
                            ["border", "테두리"],
                            ["text", "글자"],
                          ] as const).map(([field, colorLabel]) => (
                            <label key={field} className="text-[0.62rem] font-semibold text-fg-3">
                              {colorLabel}
                              <input
                                type="color"
                                value={value[field]}
                                onChange={(event) => patch({
                                  design: {
                                    ...document.design,
                                    [kind]: { ...value, [field]: event.target.value },
                                  },
                                })}
                                disabled={disabled}
                                className="mt-1 h-11 w-full rounded-lg border border-line bg-card p-1"
                              />
                            </label>
                          ))}
                          <label className="text-[0.62rem] font-semibold text-fg-3">
                            투명도
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.05"
                              value={value.opacity}
                              onChange={(event) => patch({
                                design: {
                                  ...document.design,
                                  [kind]: { ...value, opacity: Math.min(1, Math.max(0, Number(event.target.value) || 0)) },
                                },
                              })}
                              disabled={disabled}
                              className={INPUT}
                            />
                          </label>
                        </div>
                        <label className="mt-2 block text-[0.66rem] font-semibold text-fg-2">
                          글꼴
                          <input
                            value={value.fontFamily}
                            onChange={(event) => patch({
                              design: {
                                ...document.design,
                                [kind]: { ...value, fontFamily: event.target.value.slice(0, 120) },
                              },
                            })}
                            disabled={disabled}
                            className={INPUT}
                          />
                        </label>
                        {kind === "speechBubble" ? (
                          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={document.design.speechBubble.autoTail}
                              onChange={(event) => patch({
                                design: {
                                  ...document.design,
                                  speechBubble: {
                                    ...document.design.speechBubble,
                                    autoTail: event.target.checked,
                                  },
                                },
                              })}
                              disabled={disabled}
                              className="size-4 accent-accent"
                            />
                            화자 위치에 맞춰 꼬리 방향 자동 결정
                          </label>
                        ) : null}
                      </fieldset>
                    );
                  })}
                </div>
              </section>

              <section className={CARD}>
                <div className="flex items-center gap-2">
                  <Mic2 size={16} className="text-accent" aria-hidden />
                  <div>
                    <h3 className="text-sm font-black">나레이션 음성·BGM</h3>
                    <p className="text-[0.66rem] text-fg-3">브라우저 TTS는 즉시 검수하고, 외부 공급자 키는 서버 구성에서만 관리합니다.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-xs font-semibold text-fg-2">
                    공급자
                    <select
                      value={document.audio.narrationVoice.provider}
                      onChange={(event) => patch({
                        audio: {
                          ...document.audio,
                          narrationVoice: {
                            ...document.audio.narrationVoice,
                            provider: event.target.value as StudioToonAutomationDocument["audio"]["narrationVoice"]["provider"],
                          },
                        },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    >
                      {STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>{VOICE_LABELS[provider]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    voice ID
                    <input
                      value={document.audio.narrationVoice.voiceId}
                      onChange={(event) => patch({
                        audio: {
                          ...document.audio,
                          narrationVoice: { ...document.audio.narrationVoice, voiceId: event.target.value.slice(0, 240) },
                        },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    언어
                    <input
                      value={document.audio.narrationVoice.locale}
                      onChange={(event) => patch({
                        audio: {
                          ...document.audio,
                          narrationVoice: { ...document.audio.narrationVoice, locale: event.target.value.slice(0, 35) },
                        },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    속도 · {document.audio.narrationVoice.rate.toFixed(2)}×
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.05"
                      value={document.audio.narrationVoice.rate}
                      onChange={(event) => patch({
                        audio: {
                          ...document.audio,
                          narrationVoice: { ...document.audio.narrationVoice, rate: Number(event.target.value) },
                        },
                      })}
                      disabled={disabled}
                      className="mt-2 w-full accent-accent"
                    />
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    BGM 자산 ID
                    <input
                      value={document.audio.bgmAssetId}
                      onChange={(event) => patch({
                        audio: { ...document.audio, bgmAssetId: event.target.value.slice(0, 240) },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                  <div className="flex items-end">
                    <button type="button" className={cn(PRIMARY, "w-full")} onClick={previewNarration} disabled={!speechSupported}>
                      <Mic2 size={14} aria-hidden /> 대본 음성 검수
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "animation" ? (
            <div className="space-y-4">
              <section className={CARD}>
                <div className="flex flex-wrap items-start gap-2">
                  <div>
                    <h3 className="text-sm font-black">30초 애니메이션 준비</h3>
                    <p className="mt-1 text-xs text-fg-3">시나리오 → 콘티·프리뷰 → 구간 수정 → 음성·BGM → 최종 영상으로 이어지는 고정 길이 작업입니다.</p>
                  </div>
                  <button type="button" className={cn(PRIMARY, "ml-auto")} onClick={() => onOpenSurface("animation")}>
                    <Film size={14} aria-hidden /> 애니매틱 작업대 열기
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-xs font-semibold text-fg-2">
                    화면 비율
                    <select
                      value={document.animation.aspectRatio}
                      onChange={(event) => patch({
                        animation: {
                          ...document.animation,
                          aspectRatio: event.target.value as StudioToonAutomationDocument["animation"]["aspectRatio"],
                        },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    >
                      {STUDIO_TOON_AUTOMATION_ASPECT_RATIOS.map((ratio) => <option key={ratio}>{ratio}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    3D/콘티 프리뷰 자산 ID
                    <input
                      value={document.animation.previewAssetId}
                      onChange={(event) => patch({
                        animation: { ...document.animation, previewAssetId: event.target.value.slice(0, 240) },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                  <label className="text-xs font-semibold text-fg-2">
                    Blender 패키지 자산 ID
                    <input
                      value={document.animation.blenderAssetId}
                      onChange={(event) => patch({
                        animation: { ...document.animation, blenderAssetId: event.target.value.slice(0, 240) },
                      })}
                      disabled={disabled}
                      className={INPUT}
                    />
                  </label>
                </div>
                <label className="mt-3 block text-xs font-semibold text-fg-2">
                  프리뷰 수정 지시
                  <textarea
                    value={document.animation.correctionNotes}
                    onChange={(event) => patch({
                      animation: { ...document.animation, correctionNotes: event.target.value.slice(0, 4_000) },
                    })}
                    disabled={disabled}
                    rows={4}
                    className={TEXTAREA}
                  />
                </label>
              </section>

              <section className={CARD}>
                <div className="flex flex-wrap items-start gap-2">
                  <div>
                    <h3 className="text-sm font-black">구간별 움직임·카메라 프롬프트</h3>
                    <p className="mt-1 text-xs text-fg-3">모든 구간은 0초부터 30초까지 틈 없이 이어져야 최종 체크리스트를 통과합니다.</p>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className={BUTTON} onClick={fillAnimationPrompts} disabled={disabled}>
                      규칙으로 빈 프롬프트 채우기
                    </button>
                    <button type="button" className={BUTTON} onClick={addSegment} disabled={disabled || document.animation.segments.length >= STUDIO_TOON_AUTOMATION_MAX_SEGMENTS}>
                      <Plus size={13} aria-hidden /> 구간 추가
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {document.animation.segments.map((segment, index) => (
                    <article key={segment.id} className="rounded-xl border border-line bg-card p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-xs font-black text-accent">{index + 1}</span>
                        <label className="min-w-36 flex-1 text-[0.66rem] font-semibold text-fg-2">
                          구간 이름
                          <input
                            value={segment.label}
                            onChange={(event) => updateSegment(segment.id, (current) => ({ ...current, label: event.target.value.slice(0, 160) }))}
                            disabled={disabled}
                            className={INPUT}
                          />
                        </label>
                        <label className="w-28 text-[0.66rem] font-semibold text-fg-2">
                          시작(초)
                          <input
                            type="number"
                            min="0"
                            max="29.9"
                            step="0.1"
                            value={segment.startMs / 1_000}
                            onChange={(event) => updateSegment(segment.id, (current) => ({
                              ...current,
                              startMs: Math.min(current.endMs - 100, Math.max(0, Math.round(Number(event.target.value) * 1_000))),
                            }))}
                            disabled={disabled}
                            className={INPUT}
                          />
                        </label>
                        <label className="w-28 text-[0.66rem] font-semibold text-fg-2">
                          종료(초)
                          <input
                            type="number"
                            min="0.1"
                            max="30"
                            step="0.1"
                            value={segment.endMs / 1_000}
                            onChange={(event) => updateSegment(segment.id, (current) => ({
                              ...current,
                              endMs: Math.max(current.startMs + 100, Math.min(STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS, Math.round(Number(event.target.value) * 1_000))),
                            }))}
                            disabled={disabled}
                            className={INPUT}
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`${segment.label} 구간 제거`}
                          className={BUTTON}
                          onClick={() => removeSegment(segment.id)}
                          disabled={disabled || document.animation.segments.length <= 1}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                      <label className="mt-3 block text-[0.66rem] font-semibold text-fg-2">
                        움직임·카메라·연속성 프롬프트
                        <textarea
                          value={segment.prompt}
                          onChange={(event) => updateSegment(segment.id, (current) => ({ ...current, prompt: event.target.value.slice(0, 4_000) }))}
                          disabled={disabled}
                          rows={3}
                          className={TEXTAREA}
                        />
                      </label>
                      <label className="mt-2 block text-[0.66rem] font-semibold text-fg-2">
                        구간 참조 자산 ID · 쉼표 구분
                        <input
                          value={segment.referenceAssetIds.join(", ")}
                          onChange={(event) => updateSegment(segment.id, (current) => ({
                            ...current,
                            referenceAssetIds: [...new Set(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))]
                              .slice(0, STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES),
                          }))}
                          disabled={disabled}
                          className={INPUT}
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "artifacts" ? (
            <div className="space-y-4">
              <section className={CARD}>
                <h3 className="text-sm font-black">검수·다운로드 산출물</h3>
                <p className="mt-1 text-xs text-fg-3">대용량 파일은 Studio 자산 저장소에 두고 세션에는 ID와 검수 상태만 저장합니다.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(Object.keys(document.artifacts) as Array<keyof StudioToonAutomationDocument["artifacts"]>).map((field) => (
                    <label key={field} className="text-xs font-semibold text-fg-2">
                      {assetFieldLabel(field)} 자산 ID
                      <input
                        value={document.artifacts[field]}
                        onChange={(event) => patch({
                          artifacts: { ...document.artifacts, [field]: event.target.value.slice(0, 240) },
                        })}
                        disabled={disabled}
                        className={INPUT}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className={CARD}>
                <h3 className="text-sm font-black">휴대 가능한 제작 패키지</h3>
                <p className="mt-1 text-xs text-fg-3">프로젝트 JSON은 전체 설정과 자산 참조를, TXT는 공급자 중립 프롬프트와 30초 구간 지시를 담습니다.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={PRIMARY}
                    onClick={() => downloadText(
                      `${base}-toon-automation.json`,
                      JSON.stringify(studioToonAutomationManifest({ sessionId, title, document }), null, 2),
                      "application/json;charset=utf-8",
                    )}
                  >
                    <Download size={14} aria-hidden /> 프로젝트 JSON
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => downloadText(
                      `${base}-prompts.txt`,
                      studioToonAutomationPromptBundle(document),
                      "text/plain;charset=utf-8",
                    )}
                  >
                    <Download size={14} aria-hidden /> 프롬프트 TXT
                  </button>
                  <button type="button" className={BUTTON} onClick={() => onOpenSurface("animation")}>
                    영상 내보내기 작업대
                  </button>
                </div>
              </section>

              <section className={CARD}>
                <div className="flex items-center gap-2">
                  <Settings2 size={16} className="text-accent" aria-hidden />
                  <div>
                    <h3 className="text-sm font-black">기능 내재화 원칙</h3>
                    <p className="text-[0.66rem] text-fg-3">외부 서비스 화면이나 소스·브랜드 자산을 복제하지 않고, 관찰 가능한 제작 동작을 ToonStudio 네이티브 모델로 구현합니다.</p>
                  </div>
                </div>
                <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  {[
                    "프로젝트 자동저장·클라우드 revision·충돌 복구",
                    "장면별 이미지 후보·부분 수리·레이어 분리",
                    "캐릭터 후보·3면 기준·화자별 음성",
                    "프로젝트 프롬프트 규칙·기본값",
                    "나레이션·말풍선·화풍·사용자 디자인 자산",
                    "30초 구간 타임라인·프리뷰 수정·BGM",
                    "스토리·프레임·캐릭터 시트 자산 참조",
                    "JSON·TXT·Studio 애니매틱·영상 내보내기",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
