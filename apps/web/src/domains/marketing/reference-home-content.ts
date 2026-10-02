/**
 * 공개 홈(/)의 시작 동선·예시·핵심 작업실 데이터.
 * 모든 href는 실제 등록 라우트여야 한다(marketing-destinations.test).
 */
export const HOME_ART_ROOT = "/brand/illustrated-20260928";

export interface HomeLink {
  readonly href: string;
  readonly ko: string;
  readonly en: string;
}

export const HOME_QUICK_STARTS = [
  { href: "/studio/new?kind=webtoon&template=webtoon-vertical", ko: "새 웹툰 시작하기", en: "Create a webtoon", detailKo: "첫 컷부터 나의 이야기", detailEn: "Your first panel", image: "storyboard" },
  { href: "/story-lab", ko: "스토리 만들기", en: "Shape a story", detailKo: "아이디어를 대본으로", detailEn: "Ideas into scripts", image: "character-blue" },
  { href: "/studio/assets/characters/new", ko: "캐릭터 만들기", en: "Create a character", detailKo: "3D 프리셋으로 표정·포즈", detailEn: "3D presets, poses and faces", image: "character-pink" },
  { href: "/studio/bg3d", ko: "배경 만들기", en: "Build a world", detailKo: "장면을 완성하는 3D 공간", detailEn: "3D spaces for your scenes", image: "background-city" },
  { href: "/studio/canvas", ko: "빈 캔버스", en: "Blank canvas", detailKo: "지금 바로 그리기", detailEn: "Start drawing now", image: "blank-canvas" },
] as const;

/** 예시 작품 선반. 실제 사용자 프로젝트가 아니므로 화면에 '예시'로 표기한다. 회차·날짜 메타도 예시 표기다. */
export const HOME_EXAMPLES = [
  { image: "canvas-noir", ko: "회색의 도시", en: "City in grey", metaKo: "12화 · 어제 업데이트", metaEn: "Ep. 12 · Updated yesterday" },
  { image: "character-pink", ko: "다시, 봄", en: "Spring, again", metaKo: "8화 · 3일 전", metaEn: "Ep. 8 · 3 days ago" },
  { image: "project-romance", ko: "너에게 닿는 밤", en: "A night with you", metaKo: "21화 · 1주 전", metaEn: "Ep. 21 · 1 week ago" },
  { image: "character-blue", ko: "푸른 계절", en: "Blue season", metaKo: "5화 · 2주 전", metaEn: "Ep. 5 · 2 weeks ago" },
  { image: "project-crimson", ko: "붉은 기억", en: "Crimson memories", metaKo: "17화 · 3주 전", metaEn: "Ep. 17 · 3 weeks ago" },
] as const;

export const HOME_EDITOR_FRAMES = ["canvas-noir", "project-romance", "character-blue", "project-crimson", "background-city"] as const;

/** Luna 안내 캐릭터의 제안. 대화형 AI가 아니라 실제 도구로 가는 바로가기다. */
export const HOME_LUNA_SUGGESTIONS = [
  { href: "/story-lab", ko: "스토리 아이디어 정리", en: "Shape a story idea", icon: "story" },
  { href: "/studio/assets/characters/new", ko: "캐릭터 설정 만들기", en: "Design a character", icon: "character" },
  { href: "/studio/bg3d", ko: "장면 구도를 3D로 잡기", en: "Block a scene in 3D", icon: "scene" },
  { href: "/studio/ai-lab", ko: "AI 창작 도구 살펴보기", en: "Explore AI tools", icon: "ai" },
] as const;

export type HomeCoreStudioId = "drawing" | "three-d" | "collaboration" | "virtual-studio";

export interface HomeCoreStudio {
  readonly id: HomeCoreStudioId;
  readonly href: string;
  readonly image: string;
  readonly imageSet: string;
  readonly eyebrow: string;
  readonly ko: { readonly title: string; readonly body: string; readonly action: string };
  readonly en: { readonly title: string; readonly body: string; readonly action: string };
  readonly secondary: HomeLink;
}

