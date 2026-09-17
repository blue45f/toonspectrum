import {
  BookOpen,
  Database,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_UTILITY_NAVIGATION,
  type SiteNavigationText,
} from "@/shared/components/site-navigation";
import {
  primarySiteRouteAuthority,
  type SitePrimaryRouteId,
} from "@/shared/lib/site-route-authority";

interface ExtendedDestination {
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
}

interface ExtendedDestinationGroup {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly items: readonly ExtendedDestination[];
}

const destination = (
  href: string,
  ko: string,
  en: string,
  koDescription: string,
  enDescription: string,
): ExtendedDestination => ({
  href,
  label: { ko, en },
  description: { ko: koDescription, en: enDescription },
});

const authorityDestination = (id: SitePrimaryRouteId): ExtendedDestination => {
  const definition = primarySiteRouteAuthority(id);
  return destination(
    definition.canonicalPath,
    definition.label.ko,
    definition.label.en,
    definition.description.ko,
    definition.description.en,
  );
};

export const PERSONAL_DESTINATIONS = [
  {
    id: "profile-account",
    href: "/me",
    icon: UserRound,
    label: { ko: "프로필·계정", en: "Profile & account" },
    description: {
      ko: "프로필과 계정 정보, 내 활동 관리",
      en: "Manage your profile, account details and activity",
    },
  },
  {
    id: "messages",
    href: "/messages",
    icon: MessageCircle,
    label: { ko: "쪽지", en: "Messages" },
    description: {
      ko: "회원 간 쪽지와 받은 요청 확인",
      en: "Review member messages and incoming requests",
    },
  },
  {
    id: "messages-new",
    href: "/messages/new",
    icon: MessageCircle,
    label: { ko: "새 쪽지", en: "New message" },
    description: {
      ko: "회원에게 새 쪽지 또는 대화 요청 보내기",
      en: "Send a new message or conversation request",
    },
  },
  ...SITE_UTILITY_NAVIGATION,
] as const;

/**
 * Canonical user-facing destinations only. Dynamic detail pages, administrator and authentication
 * routes, redirect aliases, Studio companion windows and unfinished placeholders stay out of the
 * public directory.
 */
