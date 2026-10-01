import { PRODUCT_TOUR_ASSET } from "./product-tour-asset.generated";

/** 투어 챕터에서 여는 실제 제품 목적지. 모든 href는 등록된 라우트여야 한다(product-tour-content.test). */
export interface ProductTourLink {
  readonly href: string;
  readonly ko: string;
  readonly en: string;
}

/**
 * 장면 이미지의 성격. capture는 영상 제작 시점의 실제 제품 화면 캡처,
 * concept는 기능 구성을 설명하려고 그린 개념 도해·그림이다(화면에 '개념 도해'로 표기한다).
 */
export type ProductTourVisual = "capture" | "concept";

export interface ProductTourChapter {
  readonly start: number;
  readonly end: number;
  readonly id: string;
  readonly image: string;
  readonly visual: ProductTourVisual;
  readonly ko: string;
  readonly en: string;
  readonly summary: { readonly ko: string; readonly en: string };
  /** '이 기능 열기'의 대상. 영상 챕터가 보여 준 화면과 같은 작업공간이어야 한다. */
  readonly feature: ProductTourLink;
  /** 같은 흐름에서 이어서 쓰는 관련 기능. 영상에 직접 나오지 않은 기능은 여기에만 둔다. */
  readonly related: readonly ProductTourLink[];
}

