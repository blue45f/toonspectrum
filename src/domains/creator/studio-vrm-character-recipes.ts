export type StudioVrmAgeBand = "child" | "teen" | "young-adult" | "adult" | "senior";
export type StudioVrmPresentation = "feminine" | "masculine" | "androgynous";
export type StudioVrmOccupation =
  | "student"
  | "creator"
  | "office"
  | "doctor"
  | "nurse"
  | "paramedic";

export type StudioVrmCharacterRecipe = {
  id: string;
  label: string;
  description: string;
  emoji: string;
  modelId: string;
  ageBand: StudioVrmAgeBand;
  presentation: StudioVrmPresentation;
  occupation: StudioVrmOccupation;
  wardrobeSetId: string;
  poseId: string;
  bodyScale: { height: number; width: number };
  colors: {
    tops: string;
    bottoms: string;
    hair: string;
    body: string;
    face: string;
  };
  propIds: readonly string[];
  tags: readonly string[];
};

export type StudioVrmRecipeFilter = {
  query?: string;
  ageBand?: StudioVrmAgeBand | "all";
  presentation?: StudioVrmPresentation | "all";
  occupation?: StudioVrmOccupation | "all";
};

export const STUDIO_VRM_AGE_LABELS: Record<StudioVrmAgeBand, string> = {
  child: "어린이",
  teen: "청소년",
  "young-adult": "청년",
  adult: "성인",
  senior: "노년",
};

export const STUDIO_VRM_PRESENTATION_LABELS: Record<StudioVrmPresentation, string> = {
  feminine: "여성 표현",
  masculine: "남성 표현",
  androgynous: "중성 표현",
};

export const STUDIO_VRM_OCCUPATION_LABELS: Record<StudioVrmOccupation, string> = {
  student: "학생",
  creator: "크리에이터",
  office: "오피스",
  doctor: "의사",
  nurse: "간호사",
  paramedic: "응급구조사",
};

const colors = (
  skin: string,
  hair: string,
  tops: string,
  bottoms: string
): StudioVrmCharacterRecipe["colors"] => ({
  tops,
  bottoms,
  hair,
  body: skin,
  face: skin,
});

