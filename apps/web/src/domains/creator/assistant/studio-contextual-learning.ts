import type { LearningResource, ProductionStep } from "../../learn/learning-resources";
import type { WebtoonProductionStage } from "./webtoon-focus-timer";

export type StudioAssistantLearningTool =
  | "spec-slicer"
  | "scroll-pacing"
  | "sfx-lexicon"
  | "color-harmony"
  | "focus-timer"
  | "croquis-pose";

export interface StudioLearningFocus {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
  readonly primarySteps: readonly ProductionStep[];
  readonly secondarySteps: readonly ProductionStep[];
}

const PRODUCTION_STAGE_STEPS: Readonly<Record<WebtoonProductionStage, StudioLearningFocus>> = {
  storyboard: {
    id: "storyboard",
    label: "콘티 · 연출",
    reason: "현재 포커스 공정이 콘티이므로 컷 분할과 시선 흐름 자료를 우선합니다.",
    primarySteps: ["storyboard"],
    secondarySteps: ["story"],
  },
  draft: {
    id: "draft",
    label: "러프 · 캐릭터",
    reason: "러프 공정에서는 포즈와 실루엣을 먼저 정리하는 자료가 효율적입니다.",
    primarySteps: ["drawing", "character"],
    secondarySteps: ["storyboard"],
  },
  lineart: {
    id: "lineart",
    label: "선화",
    reason: "선화 공정에 맞춰 드로잉과 수정 가능한 제작 워크플로 자료를 추천합니다.",
    primarySteps: ["drawing"],
    secondarySteps: ["workflow"],
  },
  "flat-color": {
    id: "flat-color",
    label: "채색",
    reason: "밑색·채색 공정에 맞춰 색과 레이어 워크플로 자료를 우선합니다.",
    primarySteps: ["color"],
    secondarySteps: ["workflow", "drawing"],
  },
  "background-3d": {
    id: "background-3d",
    label: "배경 · 3D",
    reason: "배경 공정에 맞춰 투시, 공간 설계와 3D 실습 자료를 우선합니다.",
    primarySteps: ["background", "3d"],
    secondarySteps: ["drawing"],
  },
  "finishing-sfx": {
    id: "finishing-sfx",
    label: "식자 · 후가공",
    reason: "마무리 공정에 맞춰 말풍선, 효과음과 게시 전 검수 자료를 추천합니다.",
    primarySteps: ["lettering", "publish"],
    secondarySteps: ["workflow"],
  },
};

const TOOL_FOCUS: Readonly<Record<Exclude<StudioAssistantLearningTool, "focus-timer">, StudioLearningFocus>> = {
  "spec-slicer": {
    id: "publish",
    label: "게시 규격 · 검수",
    reason: "플랫폼 규격 도구를 사용 중이라 게시와 납품 체크 자료를 우선합니다.",
    primarySteps: ["publish"],
    secondarySteps: ["workflow", "lettering"],
  },
  "scroll-pacing": {
    id: "scroll-pacing",
    label: "스크롤 · 콘티 연출",
    reason: "스크롤 페이싱을 다듬는 중이라 컷 호흡과 콘티 자료를 우선합니다.",
    primarySteps: ["storyboard"],
    secondarySteps: ["story", "lettering"],
  },
  "sfx-lexicon": {
    id: "lettering",
    label: "효과음 · 식자",
    reason: "효과음을 다듬는 중이라 식자와 시선 흐름 자료를 우선합니다.",
    primarySteps: ["lettering"],
    secondarySteps: ["storyboard", "publish"],
  },
  "color-harmony": {
    id: "color",
    label: "색채 · 채색",
    reason: "컬러 조화를 조정 중이라 채색과 레이어 수정 자료를 우선합니다.",
    primarySteps: ["color"],
    secondarySteps: ["drawing", "workflow"],
  },
  "croquis-pose": {
    id: "pose",
    label: "인체 · 포즈 · 투시",
    reason: "크로키와 카메라 구도를 연습 중이라 캐릭터, 드로잉과 투시 자료를 우선합니다.",
    primarySteps: ["character", "drawing"],
    secondarySteps: ["background", "3d"],
  },
};

export function resolveStudioLearningFocus(
  tool: StudioAssistantLearningTool,
  focusStage: WebtoonProductionStage,
): StudioLearningFocus {
  return tool === "focus-timer" ? PRODUCTION_STAGE_STEPS[focusStage] : TOOL_FOCUS[tool];
}

function intersects(values: readonly ProductionStep[], candidates: readonly ProductionStep[]): boolean {
  return values.some((value) => candidates.includes(value));
}

function resourceScore(resource: LearningResource, focus: StudioLearningFocus): number {
  let score = 0;
  if (intersects(resource.steps, focus.primarySteps)) score += 8;
  if (intersects(resource.steps, focus.secondarySteps)) score += 3;
  if (resource.source === "toonstudio") score += 3;
  if (resource.practicePath) score += 2;
  if (resource.lessonId) score += 1;
  if (resource.verified) score += 1;
  if (resource.rights === "link-only") score += 0.25;
  return score;
}

export function recommendStudioLearningResources(
  resources: readonly LearningResource[],
  focus: StudioLearningFocus,
  limit = 4,
): LearningResource[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(8, Math.floor(limit))) : 4;
  const relevant = resources.filter(
    (resource) => resource.verified && intersects(resource.steps, [...focus.primarySteps, ...focus.secondarySteps]),
  );
  const candidates = relevant.length > 0 ? relevant : resources.filter((resource) => resource.verified);
  return [...candidates]
    .sort((left, right) => {
      const byScore = resourceScore(right, focus) - resourceScore(left, focus);
      if (byScore !== 0) return byScore;
      return left.title.localeCompare(right.title, "ko");
    })
    .slice(0, boundedLimit);
}