const CHAPTERS = [
  {
    start: 0,
    end: 48,
    id: "overview",
    image: "/brand/product-tour/01-overview.png",
    visual: "capture",
    ko: "툰스튜디오는 무엇인가",
    en: "What ToonStudio is",
    summary: {
      ko: "기획부터 원고 제작, 3D, 검토와 게시 준비까지 하나의 작품 흐름으로 연결하는 브라우저 기반 웹툰 제작 공간입니다.",
      en: "A browser-based webtoon workspace connecting planning, art, 3D, review and publishing preparation around one work.",
    },
    feature: { href: "/studio", ko: "내 작업실", en: "My studio" },
    related: [
      { href: "/about", ko: "서비스 소개", en: "About ToonStudio" },
      { href: "/studio/new?kind=webtoon&template=webtoon-vertical", ko: "새 웹툰 시작", en: "Start a webtoon" },
    ],
  },
  {
    start: 48,
    end: 108,
    id: "plan",
    image: "/brand/product-tour/02-plan.png",
    visual: "capture",
    ko: "아이디어와 기획",
    en: "Ideas and planning",
    summary: {
      ko: "세계관, 인물, 욕망과 장애물, 회차와 장면 목적을 정리해 다음 제작 단계가 무엇을 그려야 하는지 분명하게 만듭니다.",
      en: "Shape worlds, characters, conflicts, episodes and scene intent so the next production step has clear context.",
    },
    feature: { href: "/story-lab", ko: "스토리 연구실", en: "Story Lab" },
    related: [
      { href: "/studio/assets/characters/new", ko: "캐릭터 만들기", en: "Create a character" },
      { href: "/about/workflow", ko: "웹툰 제작 과정", en: "Webtoon workflow" },
    ],
  },
  {
    start: 108,
    end: 174,
    id: "draw",
    image: "/brand/product-tour/03-draw.png",
    visual: "capture",
    ko: "드로잉과 브러시",
    en: "Drawing and brushes",
    summary: {
      ko: "캔버스를 중심에 두고 브러시, 레이어, 선택, 질감, 필터와 보정을 가까운 작업 흐름에서 다룹니다.",
      en: "Keep the canvas central while brushes, layers, selection, texture, filters and corrections stay close to the work.",
    },
    feature: { href: "/studio/canvas", ko: "빈 캔버스에 바로 그리기", en: "Draw on a blank canvas" },
    related: [
      { href: "/studio/assets/brushes/new", ko: "브러시 만들기", en: "Create a brush" },
      { href: "/studio/assets", ko: "소재 라이브러리", en: "Asset library" },
    ],
  },
  {
    start: 174,
    end: 228,
    id: "comic",
    // 컷툰 편집기 캡처가 준비될 때까지 컷 구성 개념 그림을 쓰고 개념 도해로 표기한다.
    image: "/brand/workflow-20260928/storyboard-960.webp",
    visual: "concept",
    ko: "컷과 말풍선",
    en: "Panels and dialogue",
    summary: {
      ko: "컷 분할, 대사, 말풍선과 장면 리듬을 원고 문맥 안에서 다듬어 한 장면을 읽히는 이야기로 이어갑니다.",
      en: "Refine panels, dialogue, balloons and scene rhythm inside the manuscript context to turn scenes into readable storytelling.",
    },
    feature: { href: "/studio/comic", ko: "컷툰 편집기", en: "Comic editor" },
    related: [
      { href: "/studio/new?kind=webtoon&template=webtoon-vertical", ko: "세로 웹툰 시작", en: "Start a vertical webtoon" },
    ],
  },
  {
    start: 228,
    end: 300,
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    visual: "capture",
    ko: "캐릭터·포즈·3D 장면",
    en: "Characters, posing and 3D",
    summary: {
      ko: "캐릭터 포즈, 배경, 카메라와 공간을 구성해 어려운 구도를 탐색하고 현재 컷의 2D 제작으로 다시 연결합니다.",
      en: "Explore difficult compositions with character poses, environments, cameras and space, then return that context to 2D production.",
    },
    feature: { href: "/studio/bg3d", ko: "3D 배경 스튜디오", en: "3D background studio" },
    related: [
      { href: "/studio/assets/characters/new", ko: "3D 캐릭터", en: "3D characters" },
      { href: "/studio/poser", ko: "포즈 스튜디오", en: "Pose studio" },
    ],
  },
  {
    start: 300,
    end: 354,
    id: "assist",
    image: "/brand/product-tour/06-ai.png",
    visual: "capture",
    ko: "AI 보조와 반복 작업",
    en: "AI assistance and repetition",
    summary: {
      ko: "개인 Creator Runtime과 생성 도구를 반복 작업과 아이디어 탐색에 활용하되 결과 검토와 최종 선택은 창작자가 유지합니다.",
      en: "Use creator-controlled runtime and generation tools for repetition and exploration while keeping review and final decisions with the creator.",
    },
    feature: { href: "/studio/ai-lab", ko: "AI 변환실", en: "AI lab" },
    related: [
      { href: "/studio/ai-settings", ko: "AI 설정", en: "AI settings" },
    ],
  },
  {
    start: 354,
    end: 420,
    id: "production",
    image: "/brand/product-tour/07-production.png",
    visual: "capture",
    ko: "프로젝트·협업·검토",
    en: "Projects, collaboration and review",
    summary: {
      ko: "담당자, 제작 상태, 수정 요청, 변경 이력과 검토를 실제 작업물에 연결해 파일 전달만으로 생기는 누락을 줄입니다.",
      en: "Connect owners, production state, revision requests, history and review to the actual work instead of relying on file handoffs alone.",
    },
    feature: { href: "/production", ko: "제작 관리", en: "Production" },
    related: [
      { href: "/production/projects/sample-project/overview", ko: "샘플 프로젝트 체험", en: "Try a sample project" },
      { href: "/studio/space", ko: "가상 스튜디오", en: "Virtual studio" },
      { href: "/collaborate", ko: "구인·의뢰", en: "Find collaborators" },
    ],
  },
  {
    start: 420,
    end: 468,
    id: "learn",
    image: "/brand/product-tour/08-learn.png",
    visual: "capture",
    ko: "학습·소재·사운드",
    en: "Learning, assets and sound",
    summary: {
      ko: "웹툰 제작 강좌와 레퍼런스, 소재 마켓과 오디오 작업을 제작 도구 가까이에 두어 막힌 단계에서 바로 다음 행동을 찾습니다.",
      en: "Keep webtoon lessons, references, assets and audio close to production so the next useful action is available when work stalls.",
    },
    feature: { href: "/learn", ko: "배우기", en: "Learn" },
    related: [
      { href: "/studio/assets", ko: "소재 라이브러리", en: "Asset library" },
      { href: "/studio/assets/audio", ko: "오디오 에셋", en: "Audio assets" },
    ],
  },
  {
    start: 468,
    end: 504,
    id: "finish",
    image: "/brand/product-tour/09-publish.png",
    visual: "capture",
    ko: "검사·내보내기·게시 준비",
    en: "Validate, export and prepare to publish",
    summary: {
      ko: "완성 원고의 규격과 게시 설정을 확인하고 내보내기와 게시 준비까지 같은 작품의 마지막 단계로 이어갑니다.",
      en: "Validate the finished manuscript and publishing settings, then carry the same work through export and publishing preparation.",
    },
    feature: { href: "/studio/publish", ko: "검수·내보내기", en: "Review & export" },
    related: [
      { href: "/community", ko: "커뮤니티에 공유", en: "Share in the community" },
    ],
  },
] as const satisfies readonly ProductTourChapter[];

