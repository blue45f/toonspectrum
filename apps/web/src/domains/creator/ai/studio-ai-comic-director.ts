import {
  isScenarioImageCandidateStale,
  scenarioImageCandidates,
} from "./studio-scenario-candidate-workflow";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

export const STUDIO_AI_COMIC_DIRECTOR_STAGE_IDS = [
  "brief",
  "direction",
  "production",
  "finish",
] as const;

export type StudioAiComicDirectorStageId =
  (typeof STUDIO_AI_COMIC_DIRECTOR_STAGE_IDS)[number];

export const STUDIO_AI_COMIC_DIRECTOR_VIEW_IDS = ["board", "list"] as const;
export type StudioAiComicDirectorViewId =
  (typeof STUDIO_AI_COMIC_DIRECTOR_VIEW_IDS)[number];

export const STUDIO_AI_COMIC_DIRECTOR_PROFILE_IDS = [
  "idea",
  "production",
  "final",
] as const;
export type StudioAiComicDirectorProfileId =
  (typeof STUDIO_AI_COMIC_DIRECTOR_PROFILE_IDS)[number];

export const STUDIO_AI_COMIC_DIRECTOR_INTENT_IDS = [
  "faithful",
  "expressive",
  "cinematic",
  "alternate-composition",
] as const;
export type StudioAiComicDirectorIntentId =
  (typeof STUDIO_AI_COMIC_DIRECTOR_INTENT_IDS)[number];

export interface StudioAiComicDirectorProfile {
  readonly id: StudioAiComicDirectorProfileId;
  readonly label: string;
  readonly description: string;
  readonly variants: 1 | 2 | 4;
}

export const STUDIO_AI_COMIC_DIRECTOR_PROFILES: readonly StudioAiComicDirectorProfile[] = [
  {
    id: "idea",
    label: "아이디어 초안",
    description: "구도와 컷 흐름을 빠르게 탐색합니다.",
    variants: 1,
  },
  {
    id: "production",
    label: "제작용",
    description: "작품 기준을 유지하며 비교할 후보를 만듭니다.",
    variants: 2,
  },
  {
    id: "final",
    label: "최종 원고",
    description: "후보 4개와 전체 마감 검사를 준비합니다.",
    variants: 4,
  },
] as const;

export interface StudioAiComicDirectorIntent {
  readonly id: StudioAiComicDirectorIntentId;
  readonly label: string;
  readonly description: string;
  readonly promptGuidance: string;
}

export const STUDIO_AI_COMIC_DIRECTOR_INTENTS: readonly StudioAiComicDirectorIntent[] = [
  {
    id: "faithful",
    label: "기준 충실형",
    description: "작품 바이블과 기존 콘티를 가장 엄격하게 유지합니다.",
    promptGuidance:
      "작품 바이블, 캐릭터 정체성, 의상, 장소 구조와 현재 컷 구도를 가장 우선하여 유지합니다.",
  },
  {
    id: "expressive",
    label: "감정 표현형",
    description: "표정·몸짓과 장면의 감정 전달을 더 강조합니다.",
    promptGuidance:
      "캐릭터 정체성과 의상을 유지하면서 표정, 몸짓과 감정의 가독성을 더 분명하게 표현합니다.",
  },
  {
    id: "cinematic",
    label: "시네마틱형",
    description: "카메라, 광원과 전경을 활용해 장면 깊이를 높입니다.",
    promptGuidance:
      "이야기 비트와 캐릭터 기준을 유지하면서 카메라 깊이, 전경, 광원과 실루엣을 활용합니다.",
  },
  {
    id: "alternate-composition",
    label: "대안 구도형",
    description: "내용은 유지하고 다른 framing과 시선 흐름을 탐색합니다.",
    promptGuidance:
      "같은 이야기 비트, 인물, 의상과 장소를 유지하되 다른 framing과 시선 흐름의 대안 구도를 사용합니다.",
  },
] as const;

