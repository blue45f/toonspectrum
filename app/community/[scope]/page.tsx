import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, Sparkles, TrendingUp, UsersRound } from "lucide-react";
import type { FanCafeScopeFilter } from "@/lib/types";
import { listCommunityBoards } from "@/lib/server/community";
import { Container } from "@/components/section";
import { relativeDate } from "@/lib/utils";
import {
  COMMUNITY_SCOPE_DESCRIPTION,
  COMMUNITY_SCOPE_LABEL,
  COMMUNITY_SCOPE_ROUTES,
  COMMUNITY_SORT_LABEL,
  getCommunityScopeTargetLink,
  COMMUNITY_SORT_OPTIONS,
  parseCommunityScope,
  parseCommunitySort,
} from "@/lib/community-ui";

export const dynamic = "force-dynamic";

function parseScope(value: string | null): Exclude<FanCafeScopeFilter, "all"> | null {
  return parseCommunityScope(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scope: string }>;
}): Promise<Metadata> {
  const { scope } = await params;
  const resolvedScope = parseScope(scope);
  if (!resolvedScope) return { title: "해당 커뮤니티 페이지를 찾을 수 없어요" };
  return {
    title: `${COMMUNITY_SCOPE_LABEL[resolvedScope]} 커뮤니티`,
    description: COMMUNITY_SCOPE_DESCRIPTION[resolvedScope],
  };
}

export default async function CommunityScopePage({
  params,
  searchParams,
}: {
  params: Promise<{ scope: string }>;
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const { scope: scopeRaw } = await params;
  const { sort: sortRaw, q } = await searchParams;
  const scope = parseScope(scopeRaw);
  if (!scope) return notFound();

  const sort = parseCommunitySort(sortRaw);
  const query = (q ?? "").trim();
  const boards = await listCommunityBoards(scope, query, sort, 48);

  const totalBoards = boards.length;
  const totalPosts = boards.reduce((sum, board) => sum + board.postCount, 0);
  const totalReplies = boards.reduce((sum, board) => sum + board.replyCount, 0);

  return (
    <Container size="wide" className="relative py-8 lg:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-6 text-fg md:p-10">
        <div className="pointer-events-none absolute right-[-20%] top-[-25%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle_at_top,_rgba(124,92,252,.2),_transparent_70%)]" />
        <div className="relative z-10">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <UsersRound size={14} />
            COMMUNITY DIRECTORY
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/community"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2 py-1 text-xs text-fg-3 transition-colors hover:text-fg"
            >
              통합 커뮤니티 허브
            </Link>
            {COMMUNITY_SCOPE_ROUTES.filter((entry) => entry.value !== scope).map((entry) => (
              <Link
                key={entry.value}
                href={entry.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/50 px-2 py-1 text-xs text-fg-3 transition-colors hover:text-fg"
              >
                <span>{entry.icon}</span>
                {entry.label}
              </Link>
            ))}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {COMMUNITY_SCOPE_LABEL[scope]} 커뮤니티 디렉토리
          </h1>
          <p className="mt-2 max-w-xl text-sm text-fg-3">{COMMUNITY_SCOPE_DESCRIPTION[scope]}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/35 p-2">
            <form method="get" className="inline-flex min-w-0 grow items-center gap-2 rounded-lg bg-canvas/40 px-3 py-2 text-fg-3">
              <Search size={14} />
              <input
                name="q"
                defaultValue={query}
                maxLength={60}
                placeholder="보드명 검색"
                className="h-7 w-full min-w-0 border-none bg-transparent text-xs outline-none placeholder:text-fg-3"
              />
            </form>
            <div className="inline-flex rounded-xl border border-line bg-canvas/45 p-1 text-xs">
              {COMMUNITY_SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={`/community/${scope}?sort=${option.value}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    sort === option.value
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:bg-raised/60 hover:text-fg"
                  }`}
                >
                  {COMMUNITY_SORT_LABEL[option.value]}
                </Link>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-fg-3">
            현재 {totalBoards}개 보드 · 글 {totalPosts}개 · 댓글 {totalReplies}개
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-2">
        {boards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-card/50 p-5 text-sm text-fg-3">
            <p>조건에 맞는 보드가 없어요.</p>
            <p className="mt-1 text-xs">
              해당 범주에서 첫 시작이 필요해요. 작가·작품·펜카페 상세 페이지에서 글을 남기면 즉시 보드가 생성됩니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COMMUNITY_SCOPE_ROUTES.map((entry) => (
                <Link
                  key={entry.value}
                  href={entry.value === scope ? "/community" : entry.href}
                  className="rounded-full border border-line bg-card px-2 py-1 text-xs text-fg-3"
                >
                  {entry.label} 시작
                </Link>
              ))}
            </div>
          </div>
        ) : (
          boards.map((board) => {
            const boardHref = getCommunityScopeTargetLink(board.scope, board.targetId, board.targetLabel);
            return (
              <article
                key={`${board.scope}::${board.targetId}`}
                className="rounded-2xl border border-line bg-card p-4"
              >
                <p className="text-xs text-fg-3">{COMMUNITY_SCOPE_LABEL[board.scope]} 커뮤니티</p>
                <h2 className="mt-2 text-base font-semibold text-fg">{board.targetLabel}</h2>
                <p className="mt-1 text-xs text-fg-3">
                  최신글 {relativeDate(board.latestPostAt)} · 글 {board.postCount}개 · 댓글 {board.replyCount}개
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={boardHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs text-fg-3 transition-colors hover:bg-canvas/55 hover:text-fg"
                  >
                    <Sparkles size={12} />
                    커뮤니티로 이동
                  </Link>
                  <Link
                    href={`/community?scope=${board.scope}&board=${encodeURIComponent(`${board.scope}::${board.targetId}`)}&sort=${sort}`}
                    className="inline-flex rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-fg-3 transition-colors hover:bg-canvas/55 hover:text-fg"
                  >
                    <TrendingUp size={12} />
                    허브에서 보기
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </section>

      <p className="mt-4 text-xs text-fg-3">
        더 넓은 전체 보드를 보려면{" "}
        <Link href="/community" className="font-medium text-accent underline decoration-dotted">
          통합 커뮤니티 허브
        </Link>
        로 이동하세요.
      </p>
    </Container>
  );
}
