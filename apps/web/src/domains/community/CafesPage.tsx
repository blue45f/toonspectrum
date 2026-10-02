import {
  Coffee,
  Lock,
  LogIn,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  COMMUNITY_CAFE_KINDS,
} from "@/shared/lib/types";
import type {
  CommunityCafe,
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRule,
  CommunityCafeVisibility,
} from "@/shared/lib/types";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { CoverImage } from "@/shared/components/cover-image";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { LoadingState } from "@/shared/components/LoadingState";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useApp, useHydrated } from "@/shared/lib/store";
import { GENRES } from "@/shared/lib/taxonomy";
import { cn, relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { api, getApiErrorMessage } from "@/platform/api";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  MotionIllustration,
} from "@/shared/motion-assets";
import {
  CAFE_JOIN_POLICY_LABEL_KEYS,
  CAFE_KIND_ILLUSTRATIONS,
  CAFE_KIND_LABEL_KEYS,
  CAFE_POSTING_POLICY_LABEL_KEYS,
  CAFE_VISIBILITY_LABEL_KEYS,
} from "./community-cafe-labels";

const COPY = {
  docTitle: defineBilingualText("cafesPage", "docTitle", "회원 카페 · 커뮤니티", "Member cafés · Community"),
  pageTitle: defineBilingualText("cafesPage", "pageTitle", "회원 카페", "Member cafés"),
  listTitle: defineBilingualText("cafesPage", "listTitle", "카페 목록", "Café list"),
  resetFilters: defineBilingualText("cafesPage", "resetFilters", "필터 초기화", "Reset filters"),
  heroLede: defineBilingualText(
    "cafesPage",
    "heroLede",
    "작품·창작자·장르·프로젝트를 중심으로 회원이 직접 만드는 소모임이에요. 가입해 함께 이야기하세요.",
    "Member-made clubs around works, creators, genres and projects. Join one and start talking.",
  ),
  linkUnified: defineBilingualText("cafesPage", "linkUnified", "통합 커뮤니티", "Unified community"),
  searchAria: defineBilingualText("cafesPage", "searchAria", "커뮤니티 검색", "Search communities"),
  searchPlaceholder: defineBilingualText("cafesPage", "searchPlaceholder", "이름·소개 검색", "Search names & intros"),
  mineOnly: defineBilingualText("cafesPage", "mineOnly", "내 커뮤니티", "My communities"),
  kindFilterLabel: defineBilingualText("cafesPage", "kindFilterLabel", "커뮤니티 유형", "Community type"),
  kindAll: defineBilingualText("cafesPage", "kindAll", "모든 유형", "All types"),
  genreFilterLabel: defineBilingualText("cafesPage", "genreFilterLabel", "관심 장르", "Genres"),
  genreAll: defineBilingualText("cafesPage", "genreAll", "장르 전체", "All genres"),
  genreAny: defineBilingualText("cafesPage", "genreAny", "자유", "Any"),
  listErrorTitle: defineBilingualText("cafesPage", "listErrorTitle", "커뮤니티 목록을 불러오지 못했습니다.", "Couldn't load the community list."),
  listErrorMessage: defineBilingualText(
    "cafesPage",
    "listErrorMessage",
    "{detail} 현재 목록이 비어 있다는 뜻은 아닙니다.",
    "{detail} This doesn't mean the list is empty.",
  ),
  emptyTitle: defineBilingualText("cafesPage", "emptyTitle", "조건에 맞는 커뮤니티가 없어요.", "No communities match your filters."),
  emptyDescription: defineBilingualText(
    "cafesPage",
    "emptyDescription",
    "필터를 바꾸거나 새 커뮤니티를 만들어보세요.",
    "Try different filters or create a new community.",
  ),
  managingAria: defineBilingualText("cafesPage", "managingAria", "관리 중", "Managing"),
  membersLabel: defineBilingualText("cafesPage", "membersLabel", "멤버", "Members"),
  postsLabel: defineBilingualText("cafesPage", "postsLabel", "글", "Posts"),
  openedAt: defineBilingualText("cafesPage", "openedAt", "{date} 개설", "Opened {date}"),
  newCafeTitle: defineBilingualText("cafesPage", "newCafeTitle", "새 커뮤니티", "New community"),
  newCafeDescription: defineBilingualText(
    "cafesPage",
    "newCafeDescription",
    "공개 범위와 가입·작성 정책을 개설할 때부터 설정할 수 있어요.",
    "Set visibility, join, and posting policies from the start.",
  ),
  signInToCreate: defineBilingualText("cafesPage", "signInToCreate", "로그인하면 커뮤니티를 만들 수 있어요.", "Sign in to create a community."),
  signInAction: defineBilingualText("cafesPage", "signInAction", "로그인하고 만들기", "Sign in to create"),
  createCafe: defineBilingualText("cafesPage", "createCafe", "커뮤니티 만들기", "Create community"),
  formName: defineBilingualText("cafesPage", "formName", "이름", "Name"),
  formKind: defineBilingualText("cafesPage", "formKind", "유형", "Type"),
  formGenre: defineBilingualText("cafesPage", "formGenre", "장르", "Genre"),
  formDescription: defineBilingualText("cafesPage", "formDescription", "소개", "Description"),
  formVisibility: defineBilingualText("cafesPage", "formVisibility", "공개", "Visibility"),
  formJoin: defineBilingualText("cafesPage", "formJoin", "가입", "Join"),
  formPosting: defineBilingualText("cafesPage", "formPosting", "작성 권한", "Posting policy"),
  formTags: defineBilingualText("cafesPage", "formTags", "태그", "Tags"),
  formRules: defineBilingualText("cafesPage", "formRules", "규칙", "Rules"),
  rulesHint: defineBilingualText("cafesPage", "rulesHint", "(한 줄에 제목|설명)", "(one line: title|description)"),
  rulesPlaceholder: defineBilingualText(
    "cafesPage",
    "rulesPlaceholder",
    "서로 존중하기|비방과 혐오 표현을 금지합니다.",
    "Respect each other|No harassment or hate speech.",
  ),
  tagsPlaceholder: defineBilingualText("cafesPage", "tagsPlaceholder", "로판, 리뷰, 창작", "romance fantasy, reviews, creation"),
  close: defineBilingualText("cafesPage", "close", "닫기", "Close"),
  creating: defineBilingualText("cafesPage", "creating", "만드는 중...", "Creating…"),
  create: defineBilingualText("cafesPage", "create", "만들기", "Create"),
  invalidCreateResponse: defineBilingualText(
    "cafesPage",
    "invalidCreateResponse",
    "커뮤니티 생성 응답이 유효하지 않습니다.",
    "Invalid community creation response.",
  ),
  createError: defineBilingualText("cafesPage", "createError", "커뮤니티를 만들지 못했습니다.", "Couldn't create the community."),
} as const;

