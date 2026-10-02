// 창작 갤러리의 탭 본문 — 전체 작품·북마크, 시리즈, 팔로잉. 각 탭은 불러오기·연결 불가·빈 상태·로그인 유도를 구분해 보여 준다.
// 목록 요청은 useShowcaseResource가 취소·재시도를 맡고, 격자는 ShowcaseWorkGrid가 "더 보기"로 분량을 나눈다.
import {
  Bookmark,
  BookOpen,
  PenLine,
  Sparkles,
  Trophy,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { CreateFeaturedSections } from "../CreateFeaturedSections";
import { SeriesCard, WorkGridSkeleton } from "../creator-community-ui";
import { spatialShowcaseObjects, spatialShowcaseSeriesObjects } from "../spatial-showcase-placement";
import { TABPANEL_ID, galleryTabId, hasActiveFilters, type GalleryView, type WorksQuery } from "./gallery-query";
import { SeriesCreateEntry } from "./SeriesCreateEntry";
import { SHOWCASE_CHALLENGES_PATH } from "./showcase-links";
import { ShowcaseEmptyState, ShowcaseUnavailableState } from "./ShowcaseStates";
import { ShowcaseMoreGrid } from "./ShowcaseMoreGrid";
import { ShowcaseWorkGrid } from "./ShowcaseWorkGrid";
import { useShowcaseResource } from "./use-showcase-resource";

import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApp } from "@/shared/lib/store";
import { formatCount } from "@/shared/lib/utils";
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

/** 시리즈 카드는 가로형이라 한 장이 길다 — 처음에는 6개(모바일 약 2화면)만 보여 준다. */
const SERIES_INITIAL = 6;

// root-relative 자산은 정적 경로 헬퍼를 거쳐 렌더링합니다.
const CREATOR_BOARD_EMPTY = "/assets/create/creator-board-empty.png";

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
    <p className="mb-3 text-sm text-fg-2" aria-live="polite">
      {formatI18nTemplate(bt("작품 {count}개", "{count} works"), { count: formatCount(count) })}
    </p>
  );
}

function WorkGrid({ works, resetKey }: { works: readonly WorkSummary[]; resetKey: string }) {
  return (
    <>
      <CampusObjectSource objects={spatialShowcaseObjects(works)} />
      <ShowcaseWorkGrid works={works} resetKey={resetKey} />
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
      <WorkGrid works={works.data} resetKey={requestKey ?? ""} />
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
  // 방금 만든 시리즈는 목록을 다시 받지 않아도 맨 앞에 보이게 한다(서버 목록과 id로 중복 제거).
  const [created, setCreated] = useState<SeriesSummary[]>([]);
  const series = useShowcaseResource<SeriesSummary[]>(
    JSON.stringify(["series", sort]),
    (signal) => listSeries({ sort }, signal),
    bt("시리즈 목록을 불러오지 못했습니다.", "Couldn't load the series list."),
  );

  const list = series.status === "ready"
    ? [...created, ...series.data.filter((item) => !created.some((mine) => mine.id === item.id))]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {userId ? (
        <SeriesCreateEntry
          onCreated={(saved) => setCreated((current) => [saved, ...current.filter((item) => item.id !== saved.id)])}
        />
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
        />
      ) : (
        <>
          <CampusObjectSource objects={spatialShowcaseSeriesObjects(list)} />
          <ShowcaseMoreGrid
            items={list}
            itemKey={(item) => item.id}
            renderItem={(item) => <SeriesCard series={item} />}
            resetKey={sort}
            initial={SERIES_INITIAL}
            step={SERIES_INITIAL}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            moreLabel={(remaining) => formatI18nTemplate(bt("더 보기 · 남은 시리즈 {count}개", "Show more · {count} series left"), { count: remaining })}
          />
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
  return <WorkGrid works={feed.data} resetKey="following" />;
}

/** 선택한 탭의 본문. 전체 작품 탭은 조건이 없을 때 추천 섹션(챌린지·인기·태그·리믹스)을 목록 위에 둔다. */
export function GalleryTabPanel({ view, onResetFilters }: {
  readonly view: GalleryView;
  readonly onResetFilters: () => void;
}) {
  const { tab, query } = view;
  return (
    <div role="tabpanel" id={TABPANEL_ID} aria-labelledby={galleryTabId(tab)}>
      {tab === "works" && !hasActiveFilters(query) ? <CreateFeaturedSections /> : null}
      {tab === "works" ? (
        <WorksTab query={query} onResetFilters={onResetFilters} />
      ) : tab === "saved" ? (
        <WorksTab query={{ ...query, tag: "", contentType: "all", provenance: undefined, portfolio: false }} bookmarked onResetFilters={onResetFilters} />
      ) : tab === "series" ? (
        <SeriesTab sort={query.sort} />
      ) : (
        <FollowingTab />
      )}
    </div>
  );
}
