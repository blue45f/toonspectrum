import {
  Coffee,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  COMMUNITY_CAFE_JOIN_POLICY_LABELS,
  COMMUNITY_CAFE_KIND_LABELS,
  COMMUNITY_CAFE_KINDS,
  COMMUNITY_CAFE_POSTING_POLICY_LABELS,
  COMMUNITY_CAFE_VISIBILITY_LABELS,
} from "@/shared/lib/types";
import type {
  CommunityCafe,
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRule,
  CommunityCafeVisibility,
} from "@/shared/lib/types";

import { Container } from "@/shared/components/section";
import { useApp, useHydrated } from "@/shared/lib/store";
import { GENRES } from "@/shared/lib/taxonomy";
import { cn, relativeDate } from "@/shared/lib/utils";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api, getApiErrorMessage } from "@/infrastructure/api";

const SORTS = [
  { value: "popular", label: "인기순" },
  { value: "recent", label: "최신순" },
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

function policySummary(cafe: CommunityCafe): string {
  return [
    COMMUNITY_CAFE_VISIBILITY_LABELS[cafe.visibility],
    COMMUNITY_CAFE_JOIN_POLICY_LABELS[cafe.joinPolicy],
    COMMUNITY_CAFE_POSTING_POLICY_LABELS[cafe.postingPolicy],
  ].join(" · ");
}

export function CafesPage() {
  useDocumentTitle("커뮤니티");
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
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") {
          setError("커뮤니티 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authHeaders, genre, kind, mineOnly, queryText, refreshTick, sort]);

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
      if (!created?.slug) throw new Error("커뮤니티 생성 응답이 유효하지 않습니다.");
      navigate(`/community/cafes/${encodeURIComponent(created.slug)}`);
    } catch (caught) {
      setCreateError(await getApiErrorMessage(caught, "커뮤니티를 만들지 못했습니다."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <Coffee size={14} /> MEMBER COMMUNITIES
          </p>
          <h1 className="mt-2 text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight sm:text-4xl">
            커뮤니티
          </h1>
          <p className="lede mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
            작품과 창작자, 장르와 프로젝트를 중심으로 모임을 만들고 함께 이야기하세요.
          </p>
        </div>
        <Link
          href="/community"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-line bg-canvas/45 px-3.5 py-2 text-xs font-medium text-fg-2 transition-colors hover:border-accent/45 hover:text-fg"
        >
          <UsersRound size={14} /> 통합 커뮤니티
        </Link>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="order-2 min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 text-xs focus-within:border-accent/50 sm:basis-56">
              <Search size={14} className="shrink-0 text-fg-3" />
              <span className="sr-only">커뮤니티 검색</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                maxLength={80}
                placeholder="이름·소개 검색"
                className="h-full w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-fg-3"
              />
            </label>
            <div className="inline-flex h-9 rounded-xl border border-line bg-raised/40">
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSort(option.value)}
                  aria-pressed={sort === option.value}
                  className={cn(
                    "px-3 text-xs font-medium first:rounded-l-xl last:rounded-r-xl",
                    sort === option.value ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-canvas/55",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {userId && (
              <button
                type="button"
                onClick={() => setMineOnly((current) => !current)}
                aria-pressed={mineOnly}
                className={cn(
                  "h-9 rounded-xl border px-3 text-xs font-medium",
                  mineOnly ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                )}
              >
                내 커뮤니티
              </button>
            )}
          </div>

          <div className="mb-3">
            <label className="grid gap-1.5 text-[0.68rem] font-bold text-fg-3 sm:hidden">
              커뮤니티 유형
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as CommunityCafeKind | "")}
                className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">모든 유형</option>
                {COMMUNITY_CAFE_KINDS.map((value) => (
                  <option key={value} value={value}>{COMMUNITY_CAFE_KIND_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <div className="rail hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
              <button
                type="button"
                onClick={() => setKind("")}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                  !kind ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                )}
              >
                모든 유형
              </button>
              {COMMUNITY_CAFE_KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind((current) => (current === value ? "" : value))}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                    kind === value ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                  )}
                >
                  {COMMUNITY_CAFE_KIND_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="grid gap-1.5 text-[0.68rem] font-bold text-fg-3 sm:hidden">
              관심 장르
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">장르 전체</option>
                {GENRES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="rail hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
              <button
                type="button"
                onClick={() => setGenre("")}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                  !genre ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                )}
              >
                장르 전체
              </button>
              {GENRES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGenre((current) => (current === value ? "" : value))}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                    genre === value ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-fg-2",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad">
              <span>{error}</span>
              <button type="button" onClick={() => setRefreshTick((tick) => tick + 1)} className="rounded-lg border border-bad/30 px-2 py-1 font-medium">
                다시 시도
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-44 rounded-2xl" />)}
            </div>
          ) : cafes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-card/45 px-6 py-14 text-center">
              <Sparkles className="mx-auto mb-3 text-accent" size={22} />
              <p className="text-sm font-medium text-fg">조건에 맞는 커뮤니티가 없어요.</p>
              <p className="mt-1 text-xs text-fg-3">필터를 바꾸거나 새 커뮤니티를 만들어보세요.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {cafes.map((cafe) => (
                <li key={cafe.id}>
                  <Link href={`/community/cafes/${encodeURIComponent(cafe.slug)}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-accent/45 hover:bg-raised/35">
                    <div className="flex items-start gap-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-accent-soft text-accent">
                        {cafe.visibility === "private" ? <Lock size={16} /> : <Coffee size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-fg">{cafe.name}</p>
                        <p className="text-[0.68rem] text-fg-3">{COMMUNITY_CAFE_KIND_LABELS[cafe.kind]} · {cafe.genre || "자유"}</p>
                      </div>
                      {cafe.viewerCanManage && <ShieldCheck size={15} className="text-accent" aria-label="관리 중" />}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-fg-2">{cafe.description}</p>
                    {cafe.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {cafe.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-canvas/70 px-2 py-0.5 text-[0.65rem] text-fg-3">#{tag}</span>)}
                      </div>
                    )}
                    <p className="text-[0.68rem] text-fg-3">{policySummary(cafe)}</p>
                    <p className="mt-auto pt-1 text-[0.68rem] text-fg-3">
                      멤버 <span className="numeral text-fg-2">{cafe.memberCount}</span> · 글 <span className="numeral text-fg-2">{cafe.postCount}</span> · {relativeDate(cafe.createdAt)} 개설
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="order-1 min-w-0 lg:order-2">
          <div className="sticky top-[var(--site-header-sticky-offset,5rem)] rounded-2xl border border-line bg-panel/40 p-4">
            <h2 className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-fg"><Plus size={14} className="text-accent" />새 커뮤니티</h2>
            <p className="mb-3 text-xs leading-relaxed text-fg-3">공개 범위와 가입·작성 정책을 개설할 때부터 설정할 수 있어요.</p>
            {!hydrated ? (
              <div className="skeleton h-40 rounded-lg" />
            ) : !userId ? (
              <p className="rounded-lg border border-line bg-card/60 px-3 py-6 text-center text-xs text-fg-3">로그인하면 커뮤니티를 만들 수 있어요.</p>
            ) : !composeOpen ? (
              <button type="button" onClick={() => setComposeOpen(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-on-accent"><Plus size={14} />커뮤니티 만들기</button>
            ) : (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void createCafe(); }}>
                <label className="block text-xs text-fg-3">이름<input value={name} onChange={(event) => setName(event.target.value.slice(0, 40))} maxLength={40} className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" /></label>
                <label className="block text-xs text-fg-3">유형<select value={composeKind} onChange={(event) => setComposeKind(event.target.value as CommunityCafeKind)} className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg">{COMMUNITY_CAFE_KINDS.map((value) => <option key={value} value={value}>{COMMUNITY_CAFE_KIND_LABELS[value]}</option>)}</select></label>
                <label className="block text-xs text-fg-3">장르<select value={composeGenre} onChange={(event) => setComposeGenre(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg"><option value="">자유</option>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="block text-xs text-fg-3">소개<textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} maxLength={500} className="mt-1 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-fg-3">공개<select value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityCafeVisibility)} className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg"><option value="public">공개</option><option value="private">비공개</option></select></label>
                  <label className="text-xs text-fg-3">가입<select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as CommunityCafeJoinPolicy)} className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg"><option value="open">바로 가입</option><option value="approval">승인제</option><option value="invite">초대 전용</option></select></label>
                </div>
                <label className="block text-xs text-fg-3">작성 권한<select value={postingPolicy} onChange={(event) => setPostingPolicy(event.target.value as CommunityCafePostingPolicy)} className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg"><option value="members">모든 회원</option><option value="staff">운영진만</option></select></label>
                <label className="block text-xs text-fg-3">태그<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="로판, 리뷰, 창작" className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg" /></label>
                <label className="block text-xs text-fg-3">규칙 <span className="text-fg-3/70">(한 줄에 제목|설명)</span><textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} rows={3} placeholder="서로 존중하기|비방과 혐오 표현을 금지합니다." className="mt-1 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" /></label>
                {createError && <p className="text-xs text-bad">{createError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg border border-line px-3 py-2 text-xs text-fg-3">닫기</button>
                  <button type="submit" disabled={creating || name.trim().length < 2 || description.trim().length < 2} className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent disabled:opacity-45">{creating ? "만드는 중..." : "만들기"}</button>
                </div>
              </form>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}
