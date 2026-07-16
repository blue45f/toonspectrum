/** Filter catalog data used by the smart-filter manager and its lazy Motion Coach preview routing. */
export type StudioFilterCatalogEntry = {
  engine: string;
  title: string;
  description: string;
  group: "blur" | "tone" | "color" | "detail";
};

export const STUDIO_FILTER_CATALOG: readonly StudioFilterCatalogEntry[] = [
  {
    engine: "gaussian-blur",
    title: "가우시안 블러",
    description:
      "픽셀을 고르게 퍼뜨려 부드럽게 만듭니다. 배경을 흐리게 해 초점을 강조할 때 유용해요. (Magma Gaussian Blur)",
    group: "blur",
  },
  {
    engine: "motion-blur",
    title: "모션 블러",
    description:
      "지정한 각도로 선형 잔상을 만들어 속도·이동감을 냅니다. 거리와 각도를 조절하세요. (Magma Motion Blur)",
    group: "blur",
  },
  {
    engine: "blur",
    title: "빠른 블러",
    description: "가벼운 박스 블러입니다. 미리보기용 가벼운 흐림에 적합해요.",
    group: "blur",
  },
  {
    engine: "curves",
    title: "색상 곡선",
    description:
      "톤 커브로 밝기·대비·채널 응답을 정밀하게 잡습니다. 포토샵 Curves 계열입니다.",
    group: "tone",
  },
  {
    engine: "levels",
    title: "레벨",
    description: "검정·흰점과 감마로 노출과 대비를 빠르게 보정합니다.",
    group: "tone",
  },
  {
    engine: "brightness-contrast",
    title: "밝기/대비",
    description: "전체 밝기와 대비를 한 번에 조절합니다.",
    group: "tone",
  },
  {
    engine: "hue-saturation",
    title: "색조/채도",
    description: "색상 회전과 선명도(채도)를 바꿉니다.",
    group: "color",
  },
  {
    engine: "color-balance",
    title: "색 균형",
    description: "그림자와 하이라이트 쪽 색 기운을 조절합니다.",
    group: "color",
  },
  {
    engine: "channel-mixer",
    title: "채널 믹서",
    description:
      "RGB 채널의 기여도를 교차 조절해 정교한 색 보정과 흑백 변환을 만듭니다.",
    group: "color",
  },
  {
    engine: "gradient-map",
    title: "그라디언트 맵",
    description:
      "명암을 선택한 그라디언트 색상에 매핑해 통일된 분위기와 스타일 색감을 만듭니다.",
    group: "color",
  },
  {
    engine: "sharpen",
    title: "샤픈",
    description: "가장자리를 선명하게 해 초점을 또렷하게 만듭니다.",
    group: "detail",
  },
  {
    engine: "noise",
    title: "노이즈",
    description: "필름 입자처럼 미세한 잡음을 더합니다.",
    group: "detail",
  },
  {
    engine: "invert",
    title: "반전",
    description: "색상을 반전합니다. 마스크·특수 효과에 자주 씁니다.",
    group: "detail",
  },
] as const;

export function studioFilterCatalogEntry(engine: string): StudioFilterCatalogEntry | null {
  return STUDIO_FILTER_CATALOG.find((entry) => entry.engine === engine) ?? null;
}

export function studioFilterGroupLabel(group: StudioFilterCatalogEntry["group"]): string {
  switch (group) {
    case "blur":
      return "블러";
    case "tone":
      return "톤";
    case "color":
      return "색";
    case "detail":
      return "디테일";
  }
}
