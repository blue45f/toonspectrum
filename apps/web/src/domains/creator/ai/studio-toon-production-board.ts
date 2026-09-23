import {
  inspectStudioScenarioImageGeneration,
  scenarioCandidateReviewStatus,
  STUDIO_SCENARIO_IMAGE_QUALITY_PROFILES,
  STUDIO_SCENARIO_IMAGE_VARIATION_STRATEGIES,
  type StudioScenarioImageGenerationRequest,
} from "./studio-scenario-candidate-workflow";

import type { StudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";
import type { ScenarioPreviewItem } from "../studio-scenario-layout";

export const STUDIO_TOON_PRODUCTION_MAX_SCENES = 50;
export const STUDIO_TOON_PRODUCTION_MAX_EXTENSION_SCENES = 10;

export interface StudioToonProductionSceneSummary {
  readonly total: number;
  readonly generated: number;
  readonly approved: number;
  readonly failed: number;
}

export interface StudioToonProductionExtensionResult {
  readonly scenes: readonly ScenarioPreviewItem[];
  readonly added: number;
  readonly remainingCapacity: number;
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
function extensionPrompt(input: {
  readonly ordinal: number;
  readonly anchorSummary: string;
  readonly direction: string;
}): string {
  return [
    `[연결 장면 ${input.ordinal}]`,
    `직전 장면: ${input.anchorSummary || "이전 장면의 사건과 감정"}`,
    input.direction ? `새 전개 지시: ${input.direction}` : "직전 사건의 결과가 자연스럽게 이어지는 다음 행동을 보여줍니다.",
    "동일한 캐릭터 정체성, 의상, 소품, 장소 방향과 시간대 연속성을 유지합니다.",
    "한 컷에는 하나의 명확한 행동과 감정 변화를 두고 이미지 안에 글자나 말풍선을 그리지 않습니다.",
  ].join("\n");
}

export function summarizeStudioToonProductionScenes(
  scenes: readonly ScenarioPreviewItem[],
  referenceSignature = "",
): StudioToonProductionSceneSummary {
  const statuses = scenes.map((scene) =>
    scenarioCandidateReviewStatus(scene, referenceSignature),
  );
  return {
    total: scenes.length,
    generated: scenes.filter((scene) =>
      Boolean(scene.imageDataUrl) || (scene.imageCandidates?.length ?? 0) > 0,
    ).length,
    approved: statuses.filter((status) => status === "approved").length,
    failed: statuses.filter((status) => status === "failed").length,
  };
}
export function extendStudioToonProductionScenes(input: {
  readonly scenes: readonly ScenarioPreviewItem[];
  readonly count: number;
  readonly direction?: string;
}): StudioToonProductionExtensionResult {
  const current = input.scenes.slice(0, STUDIO_TOON_PRODUCTION_MAX_SCENES);
  const remainingCapacity = Math.max(0, STUDIO_TOON_PRODUCTION_MAX_SCENES - current.length);
  const requested = boundedInteger(
    input.count,
    0,
    STUDIO_TOON_PRODUCTION_MAX_EXTENSION_SCENES,
  );
  const added = Math.min(requested, remainingCapacity);
  const direction = input.direction?.normalize("NFKC").trim().slice(0, 1_000) ?? "";
  const scenes = [...current];

  for (let index = 0; index < added; index += 1) {
    const anchor = scenes.at(-1);
    if (!anchor) break;
    const ordinal = scenes.length + 1;
    const frame = {
      ...anchor.frame,
      y: anchor.frame.y + anchor.frame.height + 24,
    };
    scenes.push({
      frame,
      bubbles: [],
      beatType: index === added - 1 ? "turn" : "escalation",
      summary: direction ? `연결 장면 ${ordinal} · ${direction}` : `연결 장면 ${ordinal}`,
      imagePrompt: extensionPrompt({ ordinal, anchorSummary: anchor.summary, direction }),
      dialogue: "",
      ...(anchor.continuity ? { continuity: { ...anchor.continuity } } : {}),
      aspect: anchor.aspect,
      ...(anchor.preferredVariantCount
        ? { preferredVariantCount: anchor.preferredVariantCount }
        : {}),
      ...(anchor.preferredQualityProfile
        ? { preferredQualityProfile: anchor.preferredQualityProfile }
        : {}),
      ...(anchor.preferredVariationStrategy
        ? { preferredVariationStrategy: anchor.preferredVariationStrategy }
        : {}),
    });
  }
  return {
    scenes,
    added: scenes.length - current.length,
    remainingCapacity: Math.max(0, STUDIO_TOON_PRODUCTION_MAX_SCENES - scenes.length),
  };
}

function productionModeLabel(
  request: StudioScenarioImageGenerationRequest,
  scenes: readonly ScenarioPreviewItem[],
): string {
  const preflight = inspectStudioScenarioImageGeneration(scenes, request);
  const quality = STUDIO_SCENARIO_IMAGE_QUALITY_PROFILES.find(
    (option) => option.id === preflight.qualityProfile,
  )?.label ?? preflight.qualityProfile;
  const variation = STUDIO_SCENARIO_IMAGE_VARIATION_STRATEGIES.find(
    (option) => option.id === preflight.variationStrategy,
  )?.label ?? preflight.variationStrategy;
  return `${quality} · ${variation} · 컷당 ${preflight.variants}개`;
}

export function createStudioToonProductionHandoff(input: {
  readonly title: string;
  readonly storyText: string;
  readonly characterDescription: string;
  readonly scenes: readonly ScenarioPreviewItem[];
  readonly request?: StudioScenarioImageGenerationRequest;
}): StudioAiComicComposerHandoff {
  const allIndexes = input.scenes.map((_, index) => index);
  const requestedIndexes = input.request?.indexes
    ? [...input.request.indexes]
    : allIndexes;
  const request = {
    variants: input.request?.variants ?? 2,
    ...input.request,
    indexes: requestedIndexes,
  };
  const preflight = inspectStudioScenarioImageGeneration(input.scenes, request);
  const selectedIndexes = input.request ? preflight.indexes : allIndexes;
  const scenes = selectedIndexes.map((index) => ({ index, scene: input.scenes[index]! }));
  const totalCuts = scenes.length;

  return {
    version: 1,
    source: "episode-production-director",
    episodeTitle: input.title,
    storyText: input.storyText,
    characterDescription: input.characterDescription,
    variants: preflight.variants,
    qualityProfile: preflight.qualityProfile,
    variationStrategy: preflight.variationStrategy,
    modeLabel: productionModeLabel(request, input.scenes),
    totalCuts,
    projectedOutputCount: totalCuts * preflight.variants,
    generationWorkUnits: totalCuts * preflight.variants,
    scenes: scenes.map(({ index, scene }) => ({
      sourceSceneNumber: index + 1,
      sourceCutNumber: index + 1,
      beatType: scene.beatType,
      summary: scene.summary,
      imagePrompt: scene.imagePrompt,
      dialogue: scene.dialogue,
      continuity: scene.continuity,
    })),
  };
}