import type {
  StudioTemplateComposition,
  StudioTemplateCompositionPage,
  StudioTemplateDefinition,
  StudioTemplateLayoutKind,
  StudioTemplateStartMode,
  StudioTemplateValue,
} from "./studio-template-system";

export const STUDIO_TEMPLATE_CATEGORIES = [
  "all",
  "webtoon",
  "illustration",
  "promotion",
  "presentation",
  "storyboard",
] as const;

export type StudioTemplateCategory =
  (typeof STUDIO_TEMPLATE_CATEGORIES)[number];
export type StudioTemplateDifficulty = "easy" | "professional";
export type StudioTemplateWorkspace =
  | "comic"
  | "design"
  | "draw"
  | "slides"
  | "storyboard";

export interface StudioTemplateCatalogItem {
  readonly id: string;
  readonly category: Exclude<StudioTemplateCategory, "all">;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tags: readonly string[];
  readonly difficulty: StudioTemplateDifficulty;
  readonly recommendedWorkspace: StudioTemplateWorkspace;
  readonly definition: StudioTemplateDefinition;
}

export interface StudioTemplateCatalogQuery {
  readonly text?: string;
  readonly category?: StudioTemplateCategory;
  readonly favoriteIds?: readonly string[];
  readonly favoritesOnly?: boolean;
}

export interface StudioTemplateHandoff {
  readonly schemaVersion: 1;
  readonly templateId: string;
  readonly workspace: StudioTemplateWorkspace;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface StudioTemplateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_TEMPLATE_FAVORITES_KEY =
  "toonspectrum:studio-template-favorites:v1";
export const STUDIO_TEMPLATE_HANDOFF_KEY =
  "toonspectrum:studio-template-handoff:v1";

function textSlot(
  id: string,
  label: string,
  defaultValue: string,
  maxLength = 80,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "text",
    required: true,
    maxLength,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: [],
    defaultValue: { kind: "text", value: defaultValue },
  };
}

function imageSlot(
  id: string,
  label: string,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "image",
    required: true,
    maxLength: null,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: ["image"],
    defaultValue: {
      kind: "image",
      assetId: `placeholder:${id}`,
      rightsStatus: "warning",
    },
  };
}

function colorSlot(
  id: string,
  label: string,
  value: string,
): StudioTemplateDefinition["slots"][number] {
  return {
    id,
    label,
    kind: "color",
    required: true,
    maxLength: null,
    minimum: null,
    maximum: null,
    acceptedAssetTypes: [],
    defaultValue: { kind: "color", value },
  };
}

function templatePage(
  id: string,
  labelKo: string,
  labelEn: string,
  layout: StudioTemplateLayoutKind,
  panelCount: number,
  editableSlotIds: readonly string[] = [],
): StudioTemplateCompositionPage {
  return Object.freeze({
    id,
    labelKo,
    labelEn,
    layout,
    panelCount,
    editableSlotIds: Object.freeze([...editableSlotIds]),
  });
}

function templateComposition(
  aspectRatio: number,
  canvasLabelKo: string,
  canvasLabelEn: string,
  pages: readonly StudioTemplateCompositionPage[],
  layerLabels: readonly string[],
  includedAssetCount: number,
  startMode: StudioTemplateStartMode = "new-project",
): StudioTemplateComposition {
  return Object.freeze({
    aspectRatio,
    canvasLabelKo,
    canvasLabelEn,
    pages: Object.freeze([...pages]),
    layerLabels: Object.freeze([...layerLabels]),
    includedAssetCount,
    startMode,
  });
}

