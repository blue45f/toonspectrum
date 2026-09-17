import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "./studio-mode-creation-plan";
import type { StudioModeCopy } from "./studio-mode-profile";
import {
  createStudioProjectDocument,
  studioProjectDocumentHref,
  type StudioProjectDocumentEventTarget,
  type StudioProjectDocumentStorage,
} from "./studio-project-document-store";
import type { StudioProjectKind } from "./studio-project-library-store";

export type StudioModeHandoffId =
  | "storyboard-to-webtoon"
  | "webtoon-to-animation"
  | "webtoon-to-design"
  | "illustration-to-design"
  | "three-d-to-webtoon"
  | "three-d-to-illustration"
  | "webtoon-to-slides";

export interface StudioModeHandoffDefinition {
  readonly id: StudioModeHandoffId;
  readonly source: StudioProjectKind;
  readonly target: StudioProjectKind;
  readonly transfer: "copy" | "reference" | "render" | "derive";
  readonly label: StudioModeCopy;
  readonly title: StudioModeCopy;
}

const definition = (
  id: StudioModeHandoffId,
  source: StudioProjectKind,
  target: StudioProjectKind,
  transfer: StudioModeHandoffDefinition["transfer"],
  labelKo: string,
  labelEn: string,
  titleKo: string,
  titleEn: string,
): StudioModeHandoffDefinition => Object.freeze({
  id,
  source,
  target,
  transfer,
  label: Object.freeze({ ko: labelKo, en: labelEn }),
  title: Object.freeze({ ko: titleKo, en: titleEn }),
});

export const STUDIO_MODE_HANDOFFS: readonly StudioModeHandoffDefinition[] = Object.freeze([
  definition("storyboard-to-webtoon", "storyboard", "webtoon", "derive", "웹툰 원고로 이어 만들기", "Continue as webtoon", "콘티에서 만든 웹툰 원고", "Webtoon from storyboard"),
  definition("webtoon-to-animation", "webtoon", "animation", "derive", "모션 웹툰 만들기", "Create motion comic", "모션 웹툰", "Motion comic"),
  definition("webtoon-to-design", "webtoon", "design", "derive", "표지·홍보물 만들기", "Create cover & promotion", "작품 표지", "Series cover"),
  definition("illustration-to-design", "illustration", "design", "derive", "홍보 디자인으로 보내기", "Send to promotion design", "일러스트 홍보 디자인", "Illustration promotion"),
  definition("three-d-to-webtoon", "three-d", "webtoon", "render", "웹툰 배경 레퍼런스로 보내기", "Send to webtoon reference", "3D 레퍼런스 웹툰 원고", "Webtoon with 3D reference"),
  definition("three-d-to-illustration", "three-d", "illustration", "render", "일러스트 레퍼런스로 보내기", "Send to illustration reference", "3D 레퍼런스 일러스트", "Illustration with 3D reference"),
  definition("webtoon-to-slides", "webtoon", "slides", "derive", "작품 피치덱 만들기", "Create series pitch deck", "작품 피칭", "Series pitch"),
]);

export function studioModeHandoffsFor(mode: StudioProjectKind): readonly StudioModeHandoffDefinition[] {
  return STUDIO_MODE_HANDOFFS.filter((handoff) => handoff.source === mode);
}

export function executeStudioModeHandoff(
  storage: StudioProjectDocumentStorage,
  projectId: string,
  handoff: StudioModeHandoffDefinition,
  locale: "ko" | "en",
  options: { readonly target?: StudioProjectDocumentEventTarget } = {},
): { readonly documentId: string; readonly href: string } {
  const plan = resolveStudioModeCreationPlan(handoff.target);
  const created = createStudioProjectDocument(storage, projectId, {
    title: handoff.title[locale],
    kind: plan.document.kind,
    defaultWorkspace: plan.document.workspace,
    width: plan.document.width,
    height: plan.document.height,
    pageCount: plan.document.pageCount,
  }, { target: options.target });
  const href = buildStudioModeLaunchHref(
    { href: studioProjectDocumentHref(created, plan.document.workspace) },
    plan,
  );
  return Object.freeze({ documentId: created.id, href });
}
