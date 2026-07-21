import type { StudioToolHintPreviewVariant } from "./studio-tool-hint-preview-kind";
import type { StudioToolHintSpec } from "./studio-tool-hints";

export type StudioColorPopoverPurpose = "brush-shape" | "bubble-fill" | "generic";

const PURPOSE_COPY: Readonly<
  Record<
    StudioColorPopoverPurpose,
    Readonly<{
      description: string;
      previewVariant: StudioToolHintPreviewVariant<"color-palette">;
      tip: string;
    }>
  >
> = {
  "brush-shape": {
    description:
      "현재 브러시 선과 새 도형에 사용할 주 색을 고릅니다. 최근 색과 장면별 팔레트도 한곳에서 이어서 선택할 수 있어요.",
    previewVariant: "brush-shape",
    tip: "캔버스에서 색을 바로 가져오려면 색상 창의 스포이드를 사용하세요.",
  },
  "bubble-fill": {
    description:
      "선택한 말풍선의 내부 색을 바꿉니다. 최근 색이나 장면별 팔레트로 여러 말풍선의 색감을 맞출 수 있어요.",
    previewVariant: "bubble-fill",
    tip: "같은 장면의 말풍선은 최근 색에서 다시 고르면 빠르게 통일할 수 있어요.",
  },
  generic: {
    description:
      "현재 항목에 적용할 색을 고릅니다. 직접 입력, 최근 색, 큐레이션 팔레트와 스포이드를 함께 사용할 수 있어요.",
    previewVariant: "palette-swatch",
    tip: "정확한 색상 값이 있다면 헥스 입력 칸에 #rrggbb 형식으로 붙여넣으세요.",
  },
};

export function studioColorPopoverTriggerHint(
  label: string,
  purpose: StudioColorPopoverPurpose
): StudioToolHintSpec {
  const copy = PURPOSE_COPY[purpose];
  return {
    id: `color-popover:${purpose}`,
    title: label,
    description: copy.description,
    preview: "color-palette",
    previewVariant: copy.previewVariant,
    tip: copy.tip,
  };
}

export const STUDIO_COLOR_EYEDROPPER_HINT: StudioToolHintSpec = {
  id: "color-popover:eyedropper",
  title: "화면에서 색 가져오기",
  description: "브라우저 화면에서 한 지점을 선택해 그 색을 현재 색으로 가져옵니다.",
  preview: "sample",
  tip: "브라우저가 화면 색상 선택을 지원할 때만 표시됩니다.",
};

export function studioPaletteFamilyHint(
  label: string,
  description: string
): StudioToolHintSpec {
  return {
    id: `color-popover:palette:${label}`,
    title: `${label} 팔레트`,
    description,
    preview: "color-palette",
    previewVariant: "palette-family",
    tip: "팔레트를 고른 뒤 아래 색상 칩을 선택하세요.",
  };
}
