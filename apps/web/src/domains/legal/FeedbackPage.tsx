import { ArrowDown, ArrowUpRight, Bug, Check, Lightbulb, MessageSquarePlus, MessagesSquare, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";

import { FeedbackComposer } from "./feedback/FeedbackComposer";
import { FeedbackPostCard } from "./feedback/FeedbackPostCard";
import { useFeedbackFeed } from "./feedback/use-feedback-feed";
import { feedbackRouteState } from "./feedback/feedback-route-state";
import "./feedback/feedback-community.css";

import type { FeedbackFilters } from "./feedback/use-feedback-feed";
import type { FeedbackEntry, FeedbackKind, FeedbackProgress } from "@toonstudio/core/feedback";

import { Container } from "@/shared/components/container";
import { useApp, useHydrated } from "@/shared/lib/store";
import { MotionEmptyState } from "@/shared/motion-assets/motion-assets-empty";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABELS, FEEDBACK_PROGRESS, FEEDBACK_PROGRESS_LABELS } from "@toonstudio/core/feedback";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("FeedbackPage", ko, en);

const EMPTY_FILTERS: FeedbackFilters = { category: "all", progress: "all", query: "", mine: false, tag: "" };
const INTAKES = [
  {
    kind: "bug",
    icon: Bug,
    ko: ["버그를 발견했어요", "불편했던 순간과 재현 방법을 알려주세요.", "버그 제보"],
    en: ["Found a bug", "Tell us what went wrong and how to reproduce it.", "Report a bug"],
  },
  {
    kind: "idea",
    icon: Lightbulb,
    ko: ["이런 아이디어는 어때요?", "더 즐겁게 창작할 수 있는 생각을 나눠요.", "아이디어 제안"],
    en: ["How about this idea?", "Share thoughts that make creating more enjoyable.", "Suggest an idea"],
  },
  {
    kind: "request",
    icon: Sparkles,
    ko: ["이 기능이 필요해요", "작업에 꼭 필요한 도구와 개선을 요청해요.", "기능 요청"],
    en: ["I need this feature", "Request the tools and improvements your workflow really needs.", "Request a feature"],
  },
] as const;
export function FeedbackPage() {
  useBilingualI18nRevision();
  const userId = useApp((state) => state.userId);
  const hydrated = useHydrated();
  const [initialRoute] = useState(() => feedbackRouteState(
    typeof window === "undefined" ? "" : window.location.search,
    typeof window !== "undefined" && window.matchMedia("(min-width: 761px)").matches,
  ));
  const [kind, setKind] = useState<FeedbackKind>(initialRoute.kind);
  const [filters, setFilters] = useState<FeedbackFilters>(initialRoute.filters);
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(initialRoute.composerOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState(false);
  const composer = useRef<HTMLDetailsElement | null>(null);
  const board = useRef<HTMLElement | null>(null);
  const feed = useFeedbackFeed(filters, userId);
  const chooseKind = (selected: FeedbackKind) => {
    setKind(selected); setComposerOpen(true);
    window.requestAnimationFrame(() => { composer.current?.scrollIntoView({ block: "nearest" }); composer.current?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true }); });
  };
  const searchExisting = (query: string) => {
    setSearch(query); setFilters({ ...EMPTY_FILTERS, query });
    board.current?.scrollIntoView({ block: "start" });
  };
  const created = (entry: FeedbackEntry) => {
    setCreatedNotice(true);
    setFilters({ ...EMPTY_FILTERS, category: entry.category }); setSearch(""); setExpandedId(entry.id); feed.refresh();
    board.current?.scrollIntoView({ block: "start" });
  };
  const filtered = filters.category !== "all" || filters.progress !== "all" || !!filters.query || !!filters.tag || filters.mine;
  // packages/core의 FEEDBACK_KIND_LABELS/FEEDBACK_PROGRESS_LABELS는 코어 파일이라
  // 건드리지 않고 페이지 레벨에서 이중언어로 감싼다.
  const kindLabels: Record<FeedbackKind, string> = {
    bug: bi(FEEDBACK_KIND_LABELS.bug, "Bug"),
    idea: bi(FEEDBACK_KIND_LABELS.idea, "Idea"),
    request: bi(FEEDBACK_KIND_LABELS.request, "Feature request"),
    question: bi(FEEDBACK_KIND_LABELS.question, "Usage question"),
  };
  const progressLabels: Record<FeedbackProgress, string> = {
    received: bi(FEEDBACK_PROGRESS_LABELS.received, "Received"),
    reviewing: bi(FEEDBACK_PROGRESS_LABELS.reviewing, "Reviewing"),
    planned: bi(FEEDBACK_PROGRESS_LABELS.planned, "Planned"),
    in_progress: bi(FEEDBACK_PROGRESS_LABELS.in_progress, "In progress"),
    completed: bi(FEEDBACK_PROGRESS_LABELS.completed, "Completed"),
    not_planned: bi(FEEDBACK_PROGRESS_LABELS.not_planned, "On hold"),
  };
  return <Container size="default" className="feedback-community">
    <header className="fb-hero">
      <div>
        <p className="fb-eyebrow"><MessagesSquare size={15} aria-hidden="true" /> TOONSTUDIO · COMMUNITY</p>
        <p className="fb-hero-kicker">{bi("제보·제안 커뮤니티", "Feedback community")}</p>
        <h1 className="fb-hero-title">{bi("더 나은 창작 경험,", "A better creation experience,")}<br /><em>{bi("함께 만들어가요.", "built together.")}</em></h1>
        <p className="fb-hero-description">{bi("버그는 고치고, 아이디어는 키우고, 필요한 기능은 함께 논의해요.", "We fix bugs, grow ideas, and discuss the features you need.")}<br className="fb-desktop-break" /> {bi("여러분의 의견과 운영자의 처리 과정을 한곳에서 확인하세요.", "See your voice and our handling process in one place.")}</p>
      </div>
      <div className="fb-hero-aside">
        <span className="fb-small-label">{bi("당신의 한마디가 바꾸는 스튜디오", "Your words change the studio")}</span>
        <div className="fb-process" aria-label={bi("제보 처리 과정", "Feedback handling process")}><span><b>01</b>{bi("접수", "Intake")}</span><span><b>02</b>{bi("검토·논의", "Review & discussion")}</span><span><b>03</b>{bi("반영 안내", "Resolution notes")}</span></div>
        <button className="fb-button fb-primary" type="button" onClick={() => chooseKind(kind)}><MessageSquarePlus size={17} aria-hidden="true" /> {bi("제보 작성", "Write feedback")} <ArrowDown size={15} aria-hidden="true" /></button>
        <p className="fb-caption">{bi("누구나 읽고, 로그인 후 참여할 수 있어요.", "Anyone can read; sign in to participate.")}</p>
      </div>
    </header>
    <div className="fb-intakes" aria-label={bi("제보 유형 선택", "Choose a feedback type")}>{INTAKES.map((intake) => {
      const [title, description, action] = bi(intake.ko, intake.en);
      return <button type="button" key={intake.kind} className="fb-intake" data-kind={intake.kind} onClick={() => chooseKind(intake.kind)}><span className="fb-intake-icon"><intake.icon size={21} aria-hidden="true" /></span><span className="fb-intake-copy"><strong>{title}</strong><span>{description}</span><small>{action} <ArrowUpRight size={13} aria-hidden="true" /></small></span></button>;
    })}</div>
    <div className="fb-layout">
      <section className="fb-board" ref={board} aria-labelledby="fb-board-heading">
        <div className="fb-board-heading"><div><p className="fb-eyebrow">VOICE OF CREATORS</p><h2 id="fb-board-heading">{bi("함께 나누는 제보와 제안", "Shared reports and proposals")}</h2></div><button type="button" className="fb-icon-button" onClick={feed.refresh} disabled={feed.loading} aria-label={bi("제보 목록 새로고침", "Reload the feedback list")}><RefreshCw size={17} aria-hidden="true" /></button></div>
        <form role="search" className="fb-search" onSubmit={(event) => { event.preventDefault(); setFilters((previous) => ({ ...previous, query: search.trim() })); }}><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor="fb-search-input">{bi("제보 검색", "Search feedback")}</label><input id="fb-search-input" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} placeholder={bi("같은 제보가 있는지 먼저 찾아보세요", "Check if a similar report already exists")} type="search" /><button className="fb-button" type="submit">{bi("검색", "Search")}</button></form>
        <div className="fb-tabs" role="group" aria-label={bi("제보 유형 필터", "Filter by feedback type")}>{(["all", ...FEEDBACK_KINDS] as const).map((value) => <button type="button" key={value} aria-pressed={filters.category === value} onClick={() => setFilters((previous) => ({ ...previous, category: value }))}>{value === "all" ? bi("전체", "All") : kindLabels[value]}</button>)}</div>
        <div className="fb-filters"><div className="fb-status-filter"><label htmlFor="fb-progress-filter">{bi("처리 상태", "Progress")}</label><select id="fb-progress-filter" value={filters.progress} onChange={(event) => setFilters((previous) => ({ ...previous, progress: event.target.value as FeedbackFilters["progress"] }))}><option value="all">{bi("전체 상태", "All statuses")}</option>{FEEDBACK_PROGRESS.map((value) => <option key={value} value={value}>{progressLabels[value]}</option>)}</select></div><button type="button" className="fb-my-posts" aria-pressed={filters.mine && !!userId} disabled={!userId} title={!userId ? bi("로그인 후 사용할 수 있어요", "Available after sign-in") : undefined} onClick={() => setFilters((previous) => ({ ...previous, mine: !previous.mine }))}><Check size={13} aria-hidden="true" /> {bi("내 제보", "My posts")}</button><span className="fb-caption fb-order">{bi("최신순", "Newest first")}</span></div>
        {filtered && <div className="fb-active-filters">{filters.query && <span>{bi("검색:", "Search:")} {filters.query}</span>}{filters.tag && <span>{bi("태그:", "Tag:")} #{filters.tag}</span>}<button type="button" className="fb-text-button" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(""); }}>{bi("필터 초기화", "Clear filters")} <X size={13} aria-hidden="true" /></button></div>}
        {createdNotice && <p className="fb-success fb-confirmation" role="status"><Check size={17} aria-hidden="true" />{bi("제보가 등록되었습니다. 운영자의 검토와 다른 사용자의 의견을 이곳에서 확인할 수 있어요.", "Your feedback was posted. Follow the operator's review and other users' opinions right here.")}<button type="button" className="fb-icon-button" aria-label={bi("등록 알림 닫기", "Dismiss the confirmation")} onClick={() => setCreatedNotice(false)}><X size={15} aria-hidden="true" /></button></p>}
        <div aria-busy={feed.loading}>
          {feed.loading && (feed.items.length
            ? <p className="fb-caption" role="status">{bi("최신 제보를 확인하고 있어요. 작성 중인 내용은 유지됩니다.", "Fetching the latest feedback. Your draft is preserved.")}</p>
            : <div className="fb-skeletons" role="status" aria-label={bi("제보 목록을 불러오는 중", "Loading the feedback list")}>{[0, 1, 2].map((key) => <div key={key} className="fb-skeleton skeleton" />)}</div>)}
          {feed.error && <MotionEmptyState
            kind="error"
            title={bi("제보 목록을 불러오지 못했어요", "Could not load the feedback list")}
            description={feed.items.length > 0
              ? bi(`${feed.error} 아래는 이전에 불러온 목록입니다. 최신 내용을 확인한 뒤 다시 참여할 수 있어요.`, `${feed.error} Below is the previously loaded list. You can join again after checking for updates.`)
              : feed.error}
            action={
              <button type="button" className="fb-button" onClick={feed.refresh}>{bi("다시 불러오기", "Reload")}</button>
            }
          />}
          {/* Keep this list at a stable position while refreshing; inline drafts must not unmount. */}
          {feed.items.length > 0 && <>
            <p className="fb-list-count" role="status">{bi(`현재 ${feed.items.length}개의 제보를 보고 있어요${feed.hasMore ? " · 더 불러올 수 있어요" : ""}`, `Currently showing ${feed.items.length} posts${feed.hasMore ? " · more available" : ""}`)}</p>
            <ul className="fb-posts">{feed.items.map((post) => <FeedbackPostCard key={`${post.id}:${userId ?? "guest"}`} post={post} userId={userId} canManage={feed.canManage} readOnly={!feed.apiReady} expanded={expandedId === post.id} onToggle={() => setExpandedId((previous) => previous === post.id ? null : post.id)} onUpdated={(patch) => feed.update(post.id, patch)} onTag={(tag) => setFilters((previous) => ({ ...previous, tag }))} />)}</ul>
          </>}
          {!feed.loading && !feed.error && feed.items.length === 0 && <MotionEmptyState
            kind={filtered ? "search" : "empty"}
            title={filtered ? bi("조건에 맞는 제보가 없어요", "No feedback matches your filters") : bi("첫 의견을 기다리고 있어요", "Waiting for the first voice")}
            description={filtered
              ? bi("다른 검색어나 필터로 찾아보거나 새 제보를 남겨주세요.", "Try different search terms or filters, or leave a new post.")
              : bi("불편했던 순간이나 떠오른 아이디어를 나눠주세요.", "Share a moment of frustration or an idea that came to mind.")}
            action={
              <button type="button" className="fb-button" onClick={() => chooseKind(kind)}>{bi("새 제보 작성", "Write a new post")}</button>
            }
          />}
        </div>
        {feed.moreError && <p className="fb-error" role="alert">{feed.moreError}</p>}
        {feed.hasMore && !feed.loading && <button className="fb-button fb-more" type="button" onClick={() => { void feed.loadMore(); }} disabled={feed.loadingMore}>{feed.loadingMore ? bi("불러오는 중…", "Loading…") : feed.moreError ? bi("다음 제보 다시 불러오기", "Reload the next posts") : bi("제보 더보기", "Show more posts")}<ArrowDown size={15} aria-hidden="true" /></button>}
      </section>
      <aside className="fb-sidebar">
        <details ref={composer} className="fb-composer" open={composerOpen} onToggle={(event) => setComposerOpen(event.currentTarget.open)}>
          <summary><span><MessageSquarePlus size={18} aria-hidden="true" />{bi("새 제보 작성", "Write a new post")}</span><span className="fb-caption">{bi("열기 / 접기", "Open / close")}</span></summary>
          <div className="fb-composer-content"><FeedbackComposer key={userId ?? "guest"} kind={kind} onKindChange={setKind} userId={userId} hydrated={hydrated} apiReady={feed.apiReady} onCreated={created} onSearch={searchExisting} /></div>
        </details>
        <section className="fb-guidelines" aria-labelledby="fb-guidelines-title"><p className="fb-eyebrow">BETTER TOGETHER</p><h2 id="fb-guidelines-title">{bi("좋은 의견이 좋은 도구를 만듭니다", "Good voices make good tools")}</h2><p><b>{bi("하나의 글에는 하나의 주제", "One post, one topic")}</b><br />{bi("관련 기능과 원하는 결과를 구체적으로 알려주세요.", "Describe the related feature and the outcome you want, concretely.")}</p><p><b>{bi("같은 의견에는 공감과 댓글", "Empathy and comments on similar posts")}</b><br />{bi("중복 제보 대신 경험을 보태면 검토에 도움이 됩니다.", "Adding your experience instead of duplicating helps the review.")}</p><p><b>{bi("답변과 실제 반영은 구분합니다", "Answers and real resolutions are different")}</b><br />{bi("‘운영자 답변’은 응답 여부, ‘처리 상태’는 개선 진행 상황입니다.", "'Operator answer' means a response; 'progress' shows how the fix is going.")}</p><a href="/contact" className="fb-text-button">{bi("문의·제휴 안내", "Contact & partnership guide")} <ArrowUpRight size={14} aria-hidden="true" /></a></section>
      </aside>
    </div>
  </Container>;
}
