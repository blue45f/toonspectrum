import { Container } from "@/components/section";
import { useT } from "@/lib/i18n";
import Link from "@/src/compat/router-link";

interface SitemapLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

interface SitemapSection {
  readonly title: string;
  readonly description: string;
  readonly links: readonly SitemapLink[];
}

const SECTIONS: readonly SitemapSection[] = [
  {
    title: "만들기",
    description: "그리기, 캐릭터, 브러시와 사운드 도구",
    links: [
      { href: "/studio", label: "창작 스튜디오", description: "웹툰·컷툰·일러스트 제작" },
      { href: "/shaper", label: "캐릭터 셰이퍼", description: "3D 캐릭터 제작 도구 안내" },
      { href: "/brush-lab", label: "브러시 연구실", description: "브러시를 만들고 시험하기" },
      { href: "/music", label: "음악·사운드", description: "작품에 연결할 음원 만들기" },
    ],
  },
  {
    title: "작품",
    description: "창작자가 공개한 작품과 시리즈",
    links: [
      { href: "/create", label: "창작 작품", description: "공개 작품·시리즈·팔로잉 피드" },
      { href: "/create/challenges", label: "창작 챌린지", description: "주제별 창작 이벤트" },
      { href: "/authors", label: "작가별 보기", description: "작가와 대표 작품 탐색" },
    ],
  },
  {
    title: "에셋",
    description: "Studio에서 사용할 브러시·템플릿·3D 리소스",
    links: [
      { href: "/market", label: "창작 마켓", description: "추천 리소스와 카테고리" },
      { href: "/market/browse", label: "에셋 탐색", description: "종류·사용권으로 검색" },
      { href: "/market/library", label: "내 에셋", description: "획득한 리소스 관리" },
      { href: "/market/wishlist", label: "찜한 에셋", description: "나중에 사용할 리소스" },
    ],
  },
  {
    title: "배우기",
    description: "제작 강좌, 레퍼런스, 기획과 출판 준비",
    links: [
      { href: "/learn", label: "웹툰 제작 강좌", description: "기초부터 Studio 실습까지" },
      { href: "/learn/glossary", label: "웹툰 용어 사전", description: "제작 용어와 예시" },
      { href: "/learn/recipes", label: "제작 레시피", description: "연출을 직접 조작하며 학습" },
      { href: "/references", label: "작품 레퍼런스", description: "공식 자료 탐색과 연구 노트" },
      { href: "/story-lab", label: "스토리 연구실", description: "이야기 구조와 장면 기획" },
      { href: "/opportunities", label: "작가 기회센터", description: "공모·지원사업 찾기" },
      { href: "/publishing", label: "연재·출판 준비", description: "제출 전 체크리스트" },
    ],
  },
  {
    title: "발견",
    description: "검색, 추천, 랭킹과 작품 데이터",
    links: [
      { href: "/search", label: "통합 검색", description: "작품·작가·태그 검색" },
      { href: "/explore", label: "취향 탐색", description: "장르·태그·조건으로 둘러보기" },
      { href: "/recommend", label: "맞춤 추천", description: "내 기록을 바탕으로 작품 추천" },
      { href: "/ranking", label: "통합 랭킹", description: "여러 기준의 작품 순위" },
      { href: "/calendar", label: "연재 캘린더", description: "요일별 연재 일정" },
      { href: "/compare", label: "작품 비교", description: "두 작품의 주요 지표 비교" },
      { href: "/random", label: "랜덤 발견", description: "조건에 맞는 작품 무작위 추천" },
      { href: "/insights", label: "트렌드 인사이트", description: "장르·플랫폼 데이터 보기" },
      { href: "/tags", label: "태그로 찾기", description: "인기·유사 태그 탐색" },
      { href: "/news", label: "업계 소식", description: "웹툰·웹소설 관련 뉴스" },
    ],
  },
  {
    title: "커뮤니티",
    description: "작품 리뷰, 토론과 공개 기능 제안",
    links: [
      { href: "/reviews", label: "리뷰", description: "독자 평가와 서평" },
      { href: "/community", label: "커뮤니티", description: "작품·작가별 토론" },
      { href: "/community/cafes", label: "장르 카페", description: "관심 장르별 모임" },
      { href: "/feedback", label: "제보·제안", description: "버그·아이디어·기능 요청" },
    ],
  },
  {
    title: "마이·도움말",
    description: "내 기록, 설정, 서비스 안내와 정책",
    links: [
      { href: "/me", label: "내 정보", description: "내 작품·활동·프로필" },
      { href: "/library", label: "읽기 서재", description: "읽기 상태·평가·컬렉션" },
      { href: "/settings", label: "설정", description: "표시·데이터·계정 설정" },
      { href: "/about", label: "서비스 소개", description: "툰스튜디오의 기능과 원칙" },
      { href: "/guide", label: "랭킹 산정 방식", description: "데이터와 산식 설명" },
      { href: "/support", label: "문의", description: "서비스 이용 문의" },
      { href: "/contact", label: "광고·제휴", description: "비즈니스 문의 안내" },
      { href: "/copyright", label: "저작권 안내", description: "콘텐츠·권리 정책" },
      { href: "/terms", label: "이용약관", description: "서비스 이용 조건" },
      { href: "/privacy", label: "개인정보처리방침", description: "개인정보 처리 기준" },
    ],
  },
];

export function SitemapPage() {
  const t = useT();

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <section
        className="rounded-2xl border border-line bg-card p-5 sm:p-6"
        aria-labelledby="sitemap-title"
      >
        <p className="eyebrow text-accent">BETA · 전체 메뉴</p>
        <h1
          id="sitemap-title"
          className="mt-2 font-display text-[clamp(1.6rem,7vw,1.875rem)] font-bold sm:text-4xl"
        >
          {t("app.name")} 전체 메뉴
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-2">
          만들기, 작품, 에셋, 배우기와 발견 기능을 목적별로 모았습니다. 상세 작품과 게시물은
          각 목록에서 선택해 이동할 수 있습니다.
        </p>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5"
            aria-labelledby={`sitemap-${section.title}`}
          >
            <h2 id={`sitemap-${section.title}`} className="text-lg font-bold text-fg">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-fg-3">{section.description}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {section.links.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex min-h-20 h-full flex-col justify-center rounded-xl border border-line bg-card/70 px-4 py-3 transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <strong className="text-sm text-fg transition-colors group-hover:text-accent">
                      {item.label}
                    </strong>
                    <span className="mt-1 text-xs leading-5 text-fg-3">
                      {item.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
