import type { StudioToolHintPreviewVariant } from "./studio-tool-hint-preview-kind";
import type { StudioToolHintSpec } from "./studio-tool-hints";

export type StudioColorPopoverPurpose =
  | "brush-shape"
  | "bubble-fill"
  | "stroke"
  | "fill"
  | "text"
  | "bubble-stroke"
  | "shadow"
  | "generic";

type PurposeCopy = Readonly<{
  description: string;
  previewVariant: StudioToolHintPreviewVariant<"color-palette">;
  tip: string;
}>;

const PURPOSE_COPY: Readonly<Record<StudioColorPopoverPurpose, PurposeCopy>> = {
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
  stroke: {
    description:
      "선택한 선화와 도형의 선 색을 바꿉니다. 최근 선색과 원고에서 사용 중인 색을 바로 다시 쓸 수 있어요.",
    previewVariant: "brush-shape",
    tip: "없음 버튼으로 선을 끄고 같은 자리에서 마지막 선색으로 되돌릴 수 있어요.",
  },
  fill: {
    description:
      "선택한 도형의 단색 채우기를 바꿉니다. 최근 색과 원고 색을 비교하며 빠르게 통일할 수 있어요.",
    previewVariant: "palette-swatch",
    tip: "그라데이션이나 패턴이 켜져 있어도 이 색은 단색 폴백으로 안전하게 유지됩니다.",
  },
  text: {
    description:
      "글자와 대사의 기본 색을 바꿉니다. 원고에서 이미 사용한 색과 대비를 확인하며 선택할 수 있어요.",
    previewVariant: "palette-swatch",
    tip: "말풍선과 배경 위에서 읽기 좋은 대비인지 현재 톤 배지를 함께 확인하세요.",
  },
  "bubble-stroke": {
    description:
      "말풍선 외곽선 색을 바꿉니다. 같은 장면의 선색을 재사용해 말풍선 스타일을 빠르게 맞출 수 있어요.",
    previewVariant: "bubble-fill",
    tip: "외곽선을 끄면 마지막 색과 두께는 기억되어 다시 켤 때 복원됩니다.",
  },
  shadow: {
    description:
      "그림자 색을 바꿉니다. 원고색과 명도 단계를 함께 보며 자연스러운 깊이를 만들 수 있어요.",
    previewVariant: "palette-swatch",
    tip: "그림자 불투명도는 색상과 별도로 조절하면 재사용하기 쉬운 팔레트를 유지할 수 있어요.",
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
  purpose: StudioColorPopoverPurpose,
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
  title: "화면 전체에서 색 가져오기",
  description: "브라우저 밖을 포함한 화면 한 지점을 선택해 그 색을 현재 색으로 가져옵니다.",
  preview: "sample",
  tip: "브라우저가 화면 색상 선택을 지원할 때만 표시됩니다.",
};

export const STUDIO_COLOR_CANVAS_EYEDROPPER_HINT: StudioToolHintSpec = {
  id: "color-popover:canvas-eyedropper",
  title: "캔버스에서 정밀 채집",
  description: "툰 캔버스의 표시색·현재 레이어·최상위 레이어에서 정밀하게 색을 가져옵니다.",
  preview: "sample",
  tip: "브라우저 지원과 관계없이 사용할 수 있으며 I 또는 펜 사용 중 Alt로도 전환할 수 있어요.",
};

const STUDIO_PALETTE_HINT_VARIANT_BY_ID = {
  "skin-natural": "palette-skin-natural",
  "hair-natural": "palette-hair-natural",
  "hair-vivid": "palette-hair-vivid",
  "sky-hours": "palette-sky-hours",
  "nature-green": "palette-nature-green",
  "pastel-mood": "palette-pastel-mood",
  "neon-cyber": "palette-neon-cyber",
  "vintage-sepia": "palette-vintage-sepia",
  "mono-ink": "palette-mono-ink",
  "romance-pink": "palette-romance-pink",
  "autumn-fall": "palette-autumn-fall",
  "dark-fantasy": "palette-dark-fantasy",
} as const satisfies Readonly<
  Record<string, StudioToolHintPreviewVariant<"color-palette">>
>;

export function studioPaletteFamilyHint(
  label: string,
  description: string,
  paletteId?: string,
): StudioToolHintSpec {
  const previewVariant = paletteId
    ? STUDIO_PALETTE_HINT_VARIANT_BY_ID[
        paletteId as keyof typeof STUDIO_PALETTE_HINT_VARIANT_BY_ID
      ]
    : undefined;
  return {
    id: `color-popover:palette:${label}`,
    title: `${label} 팔레트`,
    description,
    preview: "color-palette",
    previewVariant: previewVariant ?? "palette-family",
    tip: "팔레트를 고른 뒤 아래 색상 칩을 선택하세요.",
  };
}
