import {
  ArrowRight,
  CalendarDays,
  Compass,
  HelpCircle,
  Library,
  MessagesSquare,
  Search,
  Shuffle,
  Sparkles,
  Swords,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { SiteStepList } from "@/domains/legal/public/site-step-list";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { GENRES } from "@/shared/lib/taxonomy";
import Link from "@/shared/navigation/router-link";
import { useApiResource } from "@/platform/use-api-resource";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { DiscoverRecentShelf } from "./DiscoverRecentShelf";
import { DiscoverShelves } from "./DiscoverShelves";
import { DiscoverSpotlight } from "./DiscoverSpotlight";
import {
  DISCOVER_HOME_SNAPSHOT_URL,
  pickDiscoverSpotlight,
  snapshotDateLabel,
  type DiscoverHomeSnapshot,
} from "./discover-home";

/** 헤더에서 바로 누를 수 있는 장르 수 — 나머지는 "전체 장르"(탐색)로 이어진다. */
const QUICK_GENRE_COUNT = 8;
/** 스냅샷 수치는 정확한 값이라 약식(6만) 대신 천 단위 구분으로 보여 준다. */
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

interface DiscoverDestination {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: readonly [string, string];
  readonly body: readonly [string, string];
  /** 탐색을 넘어 제작으로 이어지는 진입점(리서치)은 눈에 띄게 강조한다. */
  readonly highlight?: boolean;
}

const DESTINATIONS: readonly DiscoverDestination[] = [
  { href: "/search", icon: Search, title: ["정확히 검색", "Exact search"], body: ["찾는 작품·작가·태그가 있을 때", "When you know a story, creator or tag"] },
  { href: "/explore", icon: Compass, title: ["조건으로 탐색", "Explore by filters"], body: ["장르·태그·상태·플랫폼을 좁혀 발견", "Narrow by genre, tag, status and platform"] },
  { href: "/recommend", icon: Sparkles, title: ["맞춤 추천", "Recommendations"], body: ["내 평가와 선호 장르를 반영한 추천", "Picks from your ratings and favorite genres"] },
  { href: "/ranking", icon: TrendingUp, title: ["통합 랭킹", "Rankings"], body: ["인기·급상승·평점 등 여러 신호로 비교", "Compare popularity, momentum and ratings"] },
  { href: "/calendar", icon: CalendarDays, title: ["연재 캘린더", "Release calendar"], body: ["요일별로 업데이트되는 작품 확인", "See which stories update on each day"] },
  { href: "/random", icon: Shuffle, title: ["랜덤 발견", "Random discovery"], body: ["고르기 어려울 때 한 편씩 미리 보기", "Preview one pick at a time when choosing is hard"] },
  { href: "/compare", icon: Swords, title: ["두 작품 비교", "Compare two"], body: ["고민되는 두 작품의 지표와 제공처 비교", "Compare signals and availability for two stories"] },
  { href: "/library", icon: Library, title: ["내 서재", "My library"], body: ["저장·평가·읽기 상태로 돌아가기", "Return to saved, rated and in-progress stories"] },
  // 탐색에서 이어지는 다음 행동 — 작품을 보고 난 뒤 이야기를 나누거나, 내 장면의 참고자료를 찾는다.
  { href: "/community", icon: MessagesSquare, title: ["작품 이야기 나누기", "Talk about stories"], body: ["작품·작가·펜카페 커뮤니티에서 감상 나누기", "Share impressions in story, creator and pencafe communities"] },
  { href: "/research", icon: Telescope, title: ["참고자료 찾기", "Find references"], body: ["내 장면에 필요한 레퍼런스·3D 재료·폰트", "References, 3D materials and fonts for your scenes"], highlight: true },
];

/**
 * 공개 카탈로그 요약 한 줄 — 작품·플랫폼·장르 수와 기준일, 데이터 출처.
 * 대표 작품 카드가 히어로 오른쪽을 차지하므로 수치는 검색 아래 한 줄로 둔다.
 */
function CatalogSnapshotLine({ snapshot, loading }: { readonly snapshot: DiscoverHomeSnapshot | null; readonly loading: boolean }) {
  const bt = useBilingual("DiscoverHubPage");
  const dateLabel = snapshot ? snapshotDateLabel(snapshot.generatedAt) : null;
  const stats = snapshot
    ? [
        { label: bt("작품", "stories"), value: COUNT_FORMAT.format(snapshot.stats.titles) },
        { label: bt("플랫폼", "platforms"), value: COUNT_FORMAT.format(snapshot.stats.platforms) },
        { label: bt("장르", "genres"), value: COUNT_FORMAT.format(snapshot.stats.genres) },
      ]
    : null;

  return (
    <div
      aria-label={bt("공개 카탈로그 요약", "Public catalog summary")}
      role="group"
      className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/70 pt-4 text-xs text-fg-3"
    >
      {stats ? (
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1">
              <dt className="order-2">{stat.label}</dt>
              <dd className="numeral order-1 text-sm font-bold text-fg">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : loading ? (
        <span data-slot="skeleton" aria-hidden="true" className="skeleton block h-4 w-56" />
      ) : (
        <span>{bt("카탈로그 요약을 지금은 확인할 수 없어요.", "The catalog summary isn't available right now.")}</span>
      )}
      <span className="flex flex-wrap items-center gap-x-1.5">
        {dateLabel ? <span>{`${dateLabel} ${bt("기준 공개 카탈로그", "public catalog snapshot")} ·`}</span> : null}
        <Link href="/about/data" className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline sm:min-h-0">
          {bt("데이터 출처", "Data sources")}
        </Link>
      </span>
    </div>
  );
}

export function DiscoverHubPage() {
  const bt = useBilingual("DiscoverHubPage");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const home = useApiResource<DiscoverHomeSnapshot>(
    DISCOVER_HOME_SNAPSHOT_URL,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load story picks."),
  );
  // 대표 작품을 못 고르면 히어로 오른쪽 칸을 비운 채로 두지 않는다 — 칸 자체를 빼서 제목 영역이 넓어지게 한다.
  const showSpotlight = home.loading || (home.data != null && pickDiscoverSpotlight(home.data) != null);

  useDocumentTitle(bt("작품 탐색", "Discover"));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  const searchLabel = bt("작품명·작가·태그 검색", "Search stories, creators or tags");

  return (
    <PageEntrance variant="rise">
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={Compass}
        eyebrow="DISCOVER"
        title={bt("다음 컷의 영감은, 새로운 이야기에서.", "Find the story that sparks your next panel.")}
        description={bt(
          "작품·작가·태그로 검색하거나 장르로 바로 들어가 보세요. 요일 연재와 평점 높은 작품은 아래에서 바로 볼 수 있어요.",
          "Search by title, creator or tag, or jump in by genre. Weekly serials and top-rated stories are right below.",
        )}
        aside={showSpotlight ? <DiscoverSpotlight snapshot={home.data} loading={home.loading} /> : undefined}
        asideSize="wide"
        actions={
          <Link href="/research" className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-accent" })}>
            {bt("내 웹툰을 위한 참고자료 찾기", "Find references for your webtoon")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      >
        <form onSubmit={submit} role="search" className="grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-line-strong bg-card/90 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
            <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="sr-only">{searchLabel}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchLabel}
              enterKeyHint="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
          </label>
          <button type="submit" className={buttonClass({ size: "lg", className: "min-h-12 rounded-2xl px-6 text-sm font-bold" })}>
            {bt("검색", "Search")}
          </button>
        </form>
        <nav aria-label={bt("장르로 바로 찾기", "Jump in by genre")} className="mt-4">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {GENRES.slice(0, QUICK_GENRE_COUNT).map((genre) => (
              <li key={genre} className="shrink-0">
                <Link
                  href={`/explore?genre=${encodeURIComponent(genre)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-card/70 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  #{genre}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link
                href="/explore"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-accent/35 bg-accent-soft/60 px-3.5 text-xs font-bold text-accent transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {bt("전체 장르", "All genres")}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </nav>
        <CatalogSnapshotLine snapshot={home.data} loading={home.loading} />
      </SitePageHeader>

      <div className="mt-10 flex flex-col gap-12 sm:mt-12 sm:gap-14">
        <DiscoverRecentShelf />
        <DiscoverShelves snapshot={home.data} loading={home.loading} error={home.error} onRetry={home.reload} />
      </div>

      <Section
        className="mt-14 sm:mt-16"
        eyebrow="DISCOVERY TOOLS"
        title={bt("원하는 방식으로 찾기", "Choose how you want to find it")}
        desc={bt(
          "검색·조건 탐색·랭킹·캘린더처럼 지금 상황에 맞는 도구로 바로 이동하세요.",
          "Go straight to the tool that fits: search, filters, rankings or the release calendar.",
        )}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {DESTINATIONS.map((destination) => (
            <SiteLinkCard
              key={destination.href}
              layout="tile"
              href={destination.href}
              icon={destination.icon}
              title={bt(...destination.title)}
              description={bt(...destination.body)}
              className={destination.highlight ? "border-accent/45 bg-accent-soft/50" : undefined}
            />
          ))}
        </div>
        <SiteDisclosure
          className="mt-4"
          icon={HelpCircle}
          title={bt("처음이라면 30초 안내", "New here? A 30-second guide")}
          summary={bt("기능 이름을 외우지 않아도 지금 상황에 맞는 방법만 고르면 돼요.", "Pick the route that matches your situation — no feature names to memorize.")}
        >
          <SiteStepList
            steps={[
              bt("찾는 제목이 있으면 위 검색창에 바로 입력합니다.", "If you know the title, type it into the search field above."),
              bt("제목이 없으면 장르나 조건 탐색, 맞춤 추천을 고릅니다.", "If you only know your taste, pick a genre, Explore or Recommendations."),
              bt("결정이 어렵다면 랭킹·랜덤·비교로 후보를 줄입니다.", "If choosing is hard, narrow candidates with Rankings, Random or Compare."),
            ]}
          />
        </SiteDisclosure>
      </Section>
    </Container>
    </PageEntrance>
  );
}