/** 세미나에서 가장 중요한 네 작업실(드로잉·3D·협업·가상 스튜디오)의 직행 입구. */
export const HOME_CORE_STUDIOS: readonly HomeCoreStudio[] = [
  {
    id: "drawing",
    href: "/studio/canvas",
    image: `${HOME_ART_ROOT}/canvas-noir-640.webp`,
    imageSet: `${HOME_ART_ROOT}/canvas-noir-320.webp 320w, ${HOME_ART_ROOT}/canvas-noir-640.webp 640w`,
    eyebrow: "DRAW",
    ko: { title: "드로잉 캔버스", body: "브러시·레이어·컷·말풍선을 한 캔버스에서.", action: "그리기 시작" },
    en: { title: "Drawing canvas", body: "Brushes, layers, panels and balloons on one canvas.", action: "Start drawing" },
    secondary: { href: "/studio/comic", ko: "컷툰 편집기", en: "Comic editor" },
  },
  {
    id: "three-d",
    href: "/studio/assets/characters/new",
    image: `${HOME_ART_ROOT}/character-pink-640.webp`,
    imageSet: `${HOME_ART_ROOT}/character-pink-320.webp 320w, ${HOME_ART_ROOT}/character-pink-640.webp 640w`,
    eyebrow: "3D",
    ko: { title: "3D 캐릭터·배경", body: "프리셋 캐릭터와 3D 배경으로 포즈와 구도를 잡아요.", action: "3D 캐릭터 만들기" },
    en: { title: "3D characters & sets", body: "Pose preset characters and frame 3D backgrounds.", action: "Create a 3D character" },
    secondary: { href: "/studio/bg3d", ko: "3D 배경 스튜디오", en: "3D background studio" },
  },
  {
    id: "collaboration",
    href: "/production",
    image: "/brand/workflow-20260928/collaborate-640.webp",
    imageSet: "/brand/workflow-20260928/collaborate-320.webp 320w, /brand/workflow-20260928/collaborate-640.webp 640w",
    eyebrow: "TEAM",
    ko: { title: "협업 제작 관리", body: "담당자·마감·검토·수정 요청을 작품 단위로 관리해요.", action: "제작 관리 열기" },
    en: { title: "Team production", body: "Owners, deadlines, reviews and revisions per work.", action: "Open production" },
    secondary: { href: "/production/projects/sample-project/overview", ko: "샘플 프로젝트 체험", en: "Try a sample project" },
  },
  {
    id: "virtual-studio",
    href: "/studio/space",
    image: "/assets/virtual-studio/cinematic-v9/campus-social-480.webp",
    imageSet: "/assets/virtual-studio/cinematic-v9/campus-social-480.webp 480w, /assets/virtual-studio/cinematic-v9/campus-social-1024.webp 1024w",
    eyebrow: "SPACE",
    ko: { title: "가상 스튜디오", body: "내 캐릭터로 걷고 만나며 함께 작업하는 공간.", action: "가상 스튜디오 입장" },
    en: { title: "Virtual studio", body: "Walk, meet and work together as your character.", action: "Enter the virtual studio" },
    secondary: { href: "/collaborate", ko: "함께할 사람 찾기", en: "Find collaborators" },
  },
];

/**
 * 서비스 소개의 정본 순서. 홈 '더 알아보기', /about 안내 카드 번호, 각 소개 페이지의 이전·다음이 모두 이 순서를 따른다.
 * (marketing-destinations.test가 순서를 확인한다.)
 */
export const ABOUT_JOURNEY = [
  { href: "/about", ko: "서비스 소개", en: "About ToonStudio" },
  { href: "/about/studio", ko: "작업실 둘러보기", en: "Tour the studio" },
  { href: "/about/workflow", ko: "웹툰 제작 과정", en: "Webtoon workflow" },
  { href: "/about/technology", ko: "기술과 신뢰", en: "Technology & trust" },
  { href: "/about/principles", ko: "제품 원칙", en: "Product principles" },
] as const satisfies readonly HomeLink[];

export type AboutJourneyHref = (typeof ABOUT_JOURNEY)[number]["href"];

/** 소개 페이지 이전·다음 카드의 한 줄 설명. 순서와 이름은 ABOUT_JOURNEY가 정한다. */
export const ABOUT_JOURNEY_DETAILS: Readonly<Record<AboutJourneyHref, { readonly ko: string; readonly en: string }>> = {
  "/about": { ko: "ToonStudio가 잇는 창작 흐름 한눈에", en: "The connected creative flow at a glance" },
  "/about/studio": { ko: "작업실 화면 구성과 시작 동선", en: "How the studio screens fit together" },
  "/about/workflow": { ko: "기획부터 연재까지 일곱 단계", en: "Seven stages from planning to release" },
  "/about/technology": { ko: "브라우저 작업실이 작품을 지키는 방식", en: "How the browser studio protects the work" },
  "/about/principles": { ko: "창작 흐름·권리·AI·접근성 기준", en: "Creative flow, rights, AI and accessibility" },
};

/**
 * 처음 방문·발표 시연 동선: 홈 → 서비스 소개 → 제품 투어 → 첫 작품 시작.
 * 각 단계 페이지 끝의 '다음' 버튼이 이 순서를 따른다(marketing-destinations.test).
 */
export const SERVICE_FLOW = [
  { id: "home", href: "/", ko: "홈", en: "Home" },
  { id: "about", href: "/about", ko: "서비스 소개", en: "About" },
  { id: "tour", href: "/product-tour", ko: "8분 제품 투어", en: "8-minute tour" },
  { id: "start", href: "/studio/new", ko: "첫 작품 시작", en: "Start creating" },
] as const satisfies readonly (HomeLink & { readonly id: string })[];

export type ServiceFlowStep = (typeof SERVICE_FLOW)[number]["id"];

/** 홈 하단 '더 알아보기' — 소개 흐름을 정본 순서로 보여 주고 영상 두 편을 덧붙인다. */
export const HOME_LEARN_MORE: readonly HomeLink[] = [
  ...ABOUT_JOURNEY,
  { href: "/product-tour", ko: "8분 제품 투어", en: "8-minute product tour" },
  { href: "/brand-film", ko: "24초 브랜드 필름", en: "24-second brand film" },
];

export function homeArt(name: string, width: 320 | 640): string {
  return `${HOME_ART_ROOT}/${name}-${width}.webp`;
}
