import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

export const STUDIO_TOON_AUTOMATION_VERSION = 1 as const;
export const STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS = 30_000;
export const STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES = 5;
export const STUDIO_TOON_AUTOMATION_MAX_CHARACTERS = 24;
export const STUDIO_TOON_AUTOMATION_MAX_SEGMENTS = 24;

export const STUDIO_TOON_AUTOMATION_MODES = ["webtoon", "animation"] as const;
export type StudioToonAutomationMode = (typeof STUDIO_TOON_AUTOMATION_MODES)[number];

export const STUDIO_TOON_AUTOMATION_STYLE_PRESETS = [
  "webtoon",
  "watercolor",
  "pixel",
  "cartoon",
  "ink",
  "cinematic-3d",
  "storybook-animation",
  "hand-painted-animation",
  "crayon",
  "custom",
] as const;
export type StudioToonAutomationStylePreset =
  (typeof STUDIO_TOON_AUTOMATION_STYLE_PRESETS)[number];

export const STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS = [
  "browser",
  "gemini",
  "elevenlabs",
  "typecast",
  "uploaded",
] as const;
export type StudioToonAutomationVoiceProvider =
  (typeof STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS)[number];

export const STUDIO_TOON_AUTOMATION_ASPECT_RATIOS = [
  "9:16",
  "16:9",
  "1:1",
  "4:3",
] as const;
export type StudioToonAutomationAspectRatio =
  (typeof STUDIO_TOON_AUTOMATION_ASPECT_RATIOS)[number];

export interface StudioToonAutomationPromptRules {
  readonly writingInstructions: string;
  readonly jsonTemplate: string;
  readonly baseImagePrompt: string;
  readonly imagePromptRules: string;
  readonly imageGenerationRules: string;
  readonly narrationRules: string;
  readonly dialogueRules: string;
  readonly narrationDisplayRules: string;
  readonly finalNotes: string;
}

export interface StudioToonAutomationVoiceAssignment {
  readonly provider: StudioToonAutomationVoiceProvider;
  readonly voiceId: string;
  readonly locale: string;
  readonly rate: number;
  readonly pitch: number;
  readonly audioAssetId: string;
}

export interface StudioToonAutomationCharacter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly candidateAssetIds: readonly string[];
  readonly canonicalReferences: {
    readonly characterAssetId: string;
    readonly styleAssetId: string;
    readonly alternateStyleAssetId: string;
  };
  readonly voice: StudioToonAutomationVoiceAssignment;
}

export interface StudioToonAutomationDesignPreset {
  readonly presetId: string;
  readonly customAssetId: string;
  readonly fill: string;
  readonly border: string;
  readonly text: string;
  readonly fontFamily: string;
  readonly opacity: number;
}

export interface StudioToonAutomationDesignSettings {
  readonly imageStylePreset: StudioToonAutomationStylePreset;
  readonly customStylePrompt: string;
  readonly narration: StudioToonAutomationDesignPreset;
  readonly speechBubble: StudioToonAutomationDesignPreset & {
    readonly autoTail: boolean;
  };
}

export interface StudioToonAutomationAudioSettings {
  readonly narrationVoice: StudioToonAutomationVoiceAssignment;
  readonly bgmAssetId: string;
  readonly bgmVolume: number;
  readonly dialogueVolume: number;
  readonly normalizeLoudness: boolean;
}

export interface StudioToonAutomationAnimationSegment {
  readonly id: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly prompt: string;
  readonly referenceAssetIds: readonly string[];
}

export interface StudioToonAutomationAnimationSettings {
  readonly targetDurationMs: typeof STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS;
  readonly aspectRatio: StudioToonAutomationAspectRatio;
  readonly previewAssetId: string;
  readonly blenderAssetId: string;
  readonly correctionNotes: string;
  readonly segments: readonly StudioToonAutomationAnimationSegment[];
}

