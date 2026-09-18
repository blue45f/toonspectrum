import { matchesSearch } from "./learning-model";
import type { LearningLevel, SkillId } from "./learning-paths";

export const LEARNING_ROLES = ["artist", "story", "assistant", "producer", "educator"] as const;
export type LearningRole = (typeof LEARNING_ROLES)[number];

export const LEARNING_RESOURCE_FORMATS = ["course", "video", "article", "guide", "worksheet"] as const;
export type LearningResourceFormat = (typeof LEARNING_RESOURCE_FORMATS)[number];

export const LEARNING_RESOURCE_SOURCES = ["toonstudio", "webtoon-academy", "kocca", "clip-studio", "youtube"] as const;
export type LearningResourceSource = (typeof LEARNING_RESOURCE_SOURCES)[number];

export const PRODUCTION_STEPS = ["story", "character", "storyboard", "drawing", "color", "background", "lettering", "3d", "publish", "workflow"] as const;
export type ProductionStep = (typeof PRODUCTION_STEPS)[number];

export interface LearningResource {
  id: string;
  title: string;
  summary: string;
  provider: string;
  source: LearningResourceSource;
  format: LearningResourceFormat;
  level: LearningLevel;
  language: "ko" | "en";
  url: string;
  external: boolean;
  rights: "internal" | "embed" | "link-only" | "metadata-only";
  verified: boolean;
  roles: readonly LearningRole[];
  skills: readonly SkillId[];
  steps: readonly ProductionStep[];
  lessonId?: string;
  practicePath?: string;
  note?: string;
}

export const ROLE_LABELS: Readonly<Record<LearningRole, string>> = {
  artist: "그림 작가",
  story: "글 작가",
  assistant: "어시스턴트",
  producer: "프로듀서 · PD",
  educator: "강사 · 교육자",
};

export const RESOURCE_FORMAT_LABELS: Readonly<Record<LearningResourceFormat, string>> = {
  course: "강좌",
  video: "영상",
  article: "아티클",
  guide: "가이드",
  worksheet: "실습 자료",
};

export const RESOURCE_SOURCE_LABELS: Readonly<Record<LearningResourceSource, string>> = {
  toonstudio: "ToonSpectrum Academy",
  "webtoon-academy": "WEBTOON Academy",
  kocca: "에듀코카",
  "clip-studio": "CLIP STUDIO",
  youtube: "YouTube",
};

export const PRODUCTION_STEP_LABELS: Readonly<Record<ProductionStep, string>> = {
  story: "스토리",
  character: "캐릭터",
  storyboard: "콘티·연출",
  drawing: "드로잉",
  color: "채색",
  background: "배경",
  lettering: "대사·말풍선",
  "3d": "3D",
  publish: "게시·포트폴리오",
  workflow: "제작 워크플로",
};

