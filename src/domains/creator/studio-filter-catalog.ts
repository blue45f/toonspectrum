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
    engine: "spin-blur",
    title: "회전 블러",
    description: "화면 중심을 축으로 원형 잔상을 만들어 회전·충격·현기증을 표현합니다.",
    group: "blur",
    keywords: ["spin", "radial", "blur", "회전", "방사형", "원형", "잔상"],
  },
  {
    engine: "zoom-blur",
    title: "줌 블러",
    description: "화면 중심에서 바깥으로 뻗는 방사 잔상으로 돌진과 집중 효과를 만듭니다.",
    group: "blur",
    keywords: ["zoom", "radial", "blur", "줌", "방사형", "돌진", "집중"],
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
    engine: "posterize",
    title: "포스터화",
    description: "채널 계조 수를 제한해 셀 채색과 그래픽 포스터 같은 색면을 만듭니다.",
    group: "tone",
    keywords: ["posterize", "poster", "포스터", "계조", "양자화", "셀 채색"],
  },
  {
    engine: "solarize",
    title: "솔라리제이션",
    description: "밝은 채널을 임계점부터 부분 반전해 초현실적인 필름 톤을 만듭니다.",
    group: "tone",
    keywords: ["solarize", "solarization", "솔라리제이션", "부분 반전", "필름"],
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
    engine: "grayscale",
    title: "그레이스케일",
    description: "색상 정보를 휘도로 변환해 중립적인 흑백 명암으로 정리합니다.",
    group: "color",
    keywords: ["grayscale", "monochrome", "gray", "그레이", "흑백", "무채색"],
  },
  {
    engine: "sepia",
    title: "세피아",
    description: "갈색 계열의 고전 사진 색감으로 회상과 과거 장면을 연출합니다.",
    group: "color",
    keywords: ["sepia", "세피아", "빈티지", "고전", "회상", "갈색"],
  },
  {
    engine: "chromatic-aberration",
    title: "색수차",
    description: "빨강과 파랑 채널을 반대 방향으로 어긋나게 해 렌즈 왜곡과 속도감을 냅니다.",
    group: "color",
    keywords: ["chromatic aberration", "rgb split", "색수차", "색 왜곡", "채널 분리"],
  },
  {
    engine: "sharpen",
    title: "샤픈",
    description: "가벼운 고정 커널로 가장자리를 빠르게 선명하게 만듭니다.",
    group: "detail",
    keywords: ["sharpen", "샤픈", "선명", "디테일"],
  },
  {
    engine: "smart-sharpen",
    title: "스마트 샤픈",
    description: "평탄한 노이즈는 억제하고 의미 있는 경계의 고주파 디테일만 강화합니다.",
    group: "detail",
    keywords: ["smart sharpen", "adaptive", "스마트 샤픈", "엣지", "노이즈 억제"],
  },
  {
    engine: "median-despeckle",
    title: "미디언 잡티 제거",
    description: "주변 픽셀의 중앙값으로 소금·후추 잡티를 줄이면서 경계는 보존합니다.",
    group: "detail",
    keywords: ["median", "despeckle", "dust", "미디언", "잡티", "노이즈 제거"],
  },
  {
    engine: "high-pass",
    title: "하이패스",
    description: "제한된 3×3 고역 통과 커널로 윤곽과 미세 질감만 중성 회색 위에 분리합니다.",
    group: "detail",
    keywords: ["high pass", "high-pass", "frequency", "하이패스", "고주파", "질감"],
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
    engine: "ink-threshold",
    title: "먹선 임계값",
    description: "휘도 임계값을 기준으로 순흑과 순백을 나눠 스캔 선화를 정리합니다.",
    group: "detail",
    keywords: ["threshold", "binarize", "ink", "임계값", "이진화", "먹선", "선화"],
  },
  {
    engine: "line-extraction",
    title: "선화 추출",
    description: "Sobel 기울기와 고정 임계값으로 명확한 흑백 윤곽선을 추출합니다.",
    group: "detail",
    keywords: ["line extraction", "sobel", "lineart", "선화 추출", "윤곽", "외곽선"],
  },
  {
    engine: "edge-detect",
    title: "외곽선 검출",
    description: "Sobel 경사 강도를 연속 톤으로 계산해 조절 가능한 윤곽 효과를 만듭니다.",
    group: "detail",
    keywords: ["edge detect", "sobel", "find edges", "외곽선", "엣지", "윤곽 검출"],
  },
  {
    engine: "emboss",
    title: "엠보스",
    description: "방향성 이웃 차이를 중성 회색에 합성해 종이에 눌러 찍은 양각을 표현합니다.",
    group: "detail",
    keywords: ["emboss", "relief", "엠보스", "양각", "음각", "릴리프"],
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
    engine: "pixelate",
    title: "모자이크 / 픽셀화",
    description: "픽셀 블록 크기를 키워 검열 모자이크와 레트로 도트 표현을 만듭니다.",
    group: "transform",
    keywords: ["pixelate", "mosaic", "pixel", "픽셀화", "모자이크", "도트"],
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
  {
    engine: "screentone",
    title: "흑백 스크린톤",
    description: "블록별 평균 휘도를 검정 망점 크기로 바꿔 흑백 만화 톤을 만듭니다.",
    group: "texture",
    keywords: ["screentone", "manga tone", "스크린톤", "망점", "흑백 만화"],
  },
  {
    engine: "color-halftone",
    title: "컬러 하프톤",
    description: "CMYK 채널별 회전 망점을 합성해 코믹 인쇄와 신문 질감을 만듭니다.",
    group: "texture",
    keywords: ["color halftone", "cmyk", "dot screen", "컬러 하프톤", "망점", "인쇄"],
  },
  {
    engine: "oil-paint",
    title: "유화",
    description: "국소 휘도 군집의 대표색으로 면을 평탄화해 두꺼운 물감 질감을 만듭니다.",
    group: "texture",
    keywords: ["oil paint", "painterly", "kuwahara", "유화", "회화", "물감"],
  },
  {
    engine: "surface-blur",
    title: "표면 보존 블러",
    description: "미디언 기반의 제한된 이웃 샘플로 작은 잡티를 줄이면서 강한 경계는 보존합니다.",
    group: "blur",
    keywords: ["surface blur", "edge preserving", "표면", "경계 보존", "피부", "잡티"],
  },
  {
    engine: "crystal-mosaic",
    title: "크리스털 모자이크",
    description: "색상 셀을 양자화하고 국소 회화 처리를 더해 결정 조각 같은 색면을 만듭니다.",
    group: "transform",
    keywords: ["crystallize", "crystal", "mosaic", "크리스털", "결정", "모자이크", "색면"],
  },
  {
    engine: "pencil-sketch",
    title: "연필 스케치",
    description: "국소 기울기에서 종이 여백과 어두운 연필선을 추출해 드로잉 초안을 만듭니다.",
    group: "detail",
    keywords: ["pencil", "sketch", "photocopy", "연필", "스케치", "밑그림"],
  },
  {
    engine: "crosshatch",
    title: "교차 해칭",
    description: "명암에 따라 두 방향의 결정적 해칭 선을 겹쳐 펜화 질감을 만듭니다.",
    group: "detail",
    keywords: ["crosshatch", "hatching", "pen", "교차", "해칭", "펜화"],
  },
  {
    engine: "ordered-dither",
    title: "순서 디더",
    description: "고정 베이어 패턴으로 명암을 흑백 점에 배분해 재현 가능한 레트로 인쇄 톤을 만듭니다.",
    group: "texture",
    keywords: ["ordered dither", "bayer", "mezzotint", "디더", "베이어", "메조틴트", "도트"],
  },
  {
    engine: "glowing-edges",
    title: "빛나는 외곽선",
    description: "색상 경계를 검출한 다음 밝은 선만 제한 반경으로 번지게 해 네온 외곽선을 만듭니다.",
    group: "detail",
    keywords: ["glowing edges", "neon", "edge", "빛나는", "외곽선", "네온"],
  },
  {
    engine: "cutout",
    title: "종이 컷아웃",
    description: "색면을 부드럽게 단순화하고 계조 수를 줄여 겹친 색종이처럼 표현합니다.",
    group: "texture",
    keywords: ["cutout", "paper", "collage", "컷아웃", "색종이", "콜라주", "포스터"],
  },
  {
    engine: "retro-film",
    title: "레트로 필름",
    description: "세피아 톤, 고정 시드 필름 입자, 옅은 페이드와 색수차를 결합합니다.",
    group: "color",
    keywords: ["retro film", "vintage", "grain", "레트로", "빈티지", "필름", "그레인"],
  },
  {
    engine: "watercolor",
    title: "수채화",
    description: "안료 확산·가장자리 번짐·종이 섬유·과립을 결정적으로 합성합니다.",
    group: "texture",
    keywords: ["watercolor", "wash", "paper", "수채", "번짐", "안료", "종이"],
  },
  {
    engine: "diffuse-glow",
    title: "확산 글로우",
    description: "밝은 영역의 부드러운 빛 번짐과 미세한 고정 시드 입자를 결합해 몽환적인 톤을 만듭니다.",
    group: "blur",
    keywords: ["diffuse glow", "soft light", "dreamy", "확산", "글로우", "빛 번짐", "몽환"],
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
