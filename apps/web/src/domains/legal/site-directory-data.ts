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
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  type SiteNavigationGroup,
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

const I = SITE_NAVIGATION_ITEMS;

/**
 * Sitemap-specific primary information architecture.
 *
 * Global navigation intentionally stays compact and context-aware. The sitemap needs a different
 * job: expose the whole product without making creators understand the Studio/Spectrum split first.
 */
export const SITEMAP_CORE_DESTINATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "start-create",
    label: { ko: "제작 시작", en: "Start creating" },
    description: {
      ko: "새 작품을 시작하고 기존 프로젝트·소재·출판 흐름으로 바로 이동",
      en: "Start a work or jump straight into projects, assets and publishing",
    },
    items: [I.production, I.studio, I.make, I.studioAssets, I.publish],
  },
  {
    id: "learn-prepare",
    label: { ko: "배우고 준비하기", en: "Learn & prepare" },
    description: {
      ko: "제작 지식·참고자료·기회·오늘의 영감을 실제 작업에 연결",
      en: "Connect learning, references, opportunities and daily inspiration to the work",
    },
    items: [I.learn, I.research, I.technology, I.opportunities, I.now],
  },
  {
    id: "discover-inspire",
    label: { ko: "작품 발견", en: "Discover stories" },
    description: {
      ko: "검색·랭킹·연재 일정·추천·데이터에서 다음 작품과 아이디어 찾기",
      en: "Find the next story or idea through discovery, rankings, schedules and data",
    },
    items: [I.explore, I.ranking, I.calendar, I.recommend, I.fortune, I.insights],
  },
  {
    id: "connect-manage",
    label: { ko: "함께하고 관리하기", en: "Connect & manage" },
    description: {
      ko: "작품을 공유하고 리뷰·커뮤니티·협업·내 기록까지 이어서 관리",
      en: "Share work and continue through reviews, community, collaboration and your records",
    },
    items: [I.gallery, I.reviews, I.community, I.collaborate, I.play, I.library, I.me, I.home],
  },
];

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
    id: "creator-network",
    icon: UsersRound,
    label: { ko: "창작자 연결", en: "Creator network" },
    description: { ko: "협업·교육·팬 활동과 자료실", en: "Collaboration, education, fan activity and resources" },
    items: [
      destination("/creators", "창작자", "Creators", "창작자와 활동 살펴보기", "Explore creators and their activity"),
      destination("/home", "내 스튜디오", "My studio", "선택 작품의 공간과 목록에서 이어서 작업", "Continue your selected work in spatial or list view"),
      destination("/onboarding/character", "캐릭터 선택", "Choose character", "서비스와 가상스튜디오에서 사용할 내 캐릭터 선택", "Choose your identity for the service and virtual studio"),
      destination("/team", "팀 작업실", "Team workspace", "작품 멤버와 채용·면접 작업실 연결", "Connect project members, hiring and interviews"),
      destination("/hub", "둘러보기", "Explore hub", "작품·소재·창작자·학습 찾기", "Find works, materials, creators and learning"),
      destination("/about/studio", "스튜디오 소개", "Studio introduction", "기존 제작 가이드와 서비스 기능 살펴보기", "Explore the preserved production guides and features"),
      destination("/collaborate/positions", "조건별 인력 모집", "Find hiring positions", "역할·도구·보수 조건으로 모집 자리 찾기", "Find positions by role, tools and compensation"),
      destination("/collaborate/workspace", "채용·협업 작업실", "Hiring workspace", "이력서·지원·팀·면접·경력을 관리", "Manage resumes, applications, teams, interviews and career records"),
      destination("/collaborate/gallery", "창작자 경력·포트폴리오", "Creator career gallery", "공개에 동의한 경력과 포트폴리오 링크 살펴보기", "Explore opted-in career records and portfolio links"),
      destination("/ecosystem", "창작 생태계", "Creator ecosystem", "창작 생태계 서비스 찾기", "Explore creator ecosystem services"),
      destination("/ecosystem/collaboration", "협업 연결", "Collaboration", "협업 서비스를 살펴보기", "Explore collaboration services"),
      destination("/ecosystem/education", "창작 교육", "Creator education", "창작 교육 서비스를 살펴보기", "Explore creator education services"),
      destination("/ecosystem/fandom", "팬 커뮤니티", "Fandom", "팬 활동과 커뮤니티 찾기", "Explore fan activity and communities"),
      destination("/ecosystem/library", "생태계 자료실", "Ecosystem library", "생태계 자료 모아보기", "Explore ecosystem resources"),
      destination("/learn/education", "교육 안내", "Education", "교육 과정과 기능 안내", "Explore education courses and tools"),
    ],
  },
  {
    id: "events-membership",
    icon: UsersRound,
    label: { ko: "이벤트·멤버십·후원", en: "Events, membership & support" },
    description: { ko: "이벤트에 참여하고 멤버십과 후원 확인", en: "Explore events, membership and support" },
    items: [
      destination("/community/events", "커뮤니티 이벤트", "Community events", "커뮤니티 이벤트 찾기", "Explore community events"),
      destination("/events", "이벤트 안내", "Events", "이벤트 목록과 안내 확인", "Explore events and announcements"),
      destination("/events/beta-open", "베타 오픈 안내", "Beta opening", "베타 오픈 소식 확인", "Read the beta opening announcement"),
      destination("/membership", "멤버십", "Membership", "멤버십 안내 확인", "Explore membership"),
      destination("/membership/usage", "멤버십 사용 내역", "Membership usage", "멤버십 사용 내역 확인", "Review membership usage"),
      destination("/support-creators", "창작자 후원", "Support creators", "창작자 후원 안내 확인", "Explore creator support"),
      destination("/support-us", "서비스 후원", "Support the service", "서비스 후원 안내 확인", "Explore service support"),
    ],
  },
  {
    id: "studio-foundation",
    icon: Wrench,
    label: { ko: "Studio 시작·프로젝트", en: "Studio & projects" },
    description: {
      ko: "제작 허브·새 작업·프로젝트·소재·출판으로 이어지는 기본 진입점",
      en: "Core entry points for production, projects, assets and publishing",
    },
    items: [
      authorityDestination("production"),
      authorityDestination("studio-home"),
      authorityDestination("studio-new"),
      destination("/studio/projects", "프로젝트 목록", "Project list", "기존 프로젝트를 찾아 이어서 작업", "Find an existing project and continue your work"),
      authorityDestination("studio-assets"),
      destination(
        "/market",
        "소재 마켓",
        "Materials market",
        "호환성과 사용 권리를 확인하고 새 에셋 탐색",
        "Discover assets with compatibility and rights information",
      ),
      authorityDestination("studio-publish"),
      destination("/studio/manual", "Studio 사용 설명서", "Studio manual", "도구·작업 흐름·문제 해결 안내", "Learn tools, workflows and troubleshooting"),
    ],
  },
  {
    id: "drawing-character-media",
    icon: Sparkles,
    label: { ko: "드로잉·캐릭터·미디어", en: "Drawing, character & media" },
    description: {
      ko: "웹툰 컷·브러시·캐릭터·애니메이션·사운드 제작 도구",
      en: "Tools for panels, brushes, characters, animation and sound",
    },
    items: [
      destination("/studio/comic", "웹툰 만들기", "Create a webtoon", "컷·말풍선·대사를 한 화면에서 구성", "Arrange panels, balloons and dialogue in one workspace"),
      destination("/studio/assets/characters/new", "캐릭터 만들기", "Create a character", "캐릭터·표정·포즈와 3D 참고 제작", "Build characters, expressions, poses and 3D references"),
      destination("/studio/character", "캐릭터 작업실", "Character workspace", "캐릭터 외형·표정·자세 제작", "Build character looks, expressions and poses"),
      destination("/studio/animation", "애니메이션 작업실", "Animation workspace", "프레임과 움직임을 편집", "Edit frames and motion"),
      destination("/studio/brushes", "Studio 브러시", "Studio brushes", "작업 중 브러시를 선택하고 조정", "Choose and tune brushes while editing"),
      destination("/studio/assets/brushes/new", "브러시 연구실", "Brush lab", "브러시를 만들고 시험하기", "Build and test custom brushes"),
      destination("/studio/assets/audio", "음악·사운드", "Music & sound", "작품에 연결할 음원 만들기", "Create audio for your work"),
      destination("/studio/storyworld", "스토리월드", "Storyworld", "인물·장소·설정의 관계 정리", "Organize characters, locations and story relationships"),
      destination("/studio/character-convert", "캐릭터 변환", "Character conversion", "2D 캐릭터를 제작용 형식으로 변환", "Convert 2D characters into production-ready formats"),
    ],
  },
  {
    id: "three-d-scenes",
    icon: Database,
    label: { ko: "3D·장면 제작", en: "3D & scene building" },
    description: {
      ko: "배경·포즈·모델링·CAD·조형·재질·카메라 컷까지 3D 장면 제작",
      en: "Build 3D scenes from backgrounds and poses to modeling, materials and shots",
    },
    items: [
      destination("/studio/bg3d", "3D 배경", "3D backgrounds", "장면 배경과 카메라 구도 설계", "Build scene backgrounds and camera composition"),
      destination("/studio/poser", "포즈 스튜디오", "Pose studio", "인체 포즈와 구도 참고 만들기", "Create pose and composition references"),
      destination("/studio/3d/dcc/model", "3D 모델링", "3D modeling", "메시를 만들고 편집하는 기본 작업 모드", "Create and edit meshes in the core modeling mode"),
      destination("/studio/3d/dcc/build", "3D 공간 제작", "3D environment build", "방·배경·공간 구조 제작", "Build rooms, backgrounds and spatial structures"),
      destination("/studio/3d/dcc/cad", "정밀 CAD", "Precision CAD", "치수 기반 솔리드와 소품 설계", "Design dimensioned solids and props"),
      destination("/studio/3d/dcc/sculpt", "3D 조형", "3D sculpting", "브러시로 형태와 디테일 조형", "Sculpt forms and detail with brushes"),
      destination("/studio/3d/dcc/material", "재질·UV", "Materials & UV", "표면 재질과 UV 구성", "Build surface materials and UV layouts"),
      destination("/studio/3d/dcc/shot", "컷·선화", "Shot & line art", "카메라 컷과 비사실 렌더 설계", "Design camera shots and non-photoreal rendering"),
      destination("/studio/lift3d", "2D → 3D 변환", "2D to 3D lift", "이미지 소재를 3D 장면으로 확장", "Lift image subjects into 3D scenes"),
    ],
  },
  {
    id: "ai-production-tools",
    icon: Wrench,
    label: { ko: "AI·제작 도구·런타임", en: "AI, tools & runtimes" },
    description: {
      ko: "생성 기능·외부 엔진·처리 작업·개인 AI 런타임을 한곳에서 설정",
      en: "Configure generation, external engines, jobs and personal AI runtimes",
    },
    items: [
      destination("/studio/generate", "생성 도구 연결", "Generation tools", "생성 기능의 연결 상태와 사용 조건 확인", "Review generation availability and requirements"),
      destination("/studio/toolchain", "제작 도구", "Production tools", "효과·OCR·영상·3D·출판 흐름 연결", "Connect effects, OCR, media, 3D and publishing workflows"),
      destination("/studio/engines", "설치·라이선스", "Engines & licenses", "외부 실행기 설치와 사용 조건 확인", "Review local engines and license boundaries"),
      destination("/studio/jobs", "처리 중 작업", "Production jobs", "무거운 제작 작업과 결과 영수증 관리", "Manage production jobs and result receipts"),
      destination("/studio/ai-lab", "AI 실험실", "AI lab", "사용자 키로 창작 추론 작업 실행", "Run creator-funded inference workflows"),
      destination("/studio/ai-runtime", "개인 AI 런타임", "Personal AI runtime", "직접 운영하는 추론 서버 연결", "Connect a creator-operated inference server"),
      destination("/settings/ai", "AI 연결과 사용 순서", "AI connections and routing", "자동 무료 AI, 내 API 키와 기능별 사용 순서 관리", "Manage automatic free AI, personal credentials and per-capability routing"),
      destination("/studio/ecosystem", "창작 생태계", "Creator ecosystem", "제작 도구·작업·리소스를 한곳에서 관리", "Manage creation tools, work and resources together"),
      destination("/studio/growth", "창작 성장 대시보드", "Creator growth dashboard", "작품 성과·운영 과제·다음 성장 단계를 한곳에서 관리", "Manage performance, operating tasks and the next growth stage in one place"),
      destination("/studio/growth-ip", "작가 성장·IP 확장", "Creator growth & IP", "신인 발굴·지원·웹소설 각색·판권·교육·협업 관리", "Manage creator support, adaptation, rights, education and collaboration"),
      I.growthLab,
      destination("/studio/environment", "사용 환경 안내", "Environment guide", "브라우저 기능·PWA 설치·권한·오프라인 준비 상태 점검", "Check browser capabilities, PWA installation, permissions and offline readiness"),
      destination("/studio/ecosystem/viewer", "생태계 뷰어", "Ecosystem viewer", "연결된 제작 자산과 흐름을 시각화", "Visualize connected creative assets and workflows"),
    ],
  },
  {
    id: "learning-planning",
    icon: BookOpen,
    label: { ko: "학습·기획", en: "Learning & planning" },
    description: {
      ko: "제작을 배우고 이야기·연출·진행 기록을 구체화",
      en: "Learn production and shape stories, direction and progress",
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
    icon: UsersRound,
    label: { ko: "검수·협업·홍보", en: "Review, collaboration & promotion" },
    description: {
      ko: "버전·검수·공유·발표·협업·작품 홍보까지 완성 이후의 흐름",
      en: "Review, version, share, present, collaborate and promote finished work",
    },
    items: [
      destination("/production/workspaces", "팀 워크스페이스", "Team workspaces", "팀 구성원·작품·이용 한도 관리", "Manage team members, projects and usage"),
      destination("/production/workspaces/join", "팀 초대 수락", "Accept a team invitation", "인증된 이메일로 초대받은 팀에 참여", "Join an invited team using your verified email"),
      destination("/studio/review", "리뷰·승인", "Review & approval", "작업을 검수하고 의견 반영", "Review work and resolve feedback"),
      destination("/showcase/reviews", "승인 검수본 전시", "Approved review showcase", "공개에 동의한 고정 승인본을 안전하게 열람", "Browse immutable approved review snapshots that were explicitly published"),
      destination("/studio/versions", "버전·복구", "Versions & recovery", "저장 이력과 복구 지점 관리", "Manage version history and recovery points"),
      destination("/studio/present", "발표 모드", "Presentation mode", "작업을 발표용 화면으로 확인", "Preview work in presentation mode"),
      destination("/studio/share", "공유 설정", "Sharing", "링크와 협업 권한 관리", "Manage links and collaboration access"),
      destination("/studio/join", "협업 참여", "Join collaboration", "초대받은 공동 작업에 참여", "Join an invited collaborative session"),
      destination("/collaborate/new", "구인·의뢰 등록", "Post collaboration", "팀원 모집·작업 의뢰·작업자 홍보 등록", "Post a team opening, commission or availability listing"),
      destination("/community/promote", "작품 홍보", "Promote work", "작품과 창작 활동을 커뮤니티에 소개", "Share creative work with the community"),
      destination("/community/promote/new", "홍보 글 작성", "Create promotion", "새 작품·연재·창작 활동 홍보 글 작성", "Create a promotion for a release or creative activity"),
      destination("/showcase/promo", "프로모션 제작", "Promotion studio", "작품 홍보용 이미지와 소재 만들기", "Create promotional visuals and assets"),
    ],
  },
  {
    id: "asset-market",
    icon: Database,
    label: { ko: "소재 마켓·내 에셋", en: "Asset market & library" },
    description: {
      ko: "에셋을 찾고 비교하고 등록하며 내 라이브러리와 배포 상태 관리",
      en: "Find, compare, publish and manage assets and listings",
    },
    items: [
      destination("/market/browse", "에셋 상세 탐색", "Browse assets", "종류·사용권으로 리소스 찾기", "Find resources by type and license"),
      destination("/market/fit", "에셋 핏 랩", "Asset fit lab", "현재 작업에 맞는 에셋 점검", "Evaluate assets against the current project"),
      destination("/market/publish", "에셋 등록", "Publish an asset", "마켓에 리소스 제출·배포", "Submit and publish resources to Market"),
      destination("/market/manage", "판매·배포 관리", "Manage listings", "등록한 에셋과 배포 상태 관리", "Manage published assets and distribution"),
      destination("/market/library", "내 에셋", "My assets", "획득한 리소스 관리", "Manage acquired resources"),
      destination("/market/wishlist", "찜한 에셋", "Saved assets", "나중에 사용할 리소스", "Keep resources for later"),
      destination("/market/compare", "에셋 비교", "Compare assets", "후보 리소스의 차이 비교", "Compare shortlisted resources"),
    ],
  },
  {
    id: "reference-library",
    icon: BookOpen,
    label: { ko: "작품·레퍼런스 자료실", en: "Works & reference library" },
    description: {
      ko: "공개 작품·작가·창작 참고자료와 출처가 확인된 리서치 묶음 탐색",
      en: "Explore public works, creators and sourced creative references",
    },
    items: [
      destination("/showcase/challenges", "창작 챌린지", "Creative challenges", "주제별 창작 이벤트", "Join themed creative events"),
      destination("/authors", "작가별 보기", "Browse creators", "작가와 대표 작품 탐색", "Explore creators and representative work"),
      destination("/discover/works", "만화·작법서 탐색", "Comics & craft books", "만화와 창작 참고서를 함께 검색", "Search comics and creative craft books"),
      destination("/read/spatial", "공간형 웹툰 감상", "Spatial comic reader", "준비한 컷을 공간형 또는 평면 화면으로 감상", "Read prepared panels in spatial or flat view"),
      destination("/references", "작품 레퍼런스", "Story references", "공식 자료 탐색과 연구 노트", "Explore official sources and notes"),
      destination("/research/assets", "레퍼런스 아틀라스", "Reference atlas", "복식·소품·미술 자료를 장면별로", "Browse costume, prop and art references by scene"),
      destination("/research/books", "글로벌 판본 탐색", "Global editions", "Open Library·Google Books·openBD 메타데이터 검색", "Search Open Library, Google Books and openBD metadata"),
      destination("/research/3d-assets", "무료 3D 재료실", "Free 3D assets", "Poly Haven CC0 3D·HDRI·텍스처 검색", "Search Poly Haven CC0 models, HDRIs and textures"),
      destination("/research/material-assets", "CC0 PBR·3D 소재", "CC0 PBR & 3D assets", "ambientCG 재질·HDRI·데칼·3D 모델·지형 검색", "Search ambientCG materials, HDRIs, decals, models and terrain"),
      destination("/research/space-assets", "NASA 우주·과학 자료", "NASA space references", "행성·우주선·과학 이미지를 출처와 함께 탐색", "Explore sourced planetary, spacecraft and science imagery"),
      destination("/research/vam", "V&A 패션·디자인", "V&A fashion & design", "복식·직물·가구·장식미술 고증", "Research costume, textiles, furniture and decorative arts"),
      destination("/research/rijksmuseum", "Rijksmuseum 고증", "Rijksmuseum references", "제작자·시대·권리 표시가 있는 문화 자료", "Explore cultural references with maker, period and rights evidence"),
      destination("/research/fonts", "Google Fonts 매처", "Google Fonts matcher", "한글 지원·장르·굵기와 실제 문구 미리보기", "Compare Korean coverage, category, weights and live text previews"),
      destination("/research/open-data", "공개 데이터 창작실", "Open data creation lab", "국내외 공식 API를 장면·고증·대사 자료로 연결", "Connect official APIs to scenes, research and dialogue"),
      destination("/research/creatures", "생물·생태 자료", "Biodiversity references", "GBIF 생물 분류·관찰 기록을 캐릭터와 배경 고증에 활용", "Use GBIF taxonomy and observations for creature and environment research"),
      destination("/research/music-metadata", "음악 메타데이터", "Music metadata", "MusicBrainz의 아티스트·앨범·녹음 정보를 출처와 함께 탐색", "Explore sourced artist, release and recording metadata from MusicBrainz"),
      destination("/research/archive", "인터넷 아카이브", "Internet Archive", "공개 도서·영상·음원·소프트웨어 자료를 검색", "Search public books, video, audio and software collections"),
      destination("/research/weather-light", "날씨·빛 참고", "Weather & light", "기상 관측을 장면의 날씨와 조명 참고로 변환", "Turn weather observations into scene and lighting references"),
      destination("/research/open-data/kheritage", "국가유산 데이터", "Korean heritage data", "국가유산청 공개 데이터를 시대·장소 고증에 활용", "Use Korean heritage open data for period and location research"),
      destination("/research/open-data/neis", "학교·교육 데이터", "School & education data", "나이스 공개 정보를 학원·학교 배경 조사에 활용", "Use NEIS public information for school and education settings"),
      destination("/research/open-data/tourapi", "관광·지역 데이터", "Tour & regional data", "TourAPI 장소 정보를 여행·지역 배경 참고로 탐색", "Explore TourAPI places for travel and regional settings"),
      destination("/research/open-data/korean", "한국어 사전 데이터", "Korean dictionary data", "표준국어대사전·한국어 자료를 대사와 명칭 검수에 활용", "Use Korean language data to review dialogue and naming"),
      destination("/research/open-data/smithsonian", "스미스소니언 자료", "Smithsonian open access", "박물관·과학·문화 컬렉션을 출처와 함께 탐색", "Explore sourced museum, science and cultural collections"),
      destination("/research/open-data/wikimedia", "위키미디어 관심도", "Wikimedia interest", "공개 문서와 관심도 신호를 리서치 보조 자료로 확인", "Review public knowledge and interest signals as research context"),
      destination("/research/open-data/europeana", "유로피아나 문화유산", "Europeana heritage", "유럽 문화유산 컬렉션을 시대·복식·미술 고증에 활용", "Use European cultural heritage collections for period, costume and art research"),
      destination("/research/open-data/dpla", "미국 디지털 문화유산", "DPLA collections", "미국 도서관·기록관·박물관 공개 자료를 탐색", "Explore open US library, archive and museum collections"),
      destination("/research/open-data/ambientcg", "ambientCG 공개 소재", "ambientCG open assets", "CC0 재질·HDRI·데칼·모델 데이터를 공개 데이터 흐름에서 탐색", "Explore CC0 materials, HDRIs, decals and models through the open-data flow"),
      destination("/research/open-data/vam", "V&A 공개 컬렉션", "V&A open collections", "복식·직물·가구·장식미술 데이터를 공개 API로 탐색", "Explore fashion, textiles, furniture and decorative arts through the open API"),
      destination("/research/open-data/nasa", "NASA 공개 자료", "NASA open data", "우주·행성·과학 이미지를 공개 데이터 흐름에서 탐색", "Explore space, planetary and science imagery through NASA open data"),
      destination("/research/open-data/gbif", "GBIF 생물 데이터", "GBIF biodiversity data", "생물 종·분포·관찰 데이터를 공개 API로 탐색", "Explore species, distribution and observation data through GBIF"),
      destination("/research/open-data/musicbrainz", "MusicBrainz 공개 데이터", "MusicBrainz open data", "음악가·발매·녹음 메타데이터를 공개 API로 탐색", "Explore artist, release and recording metadata through MusicBrainz"),
      destination("/research/open-data/internetarchive", "Internet Archive 공개 데이터", "Internet Archive open data", "아카이브 컬렉션을 공개 API 흐름에서 검색", "Search archive collections through the public API flow"),
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
    id: "about-media",
    icon: ShieldCheck,
    label: { ko: "서비스 소개·홍보영상·기술", en: "About, films & engineering" },
    description: {
      ko: "툰스튜디오가 무엇인지 영상·제작 과정·기술 이야기로 빠르게 이해",
      en: "Understand ToonStudio through its film, workflow and engineering story",
    },
    items: [
      destination("/product-tour", "툰스튜디오 전체 제품 투어", "ToonStudio full product tour", "8분 24초 장편 영상과 실제 제품 화면으로 전체 제작 흐름 이해", "Understand the full production journey through an 8m 24s tour and real product screens"),
      destination("/brand-film", "툰스튜디오 홍보영상", "ToonStudio brand film", "24초 브랜드 필름으로 핵심 제작 경험 빠르게 보기", "Watch the 24-second brand film for a quick product overview"),
      destination("/about", "서비스 소개", "About ToonStudio", "기능과 운영 원칙", "Features and operating principles"),
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
        "문제 정의부터 검증까지 30개 기술 챕터",
        "Follow 30 engineering chapters from problem definition to verification",
      ),
      destination(
        "/about/technology/playbook",
        "서비스·기술 플레이북",
        "Service & engineering playbook",
        "시장 벤치마크·기술 도시어·홍보영상·120분 세미나",
        "Market benchmarks, technical dossiers, promotional film and a 120-minute seminar",
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
        "/about/technology/field-notes",
        "기술 심화 노트",
        "Engineering field notes",
        "Worker·PWA·무료 AI·Blender·3D·Open API와 트러블슈팅",
        "Workers, PWA, free AI, Blender, 3D, Open APIs and troubleshooting",
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
      destination("/design", "디자인 시스템", "Design system", "색상·타이포·컴포넌트 원칙", "Colors, typography and component guidelines"),
    ],
  },
  {
    id: "support-policy",
    icon: ShieldCheck,
    label: { ko: "지원·데이터·정책", en: "Support, data & policy" },
    description: {
      ko: "문의·접근성·데이터 출처·수집·저작권·약관·개인정보 정책 확인",
      en: "Find support, accessibility, data, rights, terms and privacy information",
    },
    items: [
      destination("/about/data", "데이터 출처", "Data sources", "공급자별 연결·이용 준비 상태", "Provider connections and readiness"),
      destination("/about/crawler", "공개 데이터 수집 정책", "Public data policy", "자동수집 원칙·제외·중지 요청", "Collection rules, exclusions and opt-out"),
      destination("/guide", "랭킹 산정 방식", "Ranking guide", "데이터와 산식 설명", "Understand ranking data and formulas"),
      destination("/accessibility", "접근성 안내", "Accessibility", "키보드·스크린리더·표시 지원", "Keyboard, screen reader and display support"),
      destination("/support", "이용 문의", "Support", "서비스 이용 도움받기", "Get help using the service"),
      destination("/business", "비즈니스 안내", "Business", "사업자용 서비스와 협업 안내", "Services and collaboration for businesses"),
      destination("/contact", "광고·제휴", "Business contact", "광고와 파트너십 문의", "Advertising and partnership inquiries"),
      destination("/copyright", "저작권 안내", "Copyright", "콘텐츠·권리 정책", "Content and rights policy"),
      destination("/terms", "이용약관", "Terms", "서비스 이용 조건", "Terms of service"),
      destination("/privacy", "개인정보처리방침", "Privacy", "개인정보 처리 기준", "Privacy practices"),
    ],
  },
];

const directoryEntries = [
  ...SITEMAP_CORE_DESTINATION_GROUPS.flatMap((group) => group.items),
  ...PERSONAL_DESTINATIONS,
  ...SITEMAP_EXTENDED_DESTINATION_GROUPS.flatMap((group) => group.items),
];

export const SITEMAP_DIRECTORY_ENTRIES = directoryEntries.filter(
  (entry, index) => directoryEntries.findIndex((candidate) => candidate.href === entry.href) === index,
);