export const PRODUCT_TOUR = {
  src: PRODUCT_TOUR_ASSET.src,
  bytes: PRODUCT_TOUR_ASSET.bytes,
  revision: PRODUCT_TOUR_ASSET.revision,
  poster: "/brand/toonstudio-product-tour-poster.jpg",
  captionsKo: "/brand/toonstudio-product-tour.ko.vtt",
  captionsEn: "/brand/toonstudio-product-tour.en.vtt",
  duration: 504,
  fps: 30,
  chapters: CHAPTERS,
} as const;

export type ProductTourLocale = "ko" | "en";

/** 투어 링크의 공유 가능한 딥링크(재생은 사용자가 포스터를 눌렀을 때만 시작한다). */
export function productTourChapterHref(start: number): string {
  return `/product-tour?t=${Math.max(0, Math.floor(start))}#product-tour-video`;
}

export function formatProductTourTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export const PRODUCT_TOUR_COPY = {
  ko: {
    pageTitle: "툰스튜디오 전체 제품 투어",
    metaDescription: "기획, 드로잉, 컷 연출, 3D, AI 보조, 협업, 학습과 게시 준비까지 툰스튜디오 전체 창작 흐름을 8분대 Remotion 제품 투어와 실제 제품 화면으로 살펴보세요.",
    eyebrow: "PRODUCT TOUR · 8:24",
    title: ["아이디어에서 연재 준비까지,", "8분 안에 한눈에."],
    intro: "실제 제작 순서대로 기획·드로잉·컷 연출·3D·AI 보조·협업·게시 준비를 9개 챕터로 보여 드립니다. 챕터마다 해당 기능을 바로 열 수 있어요.",
    watch: "제품 투어 재생",
    start: "새 작품 시작하기",
    facts: ["8분 24초", "9개 제작 챕터", "한국어 내레이션 · 오리지널 OST", "한·영 자막"],
    factsLabel: "제품 투어 정보",
    videoEyebrow: "WATCH THE TOUR",
    videoTitle: "보고 싶은 장면부터, 바로 그 기능까지.",
    videoBody: "챕터를 누르면 그 장면부터 재생되고, 지금 보는 장면의 기능을 곧바로 열 수 있습니다.",
    audioNote: "합성 음성으로 제작한 한국어 내레이션과 툰스튜디오 오리지널 BGM이 포함되어 있습니다. 한·영 자막을 선택할 수 있습니다.",
    transcript: "챕터별 전체 내용 읽기",
    visualOpen: "이 기능 열기",
    watchScene: "이 장면부터 보기",
    nowPlaying: "지금 보는 장면",
    upNext: "다음 장면",
    related: "함께 쓰는 기능",
    chaptersLabel: "제품 투어 챕터",
    keyboardHint: "키보드: Space 재생·정지 · ← → 챕터 이동 · F 전체화면 · C 자막",
    featuresEyebrow: "OPEN WHAT YOU SAW",
    featuresTitle: "영상 속 기능, 바로 열어 보세요.",
    featuresBody: "각 챕터의 기능으로 곧장 들어가거나 그 장면부터 다시 볼 수 있습니다. 카드 이미지는 대부분 영상 제작 시점의 제품 화면 캡처이며, '개념 도해'로 표시한 카드는 기능 구성을 설명하는 그림입니다.",
    captureBadge: "제품 화면 캡처",
    conceptBadge: "개념 도해",
    rolesEyebrow: "BUILT AROUND YOUR ROLE",
    rolesTitle: "같은 작품을 공유하되, 역할마다 시작점은 다르게.",
    rolesBody: "글작가, 그림작가, 어시스턴트·3D 작업자, 프로듀서가 한 프로젝트를 공유하면서도 각자 필요한 도구와 상태에 집중할 수 있는 흐름을 지향합니다.",
    closingEyebrow: "CREATE YOUR NEXT STORY",
    closingTitle: "이제 한 장면을 직접 만들어 보세요.",
    closingBody: "빈 프로젝트에서 시작해도 되고, 스토리·드로잉·3D·협업 중 지금 필요한 곳부터 들어가도 됩니다.",
    brandFilm: "24초 브랜드 필름",
  },
  en: {
    pageTitle: "ToonStudio full product tour",
    metaDescription: "Explore ToonStudio's complete creative flow—from planning and drawing to panels, 3D, AI assistance, production, learning and publishing—in an 8-minute Remotion product tour using real product screens.",
    eyebrow: "PRODUCT TOUR · 8:24",
    title: ["From the first idea to publishing,", "the whole studio in 8 minutes."],
    intro: "Follow the real production order—planning, drawing, panels, 3D, AI assistance, collaboration and publishing—across nine chapters. Every chapter opens the matching workspace.",
    watch: "Play the product tour",
    start: "Start a new work",
    facts: ["8m 24s", "9 production chapters", "Korean narration · original OST", "KO · EN captions"],
    factsLabel: "Product tour facts",
    videoEyebrow: "WATCH THE TOUR",
    videoTitle: "Start from any scene, then open that feature.",
    videoBody: "Choose a chapter to play from that scene, and open the workspace you are watching right away.",
    audioNote: "Includes synthesized Korean narration and ToonStudio original background music. Korean and English captions are available.",
    transcript: "Read the chapter-by-chapter outline",
    visualOpen: "Open this feature",
    watchScene: "Watch this scene",
    nowPlaying: "Now showing",
    upNext: "Up next",
    related: "Works well with",
    chaptersLabel: "Product tour chapters",
    keyboardHint: "Keyboard: Space play/pause · ← → chapters · F fullscreen · C captions",
    featuresEyebrow: "OPEN WHAT YOU SAW",
    featuresTitle: "Open the features from the film.",
    featuresBody: "Open each chapter's feature directly or replay that scene. Most card images are product captures from when the tour was produced; cards marked 'Concept illustration' explain the feature with a drawing.",
    captureBadge: "Product capture",
    conceptBadge: "Concept illustration",
    rolesEyebrow: "BUILT AROUND YOUR ROLE",
    rolesTitle: "Share one work while each role starts in the right place.",
    rolesBody: "Writers, artists, assistants and 3D creators, and producers can share one project while staying focused on the tools and states relevant to their role.",
    closingEyebrow: "CREATE YOUR NEXT STORY",
    closingTitle: "Now make one scene yourself.",
    closingBody: "Start with a blank project or jump directly into story, drawing, 3D or collaboration—wherever your current work begins.",
    brandFilm: "24-second brand film",
  },
} as const;

