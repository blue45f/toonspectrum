import {
  Bookmark,
  BookOpen,
  Heart,
  LayoutGrid,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { CreateFeaturedSections } from "./CreateFeaturedSections";
import { buildStudioHref } from "./creator-studio-links";
import { SeriesCard, SeriesForm, WorkCard, WorkGridSkeleton } from "./creator-community-ui";
import {
  SHOWCASE_CHALLENGES_PATH,
  type ShowcaseGalleryTab,
} from "./publishing/showcase-links";
import { ShowcaseEmptyState, ShowcaseUnavailableState } from "./publishing/ShowcaseStates";
import { useShowcaseResource } from "./publishing/use-showcase-resource";
import { WebtoonGalleryIntro } from "./WebtoonGalleryIntro";
import {
  spatialShowcaseObjects,
  spatialShowcaseSeriesObjects,
} from "./spatial-showcase-placement";

import { Container } from "@/shared/components/section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { CreativeJourneyLinks } from "@/shared/components/public-creative";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_COMMUNITY_CONTENT_GROUPS,
  CREATOR_COMMUNITY_PROVENANCES,
  type CreatorCommunityContentGroup,
  type CreatorCommunityProvenance,
} from "@/shared/lib/creator-community-publication-contract";
import { useApp } from "@/shared/lib/store";
import { cn, formatCount } from "@/shared/lib/utils";
import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import Link from "@/shared/navigation/router-link";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import {
  listFollowingFeed,
  listSeries,
  listWorks,
  type SeriesSummary,
  type WorkSort,
  type WorkSummary,
} from "@/platform/creator-client";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Bilingual = (ko: string, en: string) => string;

const SORTS: readonly { value: WorkSort; ko: string; en: string }[] = [
  { value: "recent", ko: "최신", en: "Latest" },
  { value: "likes", ko: "인기", en: "Popular" },
  { value: "views", ko: "조회", en: "Most viewed" },
];

const TABS: readonly { value: ShowcaseGalleryTab; ko: string; en: string; icon: LucideIcon }[] = [
  { value: "works", ko: "전체 작품", en: "All works", icon: LayoutGrid },
  { value: "series", ko: "시리즈", en: "Series", icon: BookOpen },
  { value: "following", ko: "팔로잉", en: "Following", icon: UserCheck },
  { value: "saved", ko: "북마크", en: "Bookmarks", icon: Bookmark },
];

const CONTENT_GROUP_LABEL: Record<CreatorCommunityContentGroup, readonly [string, string]> = {
  all: ["전체", "All"],
  illustration: ["일러스트", "Illustration"],
  webtoon: ["웹툰·만화", "Webtoon & comics"],
  process: ["제작 과정·WIP", "Process & WIP"],
};

const PROVENANCE_FILTER_LABEL: Record<CreatorCommunityProvenance, readonly [string, string]> = {
  human: ["직접 제작", "Human-made"],
  ai_assisted: ["AI 보조", "AI-assisted"],
  agent_assisted: ["AI 에이전트 협업", "AI agent collaboration"],
  ai_generated: ["AI 생성", "AI-generated"],
  mixed: ["혼합 제작", "Mixed"],
};

const TABPANEL_ID = "showcase-gallery-panel";
const tabId = (tab: ShowcaseGalleryTab) => `showcase-gallery-tab-${tab}`;

// root-relative 자산은 정적 경로 헬퍼를 거쳐 렌더링합니다.
const CREATOR_BOARD_EMPTY = "/assets/create/creator-board-empty.png";

const CHIP_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function isSort(value: string | null): value is WorkSort {
  return SORTS.some((option) => option.value === value);
}

function isTab(value: string | null): value is ShowcaseGalleryTab {
  return TABS.some((option) => option.value === value);
}

function isContentGroup(value: string | null): value is CreatorCommunityContentGroup {
  return CREATOR_COMMUNITY_CONTENT_GROUPS.some((group) => group === value);
}

function isProvenance(value: string | null): value is CreatorCommunityProvenance {
  return CREATOR_COMMUNITY_PROVENANCES.some((item) => item === value);
}