const INTENT_MARKER_PATTERN = /^\[AI 코믹 디렉터 제작 방향: ([^\]]+)\]\n([^\n]*)\n?/u;

export function studioAiComicDirectorProfile(
  id: StudioAiComicDirectorProfileId,
): StudioAiComicDirectorProfile {
  return (
    STUDIO_AI_COMIC_DIRECTOR_PROFILES.find((profile) => profile.id === id) ??
    STUDIO_AI_COMIC_DIRECTOR_PROFILES[1]
  );
}

export function studioAiComicDirectorIntent(
  id: StudioAiComicDirectorIntentId,
): StudioAiComicDirectorIntent {
  return (
    STUDIO_AI_COMIC_DIRECTOR_INTENTS.find((intent) => intent.id === id) ??
    STUDIO_AI_COMIC_DIRECTOR_INTENTS[0]
  );
}

export function studioAiComicDirectorPromptIntent(
  prompt: string,
): StudioAiComicDirectorIntentId | null {
  const match = prompt.match(INTENT_MARKER_PATTERN);
  if (!match) return null;
  const label = match[1]?.trim();
  return (
    STUDIO_AI_COMIC_DIRECTOR_INTENTS.find((intent) => intent.label === label)?.id ??
    null
  );
}

export function applyStudioAiComicDirectorPromptIntent(
  prompt: string,
  intentId: StudioAiComicDirectorIntentId,
): string {
  const intent = studioAiComicDirectorIntent(intentId);
  const body = prompt.replace(INTENT_MARKER_PATTERN, "").trim();
  return [
    `[AI 코믹 디렉터 제작 방향: ${intent.label}]`,
    intent.promptGuidance,
    body,
  ]
    .filter(Boolean)
    .join("\n");
}

export function inferStudioAiComicDirectorStage(
  items: readonly ScenarioPreviewItem[] | null | undefined,
): StudioAiComicDirectorStageId {
  if (!items || items.length === 0) return "brief";
  if (
    items.some(
      (item) =>
        Boolean(item.imageDataUrl) ||
        scenarioImageCandidates(item).length > 0 ||
        Boolean(item.imageError),
    )
  ) {
    return "production";
  }
  return "direction";
}

export function normalizeStudioAiComicDirectorSelection(
  indexes: readonly number[],
  itemCount: number,
): number[] {
  return [...new Set(indexes)]
    .filter(
      (index) => Number.isInteger(index) && index >= 0 && index < itemCount,
    )
    .sort((left, right) => left - right);
}

export function defaultStudioAiComicDirectorSelection(
  items: readonly ScenarioPreviewItem[],
): number[] {
  const missing = items.flatMap((item, index) =>
    item.imageDataUrl ? [] : [index],
  );
  return missing.length > 0 ? missing : items.map((_, index) => index);
}

export type StudioAiComicDirectorFindingSeverity =
  | "block"
  | "review"
  | "suggestion";

export interface StudioAiComicDirectorFinding {
  readonly id: string;
  readonly severity: StudioAiComicDirectorFindingSeverity;
  readonly title: string;
  readonly description: string;
  readonly panelIndex?: number;
}

export interface StudioAiComicDirectorQualityInput {
  readonly items: readonly ScenarioPreviewItem[];
  readonly referenceSignature: string;
  readonly referencesLoading: boolean;
  readonly missingReferenceCount: number;
  readonly referenceCount: number;
  readonly referenceLimit: number;
}

function dialogueLength(dialogue: string): number {
  return dialogue.replace(/\s+/gu, " ").trim().length;
}

