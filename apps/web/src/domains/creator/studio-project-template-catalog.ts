import type {
  StudioDocumentKind,
  StudioDocumentWorkspace,
} from "./studio-project-document-store";
import type { StudioProjectKind } from "./studio-project-library-store";

export const STUDIO_TEMPLATE_CATEGORIES = [
  "webtoon",
  "drawing",
  "design",
  "presentation",
  "storyboard",
  "image",
  "three-d",
  "motion",
] as const;

export type StudioTemplateCategory = (typeof STUDIO_TEMPLATE_CATEGORIES)[number];

export interface StudioProjectTemplateDefinition {
  readonly id: string;
  readonly version: number;
  readonly category: StudioTemplateCategory;
  readonly projectKind: StudioProjectKind;
  readonly documentKind: StudioDocumentKind;
  readonly defaultWorkspace: StudioDocumentWorkspace;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tagsKo: readonly string[];
  readonly tagsEn: readonly string[];
  readonly width: number | null;
  readonly height: number | null;
  readonly pageCount: number;
  readonly featured: boolean;
  readonly difficulty: "beginner" | "intermediate" | "professional";
  readonly source: "built-in" | "team" | "market";
}

export const STUDIO_PROJECT_TEMPLATES: readonly StudioProjectTemplateDefinition[] = Object.freeze([
  {
    id: "webtoon-vertical-standard",
    version: 1,
    category: "webtoon",
    projectKind: "webtoon",
    documentKind: "webtoon",
    defaultWorkspace: "comic",
    titleKo: "세로 웹툰 표준",
    titleEn: "Vertical webtoon standard",
    descriptionKo: "1080px 원고, 컷·말풍선·모바일 미리보기와 플랫폼 분할 규칙을 준비합니다.",
    descriptionEn: "Prepare a 1080px manuscript with panels, balloons, mobile preview and platform slicing.",
    tagsKo: ["연재", "세로", "초보"],
    tagsEn: ["serial", "vertical", "beginner"],
    width: 1080,
    height: 12000,
    pageCount: 1,
    featured: true,
    difficulty: "beginner",
    source: "built-in",
  },
  {
    id: "webtoon-four-panel",
    version: 1,
    category: "webtoon",
    projectKind: "webtoon",
    documentKind: "webtoon",
    defaultWorkspace: "comic",
    titleKo: "4컷·컷툰",
    titleEn: "Four-panel comic",
    descriptionKo: "균일한 네 컷과 대사 여백을 준비해 짧은 이야기와 SNS 게시에 적합합니다.",
    descriptionEn: "Four balanced panels with dialogue space for short stories and social publishing.",
    tagsKo: ["4컷", "SNS", "짧은 이야기"],
    tagsEn: ["four-panel", "social", "short story"],
    width: 1080,
    height: 4320,
    pageCount: 1,
    featured: true,
    difficulty: "beginner",
    source: "built-in",
  },
  {
    id: "webtoon-page-comic",
    version: 1,
    category: "webtoon",
    projectKind: "webtoon",
    documentKind: "webtoon",
    defaultWorkspace: "comic",
    titleKo: "페이지 만화",
    titleEn: "Page comic",
    descriptionKo: "인쇄와 전자책을 함께 고려한 페이지, 재단 여백과 읽기 순서를 준비합니다.",
    descriptionEn: "Prepare pages, trim margins and reading order for print and ebooks.",
    tagsKo: ["페이지", "인쇄", "전자책"],
    tagsEn: ["page", "print", "ebook"],
    width: 2480,
    height: 3508,
    pageCount: 8,
    featured: false,
    difficulty: "professional",
    source: "built-in",
  },
  {
    id: "illustration-character-sheet",
    version: 1,
    category: "drawing",
    projectKind: "illustration",
    documentKind: "illustration",
    defaultWorkspace: "draw",
    titleKo: "캐릭터 시트",
    titleEn: "Character sheet",
    descriptionKo: "정면·측면·후면, 표정과 색상 견본을 한 문서에서 관리합니다.",
    descriptionEn: "Manage front, side and back views, expressions and color swatches in one document.",
    tagsKo: ["캐릭터", "설정", "표정"],
    tagsEn: ["character", "reference", "expressions"],
    width: 4096,
    height: 3072,
    pageCount: 1,
    featured: true,
    difficulty: "intermediate",
    source: "built-in",
  },
  {
    id: "illustration-painting",
    version: 1,
    category: "drawing",
    projectKind: "illustration",
    documentKind: "illustration",
    defaultWorkspace: "draw",
    titleKo: "고해상도 일러스트",
    titleEn: "High-resolution illustration",
    descriptionKo: "레이어·마스크·조정 레이어와 인쇄 가능한 크기로 시작합니다.",
    descriptionEn: "Start with layers, masks, adjustments and print-ready dimensions.",
    tagsKo: ["채색", "고해상도", "인쇄"],
    tagsEn: ["painting", "high resolution", "print"],
    width: 4961,
    height: 3508,
    pageCount: 1,
    featured: false,
    difficulty: "professional",
    source: "built-in",
  },
  {
    id: "design-series-cover",
    version: 1,
    category: "design",
    projectKind: "design",
    documentKind: "design",
    defaultWorkspace: "design",
    titleKo: "작품 표지 세트",
    titleEn: "Series cover set",
    descriptionKo: "플랫폼 표지, 썸네일과 SNS 홍보 규격을 컴포넌트로 연결합니다.",
    descriptionEn: "Connect platform covers, thumbnails and social sizes through reusable components.",
    tagsKo: ["표지", "썸네일", "홍보"],
    tagsEn: ["cover", "thumbnail", "promotion"],
    width: 1600,
    height: 2560,
    pageCount: 4,
    featured: true,
    difficulty: "beginner",
    source: "built-in",
  },
  {
    id: "presentation-series-pitch",
    version: 1,
    category: "presentation",
    projectKind: "slides",
    documentKind: "slides",
    defaultWorkspace: "slides",
    titleKo: "웹툰 작품 피칭",
    titleEn: "Webtoon series pitch",
    descriptionKo: "로그라인, 독자, 캐릭터, 세계관, 샘플 컷과 제작 계획 슬라이드를 준비합니다.",
    descriptionEn: "Prepare logline, audience, character, world, sample art and production-plan slides.",
    tagsKo: ["피칭", "PPT", "제안서"],
    tagsEn: ["pitch", "slides", "proposal"],
    width: 1920,
    height: 1080,
    pageCount: 12,
    featured: true,
    difficulty: "beginner",
    source: "built-in",
  },
  {
    id: "presentation-production-review",
    version: 1,
    category: "presentation",
    projectKind: "slides",
    documentKind: "slides",
    defaultWorkspace: "slides",
    titleKo: "제작 리뷰",
    titleEn: "Production review",
    descriptionKo: "회차 진행률, 병목, 검토 의견, 일정과 다음 행동을 공유합니다.",
    descriptionEn: "Share episode progress, bottlenecks, review feedback, schedule and next actions.",
    tagsKo: ["제작", "리뷰", "진행률"],
    tagsEn: ["production", "review", "progress"],
    width: 1920,
    height: 1080,
    pageCount: 8,
    featured: false,
    difficulty: "intermediate",
    source: "built-in",
  },
  {
    id: "storyboard-webtoon-episode",
    version: 1,
    category: "storyboard",
    projectKind: "storyboard",
    documentKind: "storyboard",
    defaultWorkspace: "storyboard",
    titleKo: "웹툰 에피소드 콘티",
    titleEn: "Webtoon episode storyboard",
    descriptionKo: "대본 장면, 샷 크기, 카메라, 말풍선 여백과 스크롤 간격을 연결합니다.",
    descriptionEn: "Connect script beats, shot size, camera, balloon space and scroll gaps.",
    tagsKo: ["콘티", "대본", "카메라"],
    tagsEn: ["storyboard", "script", "camera"],
    width: 1080,
    height: 10000,
    pageCount: 1,
    featured: true,
    difficulty: "beginner",
    source: "built-in",
  },
  {
    id: "image-composite-cover",
    version: 1,
    category: "image",
    projectKind: "image",
    documentKind: "image",
    defaultWorkspace: "image",
    titleKo: "표지 이미지 합성",
    titleEn: "Cover image composite",
    descriptionKo: "선택·마스크·스마트 객체·조정 레이어를 사용한 비파괴 합성을 시작합니다.",
    descriptionEn: "Start a non-destructive composite with selections, masks, smart objects and adjustments.",
    tagsKo: ["합성", "보정", "비파괴"],
    tagsEn: ["composite", "retouch", "non-destructive"],
    width: 2400,
    height: 3200,
    pageCount: 1,
    featured: false,
    difficulty: "intermediate",
    source: "built-in",
  },
  {
    id: "3d-webtoon-room",
    version: 1,
    category: "three-d",
    projectKind: "three-d",
    documentKind: "three-d",
    defaultWorkspace: "3d",
    titleKo: "웹툰 실내 배경",
    titleEn: "Webtoon interior background",
    descriptionKo: "카메라, 낮·밤 조명과 색·선화·그림자·깊이 분리 출력이 준비됩니다.",
    descriptionEn: "Prepare camera, day/night lighting and separate color, line, shadow and depth passes.",
    tagsKo: ["3D", "배경", "선화"],
    tagsEn: ["3D", "background", "line art"],
    width: 2160,
    height: 1620,
    pageCount: 1,
    featured: false,
    difficulty: "professional",
    source: "built-in",
  },
  {
    id: "motion-webtoon-short",
    version: 1,
    category: "motion",
    projectKind: "animation",
    documentKind: "motion",
    defaultWorkspace: "motion",
    titleKo: "모션 웹툰 쇼츠",
    titleEn: "Motion webtoon short",
    descriptionKo: "세로 영상 장면, 대사, 음성, 자막과 카메라 움직임을 연결합니다.",
    descriptionEn: "Connect vertical-video scenes, dialogue, voice, captions and camera motion.",
    tagsKo: ["모션", "쇼츠", "음성"],
    tagsEn: ["motion", "shorts", "voice"],
    width: 1080,
    height: 1920,
    pageCount: 6,
    featured: false,
    difficulty: "intermediate",
    source: "built-in",
  },
]);