interface WorksQuery {
  readonly sort: WorkSort;
  readonly tag: string;
  readonly contentType: CreatorCommunityContentGroup;
  readonly provenance?: CreatorCommunityProvenance;
  readonly portfolio: boolean;
}

function hasActiveFilters(query: WorksQuery): boolean {
  return Boolean(query.tag) || query.contentType !== "all" || Boolean(query.provenance) || query.portfolio;
}

/** 서버에 닿지 못했을 때도 지금 할 수 있는 다음 행동을 함께 둔다. */
function GalleryUnavailable({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <ShowcaseUnavailableState
      title={title}
      detail={detail}
      onRetry={onRetry}
      actions={
        <>
          <Link href="/studio" className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <PenLine size={15} aria-hidden />
            {bt("웹툰 그리기", "Draw a webtoon")}
          </Link>
          <Link href={SHOWCASE_CHALLENGES_PATH} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <Trophy size={15} aria-hidden />
            {bt("창작 챌린지 보기", "See challenges")}
          </Link>
        </>
      }
    />
  );
}

function LoginPrompt({ icon, title, description, source }: {
  icon: LucideIcon;
  title: string;
  description: string;
  source: string;
}) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <ShowcaseEmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source, mode: "login" })}
          className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}
        >
          {bt("로그인하기", "Log in")}
        </button>
      }
    />
  );
}

// 일러스트 기반(전체 작품) 빈 상태 — 보드 일러스트를 카드에 프레이밍하고 다음 행동을 함께 둔다.
function IllustratedEmptyState({ title, description, onResetFilters }: {
  title: string;
  description: string;
  onResetFilters?: () => void;
}) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/40 px-6 py-11 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60 blur-3xl"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--color-accent) 26%, transparent), transparent 75%)" }}
      />
      <div className="relative mx-auto mb-5 w-40 max-w-[60%]">
        <span aria-hidden className="absolute -left-3 -top-2 z-10 text-accent drop-shadow">
          <Sparkles size={20} />
        </span>
        {/* 흰 배경 일러스트는 밝은 종이 프레임으로 감싸 남색 표면과 분리한다. */}
        <div className="overflow-hidden rounded-2xl bg-[oklch(0.97_0.012_85)] shadow-lg ring-1 ring-line/70">
          <img
            src={resolveAssetUrl(CREATOR_BOARD_EMPTY)}
            alt=""
            className="aspect-square w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <p className="relative text-base font-semibold text-fg">{title}</p>
      <p className="relative mx-auto mt-1.5 max-w-sm text-pretty text-[0.8125rem] leading-relaxed text-fg-2">
        {description}
      </p>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        {onResetFilters ? (
          <button type="button" onClick={onResetFilters} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <X size={15} aria-hidden />
            {bt("필터 모두 지우기", "Clear all filters")}
          </button>
        ) : null}
        <Link href="/studio" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}>
          <PenLine size={15} aria-hidden />
          {bt("창작 스튜디오로 만들기", "Create in the Studio")}
        </Link>
      </div>
    </div>
  );
}

function WorkResultCount({ count }: { count: number }) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <p className="mb-3 text-xs text-fg-3" aria-live="polite">
      {formatI18nTemplate(bt("작품 {count}개", "{count} works"), { count: formatCount(count) })}
    </p>
  );
}