export function analyzeStudioAiComicDirectorQuality({
  items,
  referenceSignature,
  referencesLoading,
  missingReferenceCount,
  referenceCount,
  referenceLimit,
}: StudioAiComicDirectorQualityInput): StudioAiComicDirectorFinding[] {
  const findings: StudioAiComicDirectorFinding[] = [];

  if (referencesLoading && referenceCount > 0) {
    findings.push({
      id: "references-loading",
      severity: "block",
      title: "참조 에셋을 확인하는 중입니다.",
      description: "작품 기준을 모두 불러온 뒤 이미지를 제작할 수 있습니다.",
    });
  }
  if (missingReferenceCount > 0) {
    findings.push({
      id: "references-missing",
      severity: "block",
      title: `참조 에셋 ${missingReferenceCount}개를 찾을 수 없습니다.`,
      description: "삭제된 참조를 제거하거나 프로젝트 에셋을 다시 연결하세요.",
    });
  }
  if (referenceCount > referenceLimit) {
    findings.push({
      id: "references-limit",
      severity: "block",
      title: `참조 에셋이 허용 수 ${referenceLimit}개를 넘었습니다.`,
      description: "장면에 꼭 필요한 캐릭터·장소·화풍 기준만 남겨 주세요.",
    });
  }

  items.forEach((item, panelIndex) => {
    const panelLabel = `컷 ${panelIndex + 1}`;
    if (!item.summary.trim()) {
      findings.push({
        id: `panel-${panelIndex}-summary`,
        severity: "block",
        title: `${panelLabel}의 장면 요약이 비어 있습니다.`,
        description: "이 컷에서 독자가 이해해야 하는 변화를 한 문장으로 적어 주세요.",
        panelIndex,
      });
    }
    if (!item.imagePrompt.trim()) {
      findings.push({
        id: `panel-${panelIndex}-prompt`,
        severity: "block",
        title: `${panelLabel}의 그림 지시가 비어 있습니다.`,
        description: "인물, 행동, 장소와 카메라를 포함한 그림 지시가 필요합니다.",
        panelIndex,
      });
    }
    if (dialogueLength(item.dialogue) > 260) {
      findings.push({
        id: `panel-${panelIndex}-dialogue-density`,
        severity: "review",
        title: `${panelLabel}의 대사가 한 컷에 많습니다.`,
        description: "말풍선이 장면을 가릴 수 있어 대사를 나누거나 컷을 추가하는 편이 좋습니다.",
        panelIndex,
      });
    }
    if (item.imageError) {
      findings.push({
        id: `panel-${panelIndex}-image-error`,
        severity: "review",
        title: `${panelLabel} 이미지 제작에 실패했습니다.`,
        description: "성공한 다른 컷은 유지됩니다. 이 컷만 다시 제작할 수 있습니다.",
        panelIndex,
      });
    }

    const candidates = scenarioImageCandidates(item);
    const selectedCandidateId =
      item.selectedImageCandidateId ??
      candidates.find((candidate) => candidate.imageDataUrl === item.imageDataUrl)?.id;
    const selectedCandidate = candidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    );
    if (
      selectedCandidate &&
      isScenarioImageCandidateStale(
        selectedCandidate,
        item,
        referenceSignature,
      )
    ) {
      findings.push({
        id: `panel-${panelIndex}-candidate-stale`,
        severity: "review",
        title: `${panelLabel}의 선택 후보는 현재 작품 기준과 다릅니다.`,
        description: "그대로 사용할지, 현재 프롬프트와 참조로 다시 제작할지 확인하세요.",
        panelIndex,
      });
    }
  });

  const beatCounts = new Map<string, number>();
  for (const item of items) {
    beatCounts.set(item.beatType, (beatCounts.get(item.beatType) ?? 0) + 1);
  }
  const repeatedBeat = [...beatCounts.entries()].find(([, count]) => count >= 4);
  if (repeatedBeat) {
    findings.push({
      id: `repeated-beat-${repeatedBeat[0]}`,
      severity: "suggestion",
      title: "비슷한 연출 역할이 연속해서 반복됩니다.",
      description: "반응·여백·강조 컷을 섞으면 회차 리듬을 더 분명하게 만들 수 있습니다.",
    });
  }

  return findings;
}