export const SITEMAP_EXTENDED_DESTINATION_GROUPS: readonly ExtendedDestinationGroup[] = [
  {
    id: "studio-workspaces",
    icon: Wrench,
    label: { ko: "Studio 작업공간", en: "Studio workspaces" },
    description: {
      ko: "드로잉·애니메이션·3D·게시까지 직접 여는 제작 화면",
      en: "Open drawing, animation, 3D and publishing workspaces directly",
    },
    items: [
      authorityDestination("production"),
      authorityDestination("studio-home"),
      authorityDestination("studio-new"),
      authorityDestination("studio-assets"),
      destination(
        "/market",
        "소재 마켓",
        "Materials market",
        "호환성과 사용 권리를 확인하고 새 에셋 탐색",
        "Discover assets with compatibility and rights information",
      ),
      destination("/studio/projects", "프로젝트 목록", "Project list", "기존 프로젝트를 찾아 이어서 작업", "Find an existing project and continue your work"),
      destination("/studio/comic", "웹툰 만들기", "Create a webtoon", "컷·말풍선·대사를 한 화면에서 구성", "Arrange panels, balloons and dialogue in one workspace"),
      destination("/studio/assets/characters/new", "캐릭터 만들기", "Create a character", "캐릭터·표정·포즈와 3D 참고 제작", "Build characters, expressions, poses and 3D references"),
      destination("/studio/animation", "애니메이션 작업실", "Animation workspace", "프레임과 움직임을 편집", "Edit frames and motion"),
      destination("/studio/brushes", "Studio 브러시", "Studio brushes", "작업 중 브러시를 선택하고 조정", "Choose and tune brushes while editing"),
      destination("/studio/bg3d", "3D 배경", "3D backgrounds", "장면 배경과 카메라 구도 설계", "Build scene backgrounds and camera composition"),
      destination("/studio/poser", "포즈 스튜디오", "Pose studio", "인체 포즈와 구도 참고 만들기", "Create pose and composition references"),
      destination("/studio/character", "캐릭터 작업실", "Character workspace", "캐릭터 외형·표정·자세 제작", "Build character looks, expressions and poses"),
      destination("/studio/3d/dcc/model", "3D 모델링", "3D modeling", "메시를 만들고 편집하는 기본 작업 모드", "Create and edit meshes in the core modeling mode"),
      destination("/studio/3d/dcc/build", "3D 공간 제작", "3D environment build", "방·배경·공간 구조 제작", "Build rooms, backgrounds and spatial structures"),
      destination("/studio/3d/dcc/cad", "정밀 CAD", "Precision CAD", "치수 기반 솔리드와 소품 설계", "Design dimensioned solids and props"),
      destination("/studio/3d/dcc/sculpt", "3D 조형", "3D sculpting", "브러시로 형태와 디테일 조형", "Sculpt forms and detail with brushes"),
      destination("/studio/3d/dcc/material", "재질·UV", "Materials & UV", "표면 재질과 UV 구성", "Build surface materials and UV layouts"),
      destination("/studio/3d/dcc/shot", "컷·선화", "Shot & line art", "카메라 컷과 비사실 렌더 설계", "Design camera shots and non-photoreal rendering"),
      destination("/studio/lift3d", "2D → 3D 변환", "2D to 3D lift", "이미지 소재를 3D 장면으로 확장", "Lift image subjects into 3D scenes"),
      destination("/studio/storyworld", "스토리월드", "Storyworld", "인물·장소·설정의 관계 정리", "Organize characters, locations and story relationships"),
      authorityDestination("studio-publish"),
      destination("/studio/manual", "Studio 사용 설명서", "Studio manual", "도구·작업 흐름·문제 해결 안내", "Learn tools, workflows and troubleshooting"),
      destination("/studio/generate", "생성 도구 연결", "Generation tools", "생성 기능의 연결 상태와 사용 조건 확인", "Review generation availability and requirements"),
      destination("/studio/toolchain", "제작 도구", "Production tools", "효과·OCR·영상·3D·출판 흐름 연결", "Connect effects, OCR, media, 3D and publishing workflows"),
      destination("/studio/engines", "설치·라이선스", "Engines & licenses", "외부 실행기 설치와 사용 조건 확인", "Review local engines and license boundaries"),
      destination("/studio/jobs", "처리 중 작업", "Production jobs", "무거운 제작 작업과 결과 영수증 관리", "Manage production jobs and result receipts"),
      destination("/studio/ai-lab", "AI 실험실", "AI lab", "사용자 키로 창작 추론 작업 실행", "Run creator-funded inference workflows"),
      destination("/studio/ai-runtime", "개인 AI 런타임", "Personal AI runtime", "직접 운영하는 추론 서버 연결", "Connect a creator-operated inference server"),
      destination("/studio/ai-settings", "Studio AI 설정", "Studio AI settings", "Studio 생성 도구의 연결과 모델 설정", "Configure Studio generation connections and models"),
      destination("/studio/character-convert", "캐릭터 변환", "Character conversion", "2D 캐릭터를 제작용 형식으로 변환", "Convert 2D characters into production-ready formats"),
      destination("/studio/ecosystem", "창작 생태계", "Creator ecosystem", "제작 도구·작업·리소스를 한곳에서 관리", "Manage creation tools, work and resources together"),
      destination("/studio/ecosystem/viewer", "생태계 뷰어", "Ecosystem viewer", "연결된 제작 자산과 흐름을 시각화", "Visualize connected creative assets and workflows"),
      destination("/studio/assets/brushes/new", "브러시 연구실", "Brush lab", "브러시를 만들고 시험하기", "Build and test custom brushes"),
      destination("/studio/assets/audio", "음악·사운드", "Music & sound", "작품에 연결할 음원 만들기", "Create audio for your work"),
      destination("/showcase/promo", "프로모션 제작", "Promotion studio", "작품 홍보용 이미지와 소재 만들기", "Create promotional visuals and assets"),
    ],
  },
  {
    id: "learning-publishing",
    icon: BookOpen,
    label: { ko: "학습·기획·출판", en: "Learning, planning & publishing" },
    description: {
      ko: "제작을 배우고 이야기와 공개 준비를 구체화",
      en: "Learn production and prepare stories and releases",
    },
    items: [
      destination("/learn", "웹툰 제작 강좌", "Creation courses", "기초부터 Studio 실습까지", "Learn from foundations to studio practice"),
      destination("/learn/glossary", "웹툰 용어 사전", "Creation glossary", "제작 용어와 예시 빠르게 찾기", "Find production terms and examples"),
      destination("/learn/studio", "Studio 실습 과정", "Studio practice", "배운 내용을 작업공간에서 따라 하기", "Practice lessons inside the workspace"),
      destination("/learn/records", "학습 기록 관리", "Learning records", "진행 기록을 백업하고 복원", "Back up and restore learning progress"),
      destination("/learn/recipes", "제작 레시피", "Creative recipes", "연출을 직접 조작하며 학습", "Learn direction through hands-on recipes"),
      destination("/story-lab", "스토리 연구실", "Story lab", "인물·욕망·갈등 설계", "Shape characters, desire and conflict"),
    ],
  },
  {
    id: "production-collaboration",
    icon: Sparkles,
    label: { ko: "제작 운영·협업", en: "Production & collaboration" },
    description: {
      ko: "검수·버전·발표·공유와 공동 작업 흐름",
      en: "Review, version, present, share and collaborate on work",
    },
    items: [
      destination("/studio/review", "리뷰·승인", "Review & approval", "작업을 검수하고 의견 반영", "Review work and resolve feedback"),
      destination("/studio/versions", "버전·복구", "Versions & recovery", "저장 이력과 복구 지점 관리", "Manage version history and recovery points"),
      destination("/studio/present", "발표 모드", "Presentation mode", "작업을 발표용 화면으로 확인", "Preview work in presentation mode"),
      destination("/studio/share", "공유 설정", "Sharing", "링크와 협업 권한 관리", "Manage links and collaboration access"),
      destination("/studio/join", "협업 참여", "Join collaboration", "초대받은 공동 작업에 참여", "Join an invited collaborative session"),
      destination("/collaborate/new", "구인·의뢰 등록", "Post collaboration", "팀원 모집·작업 의뢰·작업자 홍보 등록", "Post a team opening, commission or availability listing"),
      destination("/community/promote", "작품 홍보", "Promote work", "작품과 창작 활동을 커뮤니티에 소개", "Share creative work with the community"),
      destination("/community/promote/new", "홍보 글 작성", "Create promotion", "새 작품·연재·창작 활동 홍보 글 작성", "Create a promotion for a release or creative activity"),
    ],
  },
  {
    id: "collections",
    icon: Database,
    label: { ko: "작품·에셋 관리", en: "Work & asset management" },
    description: {
      ko: "공개 작품과 제작 재료를 더 세밀하게 탐색하고 관리",
      en: "Explore and manage published work and creative materials in detail",
    },
    items: [
      destination("/showcase/challenges", "창작 챌린지", "Creative challenges", "주제별 창작 이벤트", "Join themed creative events"),
      destination("/authors", "작가별 보기", "Browse creators", "작가와 대표 작품 탐색", "Explore creators and representative work"),
      destination("/discover/works", "만화·작법서 탐색", "Comics & craft books", "만화와 창작 참고서를 함께 검색", "Search comics and creative craft books"),
      destination("/read/spatial", "공간형 웹툰 감상", "Spatial comic reader", "준비한 컷을 공간형 또는 평면 화면으로 감상", "Read prepared panels in spatial or flat view"),
      destination("/market/browse", "에셋 상세 탐색", "Browse assets", "종류·사용권으로 리소스 찾기", "Find resources by type and license"),
      destination("/market/fit", "에셋 핏 랩", "Asset fit lab", "현재 작업에 맞는 에셋 점검", "Evaluate assets against the current project"),
      destination("/market/publish", "에셋 등록", "Publish an asset", "마켓에 리소스 제출·배포", "Submit and publish resources to Market"),
      destination("/market/manage", "판매·배포 관리", "Manage listings", "등록한 에셋과 배포 상태 관리", "Manage published assets and distribution"),
      destination("/market/library", "내 에셋", "My assets", "획득한 리소스 관리", "Manage acquired resources"),
      destination("/market/wishlist", "찜한 에셋", "Saved assets", "나중에 사용할 리소스", "Keep resources for later"),
      destination("/market/compare", "에셋 비교", "Compare assets", "후보 리소스의 차이 비교", "Compare shortlisted resources"),
      destination("/references", "작품 레퍼런스", "Story references", "공식 자료 탐색과 연구 노트", "Explore official sources and notes"),
      destination("/research/assets", "레퍼런스 아틀라스", "Reference atlas", "복식·소품·미술 자료를 장면별로", "Browse costume, prop and art references by scene"),
      destination("/research/books", "글로벌 판본 탐색", "Global editions", "Open Library·Google Books·openBD 메타데이터 검색", "Search Open Library, Google Books and openBD metadata"),
      destination("/research/3d-assets", "무료 3D 재료실", "Free 3D assets", "Poly Haven CC0 3D·HDRI·텍스처 검색", "Search Poly Haven CC0 models, HDRIs and textures"),
      destination("/research/catalog", "자료 카탈로그", "Research catalog", "출처가 확인된 창작 자료 모음", "Browse sourced creative research materials"),
      destination("/research/catalog/notebook", "연구 노트", "Research notebook", "선택한 자료와 장면 아이디어 정리", "Organize selected sources and scene ideas"),
      destination("/research/open-creation", "오픈 창작 자료", "Open creation", "자유롭게 활용할 수 있는 창작 자료 탐색", "Explore openly usable creation resources"),
      destination("/research/packs", "자료 팩", "Research packs", "주제별 참고자료 묶음으로 바로 시작", "Start from themed reference collections"),
    ],
  },
  {
    id: "data-discovery",
    icon: Search,
    label: { ko: "검색·데이터 도구", en: "Search & data tools" },
    description: {
      ko: "작품을 비교하고 취향·태그·공식 데이터로 더 깊게 탐색",
      en: "Compare stories and explore through taste, tags and official data",
    },
    items: [
      destination("/search", "통합 검색", "Unified search", "작품·작가·태그 검색", "Search stories, creators and tags"),
      destination("/explore", "취향 탐색", "Taste explorer", "장르·태그·조건으로 작품 둘러보기", "Browse stories by genre, tag and preference"),
      destination("/compare", "작품 비교", "Compare stories", "두 작품의 주요 지표 비교", "Compare key signals across two stories"),
      destination("/random", "랜덤 발견", "Random discovery", "조건에 맞는 작품 무작위 추천", "Discover a random matching story"),
      destination("/tags", "태그로 찾기", "Explore tags", "인기·유사 태그 탐색", "Explore popular and related tags"),
      destination("/news", "업계 소식", "Industry news", "웹툰·웹소설 관련 소식", "Follow webtoon and web novel news"),
      destination("/insights/resources", "공식 자료·API 안내", "Official data & APIs", "데이터 출처와 연동 방법 확인", "Review official sources and integration guidance"),
    ],
  },
  {
    id: "participation",
    icon: UsersRound,
    label: { ko: "참여·피드백", en: "Participation & feedback" },
    description: {
      ko: "관심사를 함께 나누고 서비스 개선에 참여",
      en: "Share interests with others and help improve the service",
    },
    items: [
      destination("/community/cafes", "장르 카페", "Genre cafés", "관심 장르별 모임과 대화", "Meet and talk around favorite genres"),
      destination("/feedback", "제보·제안", "Feedback", "버그·아이디어·기능 요청", "Report bugs and suggest ideas or features"),
    ],
  },
  {
    id: "help-policy",
    icon: ShieldCheck,
    label: { ko: "안내·지원·정책", en: "Help, support & policy" },
    description: {
      ko: "서비스 원칙과 접근성, 데이터 출처, 문의 및 권리 정책",
      en: "Service principles, accessibility, data sources, support and rights policies",
    },
    items: [
      destination("/about", "서비스 소개", "About ToonStudio", "기능과 운영 원칙", "Features and operating principles"),
      destination("/brand-film", "브랜드 필름", "Brand film", "Remotion으로 제작한 24초 툰스튜디오 소개 영상", "Watch the 24-second ToonStudio introduction rendered with Remotion"),
      destination(
        "/about/workflow",
        "웹툰 제작 과정",
        "Webtoon workflow",
        "기획부터 저장·연재까지 단계별 제작 흐름",
        "Follow the production flow from planning to saving and release",
      ),
      destination(
        "/about/technology",
        "기술과 신뢰",
        "Technology & trust",
        "웹·2D·3D·저장·협업 기술과 신뢰 원칙",
        "See the web, 2D, 3D, storage, collaboration and trust foundations",
      ),
      destination(
        "/about/technology/story",
        "기술 제작 스토리",
        "Engineering story",
        "문제 정의부터 검증까지 25개 기술 챕터",
        "Follow 25 engineering chapters from problem definition to verification",
      ),
      destination(
        "/about/technology/guides",
        "기술 적용 가이드",
        "Implementation guides",
        "인증·저장·브러시·성능·AI를 다른 프로젝트에 적용",
        "Apply authentication, storage, brush, performance and AI patterns elsewhere",
      ),
      destination(
        "/about/technology/references",
        "기술 참고·장애 기록",
        "Technical references & troubleshooting",
        "사용·평가·참고 기술과 재현 가능한 장애 해결 기록",
        "Used, evaluated and reference technologies with reproducible incident records",
      ),
      destination(
        "/about/technology/deck",
        "기술 발표 모드",
        "Engineering deck",
        "투자·세미나·스터디용 웹 프레젠테이션",
        "A web presentation for investor, seminar and study audiences",
      ),
      destination(
        "/about/technology/videos",
        "기술 영상 제작",
        "Engineering video",
        "Remotion 구성과 검토 가능한 영상 산출물",
        "Remotion compositions and reviewable video artifacts",
      ),
      destination(
        "/about/technology/licenses",
        "오픈소스·라이선스",
        "Open source & licenses",
        "코드·에셋·AI 권리와 배포 시 유의점",
        "Rights and distribution considerations for code, assets and AI",
      ),
      destination(
        "/about/principles",
        "제품 원칙",
        "Product principles",
        "창작 흐름·권리·AI·협업·접근성 의사결정 기준",
        "Product standards for creative flow, rights, AI, collaboration and accessibility",
      ),
      destination("/about/data", "데이터 출처", "Data sources", "공급자별 연결·이용 준비 상태", "Provider connections and readiness"),
      destination("/about/crawler", "공개 데이터 수집 정책", "Public data policy", "자동수집 원칙·제외·중지 요청", "Collection rules, exclusions and opt-out"),
      destination("/guide", "랭킹 산정 방식", "Ranking guide", "데이터와 산식 설명", "Understand ranking data and formulas"),
      destination("/accessibility", "접근성 안내", "Accessibility", "키보드·스크린리더·표시 지원", "Keyboard, screen reader and display support"),
      destination("/design", "디자인 시스템", "Design system", "색상·타이포·컴포넌트 원칙", "Colors, typography and component guidelines"),
      destination("/support", "이용 문의", "Support", "서비스 이용 도움받기", "Get help using the service"),
      destination("/settings/ai", "통합 AI 설정", "Unified AI settings", "모든 사용자 AI 연결과 키 보관함 관리", "Manage user-funded AI connections and the encrypted vault"),
      destination("/contact", "광고·제휴", "Business contact", "광고와 파트너십 문의", "Advertising and partnership inquiries"),
      destination("/copyright", "저작권 안내", "Copyright", "콘텐츠·권리 정책", "Content and rights policy"),
      destination("/terms", "이용약관", "Terms", "서비스 이용 조건", "Terms of service"),
      destination("/privacy", "개인정보처리방침", "Privacy", "개인정보 처리 기준", "Privacy practices"),
    ],
  },
];

export const SITEMAP_DIRECTORY_ENTRIES = [
  ...SITE_NAVIGATION_GROUPS.flatMap((group) => group.items),
  ...PERSONAL_DESTINATIONS,
  ...SITEMAP_EXTENDED_DESTINATION_GROUPS.flatMap((group) => group.items),
];
