"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Compass, MessageCircle, RefreshCw, Search, TrendingUp, UsersRound } from "lucide-react";
import type { FanCafeBoard, FanCafePost, FanCafeScopeFilter } from "@/lib/types";
import { Container } from "@/components/section";
import { FanCafePanel } from "@/components/fan-cafe-panel";
import { relativeDate } from "@/lib/utils";
import { ensureArray, resolveApiError, safeParseJson } from "@/lib/http-safe";
import {
  COMMUNITY_SCOPE_DIRECTORIES,
  COMMUNITY_SCOPE_TABS,
  COMMUNITY_SCOPE_LABEL,
  COMMUNITY_SORT_OPTIONS,
  COMMUNITY_SCOPE_ALL_SET,
  getCommunityScopeTargetLink,
  parseCommunitySort,
  parseCommunityScopeWithAll,
} from "@/lib/community-ui";
type BoardSort = (typeof COMMUNITY_SORT_OPTIONS)[number]["value"];

const BOARD_LIMIT = 32;
const MAX_SCOPE_CHIP = 4;

const makeBoardKey = (board: FanCafeBoard) => `${board.scope}::${board.targetId}`;
const BOARD_SCOPE_SET = COMMUNITY_SCOPE_ALL_SET;

const parseBoardKey = (value: string | null): string | null => {
  if (!value) return null;
  const sep = value.indexOf("::");
  if (sep < 1) return null;
  const scope = value.slice(0, sep) as FanCafeScopeFilter;
  const targetId = value.slice(sep + 2);
  if (!targetId) return null;
  return BOARD_SCOPE_SET.has(scope) ? `${scope}::${targetId}` : null;
};

const parseSort = (value: string | null): BoardSort => parseCommunitySort(value);
const parseScope = (value: string | null): FanCafeScopeFilter => parseCommunityScopeWithAll(value);