// 번들 VRM + 체형 + 실제 3D 워드로브 + 본 부착 소품을 한 번에 적용하는 시작 캐릭터.
// "성별"은 모델의 정체성을 단정하지 않고 시각적 표현(presentation) 필터로만 제공한다.
export const STUDIO_VRM_CHARACTER_RECIPES: readonly StudioVrmCharacterRecipe[] = [
  {
    id: "child-feminine-student",
    label: "어린이 학생 · 여성 표현",
    description: "낮은 키와 가벼운 교복 실루엣의 아동 캐릭터 시작점",
    emoji: "🧒",
    modelId: "avatar-c",
    ageBand: "child",
    presentation: "feminine",
    occupation: "student",
    wardrobeSetId: "school",
    poseId: "wave",
    bodyScale: { height: 0.78, width: 0.9 },
    colors: colors("#f4c7a5", "#49342b", "#f8fafc", "#24324a"),
    propIds: ["backpack"],
    tags: ["초등학생", "아동", "교복", "학교"],
  },
  {
    id: "child-masculine-student",
    label: "어린이 학생 · 남성 표현",
    description: "동글고 작은 체형의 활기찬 아동 캐릭터 시작점",
    emoji: "👦",
    modelId: "noa",
    ageBand: "child",
    presentation: "masculine",
    occupation: "student",
    wardrobeSetId: "school",
    poseId: "cheer",
    bodyScale: { height: 0.76, width: 0.94 },
    colors: colors("#8f5b42", "#211a18", "#f8fafc", "#23324f"),
    propIds: ["backpack"],
    tags: ["초등학생", "아동", "교복", "활기"],
  },
  {
    id: "teen-feminine-student",
    label: "청소년 학생 · 여성 표현",
    description: "학원물·로맨스 컷에 바로 쓰는 자연스러운 여학생 표현",
    emoji: "👧",
    modelId: "avatar-a",
    ageBand: "teen",
    presentation: "feminine",
    occupation: "student",
    wardrobeSetId: "school",
    poseId: "point",
    bodyScale: { height: 0.92, width: 0.94 },
    colors: colors("#efd1bb", "#5b3528", "#f8fafc", "#1e293b"),
    propIds: ["book"],
    tags: ["중학생", "고등학생", "학원물", "로맨스"],
  },
  {
    id: "teen-masculine-student",
    label: "청소년 학생 · 남성 표현",
    description: "학원물·스포츠 컷에 어울리는 슬림한 남학생 표현",
    emoji: "👦",
    modelId: "shion",
    ageBand: "teen",
    presentation: "masculine",
    occupation: "student",
    wardrobeSetId: "school",
    poseId: "run",
    bodyScale: { height: 0.96, width: 0.95 },
    colors: colors("#c88762", "#24212a", "#f8fafc", "#1e293b"),
    propIds: ["backpack"],
    tags: ["중학생", "고등학생", "학원물", "스포츠"],
  },
  {
    id: "young-feminine-creator",
    label: "청년 크리에이터 · 여성 표현",
    description: "일상·오피스·작가 캐릭터에 쓰는 캐주얼 청년 표현",
    emoji: "👩‍🎨",
    modelId: "mio",
    ageBand: "young-adult",
    presentation: "feminine",
    occupation: "creator",
    wardrobeSetId: "casual",
    poseId: "think",
    bodyScale: { height: 1, width: 0.96 },
    colors: colors("#6f4435", "#17151b", "#e5e7eb", "#3b5b85"),
    propIds: ["smartphone"],
    tags: ["작가", "디자이너", "현대", "일상"],
  },
  {
    id: "young-masculine-creator",
    label: "청년 크리에이터 · 남성 표현",
    description: "현대물·브이로그·작업실 컷의 캐주얼 청년 표현",
    emoji: "👨‍💻",
    modelId: "noa",
    ageBand: "young-adult",
    presentation: "masculine",
    occupation: "creator",
    wardrobeSetId: "casual",
    poseId: "point",
    bodyScale: { height: 1.04, width: 1.02 },
    colors: colors("#bc7c58", "#2a1d18", "#dbeafe", "#334155"),
    propIds: ["smartphone"],
    tags: ["작가", "개발자", "현대", "일상"],
  },
  {
    id: "young-androgynous-lead",
    label: "청년 주인공 · 중성 표현",
    description: "장르에 구애받지 않는 중성적 실루엣의 주인공 시작점",
    emoji: "🧑",
    modelId: "sample-vrm",
    ageBand: "young-adult",
    presentation: "androgynous",
    occupation: "creator",
    wardrobeSetId: "casual",
    poseId: "default",
    bodyScale: { height: 1, width: 0.96 },
    colors: colors("#d8a07c", "#4d3a34", "#d8e2dc", "#34495e"),
    propIds: [],
    tags: ["논바이너리", "중성", "주인공", "현대"],
  },
  {
    id: "adult-feminine-office",
    label: "성인 오피스 · 여성 표현",
    description: "전문직·회사 배경에 맞는 단정한 성인 캐릭터",
    emoji: "👩‍💼",
    modelId: "avatar-a",
    ageBand: "adult",
    presentation: "feminine",
    occupation: "office",
    wardrobeSetId: "office",
    poseId: "point",
    bodyScale: { height: 1.02, width: 0.98 },
    colors: colors("#9c6248", "#221a18", "#f8fafc", "#1f2937"),
    propIds: ["smartphone"],
    tags: ["직장인", "전문직", "회사", "현대"],
  },
  {
    id: "adult-masculine-office",
    label: "성인 오피스 · 남성 표현",
    description: "회사·법정·비즈니스 컷의 정돈된 성인 캐릭터",
    emoji: "👨‍💼",
    modelId: "noa",
    ageBand: "adult",
    presentation: "masculine",
    occupation: "office",
    wardrobeSetId: "office",
    poseId: "think",
    bodyScale: { height: 1.08, width: 1.05 },
    colors: colors("#5d382d", "#161416", "#e2e8f0", "#111827"),
    propIds: ["glasses"],
    tags: ["직장인", "전문직", "회사", "현대"],
  },
  {
    id: "doctor-feminine",
    label: "내과 의사 · 여성 표현",
    description: "흰 가운·청진기·차트를 갖춘 성인 여성 표현 의료진",
    emoji: "👩‍⚕️",
    modelId: "avatar-a",
    ageBand: "adult",
    presentation: "feminine",
    occupation: "doctor",
    wardrobeSetId: "doctor",
    poseId: "point",
    bodyScale: { height: 1.02, width: 0.98 },
    colors: colors("#dca982", "#3d2b25", "#f8fafc", "#164e63"),
    propIds: ["stethoscope", "clipboard", "idBadge"],
    tags: ["의사", "내과", "병원", "전문의"],
  },
  {
    id: "doctor-masculine",
    label: "외과 의사 · 남성 표현",
    description: "수술복·마스크·차트를 갖춘 성인 남성 표현 의료진",
    emoji: "👨‍⚕️",
    modelId: "noa",
    ageBand: "adult",
    presentation: "masculine",
    occupation: "doctor",
    wardrobeSetId: "surgeon",
    poseId: "think",
    bodyScale: { height: 1.07, width: 1.03 },
    colors: colors("#7d4d3c", "#201716", "#0f766e", "#115e59"),
    propIds: ["stethoscope", "surgicalCap", "faceMask"],
    tags: ["의사", "외과", "수술", "병원"],
  },
  {
    id: "doctor-androgynous",
    label: "응급의학 의사 · 중성 표현",
    description: "중성적 체형과 응급실 장비를 갖춘 젊은 의료진",
    emoji: "🧑‍⚕️",
    modelId: "sample-vrm",
    ageBand: "young-adult",
    presentation: "androgynous",
    occupation: "doctor",
    wardrobeSetId: "doctor",
    poseId: "run",
    bodyScale: { height: 1.01, width: 0.98 },
    colors: colors("#af704f", "#2c2422", "#f8fafc", "#155e75"),
    propIds: ["stethoscope", "medicalBag", "idBadge"],
    tags: ["의사", "응급의학", "논바이너리", "병원"],
  },
  {
    id: "nurse-feminine",
    label: "병동 간호사 · 여성 표현",
    description: "스크럽·명찰·차트를 갖춘 성인 여성 표현 간호사",
    emoji: "👩‍⚕️",
    modelId: "avatar-b",
    ageBand: "adult",
    presentation: "feminine",
    occupation: "nurse",
    wardrobeSetId: "nurse",
    poseId: "wave",
    bodyScale: { height: 1, width: 0.98 },
    colors: colors("#f0c6aa", "#4b2e29", "#dbeafe", "#1d4ed8"),
    propIds: ["clipboard", "idBadge"],
    tags: ["간호사", "병동", "병원", "의료진"],
  },
  {
    id: "nurse-masculine",
    label: "중환자실 간호사 · 남성 표현",
    description: "실용적인 스크럽과 의료 가방을 갖춘 성인 남성 표현 간호사",
    emoji: "👨‍⚕️",
    modelId: "shion",
    ageBand: "adult",
    presentation: "masculine",
    occupation: "nurse",
    wardrobeSetId: "nurse",
    poseId: "point",
    bodyScale: { height: 1.04, width: 1.03 },
    colors: colors("#4b2d25", "#171316", "#dbeafe", "#1e40af"),
    propIds: ["medicalBag", "idBadge"],
    tags: ["간호사", "중환자실", "병원", "의료진"],
  },
  {
    id: "paramedic-androgynous",
    label: "응급구조사 · 중성 표현",
    description: "활동적인 체형과 응급 가방을 갖춘 중성 표현 응급구조사",
    emoji: "🚑",
    modelId: "vivi",
    ageBand: "young-adult",
    presentation: "androgynous",
    occupation: "paramedic",
    wardrobeSetId: "paramedic",
    poseId: "run",
    bodyScale: { height: 1.03, width: 1.01 },
    colors: colors("#b87855", "#282025", "#f97316", "#1e293b"),
    propIds: ["medicalBag", "gloves", "idBadge"],
    tags: ["응급구조사", "구급대", "응급실", "중성"],
  },
  {
    id: "senior-masculine-doctor",
    label: "병원장 · 노년 남성 표현",
    description: "청진기와 안경을 갖춘 경력 많은 노년 남성 표현 의사",
    emoji: "👴",
    modelId: "old-moustache",
    ageBand: "senior",
    presentation: "masculine",
    occupation: "doctor",
    wardrobeSetId: "doctor",
    poseId: "think",
    bodyScale: { height: 0.96, width: 1.04 },
    colors: colors("#a96d50", "#d7d4cf", "#f8fafc", "#334155"),
    propIds: ["stethoscope", "glasses", "idBadge"],
    tags: ["노인", "할아버지", "원장", "의사"],
  },
  {
    id: "senior-feminine-doctor",
    label: "의대 교수 · 노년 여성 표현",
    description: "차트와 안경을 갖춘 경력 많은 노년 여성 표현 의사",
    emoji: "👵",
    modelId: "eugenia",
    ageBand: "senior",
    presentation: "feminine",
    occupation: "doctor",
    wardrobeSetId: "doctor",
    poseId: "point",
    bodyScale: { height: 0.94, width: 1.02 },
    colors: colors("#d9a27e", "#d8d2cb", "#f8fafc", "#334155"),
    propIds: ["clipboard", "glasses", "idBadge"],
    tags: ["노인", "할머니", "교수", "의사"],
  },
] as const;

export function studioVrmCharacterRecipeById(id: string): StudioVrmCharacterRecipe | undefined {
  return STUDIO_VRM_CHARACTER_RECIPES.find((recipe) => recipe.id === id);
}

export function filterStudioVrmCharacterRecipes(
  recipes: readonly StudioVrmCharacterRecipe[],
  filter: StudioVrmRecipeFilter
): StudioVrmCharacterRecipe[] {
  const query = filter.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const ageBand = filter.ageBand ?? "all";
  const presentation = filter.presentation ?? "all";
  const occupation = filter.occupation ?? "all";

  return recipes.filter((recipe) => {
    if (ageBand !== "all" && recipe.ageBand !== ageBand) return false;
    if (presentation !== "all" && recipe.presentation !== presentation) return false;
    if (occupation !== "all" && recipe.occupation !== occupation) return false;
    if (!query) return true;

    const haystack = [
      recipe.label,
      recipe.description,
      STUDIO_VRM_AGE_LABELS[recipe.ageBand],
      STUDIO_VRM_PRESENTATION_LABELS[recipe.presentation],
      STUDIO_VRM_OCCUPATION_LABELS[recipe.occupation],
      ...recipe.tags,
    ]
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return haystack.includes(query);
  });
}