export const STUDIO_TEMPLATE_CATALOG = Object.freeze([
  {
    id: "webtoon-vertical-episode",
    category: "webtoon",
    titleKo: "세로 웹툰 기본 원고",
    titleEn: "Vertical webtoon episode",
    descriptionKo: "컷 간격, 말풍선 안전 영역, 휴대폰 미리보기와 플랫폼 출력 규칙을 포함한 연재용 원고입니다.",
    descriptionEn: "A production-ready episode with panel gaps, balloon safe areas, phone preview and platform export rules.",
    tags: ["세로 웹툰", "연재", "말풍선", "모바일"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-vertical-episode",
      version: 2,
      title: "Vertical webtoon episode",
      documentKind: "comic",
      slots: [
        textSlot("episode-title", "회차 제목", "새 에피소드", 60),
        colorSlot("background", "원고 배경", "#ffffff"),
      ],
      composition: templateComposition(
        0.45,
        "1080 × 2400px 세로 스크롤",
        "1080 × 2400px vertical scroll",
        [
          templatePage("episode", "에피소드", "Episode", "vertical-strip", 8, ["episode-title", "background"]),
        ],
        ["안내", "말풍선", "효과", "인물", "전경", "배경", "원고 배경"],
        4,
      ),
    },
  },
  {
    id: "webtoon-four-panel",
    category: "webtoon",
    titleKo: "4컷·컷툰",
    titleEn: "Four-panel comic",
    descriptionKo: "도입·전개·반전·마무리 구조와 읽기 순서를 갖춘 짧은 컷툰 템플릿입니다.",
    descriptionEn: "A short-form comic with setup, development, twist, payoff and explicit reading order.",
    tags: ["4컷", "컷툰", "SNS", "짧은 만화"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-four-panel",
      version: 2,
      title: "Four-panel comic",
      documentKind: "comic",
      slots: [
        textSlot("title", "작품 제목", "오늘의 4컷", 40),
        colorSlot("accent", "강조 색상", "#f97316"),
      ],
      composition: templateComposition(
        0.72,
        "1080 × 1500px 4컷",
        "1080 × 1500px four-panel",
        [
          templatePage("comic", "4컷 원고", "Four panels", "panel-grid", 4, ["title", "accent"]),
        ],
        ["말풍선", "효과", "컷 4", "컷 3", "컷 2", "컷 1", "배경"],
        5,
      ),
    },
  },
  {
    id: "webtoon-dialogue-scene",
    category: "webtoon",
    titleKo: "대화 중심 에피소드",
    titleEn: "Dialogue-focused episode",
    descriptionKo: "시선 방향, 말풍선 순서와 리액션 컷을 갖춘 2인 대화 장면 구조입니다.",
    descriptionEn: "A two-character dialogue structure with eyelines, balloon order and reaction shots.",
    tags: ["대화", "로맨스", "드라마", "말풍선"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-dialogue-scene",
      version: 1,
      title: "Dialogue-focused episode",
      documentKind: "comic",
      slots: [
        textSlot("scene-title", "장면 제목", "두 사람의 대화", 60),
        textSlot("speaker-a", "인물 A", "인물 A", 24),
        textSlot("speaker-b", "인물 B", "인물 B", 24),
        colorSlot("accent", "대사 강조색", "#2563eb"),
      ],
      composition: templateComposition(
        0.48,
        "1080 × 2250px 대화 장면",
        "1080 × 2250px dialogue scene",
        [
          templatePage("dialogue", "대화 시퀀스", "Dialogue sequence", "vertical-strip", 6, ["scene-title", "speaker-a", "speaker-b", "accent"]),
        ],
        ["대사 가이드", "말풍선 B", "말풍선 A", "인물 B", "인물 A", "배경"],
        6,
      ),
    },
  },
  {
    id: "webtoon-action-sequence",
    category: "webtoon",
    titleKo: "액션 시퀀스",
    titleEn: "Action sequence",
    descriptionKo: "와이드 도입, 충돌, 임팩트, 리액션과 속도감 있는 전환을 미리 배치한 액션 원고입니다.",
    descriptionEn: "An action layout with establishing shot, collision, impact, reaction and speed transitions.",
    tags: ["액션", "속도선", "임팩트", "전투"],
    difficulty: "professional",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-action-sequence",
      version: 1,
      title: "Action sequence",
      documentKind: "comic",
      slots: [
        textSlot("sequence-title", "시퀀스 제목", "결정적 충돌", 60),
        imageSlot("hero-reference", "주요 인물 참고 이미지"),
        colorSlot("impact", "임팩트 색상", "#ef4444"),
      ],
      composition: templateComposition(
        0.45,
        "1080 × 2400px 액션 원고",
        "1080 × 2400px action episode",
        [
          templatePage("action", "액션 시퀀스", "Action sequence", "vertical-strip", 7, ["sequence-title", "hero-reference", "impact"]),
        ],
        ["카메라 가이드", "효과음", "속도선", "임팩트", "인물", "배경"],
        9,
      ),
    },
  },
  {
    id: "webtoon-romance-episode",
    category: "webtoon",
    titleKo: "로맨스 감정 에피소드",
    titleEn: "Romance emotion episode",
    descriptionKo: "거리감, 손·표정 클로즈업과 여백을 활용해 감정의 변화를 보여 주는 세로 원고입니다.",
    descriptionEn: "A vertical episode using distance, hand and expression close-ups, and breathing space for emotion.",
    tags: ["로맨스", "감정", "클로즈업", "여백"],
    difficulty: "easy",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-romance-episode",
      version: 1,
      title: "Romance emotion episode",
      documentKind: "comic",
      slots: [
        textSlot("episode-title", "회차 제목", "마음이 닿는 순간", 60),
        imageSlot("key-visual", "키 비주얼"),
        colorSlot("mood", "감정 색상", "#ec4899"),
      ],
      composition: templateComposition(
        0.45,
        "1080 × 2400px 감정 원고",
        "1080 × 2400px emotion episode",
        [
          templatePage("romance", "감정 시퀀스", "Emotion sequence", "vertical-strip", 8, ["episode-title", "key-visual", "mood"]),
        ],
        ["감정 효과", "말풍선", "인물 클로즈업", "인물 전신", "전경", "배경"],
        7,
      ),
    },
  },
  {
    id: "webtoon-page-comic",
    category: "webtoon",
    titleKo: "페이지 만화 원고",
    titleEn: "Page comic manuscript",
    descriptionKo: "A4 비율, 재단 안전 영역과 좌우 페이지 흐름을 갖춘 인쇄·PDF용 페이지 만화입니다.",
    descriptionEn: "An A4-ratio page comic with trim safety and left-right reading flow for print or PDF.",
    tags: ["페이지 만화", "인쇄", "PDF", "A4"],
    difficulty: "professional",
    recommendedWorkspace: "comic",
    definition: {
      id: "template:webtoon-page-comic",
      version: 1,
      title: "Page comic manuscript",
      documentKind: "comic",
      slots: [
        textSlot("chapter-title", "챕터 제목", "새 챕터", 60),
        colorSlot("paper", "종이 색상", "#ffffff"),
      ],
      composition: templateComposition(
        0.707,
        "A4 세로 · 3페이지",
        "A4 portrait · 3 pages",
        [
          templatePage("page-1", "1페이지", "Page 1", "panel-grid", 5, ["chapter-title", "paper"]),
          templatePage("page-2", "2페이지", "Page 2", "panel-grid", 5, ["paper"]),
          templatePage("page-3", "3페이지", "Page 3", "panel-grid", 4, ["paper"]),
        ],
        ["재단 가이드", "말풍선", "효과", "인물", "컷", "배경", "용지"],
        6,
      ),
    },
  },
  {
    id: "illustration-character-sheet",
    category: "illustration",
    titleKo: "캐릭터 설정 시트",
    titleEn: "Character reference sheet",
    descriptionKo: "정면·측면·후면, 표정, 색상, 의상과 소품을 한 장에서 관리하는 전문 설정 시트입니다.",
    descriptionEn: "A professional sheet for front, side, back, expressions, colors, costume and props.",
    tags: ["캐릭터", "턴어라운드", "표정", "설정집"],
    difficulty: "professional",
    recommendedWorkspace: "draw",
    definition: {
      id: "template:illustration-character-sheet",
      version: 2,
      title: "Character reference sheet",
      documentKind: "illustration",
      slots: [
        textSlot("character-name", "캐릭터 이름", "새 캐릭터", 40),
        imageSlot("character-reference", "캐릭터 참고 이미지"),
        colorSlot("primary-color", "대표 색상", "#334155"),
      ],
      composition: templateComposition(
        1.414,
        "A3 가로 캐릭터 시트",
        "A3 landscape character sheet",
        [
          templatePage("reference", "설정 시트", "Reference sheet", "character-sheet", 6, ["character-name", "character-reference", "primary-color"]),
        ],
        ["주석", "색상표", "소품", "표정", "후면", "측면", "정면", "배경"],
        12,
      ),
    },
  },
  {
    id: "illustration-expression-sheet",
    category: "illustration",
    titleKo: "표정·감정 시트",
    titleEn: "Expression and emotion sheet",
    descriptionKo: "기본 표정부터 극단 감정까지 얼굴 각도와 강도를 일관되게 정리하는 시트입니다.",
    descriptionEn: "A sheet for consistent face angles and emotion intensity from neutral to extreme expressions.",
    tags: ["표정", "감정", "얼굴", "연기"],
    difficulty: "easy",
    recommendedWorkspace: "draw",
    definition: {
      id: "template:illustration-expression-sheet",
      version: 1,
      title: "Expression and emotion sheet",
      documentKind: "illustration",
      slots: [
        textSlot("character-name", "캐릭터 이름", "새 캐릭터", 40),
        imageSlot("face-reference", "얼굴 참고 이미지"),
        colorSlot("accent", "강조 색상", "#f59e0b"),
      ],
      composition: templateComposition(
        1.414,
        "A3 가로 표정 시트",
        "A3 landscape expression sheet",
        [
          templatePage("expressions", "표정 12종", "12 expressions", "expression-grid", 12, ["character-name", "face-reference", "accent"]),
        ],
        ["감정 라벨", "강도 가이드", "표정 12", "얼굴 기준선", "배경"],
        8,
      ),
    },
  },
  {
    id: "illustration-environment-concept",
    category: "illustration",
    titleKo: "환경 콘셉트 보드",
    titleEn: "Environment concept board",
    descriptionKo: "키 프레임, 시간대, 재질, 색상과 소품을 묶어 장소의 시각 규칙을 정리합니다.",
    descriptionEn: "A board for keyframes, time of day, materials, color and props that define a location.",
    tags: ["배경", "환경", "콘셉트", "무드보드"],
    difficulty: "professional",
    recommendedWorkspace: "draw",
    definition: {
      id: "template:illustration-environment-concept",
      version: 1,
      title: "Environment concept board",
      documentKind: "illustration",
      slots: [
        textSlot("location-name", "장소 이름", "새로운 장소", 50),
        imageSlot("keyframe", "대표 키 프레임"),
        colorSlot("palette", "대표 색상", "#0f766e"),
      ],
      composition: templateComposition(
        1.6,
        "2560 × 1600px 환경 보드",
        "2560 × 1600px environment board",
        [
          templatePage("environment", "환경 보드", "Environment board", "environment-board", 5, ["location-name", "keyframe", "palette"]),
        ],
        ["메모", "색상표", "재질", "소품", "키 프레임", "배경"],
        10,
      ),
    },
  },
  {
    id: "promotion-episode-release",
    category: "promotion",
    titleKo: "신작·회차 공개 홍보",
    titleEn: "Episode release promotion",
    descriptionKo: "작품 표지, 회차 제목, 공개 일시와 CTA를 SNS 규격으로 재배치할 수 있는 디자인입니다.",
    descriptionEn: "A social design that adapts cover art, episode title, release time and call to action.",
    tags: ["홍보", "SNS", "썸네일", "표지"],
    difficulty: "easy",
    recommendedWorkspace: "design",
    definition: {
      id: "template:promotion-episode-release",
      version: 2,
      title: "Episode release promotion",
      documentKind: "design",
      slots: [
        textSlot("title", "작품·회차 제목", "새 에피소드 공개", 50),
        imageSlot("hero", "대표 이미지"),
        textSlot("cta", "행동 문구", "지금 감상하기", 24),
        colorSlot("accent", "강조 색상", "#7c3aed"),
      ],
      composition: templateComposition(
        1.0,
        "1080 × 1080px SNS 홍보",
        "1080 × 1080px social promotion",
        [
          templatePage("square", "정사각 홍보", "Square promo", "poster", 1, ["title", "hero", "cta", "accent"]),
          templatePage("story", "스토리 홍보", "Story promo", "poster", 1, ["title", "hero", "cta", "accent"]),
        ],
        ["CTA", "공개 정보", "제목", "키 비주얼", "장식", "배경"],
        7,
      ),
    },
  },
  {
    id: "promotion-series-cover",
    category: "promotion",
    titleKo: "시리즈 표지·키아트",
    titleEn: "Series cover and key art",
    descriptionKo: "작품명, 주인공, 장르 신호와 플랫폼 안전 영역을 갖춘 대표 표지 디자인입니다.",
    descriptionEn: "A hero cover with title, protagonist, genre signal and platform-safe crop regions.",
    tags: ["표지", "키아트", "타이틀", "플랫폼"],
    difficulty: "professional",
    recommendedWorkspace: "design",
    definition: {
      id: "template:promotion-series-cover",
      version: 1,
      title: "Series cover and key art",
      documentKind: "design",
      slots: [
        textSlot("series-title", "작품 제목", "새로운 이야기", 50),
        imageSlot("hero", "주인공 키 비주얼"),
        textSlot("tagline", "태그라인", "운명을 바꾸는 단 하나의 선택", 80),
        colorSlot("accent", "장르 강조색", "#9333ea"),
      ],
      composition: templateComposition(
        0.75,
        "1500 × 2000px 세로 표지",
        "1500 × 2000px portrait cover",
        [
          templatePage("cover", "대표 표지", "Main cover", "poster", 1, ["series-title", "hero", "tagline", "accent"]),
          templatePage("thumbnail", "썸네일", "Thumbnail", "poster", 1, ["series-title", "hero", "accent"]),
        ],
        ["플랫폼 안전 영역", "타이틀", "태그라인", "인물", "광원 효과", "배경"],
        9,
      ),
    },
  },
  {
    id: "promotion-social-carousel",
    category: "promotion",
    titleKo: "SNS 카드뉴스 5장",
    titleEn: "Five-slide social carousel",
    descriptionKo: "작품 소개, 캐릭터, 하이라이트, 일정과 CTA를 5장의 카드로 연결합니다.",
    descriptionEn: "A five-card carousel connecting story intro, characters, highlights, schedule and CTA.",
    tags: ["카드뉴스", "SNS", "캐러셀", "홍보"],
    difficulty: "easy",
    recommendedWorkspace: "design",
    definition: {
      id: "template:promotion-social-carousel",
      version: 1,
      title: "Five-slide social carousel",
      documentKind: "design",
      slots: [
        textSlot("series-title", "작품 제목", "새로운 연재", 50),
        imageSlot("hero", "대표 이미지"),
        textSlot("cta", "행동 문구", "첫 화 보러 가기", 30),
        colorSlot("accent", "강조 색상", "#0ea5e9"),
      ],
      composition: templateComposition(
        1.0,
        "1080 × 1080px · 5장",
        "1080 × 1080px · 5 slides",
        [
          templatePage("intro", "1. 작품 소개", "1. Introduction", "social-carousel", 1, ["series-title", "hero", "accent"]),
          templatePage("character", "2. 캐릭터", "2. Character", "social-carousel", 2, ["hero", "accent"]),
          templatePage("highlight", "3. 하이라이트", "3. Highlight", "social-carousel", 3, ["hero", "accent"]),
          templatePage("schedule", "4. 공개 일정", "4. Schedule", "social-carousel", 1, ["series-title", "accent"]),
          templatePage("cta", "5. CTA", "5. CTA", "social-carousel", 1, ["cta", "accent"]),
        ],
        ["페이지 번호", "CTA", "본문", "제목", "이미지", "장식", "배경"],
        11,
      ),
    },
  },
  {
    id: "presentation-webtoon-pitch",
    category: "presentation",
    titleKo: "웹툰 피칭 자료",
    titleEn: "Webtoon pitch deck",
    descriptionKo: "로그라인, 독자, 캐릭터, 세계관, 시각 방향, 연재 계획과 제작 예산을 설명하는 발표 자료입니다.",
    descriptionEn: "A pitch deck for logline, audience, characters, world, visual direction, release plan and budget.",
    tags: ["PPT", "피칭", "기획서", "발표"],
    difficulty: "professional",
    recommendedWorkspace: "slides",
    definition: {
      id: "template:presentation-webtoon-pitch",
      version: 2,
      title: "Webtoon pitch deck",
      documentKind: "slides",
      slots: [
        textSlot("project-title", "작품 제목", "작품 피칭", 50),
        textSlot("logline", "로그라인", "한 문장으로 작품의 약속을 설명하세요.", 160),
        imageSlot("key-visual", "키 비주얼"),
        colorSlot("theme", "테마 색상", "#111827"),
      ],
      composition: templateComposition(
        1.777,
        "16:9 · 8슬라이드",
        "16:9 · 8 slides",
        [
          templatePage("cover", "1. 표지", "1. Cover", "slide", 1, ["project-title", "key-visual", "theme"]),
          templatePage("logline", "2. 로그라인", "2. Logline", "slide", 2, ["logline", "theme"]),
          templatePage("audience", "3. 타깃 독자", "3. Audience", "slide", 3, ["theme"]),
          templatePage("characters", "4. 캐릭터", "4. Characters", "slide", 3, ["key-visual", "theme"]),
          templatePage("world", "5. 세계관", "5. World", "slide", 3, ["key-visual", "theme"]),
          templatePage("visual", "6. 시각 방향", "6. Visual direction", "slide", 4, ["key-visual", "theme"]),
          templatePage("release", "7. 연재 계획", "7. Release plan", "slide", 4, ["theme"]),
          templatePage("budget", "8. 제작 계획", "8. Production", "slide", 4, ["theme"]),
        ],
        ["발표 노트", "페이지 번호", "도표", "본문", "제목", "키 비주얼", "배경"],
        16,
      ),
    },
  },
  {
    id: "presentation-production-plan",
    category: "presentation",
    titleKo: "웹툰 제작·발주 계획서",
    titleEn: "Webtoon production plan",
    descriptionKo: "역할, 일정, 에피소드 산출물, 검수 단계와 예산을 한 흐름으로 설명하는 제작 계획서입니다.",
    descriptionEn: "A production plan covering roles, schedule, episode deliverables, review gates and budget.",
    tags: ["제작", "발주", "일정", "예산"],
    difficulty: "professional",
    recommendedWorkspace: "slides",
    definition: {
      id: "template:presentation-production-plan",
      version: 1,
      title: "Webtoon production plan",
      documentKind: "slides",
      slots: [
        textSlot("project-title", "프로젝트명", "웹툰 제작 계획", 60),
        textSlot("goal", "제작 목표", "안정적인 주간 연재 체계를 구축합니다.", 160),
        colorSlot("theme", "테마 색상", "#0369a1"),
      ],
      composition: templateComposition(
        1.777,
        "16:9 · 10슬라이드",
        "16:9 · 10 slides",
        [
          templatePage("cover", "1. 표지", "1. Cover", "slide", 1, ["project-title", "theme"]),
          templatePage("goal", "2. 목표", "2. Goal", "slide", 2, ["goal", "theme"]),
          templatePage("scope", "3. 범위", "3. Scope", "slide", 4, ["theme"]),
          templatePage("roles", "4. 역할", "4. Roles", "slide", 5, ["theme"]),
          templatePage("workflow", "5. 제작 흐름", "5. Workflow", "slide", 6, ["theme"]),
          templatePage("schedule", "6. 일정", "6. Schedule", "slide", 6, ["theme"]),
          templatePage("deliverables", "7. 산출물", "7. Deliverables", "slide", 5, ["theme"]),
          templatePage("review", "8. 검수", "8. Review", "slide", 4, ["theme"]),
          templatePage("budget", "9. 예산", "9. Budget", "slide", 4, ["theme"]),
          templatePage("next", "10. 다음 단계", "10. Next steps", "slide", 3, ["theme"]),
        ],
        ["발표 노트", "페이지 번호", "일정", "표", "본문", "제목", "배경"],
        14,
      ),
    },
  },
  {
    id: "presentation-world-bible",
    category: "presentation",
    titleKo: "세계관 바이블",
    titleEn: "World bible",
    descriptionKo: "세계의 규칙, 장소, 세력, 역사, 인물 관계와 반복 시각 요소를 정리하는 장기 제작 자료입니다.",
    descriptionEn: "A long-form bible for world rules, locations, factions, history, relationships and recurring visual motifs.",
    tags: ["세계관", "설정집", "관계도", "장기 연재"],
    difficulty: "professional",
    recommendedWorkspace: "slides",
    definition: {
      id: "template:presentation-world-bible",
      version: 1,
      title: "World bible",
      documentKind: "slides",
      slots: [
        textSlot("world-title", "세계관 이름", "새로운 세계", 60),
        textSlot("premise", "핵심 전제", "이 세계를 움직이는 한 가지 규칙을 설명하세요.", 180),
        imageSlot("world-map", "세계 지도·대표 이미지"),
        colorSlot("theme", "테마 색상", "#7c2d12"),
      ],
      composition: templateComposition(
        1.777,
        "16:9 · 12슬라이드",
        "16:9 · 12 slides",
        [
          templatePage("cover", "1. 표지", "1. Cover", "slide", 1, ["world-title", "world-map", "theme"]),
          templatePage("premise", "2. 핵심 규칙", "2. Premise", "slide", 2, ["premise", "theme"]),
          templatePage("map", "3. 지도", "3. Map", "slide", 1, ["world-map", "theme"]),
          templatePage("locations", "4. 장소", "4. Locations", "slide", 4, ["world-map", "theme"]),
          templatePage("factions", "5. 세력", "5. Factions", "slide", 4, ["theme"]),
          templatePage("history", "6. 역사", "6. History", "slide", 5, ["theme"]),
          templatePage("rules", "7. 능력·규칙", "7. Systems", "slide", 4, ["theme"]),
          templatePage("characters", "8. 인물", "8. Characters", "slide", 4, ["theme"]),
          templatePage("relations", "9. 관계도", "9. Relationships", "slide", 6, ["theme"]),
          templatePage("motifs", "10. 시각 모티프", "10. Motifs", "slide", 6, ["world-map", "theme"]),
          templatePage("episodes", "11. 에피소드 씨앗", "11. Story seeds", "slide", 5, ["theme"]),
          templatePage("glossary", "12. 용어집", "12. Glossary", "slide", 6, ["theme"]),
        ],
        ["발표 노트", "페이지 번호", "관계선", "도표", "본문", "이미지", "제목", "배경"],
        20,
      ),
    },
  },
  {
    id: "storyboard-animatic",
    category: "storyboard",
    titleKo: "콘티·애니매틱",
    titleEn: "Storyboard and animatic",
    descriptionKo: "장면 목적, 샷, 대사, 지속 시간, 카메라 이동과 음성을 순서대로 연결합니다.",
    descriptionEn: "Connect scene purpose, shots, dialogue, timing, camera motion and voice in sequence.",
    tags: ["콘티", "애니매틱", "영상", "장면"],
    difficulty: "professional",
    recommendedWorkspace: "storyboard",
    definition: {
      id: "template:storyboard-animatic",
      version: 2,
      title: "Storyboard and animatic",
      documentKind: "storyboard",
      slots: [
        textSlot("sequence-title", "시퀀스 제목", "Opening sequence", 60),
        imageSlot("opening-frame", "첫 프레임"),
      ],
      composition: templateComposition(
        1.777,
        "16:9 · 8샷",
        "16:9 · 8 shots",
        [
          templatePage("shots-1", "샷 1–4", "Shots 1–4", "storyboard", 4, ["sequence-title", "opening-frame"]),
          templatePage("shots-2", "샷 5–8", "Shots 5–8", "storyboard", 4, ["opening-frame"]),
        ],
        ["음성", "타이밍", "카메라", "대사", "샷 설명", "프레임", "배경"],
        8,
      ),
    },
  },
  {
    id: "storyboard-webtoon-vertical",
    category: "storyboard",
    titleKo: "세로 웹툰 콘티 12컷",
    titleEn: "Twelve-panel vertical webtoon storyboard",
    descriptionKo: "스크롤 리듬, 컷 간 여백, 감정 전환과 회차 훅을 12컷으로 빠르게 계획합니다.",
    descriptionEn: "Plan scroll rhythm, panel gaps, emotional transitions and an episode hook across twelve panels.",
    tags: ["웹툰 콘티", "12컷", "스크롤", "연출"],
    difficulty: "easy",
    recommendedWorkspace: "storyboard",
    definition: {
      id: "template:storyboard-webtoon-vertical",
      version: 1,
      title: "Twelve-panel vertical webtoon storyboard",
      documentKind: "storyboard",
      slots: [
        textSlot("episode-title", "회차 제목", "새 에피소드 콘티", 60),
        textSlot("hook", "마지막 훅", "다음 화를 궁금하게 만드는 장면", 120),
        colorSlot("accent", "연출 강조색", "#dc2626"),
      ],
      composition: templateComposition(
        0.5,
        "1080 × 2160px · 12컷",
        "1080 × 2160px · 12 panels",
        [
          templatePage("storyboard-a", "컷 1–6", "Panels 1–6", "storyboard", 6, ["episode-title", "accent"]),
          templatePage("storyboard-b", "컷 7–12", "Panels 7–12", "storyboard", 6, ["hook", "accent"]),
        ],
        ["연출 메모", "말풍선 메모", "스크롤 간격", "컷", "배경"],
        5,
      ),
    },
  },
  {
    id: "storyboard-shot-list",
    category: "storyboard",
    titleKo: "샷 리스트·촬영 콘티",
    titleEn: "Shot list and camera board",
    descriptionKo: "샷 번호, 렌즈, 구도, 카메라 이동, 대사와 예상 길이를 한 표와 프레임으로 관리합니다.",
    descriptionEn: "Manage shot number, lens, framing, camera motion, dialogue and timing with frames and a shot table.",
    tags: ["샷 리스트", "카메라", "영상", "촬영"],
    difficulty: "professional",
    recommendedWorkspace: "storyboard",
    definition: {
      id: "template:storyboard-shot-list",
      version: 1,
      title: "Shot list and camera board",
      documentKind: "storyboard",
      slots: [
        textSlot("sequence-title", "시퀀스 제목", "Main sequence", 60),
        imageSlot("reference-frame", "참고 프레임"),
        colorSlot("accent", "구분 색상", "#0891b2"),
      ],
      composition: templateComposition(
        1.414,
        "A3 가로 · 10샷",
        "A3 landscape · 10 shots",
        [
          templatePage("shots-a", "샷 1–5", "Shots 1–5", "storyboard", 5, ["sequence-title", "reference-frame", "accent"]),
          templatePage("shots-b", "샷 6–10", "Shots 6–10", "storyboard", 5, ["reference-frame", "accent"]),
        ],
        ["타임코드", "카메라 메모", "대사", "샷 정보", "프레임", "배경"],
        7,
      ),
    },
  },
] as const satisfies readonly StudioTemplateCatalogItem[]);

