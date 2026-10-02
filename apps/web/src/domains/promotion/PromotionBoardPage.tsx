import { ArrowRight, Bookmark, Clapperboard, PenLine, RefreshCw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PROMOTION_GENRES, PROMOTION_KINDS, PROMOTION_STAGES } from "../../../../../packages/core/src/promotion";
import { usePromotionFeed } from "./use-promotion-feed";
import "./promotion-community.css";

import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { LoadingState } from "@/shared/components/LoadingState";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { TypographicCover } from "@/shared/components/typographic-cover";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const SCOPE = "domains.promotion.PromotionBoardPage";

const KIND_EN: Record<keyof typeof PROMOTION_KINDS, string> = {
  series: "Series · new work",
  trailer: "Promo video",
  process: "Work in progress",
  feedback: "Feedback request",
};
const STAGE_EN: Record<keyof typeof PROMOTION_STAGES, string> = {
  amateur: "Amateur",
  debut: "Debut · new work",
  serializing: "Serializing creator",
};
const GENRE_EN: Record<string, string> = {
  "판타지": "Fantasy",
  "로맨스": "Romance",
  "드라마": "Drama",
  "액션": "Action",
  "일상": "Slice of life",
  "코미디": "Comedy",
  "스릴러": "Thriller",
  "SF": "Sci-fi",
  "무협": "Martial arts",
  "기타": "Other",
};

