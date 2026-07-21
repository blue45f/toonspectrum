/** Searchable metadata shared by the smart-filter catalog and Motion Coach hints. */
export type StudioFilterCatalogGroup =
  | "blur"
  | "tone"
  | "color"
  | "detail"
  | "transform"
  | "texture";

export type StudioFilterCatalogEntry = {
  engine: string;
  title: string;
  description: string;
  group: StudioFilterCatalogGroup;
  keywords: readonly string[];
};

export const STUDIO_FILTER_CATALOG: readonly StudioFilterCatalogEntry[] = [
  {
    engine: "gaussian-blur",
    title: "가우시안 블러",
    description: "픽셀을 고르게 퍼뜨려 배경·그림자를 부드럽게 흐립니다.",
    group: "blur",
    keywords: ["gaussian", "blur", "흐림", "소프트"],
  },
  {
    engine: "motion-blur",
    title: "모션 블러",
    description: "지정한 각도로 선형 잔상을 만들어 속도와 이동감을 냅니다.",
    group: "blur",
    keywords: ["motion", "blur", "속도", "잔상", "방향"],
  },
  {
    engine: "blur",
    title: "빠른 블러",
    description: "가벼운 박스 블러로 빠르게 흐림을 더합니다.",
    group: "blur",
    keywords: ["box", "blur", "흐림", "빠른"],
  },
  {
    engine: "curves",
    title: "색상 곡선",
    description: "톤 커브 프리셋으로 명암 응답과 대비를 정밀하게 잡습니다.",
    group: "tone",
    keywords: ["curve", "curves", "커브", "톤", "대비"],
  },
  {
    engine: "levels",
    title: "레벨",
    description: "입력·출력 검정점, 흰점과 감마로 명암 범위를 보정합니다.",
    group: "tone",
    keywords: ["levels", "black", "white", "gamma", "레벨", "감마"],
  },
  {
    engine: "brightness-contrast",
    title: "밝기 / 대비",
    description: "전체 밝기와 대비를 한 번에 조절합니다.",
    group: "tone",
    keywords: ["brightness", "contrast", "명도", "밝기", "대비"],
  },
  {
    engine: "exposure",
    title: "노출 / 감마 / 오프셋",
    description: "스톱 단위 노출, 중간톤 감마와 선형 오프셋을 함께 조정합니다.",
    group: "tone",
    keywords: ["exposure", "gamma", "offset", "노출", "감마", "오프셋", "ev"],
  },
  {
    engine: "hue-saturation",
    title: "색조 / 채도",
    description: "색상 회전과 채도를 조절합니다.",
    group: "color",
    keywords: ["hue", "saturation", "색조", "채도", "hsl"],
  },
  {
    engine: "color-balance",
    title: "색 균형",
    description: "그림자·중간톤·하이라이트의 색 기운을 프리셋으로 조절합니다.",
    group: "color",
    keywords: ["color balance", "색 균형", "컬러 밸런스", "shadow", "highlight"],
  },
  {
    engine: "channel-mixer",
    title: "채널 믹서",
    description: "RGB 채널 기여도를 교차 조절해 흑백 변환과 채널 룩을 만듭니다.",
    group: "color",
    keywords: ["channel mixer", "채널", "믹서", "rgb", "monochrome", "흑백"],
  },
  {
    engine: "gradient-map",
    title: "그라디언트 맵",
    description: "명암을 다색 그라디언트에 매핑해 통일된 스타일 색감을 만듭니다.",
    group: "color",
    keywords: ["gradient map", "그라디언트", "듀오톤", "색상화"],
  },
  {
    engine: "sharpen",
    title: "샤픈",
    description: "가벼운 고정 커널로 가장자리를 빠르게 선명하게 만듭니다.",
    group: "detail",
    keywords: ["sharpen", "샤픈", "선명", "디테일"],
  },
  {
    engine: "unsharp-mask",
    title: "언샤프 마스크",
    description: "양·반경·임계값을 조절해 노이즈를 억제하며 정교하게 선명도를 높입니다.",
    group: "detail",
    keywords: ["unsharp mask", "언샤프", "샤픈", "선명", "threshold", "radius"],
  },
  {
    engine: "morphology",
    title: "팽창 / 침식",
    description: "밝은 영역 또는 어두운 선을 확장해 선화 굵기와 마스크 경계를 다듬습니다.",
    group: "detail",
    keywords: ["dilate", "erode", "morphology", "팽창", "침식", "선화", "마스크"],
  },
  {
    engine: "custom-convolution",
    title: "사용자 컨볼루션",
    description: "안전하게 제한된 3×3 커널로 샤픈·엠보스·외곽선 등 사용자 효과를 만듭니다.",
    group: "detail",
    keywords: ["custom convolution", "kernel", "matrix", "컨볼루션", "커널", "행렬", "엠보스"],
  },
  {
    engine: "invert",
    title: "반전",
    description: "RGB 색상을 반전해 네거티브·마스크 확인 효과를 만듭니다.",
    group: "detail",
    keywords: ["invert", "negative", "반전", "네거티브"],
  },
  {
    engine: "offset",
    title: "픽셀 오프셋",
    description: "이미지를 x·y 방향으로 옮기고 투명·반복·가장자리 채우기를 선택합니다.",
    group: "transform",
    keywords: ["offset", "shift", "wrap", "오프셋", "이동", "반복"],
  },
  {
    engine: "noise",
    title: "노이즈",
    description: "필름 입자처럼 미세한 무작위 잡음을 더합니다.",
    group: "texture",
    keywords: ["noise", "grain", "노이즈", "그레인", "입자"],
  },
  {
    engine: "clouds",
    title: "구름 텍스처",
    description: "시드가 고정된 로컬 프랙탈 노이즈로 안개·구름·종이 얼룩을 합성합니다.",
    group: "texture",
    keywords: ["clouds", "fractal", "texture", "구름", "안개", "텍스처", "시드"],
  },
] as const;

export const STUDIO_FILTER_GROUP_ORDER: readonly StudioFilterCatalogGroup[] = [
  "blur",
  "tone",
  "color",
  "detail",
  "transform",
  "texture",
];

export function studioFilterCatalogEntry(engine: string): StudioFilterCatalogEntry | null {
  return STUDIO_FILTER_CATALOG.find((entry) => entry.engine === engine) ?? null;
}

export function studioFilterGroupLabel(group: StudioFilterCatalogGroup): string {
  switch (group) {
    case "blur":
      return "블러";
    case "tone":
      return "톤";
    case "color":
      return "색";
    case "detail":
      return "디테일";
    case "transform":
      return "변형";
    case "texture":
      return "텍스처";
  }
}

function normalizedSearchTerms(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase("ko-KR")
    .split(/\s+/)
    .filter(Boolean);
}

/** Local-only search; every term must match title, description, engine id, or an alias. */
export function searchStudioFilterCatalog(
  query: string,
  allowedEngineIds?: readonly string[],
): readonly StudioFilterCatalogEntry[] {
  const allowed = allowedEngineIds ? new Set(allowedEngineIds) : null;
  const terms = normalizedSearchTerms(query);
  return STUDIO_FILTER_CATALOG.filter((entry) => {
    if (allowed && !allowed.has(entry.engine)) return false;
    if (terms.length === 0) return true;
    const haystack = [
      entry.engine,
      entry.title,
      entry.description,
      studioFilterGroupLabel(entry.group),
      ...entry.keywords,
    ].join(" ").toLocaleLowerCase("ko-KR");
    return terms.every((term) => haystack.includes(term));
  });
}