const TEMPLATE_BY_ID: ReadonlyMap<string, StudioTemplateCatalogItem> = new Map(
  STUDIO_TEMPLATE_CATALOG.map((template) => [template.id, template]),
);

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function studioTemplateById(
  templateId: string | null | undefined,
): StudioTemplateCatalogItem | null {
  if (!templateId) return null;
  return TEMPLATE_BY_ID.get(templateId.trim()) ?? null;
}

export function searchStudioTemplates(
  query: StudioTemplateCatalogQuery = {},
): readonly StudioTemplateCatalogItem[] {
  const text = normalizedText(query.text ?? "");
  const category = query.category ?? "all";
  const favorites = new Set(query.favoriteIds ?? []);
  return Object.freeze(STUDIO_TEMPLATE_CATALOG.filter((template) => {
    if (category !== "all" && template.category !== category) return false;
    if (query.favoritesOnly && !favorites.has(template.id)) return false;
    if (!text) return true;
    const searchable = normalizedText([
      template.titleKo,
      template.titleEn,
      template.descriptionKo,
      template.descriptionEn,
      ...template.tags,
    ].join(" "));
    return searchable.includes(text);
  }));
}

export function defaultStudioTemplateValues(
  template: StudioTemplateCatalogItem,
): Readonly<Record<string, StudioTemplateValue>> {
  return Object.freeze(Object.fromEntries(
    template.definition.slots.flatMap((slot) => slot.defaultValue
      ? [[slot.id, slot.defaultValue] as const]
      : []),
  ));
}