export const CURATED_LEARNING_RESOURCES: readonly LearningResource[] = [
  {
    id: "toonstudio-three-panels",
    title: "한 문장에서 세 컷의 이야기로",
    summary: "로그라인을 행동과 반응으로 나누고 작은 콘티로 이야기 흐름을 검증합니다.",
    provider: "ToonSpectrum Academy",
    source: "toonstudio",
    format: "course",
    level: "starter",
    language: "ko",
    url: "/learn/lessons/story-board",
    external: false,
    rights: "internal",
    verified: true,
    roles: ["story", "artist", "producer", "educator"],
    skills: ["story", "direction"],
    steps: ["story", "storyboard"],
    lessonId: "story-board",
    practicePath: "/studio",
  },
  {
    id: "toonstudio-perspective",
    title: "아이레벨과 소실점으로 공간 설계하기",
    summary: "1점 투시를 직접 조절하며 카메라 눈높이와 공간 깊이를 분리해서 익힙니다.",
    provider: "ToonSpectrum Academy",
    source: "toonstudio",
    format: "course",
    level: "growing",
    language: "ko",
    url: "/learn/lessons/camera-perspective",
    external: false,
    rights: "internal",
    verified: true,
    roles: ["artist", "assistant", "educator"],
    skills: ["drawing", "direction"],
    steps: ["drawing", "background", "3d"],
    lessonId: "camera-perspective",
    practicePath: "/studio/bg3d",
  },
  {
    id: "webtoon-academy-home",
    title: "WEBTOON Academy · Creator Resources",
    summary: "스토리텔링, 캐릭터, 연출, 색채와 연재 운영을 폭넓게 다루는 WEBTOON 공식 창작자 교육 자료입니다.",
    provider: "WEBTOON",
    source: "webtoon-academy",
    format: "course",
    level: "starter",
    language: "en",
    url: "https://www.webtoons.com/en/creators101/webtoon-academy",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "story", "assistant", "producer", "educator"],
    skills: ["story", "direction", "drawing", "color", "workflow"],
    steps: ["story", "character", "storyboard", "drawing", "color", "publish"],
    note: "외부 공식 사이트에서 열립니다.",
  },
  {
    id: "webtoon-academy-publish",
    title: "WEBTOON Academy · Publish on CANVAS",
    summary: "작품 공개와 연재 준비에 필요한 WEBTOON의 공식 크리에이터 자료 모음입니다.",
    provider: "WEBTOON",
    source: "webtoon-academy",
    format: "guide",
    level: "advanced",
    language: "en",
    url: "https://www.webtoons.com/en/creators101/webtoon-academy/resource-list?resourceType=PUBLISH_CANVAS",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "story", "producer", "educator"],
    skills: ["workflow"],
    steps: ["publish", "workflow"],
  },
  {
    id: "kocca-character-2026",
    title: "웹툰 캐릭터 디자인 실습",
    summary: "캐릭터 아이디어와 유형, 이야기 속 역할, 스케치와 캐릭터 시트까지 이어지는 공개 교육 과정입니다.",
    provider: "한국콘텐츠진흥원 에듀코카",
    source: "kocca",
    format: "course",
    level: "starter",
    language: "ko",
    url: "https://edu.kocca.kr/edu/onlineEdu/realm/view.do?menuNo=500027&p_subj=CK26002&p_subjseq=0001&p_year=2026",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "story", "assistant", "educator"],
    skills: ["story", "drawing"],
    steps: ["character", "drawing"],
  },
  {
    id: "kocca-storyboard",
    title: "웹툰 스토리와 콘티 구성",
    summary: "인물과 사건, 목적을 정리하고 칸 연결과 콘티 연출을 실습하는 공개 교육 과정입니다.",
    provider: "한국콘텐츠진흥원 에듀코카",
    source: "kocca",
    format: "course",
    level: "growing",
    language: "ko",
    url: "https://edu.kocca.kr/edu/onlineEdu/realm/view.do?menuNo=500027&p_subj=CK22022&p_subjseq=0064&p_year=2026",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["story", "artist", "producer", "educator"],
    skills: ["story", "direction"],
    steps: ["story", "storyboard"],
  },
  {
    id: "clip-perspective-ruler",
    title: "Perspective Rulers · 공식 매뉴얼",
    summary: "투시자와 소실점, 가이드 조작을 공식 매뉴얼에서 단계별로 확인할 수 있습니다.",
    provider: "CELSYS",
    source: "clip-studio",
    format: "guide",
    level: "growing",
    language: "en",
    url: "https://help.clip-studio.com/en-us/manual_en/510_ruler/Perspective_Rulers.htm",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "assistant", "educator"],
    skills: ["drawing", "direction"],
    steps: ["drawing", "background"],
    practicePath: "/studio/bg3d",
  },
  {
    id: "clip-webtoon-scroll",
    title: "세로 스크롤 웹툰 제작과 연출",
    summary: "세로 스크롤 만화의 제작 흐름과 화면 구성 아이디어를 확인할 수 있는 CLIP STUDIO 공식 자료입니다.",
    provider: "CELSYS",
    source: "clip-studio",
    format: "article",
    level: "starter",
    language: "ko",
    url: "https://www.clipstudio.net/how-to-draw/archives/157055",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "story", "producer", "educator"],
    skills: ["direction", "workflow"],
    steps: ["storyboard", "workflow", "publish"],
  },
  {
    id: "clip-layer-mask",
    title: "Layer masks · 공식 매뉴얼",
    summary: "원본을 직접 지우지 않고 가림 영역을 관리하는 레이어 마스크의 기본 동작을 설명합니다.",
    provider: "CELSYS",
    source: "clip-studio",
    format: "guide",
    level: "growing",
    language: "en",
    url: "https://help.clip-studio.com/en-us/manual_en/180_layers/Layer_masks.htm",
    external: true,
    rights: "link-only",
    verified: true,
    roles: ["artist", "assistant", "educator"],
    skills: ["color", "workflow"],
    steps: ["color", "workflow"],
    lessonId: "color-layers",
  },
  {
    id: "toonstudio-lettering",
    title: "말풍선과 대사로 읽는 길 만들기",
    summary: "말풍선의 순서와 여유 공간을 조절하며 독자가 자연스럽게 대화를 따라가도록 설계합니다.",
    provider: "ToonSpectrum Academy",
    source: "toonstudio",
    format: "course",
    level: "starter",
    language: "ko",
    url: "/learn/lessons/lettering",
    external: false,
    rights: "internal",
    verified: true,
    roles: ["story", "artist", "assistant", "producer", "educator"],
    skills: ["lettering", "direction"],
    steps: ["storyboard", "lettering"],
    lessonId: "lettering",
    practicePath: "/studio",
  },
  {
    id: "toonstudio-publish-check",
    title: "완성 원고를 게시용 파일로 검수하기",
    summary: "작업 원본과 게시 파일을 분리하고 실제 내보낸 결과를 게시 전 체크리스트로 검수합니다.",
    provider: "ToonSpectrum Academy",
    source: "toonstudio",
    format: "worksheet",
    level: "advanced",
    language: "ko",
    url: "/learn/lessons/publish-check",
    external: false,
    rights: "internal",
    verified: true,
    roles: ["artist", "assistant", "producer", "educator"],
    skills: ["workflow", "lettering", "color"],
    steps: ["publish", "workflow"],
    lessonId: "publish-check",
    practicePath: "/studio/publish",
  },
];