export function PromotionBoardPage() {
  const bt = useBilingual(SCOPE);
  useDocumentTitle(bt("신작·작가 홍보 커뮤니티 · ToonStudio", "New work & creator spotlight community · ToonStudio"));
  const userId = useApp((state) => state.userId);
  const [params, setParams] = useSearchParams(), [search, setSearch] = useState(params.get("q") ?? "");
  const filters = new URLSearchParams();
  for (const name of ["kind", "stage", "genre", "q", "mine", "saved"]) { const value = params.get(name); if (value) filters.set(name, value); }
  const feed = usePromotionFeed(filters.toString(), userId);
  const setFilter = (name: string, value: string) => setParams((previous) => { const next = new URLSearchParams(previous); if (value && value !== "all") next.set(name, value); else next.delete(name); return next; });
  const publicPosts = (feed.page?.items ?? []).filter((post) => !post.hidden && !post.archived).slice(0, 24);
  return (
    <div className="pc-shell">
      <CampusObjectSource objects={publicPosts.map((post) => ({
        id: post.id,
        title: post.title,
        href: `/community/promote/${encodeURIComponent(post.id)}`,
        kind: "promotion-post",
        exposure: "public",
      }))} />
      <header className="pc-hero">
        <div>
          <p className="pc-eyebrow"><Sparkles size={16} aria-hidden="true" /> TOONSTUDIO · CREATOR SPOTLIGHT</p>
          <h1>{bt("아직 발견하지 못한,", "Stories you haven't found yet,")}<br /><em>{bt("당신의 다음 웹툰.", "your next webtoon.")}</em></h1>
          <p className="pc-lead">{bt("첫 연재의 설렘부터 한 편의 트레일러까지.", "From the thrill of a first serialization to a full trailer.")}<br />{bt("새로운 작가를 만나고, 만드는 과정을 응원해 주세요.", "Meet new creators and cheer on their process.")}</p>
          <div className="pc-actions">
            <Link className="pc-button pc-primary" to="/community/promote/new"><PenLine size={17} aria-hidden="true" />{bt("내 작품 소개하기", "Introduce my work")}</Link>
            <Link className="pc-button" to="/collaborate">{bt("용역·어시·팀원 찾기", "Find gigs · assistants · teammates")} <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link className="pc-button" to="/showcase">{bt("창작 갤러리", "Creator gallery")} <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        <aside className="pc-hero-note">
          <Clapperboard size={42} aria-hidden="true" />
          <strong>{bt("완성 전의 이야기도,", "Unfinished stories are welcome,")}<br />{bt("시작하는 작가도 환영해요.", "and so are starting creators.")}</strong>
          <span>{bt("직접 창작한 작품 · 제작 과정 · 첫 독자의 피드백", "Original works · process · first-reader feedback")}</span>
          <p>{bt("유료 상단 노출 없이 최신 등록순으로 만나요.", "No paid boosts — just the newest posts first.")}</p>
        </aside>
      </header>
      <nav className="pc-quick" aria-label={bt("추천 탐색", "Suggested browsing")}>
        <button type="button" onClick={() => { setParams({ stage: "amateur" }); setSearch(""); }}>01 <strong>{bt("아마추어 작가 발견", "Discover amateur creators")}</strong><ArrowRight size={16} aria-hidden="true" /></button>
        <button type="button" onClick={() => { setParams({ stage: "debut" }); setSearch(""); }}>02 <strong>{bt("첫 작품·신작 모아보기", "First & new works")}</strong><ArrowRight size={16} aria-hidden="true" /></button>
        <button type="button" onClick={() => { setParams({ kind: "trailer" }); setSearch(""); }}>03 <strong>{bt("트레일러 상영관", "Trailer theater")}</strong><ArrowRight size={16} aria-hidden="true" /></button>
      </nav>
      <section aria-labelledby="pc-discover-title">
        <div className="pc-heading">
          <div>
            <p className="pc-eyebrow">DISCOVER THE NEXT STORY</p>
            <h2 id="pc-discover-title">{bt("창작자의 이야기를 만나보세요", "Meet the creators' stories")}</h2>
          </div>
          <button className="pc-button" type="button" disabled={feed.loading} onClick={feed.refresh}><RefreshCw size={16} aria-hidden="true" />{bt("새로고침", "Refresh")}</button>
        </div>
        <form className="pc-search" role="search" onSubmit={(event) => { event.preventDefault(); setFilter("q", search.trim()); }}>
          <Search size={19} aria-hidden="true" />
          <label className="sr-only" htmlFor="pc-search">{bt("작품명·제목·태그 검색", "Search by work, title, or tags")}</label>
          <input id="pc-search" type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={bt("작품명, 제목, 태그로 검색", "Search by work, title, or tags")} />
          <button className="pc-button" type="submit">{bt("검색", "Search")}</button>
        </form>
        <div className="pc-tabs" role="group" aria-label={bt("게시물 유형", "Post type")}>
          {Object.entries({ all: bt("전체", "All"), ...Object.fromEntries(Object.entries(PROMOTION_KINDS).map(([value, label]) => [value, bt(label, KIND_EN[value as keyof typeof PROMOTION_KINDS] ?? label)])) }).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={(params.get("kind") ?? "all") === value} onClick={() => setFilter("kind", value)}>{label}</button>
          ))}
        </div>
        <div className="pc-filters">
          <label>{bt("활동 단계", "Creator stage")}
            <select value={params.get("stage") ?? "all"} onChange={(event) => setFilter("stage", event.target.value)}>
              <option value="all">{bt("모든 작가", "All creators")}</option>
              {Object.entries(PROMOTION_STAGES).map(([value, label]) => <option key={value} value={value}>{bt(label, STAGE_EN[value as keyof typeof PROMOTION_STAGES] ?? label)}</option>)}
            </select>
          </label>
          <label>{bt("장르", "Genre")}
            <select value={params.get("genre") ?? "all"} onChange={(event) => setFilter("genre", event.target.value)}>
              <option value="all">{bt("모든 장르", "All genres")}</option>
              {PROMOTION_GENRES.map((genre) => <option key={genre}>{bt(genre, GENRE_EN[genre] ?? genre)}</option>)}
            </select>
          </label>
          <button className="pc-button" disabled={!userId} type="button" aria-pressed={params.get("mine") === "true"} onClick={() => setFilter("mine", params.get("mine") === "true" ? "" : "true")}>{bt("내 게시물", "My posts")}</button>
          <button className="pc-button" disabled={!userId} type="button" aria-pressed={params.get("saved") === "true"} onClick={() => setFilter("saved", params.get("saved") === "true" ? "" : "true")}><Bookmark size={15} aria-hidden="true" />{bt("저장한 작품", "Saved works")}</button>
          {filters.size > 0 && <button className="pc-text-button" type="button" onClick={() => { setParams({}); setSearch(""); }}>{bt("필터 초기화", "Clear filters")}</button>}
        </div>
      </section>
      <section aria-label={bt("홍보 게시물 목록", "Promotion posts")}>
        {feed.error && (
          <div className="pc-error" role="alert">
            {feed.error}
            <button className="pc-button" type="button" onClick={feed.refresh}>{bt("다시 시도", "Retry")}</button>
          </div>
        )}
        {feed.loading && !feed.page && (
          <LoadingState variant="cards" cardCount={6} label={bt("새로운 작품을 불러오고 있어요.", "Loading new works…")} />
        )}
        {feed.loading && feed.page && (
          <p className="pc-notice" role="status">{bt("새로운 작품을 불러오고 있어요.", "Loading new works…")}</p>
        )}
        {!feed.loading && !feed.error && feed.page?.items.length === 0 && (
          <div className="pc-empty">
            <PenLine size={38} aria-hidden="true" />
            <h3>{bt("첫 이야기를 기다리고 있어요", "Waiting for the first story")}</h3>
            <p>{bt("조건에 맞는 공개 게시물이 아직 없어요.", "No public posts match these filters yet.")}<br />{bt("직접 만든 작품과 작업 과정을 소개해 주세요.", "Introduce your own work and process.")}</p>
            <Link className="pc-button pc-primary" to="/community/promote/new">{bt("첫 소개 작성하기", "Write your first introduction")}</Link>
          </div>
        )}
        <div className="pc-grid">
          {feed.page?.items.map((post, index) => (
            <article className="pc-card" key={post.id} {...introItemProps(index)}>
              <Link
                className="pc-card-cover"
                to={`/community/promote/${encodeURIComponent(post.id)}`}
                aria-label={bt(`${post.seriesTitle} 소개 보기`, `View the introduction of ${post.seriesTitle}`)}
              >
                {post.cover ? (
                  <img src={post.cover} alt={bt(`${post.seriesTitle} 표지`, `${post.seriesTitle} cover`)} loading="lazy" decoding="async" width={640} height={800} />
                ) : (
                  <TypographicCover
                    title={post.seriesTitle}
                    seed={post.id}
                    eyebrow={bt(post.genre, GENRE_EN[post.genre] ?? post.genre)}
                    className="h-full w-full"
                  />
                )}
                {post.videoUrl && <span className="pc-video-badge"><Clapperboard size={14} aria-hidden="true" />{bt("영상", "Video")}</span>}
              </Link>
              <div className="pc-card-body">
                <div className="pc-tags">
                  <span>{bt(PROMOTION_STAGES[post.stage], STAGE_EN[post.stage] ?? PROMOTION_STAGES[post.stage])}</span>
                  <span>{bt(PROMOTION_KINDS[post.kind], KIND_EN[post.kind] ?? PROMOTION_KINDS[post.kind])}</span>
                  {post.archived && <span>{bt("보관됨", "Archived")}</span>}
                  {post.hidden && <span>{bt("운영 비공개", "Hidden by moderators")}</span>}
                </div>
                <h3><Link to={`/community/promote/${encodeURIComponent(post.id)}`}>{post.title}</Link></h3>
                <p>{post.description}</p>
                <div className="pc-card-footer">
                  <Link to={`/u/${encodeURIComponent(post.author.id)}`}>{post.author.name}</Link>
                  <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</time>
                </div>
              </div>
            </article>
          ))}
        </div>
        {feed.page?.hasMore && (
          <div className="pc-load-more">
            <button className="pc-button" type="button" disabled={feed.moreLoading || feed.loading} onClick={() => void feed.loadMore()}>
              {feed.moreLoading ? bt("불러오는 중…", "Loading…") : bt("더 많은 작품 보기", "Show more works")}
            </button>
          </div>
        )}
      </section>
      <footer className="pc-bottom">
        <p>{bt("읽기는 누구나, 등록·댓글·저장은 로그인 후 이용할 수 있어요. 도용·스팸·괴롭힘은 신고해 주세요.", "Anyone can read; posting, commenting, and saving need sign-in. Report plagiarism, spam, or harassment.")}</p>
        <Link to="/community">{bt("전체 커뮤니티", "All communities")}</Link>
        {feed.page?.canModerate && <Link to="/community/promote/moderation">{bt("홍보 신고 관리", "Promotion report moderation")}</Link>}
      </footer>
    </div>
  );
}