export interface StudioAiComicDirectorApplySummary {
  readonly frames: number;
  readonly images: number;
  readonly dialogueLines: number;
  readonly bubbles: number;
  readonly failedImages: number;
}

export function studioAiComicDirectorApplySummary(
  items: readonly ScenarioPreviewItem[],
): StudioAiComicDirectorApplySummary {
  const dialogueLines = items.reduce(
    (total, item) =>
      total +
      item.dialogue
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean).length,
    0,
  );
  return {
    frames: items.length,
    images: items.filter((item) => Boolean(item.imageDataUrl)).length,
    dialogueLines,
    bubbles: items.reduce((total, item) => total + item.bubbles.length, 0),
    failedImages: items.filter((item) => Boolean(item.imageError)).length,
  };
}

export interface StudioAiComicDirectorPreferences {
  readonly stage: StudioAiComicDirectorStageId;
  readonly view: StudioAiComicDirectorViewId;
  readonly profile: StudioAiComicDirectorProfileId;
  readonly selectedIndexes: readonly number[];
  readonly selectedPanelIndex: number;
  readonly intents: Readonly<Record<string, StudioAiComicDirectorIntentId>>;
}

export function defaultStudioAiComicDirectorPreferences(
  items: readonly ScenarioPreviewItem[] | null | undefined,
): StudioAiComicDirectorPreferences {
  const safeItems = items ?? [];
  return {
    stage: inferStudioAiComicDirectorStage(safeItems),
    view: "board",
    profile: "production",
    selectedIndexes: defaultStudioAiComicDirectorSelection(safeItems),
    selectedPanelIndex: 0,
    intents: {},
  };
}

function isStage(value: unknown): value is StudioAiComicDirectorStageId {
  return (
    typeof value === "string" &&
    (STUDIO_AI_COMIC_DIRECTOR_STAGE_IDS as readonly string[]).includes(value)
  );
}

function isView(value: unknown): value is StudioAiComicDirectorViewId {
  return (
    typeof value === "string" &&
    (STUDIO_AI_COMIC_DIRECTOR_VIEW_IDS as readonly string[]).includes(value)
  );
}

function isProfile(value: unknown): value is StudioAiComicDirectorProfileId {
  return (
    typeof value === "string" &&
    (STUDIO_AI_COMIC_DIRECTOR_PROFILE_IDS as readonly string[]).includes(value)
  );
}

function isIntent(value: unknown): value is StudioAiComicDirectorIntentId {
  return (
    typeof value === "string" &&
    (STUDIO_AI_COMIC_DIRECTOR_INTENT_IDS as readonly string[]).includes(value)
  );
}

export function parseStudioAiComicDirectorPreferences(
  raw: string | null,
  items: readonly ScenarioPreviewItem[] | null | undefined,
): StudioAiComicDirectorPreferences {
  const fallback = defaultStudioAiComicDirectorPreferences(items);
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<StudioAiComicDirectorPreferences>;
    const itemCount = items?.length ?? 0;
    const selectedPanelIndex =
      Number.isInteger(value.selectedPanelIndex) &&
      Number(value.selectedPanelIndex) >= 0 &&
      Number(value.selectedPanelIndex) < Math.max(1, itemCount)
        ? Number(value.selectedPanelIndex)
        : 0;
    const intents = Object.fromEntries(
      Object.entries(value.intents ?? {}).filter(([, intent]) => isIntent(intent)),
    ) as Record<string, StudioAiComicDirectorIntentId>;
    return {
      stage: isStage(value.stage) ? value.stage : fallback.stage,
      view: isView(value.view) ? value.view : fallback.view,
      profile: isProfile(value.profile) ? value.profile : fallback.profile,
      selectedIndexes: normalizeStudioAiComicDirectorSelection(
        Array.isArray(value.selectedIndexes) ? value.selectedIndexes : [],
        itemCount,
      ),
      selectedPanelIndex,
      intents,
    };
  } catch {
    return fallback;
  }
}
