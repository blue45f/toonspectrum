export type CampusDistrictId = "plaza" | "atelier" | "production" | "market" | "library" | "gallery" | "academy" | "observatory" | "service";
export type CampusMode = "scene" | "task" | "focus";
export type CampusSurface = "room" | "native" | "focus" | "protected";
export interface CampusText { readonly ko: string; readonly en: string }
export interface CampusDestination {
  readonly id: string;
  readonly label: CampusText;
  readonly href: string;
}
export interface CampusDistrict {
  readonly id: CampusDistrictId;
  readonly label: CampusText;
  readonly description: CampusText;
  readonly href: string;
  readonly zone: string;
  readonly artworkUrl: string;
  readonly destinations: readonly CampusDestination[];
}
export interface CampusBinding {
  readonly routeId: string;
  readonly districtId: CampusDistrictId;
  readonly surface: CampusSurface;
  readonly private: boolean;
}
const text = (ko: string, en: string): CampusText => ({ ko, en });
const destination = (id: string, ko: string, en: string, href: string): CampusDestination => ({ id, label: text(ko, en), href });
export const CAMPUS_DISTRICTS: readonly CampusDistrict[] = [
  { id: "plaza", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-ferris-wheel-vertical-depth/background.png", label: text("중앙 광장", "Central plaza"), description: text("만들고, 찾고, 만나고, 쉬는 창작 세계", "Create, discover, connect and unwind"), href: "/hub", zone: "lounge", destinations: [
    destination("explore", "둘러보기", "Explore", "/hub"), destination("events", "행사 안내판", "Events", "/events"), destination("opportunities", "창작 기회", "Opportunities", "/opportunities"),
  ] },
  { id: "atelier", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-research-lab-vertical-depth/background.png", label: text("내 아틀리에", "My atelier"), description: text("내 작품과 원고를 이어가는 작업실", "Your work, materials and manuscripts"), href: "/home", zone: "drawing", destinations: [
    destination("works", "작품 선반", "My works", "/studio"), destination("new", "새 작품", "New work", "/studio/new"), destination("assets", "내 소재장", "My materials", "/studio/assets"), destination("import", "파일 가져오기", "Import", "/studio/import"),
  ] },
  { id: "production", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-boardroom-vertical-depth/background.png", label: text("제작관·팀 작업실", "Production & team"), description: text("기획부터 검수와 전달까지 같은 작품으로", "Plan, review and deliver the same work"), href: "/production", zone: "writers", destinations: [
    destination("team", "팀 작업실", "Team room", "/team"), destination("production", "제작 보드", "Production board", "/production"), destination("collaborate", "모집 게시판", "Collaboration", "/collaborate"), destination("organizations", "팀 조직", "Workspaces", "/production/workspaces"),
  ] },
  { id: "market", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-cyber-alley-vertical-depth/background.png", label: text("소재 거리", "Materials street"), description: text("찾고, 시험하고, 내 작업에 가져오는 재료", "Discover, try and use materials"), href: "/market", zone: "assets", destinations: [
    destination("browse", "소재 진열대", "Browse materials", "/market/browse"), destination("fit", "체험 공방", "Try materials", "/market/fit"), destination("compare", "비교 테이블", "Compare", "/market/compare"), destination("library", "내 보관함", "My library", "/market/library"), destination("wishlist", "위시 노트", "Wishlist", "/market/wishlist"), destination("publish", "출품 데스크", "Publish material", "/market/publish"), destination("manage", "제작자 운영실", "Manage materials", "/market/manage"),
  ] },
  { id: "library", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-cherry-path-vertical-depth/background.png", label: text("이야기 도서관", "Story library"), description: text("작품·작가·출처 있는 참고자료", "Stories, creators and sourced references"), href: "/discover", zone: "writers", destinations: [
    destination("search", "검색대", "Search", "/search"), destination("ranking", "인기 서가", "Rankings", "/ranking"), destination("research", "리서치 데스크", "Research", "/research"), destination("library", "내 감상 서재", "Reading library", "/library"), destination("calendar", "연재 달력", "Release calendar", "/calendar"), destination("insights", "트렌드 보드", "Insights", "/insights"),
  ] },
  { id: "gallery", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/wuxia/gpt25-bg-wuxia-traditional-market-vertical-depth/background.png", label: text("전시관·창작자 카페", "Gallery & creator cafe"), description: text("공개한 작품과 창작 경험을 나누는 곳", "Published works and creative conversations"), href: "/showcase", zone: "review", destinations: [
    destination("showcase", "작품 전시", "Showcase", "/showcase"), destination("community", "창작자 카페", "Community", "/community"), destination("challenges", "챌린지", "Challenges", "/showcase/challenges"), destination("creators", "창작자 만나기", "Meet creators", "/creators"), destination("publish", "작품 소개하기", "Publish a showcase", "/community/promote/new"),
  ] },
  { id: "academy", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/action/gpt25-bg-action-jungle-temple-vertical-depth/background.png", label: text("배움터·실험실", "Academy & laboratory"), description: text("예제와 실습에서 내 창작으로", "From lessons and practice to your own work"), href: "/learn", zone: "storyboard", destinations: [
    destination("learn", "배움터", "Learn", "/learn"), destination("recipes", "실습 교본", "Recipes", "/learn/recipes"), destination("manual", "제작 가이드", "Manual", "/studio/manual"), destination("ai", "개인 AI 실험실", "Personal AI lab", "/studio/ai-lab"), destination("trace", "따라 그리기", "Trace practice", "/learn/trace"), destination("tools", "제작 도구", "Toolchain", "/studio/toolchain"),
  ] },
  { id: "observatory", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/fantasy/gpt25-bg-fantasy-dragon-cliff-vertical-depth/background.png", label: text("별빛 관측소", "Starlight observatory"), description: text("카드·전통·상징을 즐기는 나만의 시간", "Your private time with cards and symbolism"), href: "/fortune", zone: "lounge", destinations: [
    destination("tarot", "타로 테이블", "Tarot table", "/fortune?content=tarot"), destination("saju", "역법 서가", "Traditional readings", "/fortune?content=saju"), destination("lucky", "팔레트 정원", "Palette garden", "/fortune?content=lucky"), destination("rest", "쉼의 테라스", "Quiet terrace", "/fortune?content=rest"), destination("play", "놀이터", "Playground", "/play"),
  ] },
  { id: "service", artworkUrl: "/assets/studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-bedroom-night-vertical-depth/background.png", label: text("안내·설정관", "Help & settings"), description: text("내 환경과 데이터, 사용 도움말", "Your preferences, data and help"), href: "/help", zone: "assistant", destinations: [
    destination("help", "안내 데스크", "Help desk", "/help"), destination("settings", "개인 설정실", "Preferences", "/settings"), destination("account", "내 계정", "My account", "/my"), destination("terms", "정책 열람실", "Policies", "/terms"),
  ] },
];
export function campusDistrict(id: CampusDistrictId): CampusDistrict {
  return CAMPUS_DISTRICTS.find((district) => district.id === id)!;
}
