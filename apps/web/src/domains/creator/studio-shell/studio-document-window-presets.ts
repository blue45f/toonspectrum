import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";

export interface StudioDocumentWindowPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly workspaces: readonly StudioDocumentWorkspaceId[];
}

export const STUDIO_DOCUMENT_WINDOW_PRESETS: readonly StudioDocumentWindowPreset[] = [
  {
    id: "webtoon-production",
    labelKo: "원고 제작",
    labelEn: "Webtoon production",
    descriptionKo: "드로잉·웹툰·검토를 나눠 원고와 피드백을 동시에 봅니다.",
    descriptionEn: "Separate drawing, webtoon layout and review while keeping one document.",
    workspaces: ["draw", "comic", "review"],
  },
  {
    id: "story-to-motion",
    labelKo: "콘티 → 영상",
    labelEn: "Story to motion",
    descriptionKo: "콘티·애니메이션·오디오를 타임라인별 창으로 엽니다.",
    descriptionEn: "Open storyboard, animation and audio as dedicated timeline views.",
    workspaces: ["storyboard", "animation", "audio"],
  },
  {
    id: "three-dimensional-reference",
    labelKo: "3D 참고 제작",
    labelEn: "3D reference production",
    descriptionKo: "3D 장면·드로잉·검토를 타일 창으로 배치합니다.",
    descriptionEn: "Tile 3D scene, drawing and review views across the screen.",
    workspaces: ["3d", "draw", "review"],
  },
  {
    id: "localization-quality",
    labelKo: "현지화 검수",
    labelEn: "Localization quality",
    descriptionKo: "현지화·웹툰·검토를 함께 열어 원문과 결과를 비교합니다.",
    descriptionEn: "Compare source, localized lettering and review side by side.",
    workspaces: ["localization", "comic", "review"],
  },
  {
    id: "design-pitch",
    labelKo: "디자인 피치",
    labelEn: "Design pitch",
    descriptionKo: "디자인·발표 자료·검토를 분리해 편집과 확인을 병행합니다.",
    descriptionEn: "Separate design, slides and review for parallel editing and checks.",
    workspaces: ["design", "slides", "review"],
  },
] as const;
const RECOMMENDED_COMPANIONS: Readonly<
  Record<StudioDocumentWorkspaceId, readonly StudioDocumentWorkspaceId[]>
> = Object.freeze({
  draw: ["3d", "comic", "review"],
  comic: ["storyboard", "review", "localization"],
  image: ["design", "draw", "review"],
  design: ["image", "slides", "review"],
  slides: ["design", "review", "image"],
  storyboard: ["comic", "animation", "whiteboard"],
  whiteboard: ["storyboard", "comic", "review"],
  "3d": ["draw", "storyboard", "review"],
  animation: ["storyboard", "audio", "motion"],
  motion: ["storyboard", "animation", "audio"],
  audio: ["animation", "motion", "storyboard"],
  localization: ["comic", "review", "design"],
  review: ["comic", "draw", "localization"],
});

export function studioRecommendedCompanionWorkspaces(
  workspace: StudioDocumentWorkspaceId,
): readonly StudioDocumentWorkspaceId[] {
  return RECOMMENDED_COMPANIONS[workspace];
}