function WorkGrid({ works }: { works: readonly WorkSummary[] }) {
  return (
    <>
      <CampusObjectSource objects={spatialShowcaseObjects(works)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {works.map((work) => (
          <WorkCard key={work.id} work={work} />
        ))}
      </div>
    </>
  );
}

// ── 전체 작품·북마크 탭 ────────────────────────────────────────────────
function WorksTab({ query, bookmarked = false, onResetFilters }: {
  query: WorksQuery;
  bookmarked?: boolean;
  onResetFilters: () => void;
}) {
  const userId = useApp((state) => state.userId);
  const bt = useBilingual("CreateGalleryPage");
  const needsLogin = bookmarked && !userId;
  const requestKey = needsLogin
    ? null
    : JSON.stringify(["works", query.sort, query.tag, query.contentType, query.provenance ?? "", query.portfolio, bookmarked, userId ?? ""]);
  const works = useShowcaseResource<WorkSummary[]>(
    requestKey,
    (signal) => listWorks({
      sort: query.sort,
      tag: query.tag || undefined,
      contentType: query.contentType,
      provenance: query.provenance,
      portfolio: query.portfolio ? "1" : undefined,
      bookmarked: bookmarked ? "1" : undefined,
    }, signal),
    bt("창작물 목록을 불러오지 못했습니다.", "Couldn't load the creations list."),
  );

  if (needsLogin) {
    return (
      <LoginPrompt
        icon={Bookmark}
        title={bt("로그인하고 작품을 북마크해 보세요.", "Log in and bookmark works you love.")}
        description={bt("다시 보고 싶은 일러스트와 웹툰을 한곳에 모을 수 있습니다.", "Keep the illustrations and webtoons you want to revisit in one place.")}
        source="create-gallery-bookmark"
      />
    );
  }
  if (works.status === "error") {
    return (
      <GalleryUnavailable
        title={bt("작품 목록을 잠시 불러올 수 없어요", "Works are temporarily unavailable")}
        detail={works.error}
        onRetry={works.reload}
      />
    );
  }
  if (works.status !== "ready") return <WorkGridSkeleton />;
  if (works.data.length === 0) {
    if (bookmarked) {
      return (
        <ShowcaseEmptyState
          icon={Bookmark}
          title={bt("아직 북마크한 작품이 없습니다.", "No bookmarked works yet.")}
          description={bt("다시 보고 싶은 일러스트와 웹툰에서 북마크를 눌러 보세요.", "Tap bookmark on illustrations and webtoons you want to revisit.")}
        />
      );
    }
    const filtered = hasActiveFilters(query);
    return (
      <IllustratedEmptyState
        title={query.tag
          ? formatI18nTemplate(bt("#{tag} 태그의 창작물이 아직 없습니다.", "No creations tagged #{tag} yet."), { tag: query.tag })
          : filtered
            ? bt("조건에 맞는 창작물이 아직 없습니다.", "No creations match these filters yet.")
            : bt("첫 번째 작품을 기다리고 있어요.", "Waiting for the first work.")}
        description={filtered
          ? bt("필터를 줄이면 더 많은 작품을 볼 수 있어요. 직접 그린 작품을 공개해 갤러리를 채워 보세요.", "Loosen the filters to see more, or publish your own work to fill the gallery.")
          : bt("스튜디오에서 그린 웹툰·일러스트를 공개하면 이곳에 가장 먼저 소개됩니다.", "Publish a webtoon or illustration from the Studio and it will appear here first.")}
        onResetFilters={filtered ? onResetFilters : undefined}
      />
    );
  }
  return (
    <>
      <WorkResultCount count={works.data.length} />
      <WorkGrid works={works.data} />
    </>
  );
}

// ── 시리즈 탭 — 연재 시리즈 카드 + 새 시리즈 만들기 ─────────────────────
function SeriesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-3.5 rounded-2xl border border-line bg-panel/30 p-3">
          <span className="skeleton block aspect-[3/4] w-24 rounded-xl sm:w-28" />
          <div className="flex-1 space-y-2 py-1">
            <span className="skeleton block h-4 w-2/3" />
            <span className="skeleton block h-3 w-full" />
            <span className="skeleton block h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SeriesTab({ sort }: { sort: WorkSort }) {
  const userId = useApp((s) => s.userId);
  const bt = useBilingual("CreateGalleryPage");
  const [creating, setCreating] = useState(false);
  // 방금 만든 시리즈는 목록을 다시 받지 않아도 맨 앞에 보이게 한다(서버 목록과 id로 중복 제거).
  const [created, setCreated] = useState<SeriesSummary[]>([]);
  const series = useShowcaseResource<SeriesSummary[]>(
    JSON.stringify(["series", sort]),
    (signal) => listSeries({ sort }, signal),
    bt("시리즈 목록을 불러오지 못했습니다.", "Couldn't load the series list."),
  );

  const createButton = (variant: "solid" | "outline") => (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className={buttonClass({ size: variant === "solid" ? "md" : "sm", variant, className: "gap-1.5" })}
    >
      <Plus size={15} aria-hidden />
      {bt("새 시리즈 만들기", "New series")}
    </button>
  );

  const list = series.status === "ready"
    ? [...created, ...series.data.filter((item) => !created.some((mine) => mine.id === item.id))]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {userId ? (
        <div>
          {creating ? (
            <SeriesForm
              onSaved={(saved) => {
                setCreating(false);
                setCreated((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : createButton("outline")}
        </div>
      ) : null}

      {series.status === "error" ? (
        <GalleryUnavailable
          title={bt("시리즈 목록을 잠시 불러올 수 없어요", "Series are temporarily unavailable")}
          detail={series.error}
          onRetry={series.reload}
        />
      ) : series.status !== "ready" ? (
        <SeriesSkeleton />
      ) : list.length === 0 ? (
        <ShowcaseEmptyState
          icon={BookOpen}
          title={bt("아직 연재 시리즈가 없습니다.", "No series yet.")}
          description={bt("시리즈를 만들고 작품 상세에서 회차로 연결하면 연재가 시작됩니다.", "Create a series and link works to it as episodes to start serializing.")}
          action={userId && !creating ? createButton("solid") : undefined}
        />
      ) : (
        <>
          <CampusObjectSource objects={spatialShowcaseSeriesObjects(list)} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((item) => (
              <SeriesCard key={item.id} series={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── 팔로잉 탭 — 팔로우한 창작자의 최신 작품(비로그인 시 로그인 유도) ──────
function FollowingTab() {
  const userId = useApp((s) => s.userId);
  const bt = useBilingual("CreateGalleryPage");
  const feed = useShowcaseResource<WorkSummary[]>(
    userId ? JSON.stringify(["following", userId]) : null,
    (signal) => listFollowingFeed(signal),
    bt("팔로잉 피드를 불러오지 못했습니다.", "Couldn't load the following feed."),
  );

  if (!userId) {
    return (
      <LoginPrompt
        icon={UserCheck}
        title={bt("로그인하고 좋아하는 창작자를 팔로우해 보세요.", "Log in and follow your favorite creators.")}
        description={bt("팔로우한 창작자의 새 작품이 이곳에 모입니다.", "New works from followed creators gather here.")}
        source="create-gallery-following"
      />
    );
  }
  if (feed.status === "error") {
    return (
      <GalleryUnavailable
        title={bt("팔로잉 피드를 잠시 불러올 수 없어요", "Following feed is temporarily unavailable")}
        detail={feed.error}
        onRetry={feed.reload}
      />
    );
  }
  if (feed.status !== "ready") return <WorkGridSkeleton count={5} />;
  if (feed.data.length === 0) {
    return (
      <ShowcaseEmptyState
        icon={UserCheck}
        title={bt("아직 팔로우한 창작자가 없습니다.", "No followed creators yet.")}
        description={bt("마음에 드는 작품의 작성자 프로필에서 팔로우하면 새 작품을 여기서 볼 수 있어요.", "Follow creators from their profile pages and their new works will appear here.")}
      />
    );
  }
  return <WorkGrid works={feed.data} />;
}

// ── 필터 헤더 ────────────────────────────────────────────────────────
/** 보기 탭 — WAI-ARIA 탭 패턴(←/→/Home/End로 이동, 선택된 탭만 Tab 순서에 포함). */
function GalleryTabs({ value, onChange }: { value: ShowcaseGalleryTab; onChange: (tab: ShowcaseGalleryTab) => void }) {
  const bt = useBilingual("CreateGalleryPage");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    const target = TABS[next];
    if (!target) return;
    onChange(target.value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={bt("작품 보기", "Browse works")} className="flex flex-wrap gap-1 rounded-2xl border border-line bg-canvas/50 p-1">
      {TABS.map((option, index) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={tabId(option.value)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={TABPANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-colors duration-150",
              CHIP_FOCUS,
              active ? "bg-accent text-on-accent shadow-md shadow-accent/25" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Icon size={15} aria-hidden />
            {bt(option.ko, option.en)}
          </button>
        );
      })}
    </div>
  );
}

function SortControl({ value, onChange }: { value: WorkSort; onChange: (sort: WorkSort) => void }) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <div role="group" aria-label={bt("정렬", "Sort")} className="inline-flex items-center gap-1 rounded-2xl border border-line bg-canvas/50 p-1">
      {SORTS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm transition-colors duration-150",
              CHIP_FOCUS,
              active ? "bg-raised font-semibold text-fg shadow-sm" : "text-fg-3 hover:text-fg",
            )}
          >
            {option.value === "likes" ? <Heart size={13} aria-hidden /> : null}
            {bt(option.ko, option.en)}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-3.5 text-xs font-medium transition-colors",
        CHIP_FOCUS,
        pressed ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
      )}
    >
      {children}
    </button>
  );
}

function ActiveFilterChip({ label, clearLabel, onClear }: { label: string; clearLabel: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={clearLabel}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/50 bg-accent-soft px-3.5 text-xs font-medium text-fg transition-colors hover:bg-accent-soft/70 active:scale-[0.96]",
        CHIP_FOCUS,
      )}
    >
      {label}
      <X size={13} aria-hidden />
    </button>
  );
}

function ActiveFilters({ query, bt, onClear, onClearAll }: {
  query: WorksQuery;
  bt: Bilingual;
  onClear: (key: "tag" | "content" | "provenance" | "portfolio") => void;
  onClearAll: () => void;
}) {
  if (!hasActiveFilters(query)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3" aria-label={bt("적용된 필터", "Active filters")} role="group">
      <span className="mr-1 text-xs font-medium text-fg-3">{bt("적용된 필터", "Active filters")}</span>
      {query.tag ? (
        <ActiveFilterChip
          label={`#${query.tag}`}
          clearLabel={formatI18nTemplate(bt("#{tag} 태그 필터 해제", "Clear #{tag} tag filter"), { tag: query.tag })}
          onClear={() => onClear("tag")}
        />
      ) : null}
      {query.contentType !== "all" ? (
        <ActiveFilterChip
          label={bt(...CONTENT_GROUP_LABEL[query.contentType])}
          clearLabel={bt("작품 유형 필터 해제", "Clear content type filter")}
          onClear={() => onClear("content")}
        />
      ) : null}
      {query.provenance ? (
        <ActiveFilterChip
          label={bt(...PROVENANCE_FILTER_LABEL[query.provenance])}
          clearLabel={bt("제작 방식 필터 해제", "Clear production method filter")}
          onClear={() => onClear("provenance")}
        />
      ) : null}
      {query.portfolio ? (
        <ActiveFilterChip
          label={bt("대표 포트폴리오·전시", "Featured portfolio & exhibits")}
          clearLabel={bt("포트폴리오 필터 해제", "Clear portfolio filter")}
          onClear={() => onClear("portfolio")}
        />
      ) : null}
      <button
        type="button"
        onClick={onClearAll}
        className={cn("ml-auto min-h-11 rounded-full px-3 text-xs font-medium text-accent underline-offset-4 hover:underline", CHIP_FOCUS)}
      >
        {bt("필터 모두 지우기", "Clear all filters")}
      </button>
    </div>
  );
}

export function CreateGalleryPage() {
  const bt = useBilingual("CreateGalleryPage");
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort");
  const tabParam = searchParams.get("tab");
  const contentParam = searchParams.get("content");
  const provenanceParam = searchParams.get("provenance");
  const tab: ShowcaseGalleryTab = isTab(tabParam) ? tabParam : "works";
  const query: WorksQuery = {
    sort: isSort(sortParam) ? sortParam : "recent",
    tag: searchParams.get("tag") ?? "",
    contentType: isContentGroup(contentParam) ? contentParam : "all",
    provenance: isProvenance(provenanceParam) ? provenanceParam : undefined,
    portfolio: searchParams.get("portfolio") === "1",
  };

  const updateParams = (patch: Readonly<Record<string, string | null>>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params, { replace: true });
  };
  const clearAllFilters = () => updateParams({ tag: null, content: null, provenance: null, portfolio: null });

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <WebtoonGalleryIntro />
      <header className="webtoon-gallery-filter mb-7 rounded-2xl border border-line p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{bt("창작자의 작품을 만나보세요", "Discover creators' works")}</h2>
            <p className="mt-1 text-xs text-fg-3">
              {bt("탭으로 보기 방식을 고르고, 정렬과 필터로 원하는 작품을 좁혀 보세요.", "Pick a view with the tabs, then narrow results with sort and filters.")}
            </p>
          </div>
          <Link href="/showcase/reviews" className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}>
            <ShieldCheck size={15} aria-hidden />
            {bt("승인본 전시", "Approved showcase")}
          </Link>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GalleryTabs value={tab} onChange={(next) => updateParams({ tab: next === "works" ? null : next })} />
            {tab !== "following" ? (
              <SortControl value={query.sort} onChange={(next) => updateParams({ sort: next === "recent" ? null : next })} />
            ) : null}
          </div>

          {tab === "works" ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
              <span className="mr-1 text-xs font-medium text-fg-3">{bt("작품 유형", "Content type")}</span>
              {CREATOR_COMMUNITY_CONTENT_GROUPS.map((group) => (
                <FilterChip
                  key={group}
                  pressed={query.contentType === group}
                  onClick={() => updateParams({ content: group === "all" ? null : group })}
                >
                  {bt(...CONTENT_GROUP_LABEL[group])}
                </FilterChip>
              ))}
              <select
                value={query.provenance ?? ""}
                onChange={(event) => updateParams({ provenance: event.target.value || null })}
                aria-label={bt("제작 방식 필터", "Production method filter")}
                className={cn("min-h-11 rounded-full border border-line bg-card px-3 text-xs text-fg-2", CHIP_FOCUS)}
              >
                <option value="">{bt("모든 제작 방식", "All production methods")}</option>
                {CREATOR_COMMUNITY_PROVENANCES.map((value) => (
                  <option key={value} value={value}>{bt(...PROVENANCE_FILTER_LABEL[value])}</option>
                ))}
              </select>
              <FilterChip pressed={query.portfolio} onClick={() => updateParams({ portfolio: query.portfolio ? null : "1" })}>
                {bt("대표 포트폴리오·전시", "Featured portfolio & exhibits")}
              </FilterChip>
            </div>
          ) : null}

          {tab === "works" ? (
            <ActiveFilters
              query={query}
              bt={bt}
              onClear={(key) => updateParams({ [key]: null })}
              onClearAll={clearAllFilters}
            />
          ) : null}
        </div>
      </header>

      <div role="tabpanel" id={TABPANEL_ID} aria-labelledby={tabId(tab)}>
        {tab === "works" && !hasActiveFilters(query) ? <CreateFeaturedSections /> : null}
        {tab === "works" ? (
          <WorksTab query={query} onResetFilters={clearAllFilters} />
        ) : tab === "saved" ? (
          <WorksTab query={{ ...query, tag: "", contentType: "all", provenance: undefined, portfolio: false }} bookmarked onResetFilters={clearAllFilters} />
        ) : tab === "series" ? (
          <SeriesTab sort={query.sort} />
        ) : (
          <FollowingTab />
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-fg">{bt("내 작품도 이곳에 소개해 보세요", "Feature your own work here")}</p>
          <p className="mt-1 text-xs text-fg-3">{bt("스튜디오에서 그리거나 완성 이미지를 올린 뒤, 발행 단계에서 공개 범위를 고르면 갤러리에 올라갑니다.", "Draw in the Studio or upload finished images, then choose public visibility when publishing.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={buildStudioHref({ mode: "upload" })} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <Plus size={15} aria-hidden />
            {bt("작품 올리기", "Upload work")}
          </Link>
          <Link href="/studio/publish" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}>
            <Sparkles size={15} aria-hidden />
            {bt("발행하기", "Publish")}
          </Link>
        </div>
      </div>
      <CreativeJourneyLinks />
    </Container>
  );
}
