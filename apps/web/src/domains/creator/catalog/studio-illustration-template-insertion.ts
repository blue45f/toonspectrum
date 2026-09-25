import { getStudioIllustrationTemplateBackground, STUDIO_ILLUSTRATION_SCENE_TEMPLATES } from "./studio-illustration-scene-templates";
import { summarizeStudioSceneTemplate } from "./studio-scene-template-summary";
import { elBounds } from "../studio-element-geometry";
import { STUDIO_PROJECT_MAX_CANVAS_HEIGHT } from "../studio-project-file";

import type { El } from "../studio-element-model";

export interface StudioIllustrationTemplateInsertion {
  readonly elements: El[];
  readonly addedElements: readonly El[];
  readonly canvasH: number;
  readonly originY: number;
  readonly firstElementId: string;
}

/** 기존 요소 아래에 새 컷 묶음을 추가해 사용자의 배경·대사를 덮어쓰지 않는다. */
export function planStudioIllustrationTemplateInsertion(
  templateId: string,
  currentElements: readonly El[],
  canvasH: number,
  createId: () => string,
  resolveBackgroundUrl: (src: string) => string = (src) => src,
): StudioIllustrationTemplateInsertion | null {
  const template = STUDIO_ILLUSTRATION_SCENE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  const background = getStudioIllustrationTemplateBackground(template.id);
  if (!background) throw new Error("장면 배경을 준비하지 못했습니다. 배경 목록을 확인해 주세요.");
  const summary = summarizeStudioSceneTemplate(template);
  const contentBottom = currentElements.reduce((bottom, element) => {
    const bounds = elBounds(element);
    return Number.isFinite(bounds.y + bounds.h) ? Math.max(bottom, bounds.y + bounds.h) : bottom;
  }, 0);
  const originY = currentElements.length > 0 ? Math.ceil(contentBottom + 40) : 24;
  const nextHeight = Math.max(canvasH, Math.ceil(originY + summary.height + 24));
  if (!Number.isFinite(nextHeight) || nextHeight > STUDIO_PROJECT_MAX_CANVAS_HEIGHT) {
    throw new Error("페이지 높이 한도에 도달했습니다. 새 페이지에 장면을 추가해 주세요.");
  }
  const addedElements = template.build(0, originY).map((seed): El => {
    if (seed.type === "frame") {
      return {
        ...seed,
        id: createId(),
        bg: resolveBackgroundUrl(background.src),
        aiProvenance: {
          action: "generated", provider: "openai", model: "unverified", transport: "server",
          promptVersion: 1, createdAt: "2026-09-26T00:00:00.000Z",
        },
      };
    }
    return { ...seed, id: createId() };
  });
  const first = addedElements[0];
  if (!first) throw new Error("장면 구성이 비어 있습니다.");
  return {
    elements: [...currentElements, ...addedElements],
    addedElements,
    canvasH: nextHeight,
    originY,
    firstElementId: first.id,
  };
}