export const PRODUCT_ROLES = [
  { tag: "WRITER", href: "/story-lab", ko: ["글작가", "세계관과 에피소드, 장면 목적과 대사를 정리하고 그림 제작 단계가 필요한 문맥을 전달합니다."], en: ["Writer", "Shape the world, episode, scene intent and dialogue, then pass the right context into visual production."] },
  { tag: "ARTIST", href: "/studio", ko: ["그림작가", "드로잉·컷 구성·보정에 집중하고 필요할 때 3D, 소재와 레퍼런스를 현재 장면에 연결합니다."], en: ["Artist", "Focus on drawing, panel construction and finishing, bringing in 3D, assets and references when the scene needs them."] },
  { tag: "ASSIST", href: "/studio/bg3d", ko: ["어시·3D 작업자", "배경, 포즈, 소재와 반복 제작을 담당하면서 어떤 컷과 작업 단계에 필요한 산출물인지 함께 확인합니다."], en: ["Assistant / 3D creator", "Handle environments, posing, assets and repeatable work with clear context about the panel and production stage being supported."] },
  { tag: "PRODUCER", href: "/production", ko: ["프로듀서·팀", "진행 상태, 담당자, 리뷰, 수정 요청과 납품 준비를 확인해 제작 병목과 누락을 줄입니다."], en: ["Producer / team", "Track status, owners, review, revisions and delivery readiness to reduce bottlenecks and missed handoffs."] },
] as const;