export interface StudioToonAutomationArtifacts {
  readonly storySheetAssetId: string;
  readonly frameSheetAssetId: string;
  readonly characterGridAssetId: string;
  readonly promptTextAssetId: string;
  readonly finalVideoAssetId: string;
}

export interface StudioToonAutomationDocument {
  readonly version: typeof STUDIO_TOON_AUTOMATION_VERSION;
  readonly revision: number;
  readonly mode: StudioToonAutomationMode;
  readonly scenarioReferenceAssetIds: readonly string[];
  readonly characters: readonly StudioToonAutomationCharacter[];
  readonly prompts: StudioToonAutomationPromptRules;
  readonly design: StudioToonAutomationDesignSettings;
  readonly audio: StudioToonAutomationAudioSettings;
  readonly animation: StudioToonAutomationAnimationSettings;
  readonly artifacts: StudioToonAutomationArtifacts;
  readonly updatedAt: string;
}

export interface StudioToonAutomationReadinessItem {
  readonly id: "story" | "references" | "characters" | "prompts" | "design" | "audio" | "timeline";
  readonly label: string;
  readonly ready: boolean;
  readonly detail: string;
}

export interface StudioToonAutomationReadiness {
  readonly ready: number;
  readonly total: number;
  readonly percentage: number;
  readonly items: readonly StudioToonAutomationReadinessItem[];
}