export default function CommunityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParamString = searchParams.toString();
  const [scope, setScope] = useState<FanCafeScopeFilter>(parseScope(searchParams.get("scope")));
  const [sort, setSort] = useState<BoardSort>(parseSort(searchParams.get("sort")));
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [boards, setBoards] = useState<FanCafeBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [activeBoardKey, setActiveBoardKey] = useState<string>("all::");
  const [boardAutoRefreshEnabled, setBoardAutoRefreshEnabled] = useState(false);
  const [boardRefreshTick, setBoardRefreshTick] = useState(0);
  const [boardSyncedAt, setBoardSyncedAt] = useState<string | null>(null);
  const [boardPulseMessage, setBoardPulseMessage] = useState<string | null>(null);
  const boardScopeSignatureRef = useRef(`${scope}::${sort}::${query}`);
  const boardSummaryRef = useRef({ posts: 0, replies: 0 });
  const boardPulseTimerRef = useRef<number | null>(null);
  const activeBoardKeyRef = useRef(activeBoardKey);
  const requestedBoardKey = useMemo(() => parseBoardKey(new URLSearchParams(searchParamString).get("board")), [searchParamString]);
  const requestedBoardKeyRef = useRef(requestedBoardKey);

  const selectedBoard = useMemo(() => {
    if (activeBoardKey === "all::" || scope === "all") return null;
    return boards.find((board) => board.scope === scope && makeBoardKey(board) === activeBoardKey) ?? null;
  }, [activeBoardKey, boards, scope]);

  const totalBoardPosts = boards.reduce((sum, board) => sum + board.postCount, 0);
  const totalBoardReplies = boards.reduce((sum, board) => sum + board.replyCount, 0);
  const boardScopeBuckets = boards.reduce(
    (acc, board) => {
      acc[board.scope] = { boards: acc[board.scope].boards + 1, posts: acc[board.scope].posts + board.postCount, replies: acc[board.scope].replies + board.replyCount };
      return acc;
    },
    {
      title: { boards: 0, posts: 0, replies: 0 },
      author: { boards: 0, posts: 0, replies: 0 },
      pencafe: { boards: 0, posts: 0, replies: 0 },
    } as Record<Exclude<FanCafeScopeFilter, "all">, { boards: number; posts: number; replies: number }>
  );

  const boardPulseText = boardPulseMessage ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-accent/45 bg-accent-soft px-2 py-1 text-xs text-accent">
      <Bell size={12} />
      {boardPulseMessage}
    </span>
  ) : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingBoards(true);
      setBoardError(null);
      setQuery(searchText.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    activeBoardKeyRef.current = activeBoardKey;
  }, [activeBoardKey]);

  useEffect(() => {
    requestedBoardKeyRef.current = requestedBoardKey;
  }, [requestedBoardKey]);

  useEffect(() => {
    if (!boardPulseMessage) return;
    if (boardPulseTimerRef.current) window.clearTimeout(boardPulseTimerRef.current);
    boardPulseTimerRef.current = window.setTimeout(() => setBoardPulseMessage(null), 6500);
    return () => {
      if (boardPulseTimerRef.current) {
        window.clearTimeout(boardPulseTimerRef.current);
        boardPulseTimerRef.current = null;
      }
    };
  }, [boardPulseMessage]);

  useEffect(() => {
    return () => {
      if (boardPulseTimerRef.current) {
        window.clearTimeout(boardPulseTimerRef.current);
        boardPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!boardAutoRefreshEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setBoardRefreshTick((current) => current + 1);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [boardAutoRefreshEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParamString);
      const syncedScope = parseScope(params.get("scope"));
      const syncedSort = parseSort(params.get("sort"));
      const syncedQuery = (params.get("q") ?? "").trim();
      const boardParam = parseBoardKey(params.get("board"));

      setLoadingBoards(true);
      setBoardError(null);
      setScope(syncedScope);
      setSort(syncedSort);
      setSearchText((current) => (current === syncedQuery ? current : syncedQuery));
      setQuery((current) => (current === syncedQuery ? current : syncedQuery));

      if (syncedScope === "all") {
        setActiveBoardKey("all::");
      } else if (boardParam) {
        setActiveBoardKey(boardParam);
      } else {
        setActiveBoardKey(`${syncedScope}::`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParamString]);

  function refreshBoardsNow() {
    setLoadingBoards(true);
    setBoardError(null);
    setBoardRefreshTick((current) => current + 1);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (scope !== "all") params.set("scope", scope);
    if (sort !== "popular") params.set("sort", sort);
    if (query) params.set("q", query);
    if (scope !== "all" && activeBoardKey.includes("::")) {
      const [currentScope] = activeBoardKey.split("::");
      if (currentScope === scope) {
        params.set("board", activeBoardKey);
      }
    }
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [scope, sort, query, activeBoardKey, pathname, router]);

  useEffect(() => {
    const contextSignature = `${scope}::${sort}::${query}`;
    const params = new URLSearchParams({ scope, sort, limit: String(BOARD_LIMIT), q: query });
    const controller = new AbortController();
    const endpoint = `/api/community/boards?${params.toString()}`;
    const isContextChanged = boardScopeSignatureRef.current !== contextSignature;
    if (isContextChanged) {
      boardScopeSignatureRef.current = contextSignature;
      boardSummaryRef.current = { posts: 0, replies: 0 };
      setBoardPulseMessage(null);
    }

    const resetTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setLoadingBoards(true);
      setBoardError(null);
      if (isContextChanged) {
        setBoards([]);
        setBoardSyncedAt(null);
      }
    }, 0);

    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const payload = await safeParseJson<unknown>(res);
        if (!res.ok) {
          throw new Error(resolveApiError(payload, `board load failed (${res.status})`));
        }
        if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) {
          throw new Error("invalid payload");
        }
        return payload as { items: unknown[] };
      })
      .then((data) => {
        const items = ensureArray<FanCafeBoard>(data.items);
        const nextTotals = items.reduce(
          (acc, board) => {
            acc.posts += board.postCount;
            acc.replies += board.replyCount;
            return acc;
          },
          { posts: 0, replies: 0 }
        );
        const prevTotals = boardSummaryRef.current;
        if (!isContextChanged) {
          const deltaPosts = nextTotals.posts - prevTotals.posts;
          const deltaReplies = nextTotals.replies - prevTotals.replies;
          if (deltaPosts + deltaReplies > 0 && prevTotals.posts + prevTotals.replies > 0) {
            const parts: string[] = [];
            if (deltaPosts > 0) parts.push(`글 ${deltaPosts}개`);
            if (deltaReplies > 0) parts.push(`댓글 ${deltaReplies}개`);
            setBoardPulseMessage(`새 활동 ${parts.join(", ")} 반영`);
          } else if (deltaPosts + deltaReplies < 0) {
            setBoardPulseMessage("검색 조건 변경으로 표시 데이터가 갱신됐어요.");
          }
        }
        boardSummaryRef.current = nextTotals;
        setBoards(items);
        if (scope === "all") {
          setActiveBoardKey("all::");
          setBoardSyncedAt(new Date().toISOString());
          return;
        }

        const scopedBoardItems = items.filter((board) => board.scope === scope);
        const requestedKey = requestedBoardKeyRef.current;
        const requested = requestedKey && scopedBoardItems.find((board) => makeBoardKey(board) === requestedKey);
        const currentActiveBoardKey = activeBoardKeyRef.current;
        const retained = currentActiveBoardKey.includes("::")
          ? scopedBoardItems.find((board) => makeBoardKey(board) === currentActiveBoardKey)
          : null;
        const selected = requested ?? retained ?? scopedBoardItems[0];
        if (selected) {
          setActiveBoardKey(makeBoardKey(selected));
          setBoardSyncedAt(new Date().toISOString());
          return;
        }

        setActiveBoardKey(`${scope}::`);
        setBoardSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setBoardError("보드 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBoards(false);
      });

    return () => {
      window.clearTimeout(resetTimer);
      controller.abort();
    };
  }, [scope, sort, query, boardRefreshTick]);

  function handleTopLevelReplyDelta(post: FanCafePost, delta: number) {
    setBoards((current) =>
      current.map((board) => {
        if (board.scope !== post.scope || board.targetId !== post.targetId) return board;
        return { ...board, replyCount: Math.max(0, board.replyCount + delta) };
      })
    );

  }

  function handleTopLevelPostCreated(post: FanCafePost) {
    setBoards((current) => {
      const exists = current.find((board) => board.scope === post.scope && board.targetId === post.targetId);
      const updated = current.map((board) =>
        board.scope === post.scope && board.targetId === post.targetId
          ? {
              ...board,
              postCount: board.postCount + 1,
              latestPostAt: new Date(post.createdAt) > new Date(board.latestPostAt) ? post.createdAt : board.latestPostAt,
            }
          : board
      );
      if (exists) return updated;

      const nextBoard = {
        scope: post.scope,
        targetId: post.targetId,
        targetLabel: post.targetLabel,
        postCount: 1,
        replyCount: 0,
        latestPostAt: post.createdAt,
      };
      const nextBoards = [...updated, nextBoard];
      return nextBoards.sort((a, b) => {
        if (sort === "popular") {
          const aScore = a.replyCount * 2 + a.postCount;
          const bScore = b.replyCount * 2 + b.postCount;
          if (aScore !== bScore) return bScore - aScore;
        }
        if (a.latestPostAt !== b.latestPostAt) {
          return new Date(b.latestPostAt).getTime() - new Date(a.latestPostAt).getTime();
        }
        return b.postCount - a.postCount;
      });
    });

  }

  return (
    <Container size="wide" className="relative min-h-screen py-8 lg:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-6 text-fg md:p-10">
        <div className="pointer-events-none absolute right-[-20%] top-[-25%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle_at_top,_rgba(124,92,252,.2),_transparent_70%)]" />
        <div className="relative z-10">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <Compass size={14} />
            COMMUNITY HUB
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">작품·작가·펜카페 커뮤니티</h1>
              <p className="mt-2 max-w-xl text-sm text-fg-3">
                작품 해석부터 번역/팬카페 이슈까지. 스코프별로 분리된 실시간 팬카페를 탐색하세요.
              </p>
            </div>
            <Link
              href="/reviews"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas/45 px-3 py-2 text-xs font-medium text-fg-3 transition-colors hover:text-fg"
            >
              <MessageCircle size={14} />
              리뷰도 함께 보기
            </Link>
          </div>

            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
              {COMMUNITY_SCOPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setLoadingBoards(true);
                    setBoardError(null);
                    setScope(tab.value);
                    setActiveBoardKey(tab.value === "all" ? "all::" : `${tab.value}::`);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    scope === tab.value
                      ? "border-accent/45 bg-accent-soft text-accent"
                      : "border-line bg-card/45 text-fg-3 hover:text-fg"
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                  <span className="hidden text-[0.65rem] text-fg-3 sm:inline">• {tab.description}</span>
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl border border-line bg-canvas/45 p-1 text-xs">
              {COMMUNITY_SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLoadingBoards(true);
                    setBoardError(null);
                    setSort(option.value);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    sort === option.value
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:bg-raised/60 hover:text-fg"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/35 p-2">
            <div className="inline-flex min-w-0 grow items-center gap-2 rounded-lg bg-canvas/40 px-3 py-2 text-fg-3">
              <Search size={14} />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                maxLength={60}
                placeholder="보드명/작품명 검색"
                className="h-7 w-full min-w-0 border-none bg-transparent text-xs outline-none placeholder:text-fg-3"
              />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas/30 px-2 py-1.5 text-xs text-fg-3">
              <TrendingUp size={13} />
              현재 {boards.length}개 보드 · 글 {totalBoardPosts}개 · 댓글 {totalBoardReplies}개
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas/30 px-2 py-1.5 text-xs text-fg-3">
              동기화: {boardSyncedAt ? new Date(boardSyncedAt).toLocaleTimeString() : "로딩 전"}
            </span>
            {boardPulseText}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-canvas/30 px-2 py-1.5 text-xs text-fg-3">
              <input
                type="checkbox"
                checked={boardAutoRefreshEnabled}
                onChange={(event) => setBoardAutoRefreshEnabled(event.target.checked)}
                className="size-3.5"
              />
              실시간(30초)
            </label>
            <button
              type="button"
              onClick={refreshBoardsNow}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2 py-1.5 text-xs text-fg-3 transition-colors hover:bg-canvas/55 hover:text-fg"
            >
              <RefreshCw size={13} />
              새로고침
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {COMMUNITY_SCOPE_DIRECTORIES.map((directory) => (
              <Link
                key={directory.value}
                href={directory.href}
                className="inline-flex items-center rounded-full border border-line bg-card/50 px-2.5 py-1.5 text-xs text-fg-3 transition-colors hover:text-fg"
              >
                <span className="mr-1.5">{directory.icon}</span>
                {directory.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {COMMUNITY_SCOPE_TABS.filter((entry) => entry.value !== "all")
            .slice(0, MAX_SCOPE_CHIP)
            .map((entry) => {
              const entryScope = entry.value as Exclude<FanCafeScopeFilter, "all">;
              const scopeBucket = boardScopeBuckets[entryScope];
              return (
                <Link
                  key={entry.value}
                  href={`/community/${entry.value}`}
                  className="rounded-2xl border border-line bg-card/45 p-3 transition-colors hover:border-accent/60 hover:bg-accent-soft/30"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <span>{entry.icon}</span>
                    <span>{entry.label} 커뮤니티</span>
                  </p>
                  <p className="mt-1 text-[0.7rem] text-fg-3">
                    보드 {scopeBucket.boards}개 · 글 {scopeBucket.posts}개 · 댓글 {scopeBucket.replies}개
                  </p>
                </Link>
              );
            })}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
        <aside className="rounded-3xl border border-line bg-panel/45 p-4">
          <div className="mb-3 flex items-center gap-2 text-fg-2">
            <UsersRound size={16} />
            <h2 className="text-sm font-bold">보드</h2>
          </div>

          {loadingBoards ? (
            <div className="space-y-2">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          ) : boardError ? (
            <div className="rounded-xl border border-dashed border-line bg-card/55 p-4 text-sm text-fg-3">{boardError}</div>
          ) : (
            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {scope === "all" && (
                <button
                  type="button"
                  onClick={() => setActiveBoardKey("all::")}
                  className={`w-full rounded-2xl border p-3 text-left transition-all ${
                    activeBoardKey === "all::"
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line bg-card/50 hover:bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                    <span>🌐</span>
                    <span>통합 피드</span>
                  </div>
                  <p className="mt-1 text-xs text-fg-3">모든 스코프의 실시간 인기 글을 한 화면에서 조회</p>
                </button>
              )}

              {boards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-card/50 p-4 text-xs text-fg-3">
                  조건에 맞는 보드가 아직 없어요.
                </div>
              ) : (
                boards.map((board) => {
                  const key = makeBoardKey(board);
                  const boardHref = getCommunityScopeTargetLink(board.scope, board.targetId, board.targetLabel);
                  return (
                    <article
                      key={key}
                      className={`w-full rounded-2xl border p-3 transition-all ${
                        activeBoardKey === key
                          ? "border-accent/50 bg-accent-soft"
                          : "border-line bg-card/45 hover:bg-card"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveBoardKey(key);
                          setScope(board.scope);
                        }}
                        className="flex w-full flex-col gap-2 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-fg">{board.targetLabel}</p>
                            <p className="mt-0.5 text-[0.68rem] text-fg-3">{COMMUNITY_SCOPE_LABEL[board.scope]}</p>
                          </div>
                          <span className="text-[0.65rem] text-fg-3">{relativeDate(board.latestPostAt)}</span>
                        </div>
                        <p className="mt-2 flex flex-wrap gap-2 text-[0.68rem] text-fg-3">
                          <span>글 {board.postCount}개</span>
                          <span>댓글 {board.replyCount}개</span>
                        </p>
                      </button>
                      <div className="mt-3 flex">
                        <Link
                          href={boardHref}
                          className="rounded-full border border-line bg-card/80 px-2 py-0.5 text-[0.65rem] transition-colors hover:bg-raised/70"
                        >
                          상세 이동
                        </Link>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </aside>

        <article className="rounded-3xl border border-line bg-panel/45 p-1">
          {activeBoardKey === "all::" ? (
            <FanCafePanel
              key="all::"
              scope="all"
              targetLabel="통합 커뮤니티 피드"
              compact
              onTopLevelReplyDelta={handleTopLevelReplyDelta}
              onTopLevelPostCreated={handleTopLevelPostCreated}
            />
          ) : selectedBoard ? (
            <FanCafePanel
              key={activeBoardKey}
              scope={selectedBoard.scope}
              targetId={selectedBoard.targetId}
              targetLabel={selectedBoard.targetLabel}
              compact={false}
              onTopLevelReplyDelta={handleTopLevelReplyDelta}
              onTopLevelPostCreated={handleTopLevelPostCreated}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-line bg-card/50 p-10 text-center">
              <p className="text-sm font-medium text-fg">보드를 선택해 주세요.</p>
              <p className="mt-1 text-xs text-fg-3">왼쪽에서 작품/작가/펜카페 보드를 골라 팬카페를 시작하세요.</p>
            </div>
          )}
        </article>
      </section>
    </Container>
  );
}