const SORTS = [
  { value: "popular", key: defineBilingualText("cafesPage", "sortPopular", "인기순", "Most popular") },
  { value: "recent", key: defineBilingualText("cafesPage", "sortRecent", "최신순", "Newest") },
] as const;

function parseRules(value: string): CommunityCafeRule[] {
  return value
    .split("\n")
    .map((line, index) => {
      const [rawTitle, ...descriptionParts] = line.split("|");
      const title = rawTitle?.trim() ?? "";
      if (!title) return null;
      return {
        id: `rule-${index + 1}`,
        title,
        description: descriptionParts.join("|").trim(),
      };
    })
    .filter((item): item is CommunityCafeRule => item !== null)
    .slice(0, 12);
}

function policySummary(t: (key: string) => string, cafe: CommunityCafe): string {
  return [
    t(CAFE_VISIBILITY_LABEL_KEYS[cafe.visibility]),
    t(CAFE_JOIN_POLICY_LABEL_KEYS[cafe.joinPolicy]),
    t(CAFE_POSTING_POLICY_LABEL_KEYS[cafe.postingPolicy]),
  ].join(" · ");
}

export function CafesPage() {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const isEnglish = (normalizeLocaleCode(language) ?? "").startsWith("en");
  const pageLang = isEnglish ? "en" : "ko";

  useDocumentTitle(t(COPY.docTitle));
  const navigate = useNavigate();
  const userId = useApp((state) => state.userId);
  const sessionToken = useApp((state) => state.sessionToken);
  const hydrated = useHydrated();
  const authHeaders = useMemo(
    () => (sessionToken ? { "x-user-id": sessionToken } : undefined),
    [sessionToken],
  );

  const [cafes, setCafes] = useState<CommunityCafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState<CommunityCafeKind | "">("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("popular");
  const [mineOnly, setMineOnly] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [composeGenre, setComposeGenre] = useState("");
  const [composeKind, setComposeKind] = useState<CommunityCafeKind>("genre");
  const [visibility, setVisibility] = useState<CommunityCafeVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<CommunityCafeJoinPolicy>("open");
  const [postingPolicy, setPostingPolicy] = useState<CommunityCafePostingPolicy>("members");
  const [tagsText, setTagsText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQueryText(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (mineOnly && !userId) setMineOnly(false);
  }, [mineOnly, userId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<{ items?: unknown }>("/community/cafes", {
        params: {
          sort,
          genre: genre || undefined,
          kind: kind || undefined,
          q: queryText || undefined,
          mine: mineOnly || undefined,
        },
        headers: authHeaders,
        signal: controller.signal,
      })
      .then((data) => {
        setCafes(Array.isArray(data?.items) ? (data.items as CommunityCafe[]) : []);
      })
      .catch(async (caught) => {
        if ((caught as Error).name !== "AbortError") {
          setError(await getApiErrorMessage(
            caught,
            t(COPY.listErrorTitle),
          ));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authHeaders, genre, kind, mineOnly, queryText, refreshTick, sort, t]);

  async function createCafe() {
    if (!userId || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.post<CommunityCafe>(
        "/community/cafes",
        {
          name,
          description,
          genre: composeGenre,
          kind: composeKind,
          visibility,
          joinPolicy,
          postingPolicy,
          tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
          rules: parseRules(rulesText),
        },
        { headers: authHeaders },
      );
      if (!created?.slug) throw new Error(t(COPY.invalidCreateResponse));
      navigate(`/community/cafes/${encodeURIComponent(created.slug)}`);
    } catch (caught) {
      setCreateError(await getApiErrorMessage(caught, t(COPY.createError)));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div lang={pageLang}>
      <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
        <SitePageHeader
          surface="plain"
          className="mb-6 sm:mb-8"
          icon={Coffee}
          eyebrow="MEMBER COMMUNITIES"
          title={t(COPY.pageTitle)}
          description={t(COPY.heroLede)}
          actions={
            <Link href="/community" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 gap-1.5" })}>
              <UsersRound size={15} aria-hidden="true" />
              {t(COPY.linkUnified)}
            </Link>
          }
          aside={
            <CoverImage
              src="/images/section-community.webp"
              alt=""
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
          }
          asideClassName="hidden lg:block"
        />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_340px]">
          {/* 좁은 화면: 로그인한 사람에게는 만들기 버튼을 목록 위에, 로그인 전에는 목록을 먼저 보여 준다. */}
          <section className="order-2 min-w-0 lg:order-1" aria-labelledby="cafes-list-title">
            <h2 id="cafes-list-title" className="sr-only">{t(COPY.listTitle)}</h2>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 text-xs focus-within:border-accent/50 sm:basis-56">
                <Search size={14} className="shrink-0 text-fg-3" />
                <span className="sr-only">{t(COPY.searchAria)}</span>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  maxLength={80}
                  placeholder={t(COPY.searchPlaceholder)}
                  className="h-full w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-fg-3"
                />
              </label>
              <div className="inline-flex min-h-11 rounded-xl border border-line bg-raised/40">
                {SORTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSort(option.value)}
                    aria-pressed={sort === option.value}
                    className={cn(
                      "min-h-11 px-3 text-xs font-medium first:rounded-l-xl last:rounded-r-xl",
                      sort === option.value ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-canvas/55",
                    )}
                  >
                    {t(option.key)}
                  </button>
                ))}
              </div>
              {userId && (
                <button
                  type="button"
                  onClick={() => setMineOnly((current) => !current)}
                  aria-pressed={mineOnly}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 text-xs font-medium",
                    mineOnly ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                  )}
                >
                  {t(COPY.mineOnly)}
                </button>
              )}
            </div>

            <div className="mb-3">
              <label className="grid gap-1.5 text-xs font-bold text-fg-3 sm:hidden">
                {t(COPY.kindFilterLabel)}
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as CommunityCafeKind | "")}
                  className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">{t(COPY.kindAll)}</option>
                  {COMMUNITY_CAFE_KINDS.map((value) => (
                    <option key={value} value={value}>{t(CAFE_KIND_LABEL_KEYS[value])}</option>
                  ))}
                </select>
              </label>
              <div className="rail hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
                <button
                  type="button"
                  onClick={() => setKind("")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-11",
                    !kind ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                  )}
                >
                  {t(COPY.kindAll)}
                </button>
                {COMMUNITY_CAFE_KINDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind((current) => (current === value ? "" : value))}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-11",
                      kind === value ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                    )}
                  >
                    {t(CAFE_KIND_LABEL_KEYS[value])}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="grid gap-1.5 text-xs font-bold text-fg-3 sm:hidden">
                {t(COPY.genreFilterLabel)}
                <select
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">{t(COPY.genreAll)}</option>
                  {GENRES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <div className="rail hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
                <button
                  type="button"
                  onClick={() => setGenre("")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-11",
                    !genre ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                  )}
                >
                  {t(COPY.genreAll)}
                </button>
                {GENRES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGenre((current) => (current === value ? "" : value))}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-11",
                      genre === value ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <LoadingState variant="cards" cardCount={4} />
            ) : error ? (
              <ErrorState
                title={t(COPY.listErrorTitle)}
                message={t(COPY.listErrorMessage, { detail: error })}
                onRetry={() => setRefreshTick((tick) => tick + 1)}
                className="py-14"
              />
            ) : cafes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-card/45 px-6 py-14 text-center">
                <Sparkles className="mx-auto mb-3 text-accent" size={22} />
                <p className="text-sm font-medium text-fg">{t(COPY.emptyTitle)}</p>
                <p className="mt-1 text-xs text-fg-3">{t(COPY.emptyDescription)}</p>
                <button
                  type="button"
                  onClick={() => { setSearchText(""); setKind(""); setGenre(""); setMineOnly(false); }}
                  className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 min-h-11" })}
                >
                  {t(COPY.resetFilters)}
                </button>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {cafes.map((cafe, index) => (
                  <li key={cafe.id} {...introItemProps(index)}>
                    <Link href={`/community/cafes/${encodeURIComponent(cafe.slug)}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-accent/45 hover:bg-raised/35">
                      <div className="relative flex h-24 items-center justify-between gap-3 overflow-hidden bg-accent-soft/25 px-4">
                        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">
                          {t(CAFE_KIND_LABEL_KEYS[cafe.kind])}
                        </span>
                        <MotionIllustration
                          name={CAFE_KIND_ILLUSTRATIONS[cafe.kind]}
                          size="lg"
                          animated={false}
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-start gap-2">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-accent-soft text-accent">
                            {cafe.visibility === "private" ? <Lock size={16} /> : <Coffee size={16} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-fg">{cafe.name}</p>
                            <p className="text-xs text-fg-3">{t(CAFE_KIND_LABEL_KEYS[cafe.kind])} · {cafe.genre || t(COPY.genreAny)}</p>
                          </div>
                          {cafe.viewerCanManage && <ShieldCheck size={15} className="text-accent" aria-label={t(COPY.managingAria)} />}
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-fg-2">{cafe.description}</p>
                        {cafe.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cafe.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-canvas/70 px-2 py-0.5 text-xs text-fg-3">#{tag}</span>)}
                          </div>
                        )}
                        <p className="text-xs text-fg-3">{policySummary(t, cafe)}</p>
                        <p className="mt-auto pt-1 text-xs text-fg-3">
                          {t(COPY.membersLabel)} <span className="numeral text-fg-2">{cafe.memberCount}</span> · {t(COPY.postsLabel)} <span className="numeral text-fg-2">{cafe.postCount}</span> · {t(COPY.openedAt, { date: relativeDate(cafe.createdAt, undefined, pageLang) })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className={cn("min-w-0 lg:order-2", hydrated && userId ? "order-1" : "order-3")}>
            <div className="sticky top-[var(--site-header-sticky-offset,5rem)] rounded-2xl border border-line bg-panel/40 p-4">
              <h2 className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-fg"><Plus size={14} className="text-accent" />{t(COPY.newCafeTitle)}</h2>
              <p className="mb-3 text-xs leading-relaxed text-fg-3">{t(COPY.newCafeDescription)}</p>
              {!hydrated ? (
                <div className="skeleton h-40 rounded-lg" />
              ) : !userId ? (
                <div className="rounded-lg border border-line bg-card/60 px-3 py-4 text-center">
                  <p className="text-xs text-fg-3">{t(COPY.signInToCreate)}</p>
                  <button
                    type="button"
                    onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "community-cafes-create", mode: "login" })}
                    className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11 gap-1.5" })}
                  >
                    <LogIn size={14} aria-hidden="true" />
                    {t(COPY.signInAction)}
                  </button>
                </div>
              ) : !composeOpen ? (
                <button type="button" onClick={() => setComposeOpen(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-on-accent"><Plus size={14} />{t(COPY.createCafe)}</button>
              ) : (
                <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void createCafe(); }}>
                  <label className="block text-xs text-fg-3">{t(COPY.formName)}<input value={name} onChange={(event) => setName(event.target.value.slice(0, 40))} maxLength={40} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" /></label>
                  <label className="block text-xs text-fg-3">{t(COPY.formKind)}<select value={composeKind} onChange={(event) => setComposeKind(event.target.value as CommunityCafeKind)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg">{COMMUNITY_CAFE_KINDS.map((value) => <option key={value} value={value}>{t(CAFE_KIND_LABEL_KEYS[value])}</option>)}</select></label>
                  <label className="block text-xs text-fg-3">{t(COPY.formGenre)}<select value={composeGenre} onChange={(event) => setComposeGenre(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg"><option value="">{t(COPY.genreAny)}</option>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="block text-xs text-fg-3">{t(COPY.formDescription)}<textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} maxLength={500} className="mt-1 min-h-11 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-fg-3">{t(COPY.formVisibility)}<select value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityCafeVisibility)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg">{Object.keys(CAFE_VISIBILITY_LABEL_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_VISIBILITY_LABEL_KEYS[value as CommunityCafeVisibility])}</option>)}</select></label>
                    <label className="text-xs text-fg-3">{t(COPY.formJoin)}<select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as CommunityCafeJoinPolicy)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg">{Object.keys(CAFE_JOIN_POLICY_LABEL_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_JOIN_POLICY_LABEL_KEYS[value as CommunityCafeJoinPolicy])}</option>)}</select></label>
                  </div>
                  <label className="block text-xs text-fg-3">{t(COPY.formPosting)}<select value={postingPolicy} onChange={(event) => setPostingPolicy(event.target.value as CommunityCafePostingPolicy)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg">{Object.keys(CAFE_POSTING_POLICY_LABEL_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_POSTING_POLICY_LABEL_KEYS[value as CommunityCafePostingPolicy])}</option>)}</select></label>
                  <label className="block text-xs text-fg-3">{t(COPY.formTags)}<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder={t(COPY.tagsPlaceholder)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg" /></label>
                  <label className="block text-xs text-fg-3">{t(COPY.formRules)} <span className="text-fg-3/70">{t(COPY.rulesHint)}</span><textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} rows={3} placeholder={t(COPY.rulesPlaceholder)} className="mt-1 min-h-11 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" /></label>
                  {createError && <p role="alert" className="text-xs text-bad">{createError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setComposeOpen(false)} className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs text-fg-3">{t(COPY.close)}</button>
                    <button type="submit" disabled={creating || name.trim().length < 2 || description.trim().length < 2} className="min-h-11 flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent disabled:opacity-45">{creating ? t(COPY.creating) : t(COPY.create)}</button>
                  </div>
                </form>
              )}
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