function secureId(prefix: string): string {
  return `${prefix}-${createSecureRandomUuid(
    `이 브라우저에서는 안전한 ${prefix} ID를 만들 수 없습니다.`,
  )}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "", maximum = 12_000): string {
  return typeof value === "string" ? value.slice(0, maximum) : fallback;
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(finiteNumber(value, fallback, minimum, maximum));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? value as T
    : fallback;
}

function iso(value: unknown): string {
  const candidate = typeof value === "string" ? new Date(value) : new Date();
  return Number.isFinite(candidate.getTime())
    ? candidate.toISOString()
    : new Date().toISOString();
}

function stringList(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.normalize("NFKC").trim().slice(0, 240))
    .filter(Boolean))]
    .slice(0, maximum);
}

function defaultVoice(): StudioToonAutomationVoiceAssignment {
  return {
    provider: "browser",
    voiceId: "",
    locale: "ko-KR",
    rate: 1,
    pitch: 1,
    audioAssetId: "",
  };
}

function hydrateVoice(value: unknown): StudioToonAutomationVoiceAssignment {
  const source = record(value);
  return {
    provider: enumValue(
      source.provider,
      STUDIO_TOON_AUTOMATION_VOICE_PROVIDERS,
      "browser",
    ),
    voiceId: text(source.voiceId, "", 240),
    locale: text(source.locale, "ko-KR", 35) || "ko-KR",
    rate: finiteNumber(source.rate, 1, 0.5, 2),
    pitch: finiteNumber(source.pitch, 1, 0.5, 2),
    audioAssetId: text(source.audioAssetId, "", 240),
  };
}

function defaultPromptRules(): StudioToonAutomationPromptRules {
  return {
    writingInstructions:
      "원문의 사건 순서와 인물 관계를 보존하고, 한 장면에는 하나의 명확한 행동과 감정 변화를 둔다.",
    jsonTemplate:
      "{\n  \"scenes\": [{ \"summary\": \"\", \"imagePrompt\": \"\", \"narration\": \"\", \"dialogue\": [] }]\n}",
    baseImagePrompt:
      "동일 작품의 캐릭터 정체성, 의상, 색채, 광원과 공간 연속성을 유지한다.",
    imagePromptRules:
      "카메라 거리·각도·행동·표정·배경·광원을 구체적으로 쓰고, 화면 안 텍스트는 생성하지 않는다.",
    imageGenerationRules:
      "참조 이미지는 역할별로 사용하고, 캐릭터 정체성 참조와 화풍 참조를 섞지 않는다.",
    narrationRules:
      "그림과 대사로 전달되지 않는 시간·장소·내면 정보만 짧게 쓴다.",
    dialogueRules:
      "화자별 말투를 유지하고, 말풍선 하나에는 한 호흡의 문장만 넣는다.",
    narrationDisplayRules:
      "나레이션은 장면의 주요 얼굴과 행동을 가리지 않는 여백에 배치한다.",
    finalNotes:
      "생성 결과는 후보로 취급하고, 검수·승인된 결과만 편집 원고와 최종 영상에 적용한다.",
  };
}

function hydratePromptRules(value: unknown): StudioToonAutomationPromptRules {
  const source = record(value);
  const fallback = defaultPromptRules();
  return {
    writingInstructions: text(source.writingInstructions, fallback.writingInstructions),
    jsonTemplate: text(source.jsonTemplate, fallback.jsonTemplate),
    baseImagePrompt: text(source.baseImagePrompt, fallback.baseImagePrompt),
    imagePromptRules: text(source.imagePromptRules, fallback.imagePromptRules),
    imageGenerationRules: text(source.imageGenerationRules, fallback.imageGenerationRules),
    narrationRules: text(source.narrationRules, fallback.narrationRules),
    dialogueRules: text(source.dialogueRules, fallback.dialogueRules),
    narrationDisplayRules: text(source.narrationDisplayRules, fallback.narrationDisplayRules),
    finalNotes: text(source.finalNotes, fallback.finalNotes),
  };
}

function defaultDesignPreset(presetId: string): StudioToonAutomationDesignPreset {
  return {
    presetId,
    customAssetId: "",
    fill: "#ffffff",
    border: "#18181b",
    text: "#18181b",
    fontFamily: "Pretendard",
    opacity: 1,
  };
}

function hydrateDesignPreset(
  value: unknown,
  fallback: StudioToonAutomationDesignPreset,
): StudioToonAutomationDesignPreset {
  const source = record(value);
  return {
    presetId: text(source.presetId, fallback.presetId, 80) || fallback.presetId,
    customAssetId: text(source.customAssetId, "", 240),
    fill: text(source.fill, fallback.fill, 40),
    border: text(source.border, fallback.border, 40),
    text: text(source.text, fallback.text, 40),
    fontFamily: text(source.fontFamily, fallback.fontFamily, 120),
    opacity: finiteNumber(source.opacity, fallback.opacity, 0, 1),
  };
}

function defaultDesign(): StudioToonAutomationDesignSettings {
  return {
    imageStylePreset: "webtoon",
    customStylePrompt: "",
    narration: defaultDesignPreset("caption-clean"),
    speechBubble: {
      ...defaultDesignPreset("speech-round"),
      autoTail: true,
    },
  };
}

function hydrateDesign(value: unknown): StudioToonAutomationDesignSettings {
  const source = record(value);
  const fallback = defaultDesign();
  const bubbleSource = record(source.speechBubble);
  return {
    imageStylePreset: enumValue(
      source.imageStylePreset,
      STUDIO_TOON_AUTOMATION_STYLE_PRESETS,
      fallback.imageStylePreset,
    ),
    customStylePrompt: text(source.customStylePrompt, "", 4_000),
    narration: hydrateDesignPreset(source.narration, fallback.narration),
    speechBubble: {
      ...hydrateDesignPreset(source.speechBubble, fallback.speechBubble),
      autoTail: bubbleSource.autoTail !== false,
    },
  };
}

function defaultSegments(): StudioToonAutomationAnimationSegment[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `shot-${String(index + 1).padStart(2, "0")}`,
    label: `장면 ${index + 1}`,
    startMs: index * 5_000,
    endMs: (index + 1) * 5_000,
    prompt: "",
    referenceAssetIds: [],
  }));
}

function hydrateSegment(value: unknown, index: number): StudioToonAutomationAnimationSegment | null {
  const source = record(value);
  const startMs = integer(source.startMs, index * 5_000, 0, STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS - 100);
  const endMs = integer(
    source.endMs,
    Math.min(STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS, startMs + 5_000),
    startMs + 100,
    STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
  );
  return {
    id: text(source.id, `shot-${String(index + 1).padStart(2, "0")}`, 160)
      || `shot-${String(index + 1).padStart(2, "0")}`,
    label: text(source.label, `장면 ${index + 1}`, 160) || `장면 ${index + 1}`,
    startMs,
    endMs,
    prompt: text(source.prompt, "", 4_000),
    referenceAssetIds: stringList(source.referenceAssetIds, STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES),
  };
}

function hydrateCharacter(value: unknown): StudioToonAutomationCharacter | null {
  const source = record(value);
  const id = text(source.id, "", 160);
  if (!id) return null;
  const canonical = record(source.canonicalReferences);
  return {
    id,
    name: text(source.name, "", 120),
    description: text(source.description, "", 4_000),
    candidateAssetIds: stringList(source.candidateAssetIds, 24),
    canonicalReferences: {
      characterAssetId: text(canonical.characterAssetId, "", 240),
      styleAssetId: text(canonical.styleAssetId, "", 240),
      alternateStyleAssetId: text(canonical.alternateStyleAssetId, "", 240),
    },
    voice: hydrateVoice(source.voice),
  };
}

export function createStudioToonAutomationCharacter(
  name = "새 캐릭터",
): StudioToonAutomationCharacter {
  return {
    id: secureId("character"),
    name,
    description: "",
    candidateAssetIds: [],
    canonicalReferences: {
      characterAssetId: "",
      styleAssetId: "",
      alternateStyleAssetId: "",
    },
    voice: defaultVoice(),
  };
}

export function createStudioToonAutomationDocument(): StudioToonAutomationDocument {
  return {
    version: STUDIO_TOON_AUTOMATION_VERSION,
    revision: 1,
    mode: "webtoon",
    scenarioReferenceAssetIds: [],
    characters: [],
    prompts: defaultPromptRules(),
    design: defaultDesign(),
    audio: {
      narrationVoice: defaultVoice(),
      bgmAssetId: "",
      bgmVolume: 0.35,
      dialogueVolume: 1,
      normalizeLoudness: true,
    },
    animation: {
      targetDurationMs: STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
      aspectRatio: "9:16",
      previewAssetId: "",
      blenderAssetId: "",
      correctionNotes: "",
      segments: defaultSegments(),
    },
    artifacts: {
      storySheetAssetId: "",
      frameSheetAssetId: "",
      characterGridAssetId: "",
      promptTextAssetId: "",
      finalVideoAssetId: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function hydrateStudioToonAutomationDocument(
  value: unknown,
): StudioToonAutomationDocument {
  const source = record(value);
  const fallback = createStudioToonAutomationDocument();
  const audio = record(source.audio);
  const animation = record(source.animation);
  const artifacts = record(source.artifacts);
  const rawCharacters = Array.isArray(source.characters) ? source.characters : [];
  const rawSegments = Array.isArray(animation.segments) ? animation.segments : [];
  const segments = rawSegments
    .slice(0, STUDIO_TOON_AUTOMATION_MAX_SEGMENTS)
    .map(hydrateSegment)
    .filter((item): item is StudioToonAutomationAnimationSegment => item !== null);

  return {
    version: STUDIO_TOON_AUTOMATION_VERSION,
    revision: integer(source.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    mode: enumValue(source.mode, STUDIO_TOON_AUTOMATION_MODES, "webtoon"),
    scenarioReferenceAssetIds: stringList(
      source.scenarioReferenceAssetIds,
      STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES,
    ),
    characters: rawCharacters
      .slice(0, STUDIO_TOON_AUTOMATION_MAX_CHARACTERS)
      .map(hydrateCharacter)
      .filter((item): item is StudioToonAutomationCharacter => item !== null),
    prompts: hydratePromptRules(source.prompts),
    design: hydrateDesign(source.design),
    audio: {
      narrationVoice: hydrateVoice(audio.narrationVoice),
      bgmAssetId: text(audio.bgmAssetId, "", 240),
      bgmVolume: finiteNumber(audio.bgmVolume, fallback.audio.bgmVolume, 0, 1),
      dialogueVolume: finiteNumber(audio.dialogueVolume, fallback.audio.dialogueVolume, 0, 1),
      normalizeLoudness: audio.normalizeLoudness !== false,
    },
    animation: {
      targetDurationMs: STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
      aspectRatio: enumValue(
        animation.aspectRatio,
        STUDIO_TOON_AUTOMATION_ASPECT_RATIOS,
        fallback.animation.aspectRatio,
      ),
      previewAssetId: text(animation.previewAssetId, "", 240),
      blenderAssetId: text(animation.blenderAssetId, "", 240),
      correctionNotes: text(animation.correctionNotes, "", 4_000),
      segments: segments.length > 0 ? segments : fallback.animation.segments,
    },
    artifacts: {
      storySheetAssetId: text(artifacts.storySheetAssetId, "", 240),
      frameSheetAssetId: text(artifacts.frameSheetAssetId, "", 240),
      characterGridAssetId: text(artifacts.characterGridAssetId, "", 240),
      promptTextAssetId: text(artifacts.promptTextAssetId, "", 240),
      finalVideoAssetId: text(artifacts.finalVideoAssetId, "", 240),
    },
    updatedAt: iso(source.updatedAt),
  };
}

export function updateStudioToonAutomationDocument(
  document: StudioToonAutomationDocument,
  patch: Partial<Omit<StudioToonAutomationDocument, "version" | "revision" | "updatedAt">>,
): StudioToonAutomationDocument {
  return {
    ...document,
    ...patch,
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

function timelineIsReady(segments: readonly StudioToonAutomationAnimationSegment[]): boolean {
  if (segments.length === 0) return false;
  const ordered = [...segments].sort((left, right) => left.startMs - right.startMs);
  if (ordered[0]?.startMs !== 0) return false;
  if (ordered.at(-1)?.endMs !== STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS) return false;
  return ordered.every((segment, index) => {
    if (!segment.prompt.trim() || segment.endMs <= segment.startMs) return false;
    const previous = ordered[index - 1];
    return !previous || previous.endMs === segment.startMs;
  });
}

function characterIsReady(character: StudioToonAutomationCharacter): boolean {
  const references = character.canonicalReferences;
  return Boolean(
    character.name.trim()
    && references.characterAssetId.trim()
    && references.styleAssetId.trim()
    && references.alternateStyleAssetId.trim(),
  );
}

export function studioToonAutomationReadiness(input: {
  readonly document: StudioToonAutomationDocument;
  readonly storyTextLength: number;
  readonly sceneCount: number;
  readonly visualBibleEntryCount: number;
}): StudioToonAutomationReadiness {
  const { document } = input;
  const promptReady = [
    document.prompts.writingInstructions,
    document.prompts.baseImagePrompt,
    document.prompts.imagePromptRules,
    document.prompts.narrationRules,
    document.prompts.dialogueRules,
  ].every((value) => value.trim().length > 0);
  const voice = document.audio.narrationVoice;
  const audioReady = voice.provider === "browser"
    || (voice.provider === "uploaded" ? Boolean(voice.audioAssetId.trim()) : Boolean(voice.voiceId.trim()));
  const references = document.scenarioReferenceAssetIds.length + input.visualBibleEntryCount;
  const items: StudioToonAutomationReadinessItem[] = [
    {
      id: "story",
      label: "대본·컷 구성",
      ready: input.storyTextLength > 0 && input.sceneCount > 0,
      detail: `${input.storyTextLength.toLocaleString("ko-KR")}자 · ${input.sceneCount}컷`,
    },
    {
      id: "references",
      label: "시나리오·작품 참조",
      ready: references > 0,
      detail: `${references}개 참조`,
    },
    {
      id: "characters",
      label: "캐릭터 3면 기준",
      ready: document.characters.length > 0 && document.characters.every(characterIsReady),
      detail: `${document.characters.filter(characterIsReady).length}/${document.characters.length}명 준비`,
    },
    {
      id: "prompts",
      label: "프롬프트 규칙",
      ready: promptReady,
      detail: promptReady ? "핵심 규칙 준비됨" : "비어 있는 핵심 규칙 있음",
    },
    {
      id: "design",
      label: "화풍·말풍선·나레이션",
      ready: Boolean(document.design.imageStylePreset && document.design.speechBubble.presetId),
      detail: `${document.design.imageStylePreset} · ${document.design.speechBubble.presetId}`,
    },
    {
      id: "audio",
      label: "음성·BGM",
      ready: audioReady,
      detail: `${voice.provider}${document.audio.bgmAssetId ? " · BGM 연결" : ""}`,
    },
    {
      id: "timeline",
      label: "30초 애니메이션 타임라인",
      ready: timelineIsReady(document.animation.segments),
      detail: `${document.animation.segments.length}구간 · ${document.animation.aspectRatio}`,
    },
  ];
  const ready = items.filter((item) => item.ready).length;
  return {
    ready,
    total: items.length,
    percentage: Math.round(ready / items.length * 100),
    items,
  };
}

export function studioToonAutomationPromptBundle(
  document: StudioToonAutomationDocument,
): string {
  const rules = document.prompts;
  const characterLines = document.characters.map((character, index) => [
    `${index + 1}. ${character.name || "이름 미정"}`,
    character.description,
    `voice=${character.voice.provider}:${character.voice.voiceId || character.voice.audioAssetId || "default"}`,
    `references=${Object.values(character.canonicalReferences).filter(Boolean).join(", ") || "none"}`,
  ].filter(Boolean).join(" | "));
  const segmentLines = document.animation.segments.map((segment, index) =>
    `${index + 1}. ${(segment.startMs / 1_000).toFixed(1)}-${(segment.endMs / 1_000).toFixed(1)}s ${segment.label}: ${segment.prompt || "프롬프트 미정"}`,
  );
  return [
    "# ToonStudio 제작 자동화 프롬프트 번들",
    `mode=${document.mode}`,
    `style=${document.design.imageStylePreset}`,
    `aspectRatio=${document.animation.aspectRatio}`,
    "",
    "## 집필 지침",
    rules.writingInstructions,
    "",
    "## JSON 템플릿",
    rules.jsonTemplate,
    "",
    "## 기본 이미지 프롬프트",
    rules.baseImagePrompt,
    "",
    "## 이미지 프롬프트 규칙",
    rules.imagePromptRules,
    "",
    "## 이미지 생성 규칙",
    rules.imageGenerationRules,
    "",
    "## 나레이션 규칙",
    rules.narrationRules,
    "",
    "## 대사 규칙",
    rules.dialogueRules,
    "",
    "## 나레이션 표시 규칙",
    rules.narrationDisplayRules,
    "",
    "## 캐릭터",
    ...(characterLines.length ? characterLines : ["등록된 캐릭터 없음"]),
    "",
    "## 30초 구간 프롬프트",
    ...segmentLines,
    "",
    "## 최종 참고",
    rules.finalNotes,
  ].join("\n");
}

export function studioToonAutomationManifest(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly document: StudioToonAutomationDocument;
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: "toonstudio.toon-automation",
    version: STUDIO_TOON_AUTOMATION_VERSION,
    exportedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    title: input.title,
    automation: input.document,
    promptBundle: studioToonAutomationPromptBundle(input.document),
  });
}