const TEMPLATE_BY_ID = new Map(STUDIO_PROJECT_TEMPLATES.map((template) => [template.id, template]));

export function studioProjectTemplateById(
  templateId: string,
): StudioProjectTemplateDefinition | null {
  return TEMPLATE_BY_ID.get(templateId) ?? null;
}

export function searchStudioProjectTemplates(input: {
  readonly query?: string;
  readonly category?: StudioTemplateCategory | "all";
  readonly featuredOnly?: boolean;
} = {}): readonly StudioProjectTemplateDefinition[] {
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  return Object.freeze(STUDIO_PROJECT_TEMPLATES.filter((template) => {
    if (input.category && input.category !== "all" && template.category !== input.category) return false;
    if (input.featuredOnly && !template.featured) return false;
    if (!query) return true;
    const haystack = [
      template.titleKo,
      template.titleEn,
      template.descriptionKo,
      template.descriptionEn,
      ...template.tagsKo,
      ...template.tagsEn,
    ].join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  }));
}

export function validateStudioProjectTemplateCatalog(): readonly string[] {
  const issues: string[] = [];
  const ids = STUDIO_PROJECT_TEMPLATES.map((template) => template.id);
  if (new Set(ids).size !== ids.length) issues.push("template-id-duplicate");
  for (const template of STUDIO_PROJECT_TEMPLATES) {
    if (!template.id.trim() || !template.titleKo.trim() || !template.titleEn.trim()) {
      issues.push(`template-required:${template.id}`);
    }
    if (!Number.isSafeInteger(template.version) || template.version < 1) {
      issues.push(`template-version:${template.id}`);
    }
    if (!Number.isSafeInteger(template.pageCount) || template.pageCount < 1) {
      issues.push(`template-page-count:${template.id}`);
    }
    if ((template.width === null) !== (template.height === null)) {
      issues.push(`template-dimensions-pair:${template.id}`);
    }
    if (template.width !== null && (!Number.isSafeInteger(template.width) || template.width < 1)) {
      issues.push(`template-width:${template.id}`);
    }
    if (template.height !== null && (!Number.isSafeInteger(template.height) || template.height < 1)) {
      issues.push(`template-height:${template.id}`);
    }
  }
  return Object.freeze(issues);
}