export function readStudioTemplateFavorites(
  storage: StudioTemplateStorage,
): readonly string[] {
  const raw = storage.getItem(STUDIO_TEMPLATE_FAVORITES_KEY);
  if (!raw) return Object.freeze([]);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze([...new Set(parsed.filter((value): value is string => (
      typeof value === "string" && TEMPLATE_BY_ID.has(value)
    )))].sort());
  } catch {
    return Object.freeze([]);
  }
}

export function writeStudioTemplateFavorites(
  storage: StudioTemplateStorage,
  favoriteIds: readonly string[],
): readonly string[] {
  const next = Object.freeze([...new Set(favoriteIds.filter((id) => TEMPLATE_BY_ID.has(id)))].sort());
  storage.setItem(STUDIO_TEMPLATE_FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export function studioTemplateStartHref(templateId: string): string {
  const template = studioTemplateById(templateId);
  if (!template) throw new Error("A known Studio template is required.");
  const params = new URLSearchParams({
    template: template.id,
    workspace: template.recommendedWorkspace,
  });
  params.sort();
  return `/studio/new?${params.toString()}`;
}

export function createStudioTemplateHandoff(
  templateId: string,
  createdAt = new Date().toISOString(),
  ttlMs = 15 * 60 * 1000,
): StudioTemplateHandoff {
  const template = studioTemplateById(templateId);
  const createdAtMs = Date.parse(createdAt);
  if (!template || !Number.isFinite(createdAtMs) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("A known template, valid time and positive TTL are required.");
  }
  return Object.freeze({
    schemaVersion: 1,
    templateId: template.id,
    workspace: template.recommendedWorkspace,
    createdAt,
    expiresAt: new Date(createdAtMs + ttlMs).toISOString(),
  });
}

export function writeStudioTemplateHandoff(
  storage: StudioTemplateStorage,
  handoff: StudioTemplateHandoff,
): StudioTemplateHandoff {
  if (!studioTemplateById(handoff.templateId)
    || handoff.schemaVersion !== 1
    || !Number.isFinite(Date.parse(handoff.createdAt))
    || !Number.isFinite(Date.parse(handoff.expiresAt))) {
    throw new Error("A valid Studio template handoff is required.");
  }
  storage.setItem(STUDIO_TEMPLATE_HANDOFF_KEY, JSON.stringify(handoff));
  return handoff;
}

export function readStudioTemplateHandoff(
  storage: StudioTemplateStorage,
  now = new Date().toISOString(),
): StudioTemplateHandoff | null {
  const raw = storage.getItem(STUDIO_TEMPLATE_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StudioTemplateHandoff> | null;
    const template = studioTemplateById(parsed?.templateId);
    const nowMs = Date.parse(now);
    const expiresAtMs = Date.parse(parsed?.expiresAt ?? "");
    if (!parsed
      || parsed.schemaVersion !== 1
      || !template
      || parsed.workspace !== template.recommendedWorkspace
      || !Number.isFinite(nowMs)
      || !Number.isFinite(expiresAtMs)
      || expiresAtMs <= nowMs) {
      storage.removeItem?.(STUDIO_TEMPLATE_HANDOFF_KEY);
      return null;
    }
    return Object.freeze({
      schemaVersion: 1,
      templateId: template.id,
      workspace: template.recommendedWorkspace,
      createdAt: String(parsed.createdAt),
      expiresAt: String(parsed.expiresAt),
    });
  } catch {
    storage.removeItem?.(STUDIO_TEMPLATE_HANDOFF_KEY);
    return null;
  }
}