export interface LearningResourceFilters {
  query?: string;
  role?: LearningRole | "all";
  source?: LearningResourceSource | "all";
  format?: LearningResourceFormat | "all";
  level?: LearningLevel | "all";
  step?: ProductionStep | "all";
}

export function filterLearningResources(
  resources: readonly LearningResource[],
  filters: LearningResourceFilters,
): LearningResource[] {
  const role = filters.role ?? "all";
  const source = filters.source ?? "all";
  const format = filters.format ?? "all";
  const level = filters.level ?? "all";
  const step = filters.step ?? "all";
  const query = filters.query?.trim() ?? "";

  return resources.filter((resource) => (
    (role === "all" || resource.roles.includes(role))
    && (source === "all" || resource.source === source)
    && (format === "all" || resource.format === format)
    && (level === "all" || resource.level === level)
    && (step === "all" || resource.steps.includes(step))
    && matchesSearch(query, [
      resource.title,
      resource.summary,
      resource.provider,
      ...resource.roles.map((item) => ROLE_LABELS[item]),
      ...resource.steps.map((item) => PRODUCTION_STEP_LABELS[item]),
    ])
  ));
}

export function rankLearningResources(
  resources: readonly LearningResource[],
  role: LearningRole,
): LearningResource[] {
  return [...resources].sort((left, right) => {
    const score = (resource: LearningResource) => (
      (resource.roles.includes(role) ? 4 : 0)
      + (resource.source === "toonstudio" ? 2 : 0)
      + (resource.verified ? 1 : 0)
      + (resource.practicePath ? 1 : 0)
    );
    return score(right) - score(left) || left.title.localeCompare(right.title, "ko");
  });
}

export function buildYouTubeLearningSearchUrl(query: string): string {
  const normalized = query.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 120);
  const search = normalized ? `웹툰 ${normalized}` : "웹툰 제작 강좌";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`;
}
