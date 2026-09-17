export type LearningResourceCategory =
  | "story"
  | "storyboard"
  | "drawing"
  | "color"
  | "background"
  | "production"
  | "tool";

export type LearningResourceLevel = "starter" | "growing" | "advanced";
export type LearningResourceFormat = "course" | "video" | "article" | "guide" | "practice";
export type LearningResourceAccess = "internal" | "embed" | "link-only" | "metadata-only";
export type LearningResourceProvider = "toonstudio" | "kocca" | "webtoon-academy" | "clip-studio" | "youtube";

export interface LearningResource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly provider: LearningResourceProvider;
  readonly category: LearningResourceCategory;
  readonly level: LearningResourceLevel;
  readonly format: LearningResourceFormat;
  readonly language: "ko" | "en";
  readonly access: LearningResourceAccess;
  readonly href: string;
  readonly practiceHref?: string;
  readonly skills: readonly string[];
  readonly durationLabel?: string;
  readonly verifiedLabel: string;
}
export const LEARNING_RESOURCE_CATEGORY_LABELS: Readonly<Record<LearningResourceCategory, string>> = {
  story: "스토리",
  storyboard: "콘티·연출",
  drawing: "작화",
  color: "채색·빛",
  background: "배경·원근",
  production: "제작 과정",
  tool: "도구·워크플로",
};

export const LEARNING_RESOURCE_PROVIDER_LABELS: Readonly<Record<LearningResourceProvider, string>> = {
  toonstudio: "ToonStudio",
  kocca: "에듀코카",
  "webtoon-academy": "WEBTOON Academy",
  "clip-studio": "CLIP STUDIO TIPS",
  youtube: "YouTube",
};

export const LEARNING_RESOURCE_ACCESS_LABELS: Readonly<Record<LearningResourceAccess, string>> = {
  internal: "자체 콘텐츠",
  embed: "임베드 가능",
  "link-only": "원문 링크",
  "metadata-only": "메타데이터·검색",
};

export const LEARNING_RESOURCES: readonly LearningResource[] = [
  {
    id: "toonstudio-webtoon-process",
    title: "웹툰 제작 과정 한눈에 보기",
    description: "아이디어에서 스토리, 콘티, 작화, 검수, 게시까지 전체 제작 흐름을 먼저 익힙니다.",
    provider: "toonstudio",
    category: "production",
    level: "starter",
    format: "guide",
    language: "ko",
    access: "internal",
    href: "/learn/process",
    practiceHref: "/studio",
    skills: ["제작 파이프라인", "회차 설계", "검수"],
    durationLabel: "10분",
    verifiedLabel: "자체 검수",
  },
  {
    id: "kocca-storyboard",
    title: "웹툰 스토리와 콘티 구성",
    description: "인물·사건·목적을 정리하고 칸의 연결과 콘티 연출을 제작 순서에 맞춰 학습합니다.",
    provider: "kocca",
    category: "storyboard",
    level: "starter",
    format: "course",
    language: "ko",
    access: "link-only",
    href: "https://edu.kocca.kr/edu/onlineEdu/realm/view.do?menuNo=500027&p_subj=CK22022&p_subjseq=0064&p_year=2026",
    practiceHref: "/story-lab",
    skills: ["콘티", "컷 연결", "장면 연출"],
    verifiedLabel: "공공 교육기관 원문",
  },
  {
    id: "kocca-character-design",
    title: "웹툰 캐릭터 디자인 실습",
    description: "아이디어 기획부터 캐릭터 유형, 이야기와의 연결, 스케치와 캐릭터 시트까지 이어지는 실습 과정입니다.",
    provider: "kocca",
    category: "drawing",
    level: "growing",
    format: "course",
    language: "ko",
    access: "link-only",
    href: "https://edu.kocca.kr/edu/onlineEdu/realm/view.do?menuNo=500027&p_subj=CK26002&p_subjseq=0001&p_year=2026",
    practiceHref: "/studio/character",
    skills: ["캐릭터 디자인", "캐릭터 시트", "스토리 연계"],
    verifiedLabel: "공공 교육기관 원문",
  },
  {
    id: "webtoon-academy-resource-library",
    title: "WEBTOON Academy Creator Resources",
    description: "스토리텔링, 캐릭터, 색채, 원근, 피칭과 제작 효율화 자료를 주제별로 찾아볼 수 있는 공식 자료실입니다.",
    provider: "webtoon-academy",
    category: "production",
    level: "growing",
    format: "guide",
    language: "en",
    access: "link-only",
    href: "https://www.webtoons.com/en/creators101/webtoon-academy/resource-list",
    practiceHref: "/studio",
    skills: ["스토리텔링", "작화", "연재 준비"],
    verifiedLabel: "플랫폼 공식 자료",
  },
  {
    id: "clip-studio-tips",
    title: "CLIP STUDIO 공식 제작 팁",
    description: "선화, 채색, 배경, 소재, 만화 제작 도구의 사용법과 작화 기법을 공식 튜토리얼에서 찾아봅니다.",
    provider: "clip-studio",
    category: "tool",
    level: "starter",
    format: "article",
    language: "ko",
    access: "link-only",
    href: "https://tips.clip-studio.com/ko-kr/official",
    practiceHref: "/studio",
    skills: ["디지털 작화", "도구 활용", "워크플로"],
    verifiedLabel: "도구 제작사 공식 자료",
  },
  {
    id: "youtube-storyboard-discovery",
    title: "YouTube · 웹툰 콘티·연출 강좌 찾기",
    description: "공개 영상을 직접 복제하지 않고 YouTube 검색 결과에서 콘티, 컷 분할, 스크롤 연출 강좌를 탐색합니다.",
    provider: "youtube",
    category: "storyboard",
    level: "growing",
    format: "video",
    language: "ko",
    access: "metadata-only",
    href: "https://www.youtube.com/results?search_query=%EC%9B%B9%ED%88%B0+%EC%BD%98%ED%8B%B0+%EC%97%B0%EC%B6%9C+%EA%B0%95%EC%A2%8C",
    practiceHref: "/story-lab",
    skills: ["컷 분할", "스크롤 리듬", "카메라 연출"],
    verifiedLabel: "YouTube 검색 연결",
  },
  {
    id: "youtube-drawing-discovery",
    title: "YouTube · 웹툰 인체·포즈 강좌 찾기",
    description: "인체 비율, 손, 얼굴, 제스처와 과장된 포즈를 다루는 공개 강좌를 YouTube에서 직접 찾아봅니다.",
    provider: "youtube",
    category: "drawing",
    level: "starter",
    format: "video",
    language: "ko",
    access: "metadata-only",
    href: "https://www.youtube.com/results?search_query=%EC%9B%B9%ED%88%B0+%EC%9D%B8%EC%B2%B4+%EB%93%9C%EB%A1%9C%EC%9E%89+%ED%8F%AC%EC%A6%88+%EA%B0%95%EC%A2%8C",
    practiceHref: "/studio/poser",
    skills: ["인체", "제스처", "포즈"],
    verifiedLabel: "YouTube 검색 연결",
  },
  {
    id: "youtube-background-discovery",
    title: "YouTube · 배경·투시 강좌 찾기",
    description: "1·2·3점 투시, 실내외 배경과 카메라 구도를 다루는 공개 강좌를 찾아 Studio에서 바로 실습합니다.",
    provider: "youtube",
    category: "background",
    level: "growing",
    format: "video",
    language: "ko",
    access: "metadata-only",
    href: "https://www.youtube.com/results?search_query=%EC%9B%B9%ED%88%B0+%EB%B0%B0%EA%B2%BD+%ED%88%AC%EC%8B%9C+%EA%B0%95%EC%A2%8C",
    practiceHref: "/studio/poser",
    skills: ["원근", "배경", "카메라 구도"],
    verifiedLabel: "YouTube 검색 연결",
  },
];
export interface LearningResourceFilters {
  readonly query?: string;
  readonly provider?: LearningResourceProvider | "all";
  readonly category?: LearningResourceCategory | "all";
  readonly level?: LearningResourceLevel | "all";
}

export function filterLearningResources(
  resources: readonly LearningResource[],
  filters: LearningResourceFilters,
): LearningResource[] {
  const query = filters.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  return resources.filter((resource) => {
    const haystack = [resource.title, resource.description, ...resource.skills]
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return (!query || haystack.includes(query))
      && (!filters.provider || filters.provider === "all" || resource.provider === filters.provider)
      && (!filters.category || filters.category === "all" || resource.category === filters.category)
      && (!filters.level || filters.level === "all" || resource.level === filters.level);
  });
}

export const ACADEMY_DISCOVERY_CONTRACT = {
  youtube: {
    mode: "server-side-data-api",
    operations: ["search", "playlist-sync", "video-metadata-refresh"],
    refreshWindowDays: 30,
  },
  mcp: {
    server: "academy-content",
    tools: ["search_learning_resources", "find_resources_for_skill", "recommend_next_lesson"],
  },
} as const;
