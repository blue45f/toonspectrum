"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  MessageCircle,
  Bell,
  CornerDownRight,
  RefreshCw,
  Send,
  Tag,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { FanCafePost, FanCafePostKind, FanCafeReply, FanCafeScopeFilter } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn, relativeDate } from "@/lib/utils";
import { ensureArray, resolveApiError, safeParseJson } from "@/lib/http-safe";
import {
  COMMUNITY_SORT_OPTIONS,
  COMMUNITY_SORT_LABEL,
  COMMUNITY_SCOPE_LABEL,
  COMMUNITY_SCOPE_LABEL_WITH_ALL,
  FAN_CAFE_SCOPE_COPY,
} from "@/lib/community-ui";

const KIND_LABEL: Record<FanCafePostKind, string> = {
  talk: "잡담",
  theory: "해석",
  fanart: "팬아트",
  cheer: "응원",
};

const TAG_CHIP_LIMIT = 10;
const FAN_CAFE_REPLY_MAX_LENGTH = 700;
const FAN_CAFE_POST_TITLE_MAX_LENGTH = 80;
const FAN_CAFE_POST_TEXT_MAX_LENGTH = 1200;
const FAN_CAFE_POST_TAGS_MAX_LENGTH = 80;

type FanCafeKindFilter = FanCafePostKind | "all";

const KIND_ITEMS: { value: FanCafeKindFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "talk", label: KIND_LABEL.talk },
  { value: "theory", label: KIND_LABEL.theory },
  { value: "fanart", label: KIND_LABEL.fanart },
  { value: "cheer", label: KIND_LABEL.cheer },
];

const MAX_REPLY_DEPTH = 4;

export function FanCafePanel({
  scope,
  targetId,
  targetLabel,
  compact = false,
  onTopLevelReplyDelta,
  onTopLevelPostCreated,
}: {
  scope: FanCafeScopeFilter;
  targetId?: string;
  targetLabel: string;
  compact?: boolean;
  onTopLevelReplyDelta?: (post: FanCafePost, delta: number) => void;
  onTopLevelPostCreated?: (post: FanCafePost) => void;
}) {
  const userId = useApp((s) => s.userId);
  const [posts, setPosts] = useState<FanCafePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<FanCafeKindFilter>("all");
  const [composeKind, setComposeKind] = useState<FanCafePostKind>("talk");
  const [sort, setSort] = useState<"popular" | "recent">("recent");
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [selectedTagState, setSelectedTagState] = useState<{ context: string; tag: string | null }>({
    context: "",
    tag: null,
  });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [showMyPostsOnly, setShowMyPostsOnly] = useState(false);
  const [postPulse, setPostPulse] = useState(0);
  const postsRequestSignatureRef = useRef("");
  const postPulseTimerRef = useRef<number | null>(null);
  const selectedTagContext = `${scope}|${targetId ?? ""}`;

  function applyTopLevelReplyDelta(postItem: FanCafePost, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setPosts((current) => {
      const nextPosts = current.map((item) =>
        item.id === postItem.id ? { ...item, replyCount: Math.max(0, item.replyCount + delta) } : item
      );
      const changed = nextPosts.some((post, index) => post !== current[index]);
      if (!changed) return current;
      if (sort !== "popular") return nextPosts;
      return nextPosts
        .slice()
        .sort((a, b) => b.replyCount - a.replyCount || b.createdAt.localeCompare(a.createdAt));
    });
    onTopLevelReplyDelta?.(postItem, delta);
  }

  const postTagSuggests = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const rawTag of post.tags) {
        const tag = String(rawTag ?? "")
          .replace(/^#/, "")
          .trim()
          .toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_CHIP_LIMIT)
      .map(([tag]) => tag);
  }, [posts]);

  const selectedTag =
    selectedTagState.context === selectedTagContext && postTagSuggests.includes(selectedTagState.tag ?? "")
      ? selectedTagState.tag
      : null;
  const showOnlyMine = Boolean(showMyPostsOnly && userId);

  function setSelectedTagFilter(tag: string | null) {
    setLoading(true);
    setError(null);
    setSelectedTagState({ context: selectedTagContext, tag });
  }

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams({ scope, sort });
    if (scope !== "all" && targetId) params.set("targetId", targetId);
    if (filterKind !== "all") params.set("kind", filterKind);
    if (selectedTag) params.set("tag", selectedTag);
    if (showOnlyMine) params.set("mine", "true");
    return params.toString();
  }, [filterKind, scope, selectedTag, showOnlyMine, sort, targetId]);

  const requestSignature = useMemo(
    () => `${scope}|${targetId ?? ""}|${filterKind}|${sort}|${selectedTag ?? ""}|${queryText}|${showOnlyMine}`,
    [filterKind, queryText, scope, selectedTag, showOnlyMine, sort, targetId]
  );

  const canComposePost = scope !== "all" && Boolean(targetId);
  const authHeaders = useMemo(() => (userId ? { "x-user-id": userId } : undefined), [userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      setQueryText(searchText.trim().toLowerCase());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setLoading(true);
        setError(null);
        setRefreshTick((current) => current + 1);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const interval = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (!postPulse) return;
    if (postPulseTimerRef.current) {
      window.clearTimeout(postPulseTimerRef.current);
    }
    postPulseTimerRef.current = window.setTimeout(() => setPostPulse(0), 5500);
    return () => {
      if (postPulseTimerRef.current) {
        window.clearTimeout(postPulseTimerRef.current);
        postPulseTimerRef.current = null;
      }
    };
  }, [postPulse]);

  useEffect(() => {
    return () => {
      if (postPulseTimerRef.current) {
        window.clearTimeout(postPulseTimerRef.current);
        postPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const isContextChanged = postsRequestSignatureRef.current !== requestSignature;
    postsRequestSignatureRef.current = requestSignature;

    const controller = new AbortController();
    const resetTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      if (isContextChanged) {
        setPostPulse(0);
        setPosts([]);
        setHasMore(false);
        setNextCursor(null);
      }
    }, 0);
    const params = new URLSearchParams(apiQuery);
    if (queryText) params.set("q", queryText);
    params.set("limit", "20");
    fetch(`/api/community/posts?${params.toString()}`, { cache: "no-store", signal: controller.signal, headers: authHeaders })
      .then(async (res) => {
        const payload = await safeParseJson<unknown>(res);
        if (!res.ok) {
          throw new Error(resolveApiError(payload, `posts load failed (${res.status})`));
        }
        if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) {
          throw new Error("invalid payload");
        }
        return payload as { items: unknown[]; nextCursor?: string | null; hasMore?: boolean };
      })
      .then((data) => {
        const nextItems = ensureArray(data.items) as FanCafePost[];
        let incomingPosts = 0;

        setPosts((currentPosts) => {
          if (!isContextChanged && sort === "recent" && currentPosts.length > 0) {
            const currentIdSet = new Set(currentPosts.map((post) => post.id));
            const nextIdSet = new Set(nextItems.map((post) => post.id));
            incomingPosts = nextItems.reduce((count, post) => (currentIdSet.has(post.id) ? count : count + 1), 0);
            const retained = currentPosts.filter((post) => !nextIdSet.has(post.id));
            return [...nextItems, ...retained];
          }
          return nextItems;
        });

        if (!isContextChanged && incomingPosts > 0) {
          setPostPulse(incomingPosts);
        }
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
        setLastSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError("팬카페 글을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      window.clearTimeout(resetTimer);
      controller.abort();
    };
  }, [apiQuery, authHeaders, queryText, refreshTick, requestSignature, sort]);

  async function loadMore() {
    if (!nextCursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    const params = new URLSearchParams(apiQuery);
    if (queryText) params.set("q", queryText);
    params.set("limit", "20");
    params.set("cursor", nextCursor);
    try {
      const res = await fetch(`/api/community/posts?${params.toString()}`, { cache: "no-store", headers: authHeaders });
      const data = await safeParseJson<unknown>(res);
      if (!res.ok) {
        throw new Error(resolveApiError(data, `load more failed (${res.status})`));
      }
      if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items)) {
        throw new Error("invalid payload");
      }
      const parsedData = data as { items: unknown[]; nextCursor?: string | null; hasMore?: boolean };
      setPosts((current) => [...current, ...ensureArray<FanCafePost>(parsedData.items)]);
      setNextCursor(parsedData.nextCursor ?? null);
      setHasMore(Boolean(parsedData.hasMore));
    } catch {
      setError("추가 게시글을 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit() {
    if (!userId || !title.trim() || !text.trim()) return;
    if (!canComposePost) {
      setError("팬카페 대상이 지정된 보드에서만 글을 작성할 수 있어요.");
      return;
    }
    setIsSubmittingPost(true);
    setError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(authHeaders ?? {}) },
        body: JSON.stringify({
          scope,
          targetId,
          targetLabel,
          kind: composeKind,
          title,
          text,
          tags: tags
            .split(/[,\s#]+/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        }),
      });
      const data = await safeParseJson<unknown>(res);
      if (!res.ok) {
        setError(resolveApiError(data, "팬카페 글을 저장하지 못했습니다."));
        return;
      }
      if (!data || typeof data !== "object") {
        setError("팬카페 글 응답이 유효하지 않습니다.");
        return;
      }
      const created = data as FanCafePost;
      onTopLevelPostCreated?.(created);
      const normalizedCreatedTags = created.tags.map((tag) => tag.toLowerCase());
      const tagMatch = !selectedTag || normalizedCreatedTags.includes(selectedTag);
      const shouldInsert =
        (filterKind === "all" || filterKind === created.kind) &&
        tagMatch &&
        (!queryText || `${created.title} ${created.text}`.toLowerCase().includes(queryText));

      if (!shouldInsert) {
        setError("현재 필터/검색 조건과 달라 목록에 바로 반영되지 않습니다.");
      } else {
        setError(null);
        setPosts((current) => {
          const next = [created, ...current];
          if (sort === "popular") {
            return next
              .slice()
              .sort((a, b) => b.replyCount - a.replyCount || b.createdAt.localeCompare(a.createdAt));
          }
          return next;
        });
      }
      setTitle("");
      setText("");
      setTags("");
      setRefreshTick((current) => current + 1);
    } catch {
      setError("팬카페 글을 저장하지 못했습니다.");
    } finally {
      setIsSubmittingPost(false);
    }
  }

  function refreshNow() {
    setLoading(true);
    setError(null);
    setRefreshTick((current) => current + 1);
  }

  return (
    <section className="rounded-2xl border border-line bg-panel/45 p-5 surface-hl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <UsersRound size={14} />
            FAN CAFE
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-fg">{targetLabel} 팬카페</h2>
          {compact && scope !== "all" && (
            <p className="mt-1 text-xs text-fg-3">
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[0.65rem]">{COMMUNITY_SCOPE_LABEL_WITH_ALL[scope]}</span> {targetLabel}
            </p>
          )}
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-3">
            {FAN_CAFE_SCOPE_COPY[scope]}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/45 px-3 py-2 text-xs text-fg-3">
          <BookOpenText size={14} />
          게시글 <span className="numeral text-fg">{posts.length}</span>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-fg-3">
          마지막 동기화: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "로딩 전"}
        </p>
        {postPulse > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-accent/35 bg-accent-soft px-2 py-1 text-xs text-accent">
            <Bell size={12} />
            새 글 {postPulse}개 반영
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-canvas/40 px-2 py-1.5">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
              className="size-3.5"
            />
            <span className="text-fg-3">실시간 새로고침(30초)</span>
          </label>
          <button
            type="button"
            onClick={refreshNow}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2 py-1.5 text-fg-3 transition-colors hover:bg-canvas/55 hover:text-fg"
          >
            <RefreshCw size={13} />
            새로고침
          </button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-xs">
          <Search size={14} />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            maxLength={80}
            placeholder="제목·본문 키워드 검색"
            className="h-7 w-52 min-w-0 border-none bg-transparent text-xs outline-none placeholder:text-fg-3"
          />
        </div>
        <button
          type="button"
          onClick={() => setSelectedTagFilter(null)}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border border-line bg-raised/45 px-2 py-1.5 text-xs font-medium transition-colors",
            selectedTag === null ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-canvas/55 hover:text-fg"
          )}
        >
          <Tag size={12} />
          태그 전체
        </button>
        <div className="inline-flex rounded-xl border border-line bg-raised/40">
          {COMMUNITY_SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                setSort(option.value);
              }}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl",
                sort === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-canvas/55 hover:text-fg"
              )}
            >
              {COMMUNITY_SORT_LABEL[option.value]}
            </button>
          ))}
        </div>
      </div>
      {postTagSuggests.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[0.68rem] text-fg-3">태그:</span>
          {postTagSuggests.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTagFilter(active ? null : tag)}
                className={cn(
                  "rounded-full border px-2 py-1 text-[0.65rem] transition-colors",
                  active
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-canvas/50 text-fg-3 hover:text-fg"
                )}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

          <div className={cn("grid gap-4", !compact && "lg:grid-cols-[0.9fr_1.1fr]")}>
            <div className="rounded-xl border border-line bg-card p-4">
              {userId ? (
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-canvas/40 px-2 py-1.5 text-xs text-fg-3">
                  <input
                    type="checkbox"
                    checked={showOnlyMine}
                    onChange={(event) => {
                      setLoading(true);
                      setError(null);
                      setShowMyPostsOnly(event.target.checked);
                    }}
                    className="size-3.5"
                  />
                  <span>내 글만 보기</span>
                </label>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {KIND_ITEMS.map((item) => (
                  <button
                key={item.value}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setFilterKind(item.value);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filterKind === item.value
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-raised/45 text-fg-3 hover:text-fg"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {canComposePost ? (
            userId ? (
            <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-xs text-fg-3">
                  <span>카테고리</span>
                  <select
                    value={composeKind}
                    onChange={(event) => setComposeKind(event.target.value as FanCafePostKind)}
                    className="rounded-md border border-line bg-canvas px-2 py-1 text-xs text-fg outline-none focus:border-accent/60"
                  >
                    {KIND_ITEMS.filter((item) => item.value !== "all").map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, FAN_CAFE_POST_TITLE_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TITLE_MAX_LENGTH}
                  placeholder="팬카페 글 제목"
                  className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <div className="text-right text-[0.7rem] text-fg-3">
                  {title.length}/{FAN_CAFE_POST_TITLE_MAX_LENGTH}
                </div>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value.slice(0, FAN_CAFE_POST_TEXT_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TEXT_MAX_LENGTH}
                  rows={5}
                  placeholder="해석, 질문, 응원, 팬아트 메모를 남겨보세요."
                  className="resize-none rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <div className="text-right text-[0.7rem] text-fg-3">
                  {text.length}/{FAN_CAFE_POST_TEXT_MAX_LENGTH}
                </div>
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value.slice(0, FAN_CAFE_POST_TAGS_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TAGS_MAX_LENGTH}
                  placeholder="#정주행 #해석 처럼 태그 추가"
                  className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!title.trim() || !text.trim() || isSubmittingPost}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send size={15} />
                  {isSubmittingPost ? "등록 중..." : "팬카페에 올리기"}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
                <Sparkles className="mx-auto mb-2 text-accent" size={20} />
                <p className="text-sm font-medium text-fg">로그인하면 팬카페에 글을 쓸 수 있습니다.</p>
                <p className="mt-1 text-xs text-fg-3">읽기는 누구에게나 열려 있습니다.</p>
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
              <Sparkles className="mx-auto mb-2 text-accent" size={20} />
              <p className="text-sm font-medium text-fg">현재 통합 피드에서는 작성이 제한돼요.</p>
              <p className="mt-1 text-xs text-fg-3">작품·작가·펜카페 보드로 이동해 작성할 수 있습니다.</p>
            </div>
          )}
          {error && <p className="mt-3 text-xs text-bad">{error}</p>}
        </div>

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <div className="skeleton h-28 w-full rounded-xl" />
              <div className="skeleton h-28 w-full rounded-xl" />
            </>
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-card/50 px-5 py-12 text-center">
              <MessageCircle className="mx-auto mb-3 text-fg-3" size={22} />
              <p className="text-sm font-medium text-fg">아직 팬카페 글이 없습니다.</p>
              <p className="mt-1 text-xs text-fg-3">첫 해석이나 응원을 남겨보세요.</p>
            </div>
          ) : (
            posts.map((post) => (
              <FanPostCard
                key={post.id}
                post={post}
                compact={compact}
                onReplyCreated={(replyPost) => applyTopLevelReplyDelta(replyPost, 1)}
              />
            ))
          )}
          {loadingMore ? (
            <div className="skeleton h-20 w-full rounded-xl" />
          ) : hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              className="rounded-lg border border-line bg-raised px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-canvas/55"
            >
              더 보기
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FanPostCard({
  post,
  compact,
  onReplyCreated,
}: {
  post: FanCafePost;
  compact?: boolean;
  onReplyCreated?: (post: FanCafePost, delta: number) => void;
}) {
  const userId = useApp((s) => s.userId);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(post.replies));
  const [replies, setReplies] = useState<FanCafeReply[]>(post.replies ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submittingReplies, setSubmittingReplies] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({ "__root__": "" });
  const [openComposerFor, setOpenComposerFor] = useState<string | null>(null);
  const [replySyncAt, setReplySyncAt] = useState<string | null>(null);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [replyAutoRefreshEnabled, setReplyAutoRefreshEnabled] = useState(false);
  const [replyRefreshTick, setReplyRefreshTick] = useState(0);
  const replyRefreshControllerRef = useRef<AbortController | null>(null);

  function refreshReplies() {
    setReplyRefreshTick((current) => current + 1);
  }

  useEffect(() => {
    if (!open || !replyAutoRefreshEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        refreshReplies();
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
  }, [open, replyAutoRefreshEnabled]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      replyRefreshControllerRef.current?.abort();
      setIsLoadingReplies(true);
      setError(null);
      const controller = new AbortController();
      replyRefreshControllerRef.current = controller;

      fetch(`/api/community/posts/${encodeURIComponent(post.id)}/replies`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await safeParseJson<unknown>(res);
          if (!res.ok) {
            throw new Error(resolveApiError(data, "댓글을 불러오지 못했습니다."));
          }
          if (!data || !Array.isArray(data)) {
            throw new Error("댓글 응답이 유효하지 않습니다.");
          }
          return ensureArray<FanCafeReply>(data);
        })
        .then((nextReplies) => {
          if (controller.signal.aborted) return;
          setReplies(nextReplies);
          setLoaded(true);
          setReplySyncAt(new Date().toISOString());
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setError(err instanceof Error ? err.message : "댓글을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoadingReplies(false);
          }
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      replyRefreshControllerRef.current?.abort();
    };
  }, [open, post.id, replyRefreshTick]);

  useEffect(() => {
    return () => {
      replyRefreshControllerRef.current?.abort();
      replyRefreshControllerRef.current = null;
    };
  }, []);

  function setDraft(id: string, value: string) {
    const next = value.slice(0, FAN_CAFE_REPLY_MAX_LENGTH);
    setReplyDrafts((current) => ({ ...current, [id]: next }));
  }

  function getDraft(id: string) {
    return replyDrafts[id] ?? "";
  }

  function toggleComposer(id: string | null) {
    if (!id) {
      setOpenComposerFor(null);
      return;
    }
    setOpenComposerFor((current) => (current === id ? null : id));
  }

  function insertReply(tree: FanCafeReply[], parentId: string | null, reply: FanCafeReply): FanCafeReply[] {
    if (!parentId) return [...tree, reply];
    let inserted = false;
    const next = tree.map((item) => {
      if (item.id === parentId) {
        inserted = true;
        return { ...item, children: [...(item.children ?? []), reply] };
      }
      if (!item.children || item.children.length === 0) return item;
      const nextChildren = insertReply(item.children, parentId, reply);
      if (nextChildren !== item.children) {
        inserted = true;
        return { ...item, children: nextChildren };
      }
      return item;
    });
    if (!inserted) return [...tree, reply];
    return next;
  }

  async function submitReply(parentId: string | null) {
    if (!userId) return;
    const draft = getDraft(parentId ?? "__root__").trim();
    if (!draft) return;

    const draftKey = parentId ?? "__root__";
    setSubmittingReplies((current) => ({ ...current, [draftKey]: true }));
    setError(null);

    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(post.id)}/replies`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(userId ? { "x-user-id": userId } : {}) },
        body: JSON.stringify({
          text: draft,
          ...(parentId ? { parentId } : {}),
        }),
      });

      const data = await safeParseJson<unknown>(res);
      if (!res.ok) {
        setError(resolveApiError(data, "댓글을 저장하지 못했습니다."));
        return;
      }
      if (!data || typeof data !== "object") {
        setError("댓글 응답이 유효하지 않습니다.");
        return;
      }
      const created = data as FanCafeReply;
      setReplies((current) => insertReply(current, parentId, created));
      onReplyCreated?.(post, 1);
      setReplySyncAt(new Date().toISOString());
      setDraft(parentId ?? "__root__", "");
      setLoaded(true);
      setOpenComposerFor(null);
    } catch {
      setError("댓글을 저장하지 못했습니다.");
    } finally {
      setSubmittingReplies((current) => ({ ...current, [draftKey]: false }));
    }
  }

  const replyCount = countReplies(replies);
  const displayReplyCount = loaded ? replyCount : post.replyCount;
  const rootDraft = getDraft("__root__");
  const isRootSubmitting = Boolean(submittingReplies.__root__);

  return (
    <article className="group rounded-2xl border border-line bg-card p-4 transition-[border-color,background-color,transform] duration-200 hover:border-line-strong hover:bg-raised/30 sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-fg ring-1 ring-white/10"
          style={{ background: `linear-gradient(140deg, ${post.author.avatar}, oklch(0.26 0.04 60))` }}
        >
          {post.author.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent">
              {KIND_LABEL[post.kind]}
            </span>
            <span className="text-[0.68rem] text-fg-3">{relativeDate(post.createdAt)}</span>
          </div>
          {compact ? (
            <p className="mt-0.5 text-[0.68rem] text-fg-3">
              {COMMUNITY_SCOPE_LABEL[post.scope]} · {post.targetLabel}
            </p>
          ) : null}
          <h3 className="mt-1 line-clamp-2 [overflow-wrap:anywhere] text-sm font-bold leading-snug text-fg">
            {post.title}
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">{post.author.name}</p>
        </div>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{post.text}</p>
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-md border border-line bg-raised/70 px-1.5 py-0.5 text-[0.68rem] text-fg-3">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              const nextOpen = !open;
              setOpen(nextOpen);
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              open
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-line bg-raised/55 text-fg-2 hover:bg-canvas/55"
            )}
          >
            <MessageCircle size={15} />
            댓글 {displayReplyCount}
          </button>
          {loaded && displayReplyCount > 0 ? (
            <span className="text-[0.68rem] text-fg-3">대화 {displayReplyCount}개</span>
          ) : null}
        </div>
        {open && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/25 px-3 py-2 text-[0.68rem] text-fg-3">
              <span>동기화 {replySyncAt ? new Date(replySyncAt).toLocaleTimeString() : "대기 중"}</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 transition-colors hover:bg-raised/70">
                    <input
                      type="checkbox"
                      checked={replyAutoRefreshEnabled}
                      onChange={(event) => setReplyAutoRefreshEnabled(event.target.checked)}
                      className="size-3.5"
                    />
                  30초 갱신
                </label>
                <button
                  type="button"
                  onClick={refreshReplies}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-raised/50 px-2 text-[0.65rem] font-medium text-fg-3 transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoadingReplies}
                >
                  <RefreshCw size={12} className={cn(isLoadingReplies && "animate-spin")} />
                  {isLoadingReplies ? "동기화 중" : "새로고침"}
                </button>
              </div>
            </div>
            {isLoadingReplies && !loaded ? (
              <div className="flex flex-col gap-2">
                <div className="skeleton h-16 w-full rounded-xl" />
                <div className="skeleton h-14 w-5/6 rounded-xl" />
              </div>
            ) : null}
            {replies.length === 0 && loaded ? (
              <div className="rounded-xl border border-dashed border-line bg-canvas/30 px-3 py-4 text-xs text-fg-3">
                첫 댓글을 남겨 대화를 시작하세요.
              </div>
            ) : (
              <ReplyThread
                items={replies}
                userId={userId}
                onSubmit={submitReply}
                onToggleComposer={toggleComposer}
                openComposerFor={openComposerFor}
                draftByReplyId={replyDrafts}
                onChangeDraft={setDraft}
                submittingReplies={submittingReplies}
              />
            )}
            {userId ? (
              <div className="rounded-xl border border-line bg-canvas/35 p-3 transition-colors focus-within:border-accent/60">
                <textarea
                  value={rootDraft}
                  onChange={(event) => setDraft("__root__", event.target.value)}
                  maxLength={FAN_CAFE_REPLY_MAX_LENGTH}
                  rows={2}
                  placeholder="댓글 남기기"
                  className="min-h-16 w-full resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3"
                />
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.65rem] text-fg-3">
                  <span>{rootDraft.length}/{FAN_CAFE_REPLY_MAX_LENGTH}</span>
                  <button
                    type="button"
                    onClick={() => submitReply(null)}
                    disabled={!rootDraft.trim() || isRootSubmitting}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send size={13} />
                    {isRootSubmitting ? "등록 중..." : "등록"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-canvas/25 px-3 py-3 text-xs text-fg-3">
                로그인하면 댓글과 대댓글을 남길 수 있습니다.
              </p>
            )}
            {error ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={refreshReplies}
                  className="rounded-lg border border-bad/30 px-2 py-1 font-medium"
                >
                  다시 시도
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

function ReplyThread({
  items,
  userId,
  onSubmit,
  onToggleComposer,
  openComposerFor,
  draftByReplyId,
  onChangeDraft,
  submittingReplies,
  depth = 0,
}: {
  items: FanCafeReply[];
  userId: string | null;
  onSubmit: (parentId: string | null) => Promise<void>;
  onToggleComposer: (parentId: string | null) => void;
  openComposerFor: string | null;
  draftByReplyId: Record<string, string>;
  onChangeDraft: (id: string, value: string) => void;
  submittingReplies: Record<string, boolean>;
  depth?: number;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {items.map((reply) => (
        <FanPostReplyItem
          key={reply.id}
          reply={reply}
          depth={depth}
          userId={userId}
          canReply={depth < MAX_REPLY_DEPTH - 1}
          onSubmit={onSubmit}
          onToggleComposer={onToggleComposer}
          openComposerFor={openComposerFor}
          draftByReplyId={draftByReplyId}
          onChangeDraft={onChangeDraft}
          submittingReplies={submittingReplies}
          isSubmitting={submittingReplies[reply.id]}
        />
      ))}
    </div>
  );
}

function FanPostReplyItem({
  reply,
  depth,
  userId,
  canReply,
  onSubmit,
  onToggleComposer,
  openComposerFor,
  draftByReplyId,
  onChangeDraft,
  submittingReplies,
  isSubmitting = false,
}: {
  reply: FanCafeReply;
  depth: number;
  userId: string | null;
  canReply: boolean;
  onSubmit: (parentId: string | null) => Promise<void>;
  onToggleComposer: (parentId: string | null) => void;
  openComposerFor: string | null;
  draftByReplyId: Record<string, string>;
  onChangeDraft: (id: string, value: string) => void;
  submittingReplies: Record<string, boolean>;
  isSubmitting?: boolean;
}) {
  const isOpen = openComposerFor === reply.id;
  const replyKey = reply.id;
  const draft = draftByReplyId[replyKey] ?? "";
  const children = reply.children ?? [];
  const hasChildren = children.length > 0;

  return (
    <article
      className={cn(
        "relative rounded-xl border border-line bg-canvas/35 p-3 transition-colors hover:border-line-strong sm:p-3.5",
        depth > 0 && "ml-4 sm:ml-6"
      )}
    >
      {depth > 0 ? (
        <span className="absolute -left-4 top-5 h-px w-3 bg-line sm:-left-5 sm:w-4" aria-hidden />
      ) : null}
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
        {depth > 0 ? <CornerDownRight size={12} className="text-accent/80" aria-hidden /> : null}
        <span className="max-w-[12rem] truncate font-semibold text-fg-2">{reply.author.name}</span>
        <span>{relativeDate(reply.createdAt)}</span>
        {hasChildren ? <span className="text-fg-3">답글 {countReplies(children)}</span> : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{reply.text}</p>
      {canReply && (
        <button
          type="button"
          onClick={() => onToggleComposer(reply.id)}
          aria-expanded={isOpen}
          className={cn(
            "mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.68rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            isOpen
              ? "border-accent/45 bg-accent-soft text-accent"
              : "border-line bg-raised/40 text-fg-3 hover:text-fg-2"
          )}
        >
          <MessageCircle size={12} />
          대댓글
        </button>
      )}
      {isOpen && (
        <div className="mt-2">
          {userId ? (
            <div className="rounded-xl border border-line bg-panel/45 p-2.5 transition-colors focus-within:border-accent/60">
              <textarea
                value={draft}
                onChange={(event) => onChangeDraft(replyKey, event.target.value)}
                maxLength={FAN_CAFE_REPLY_MAX_LENGTH}
                rows={2}
                placeholder={`${reply.author.name}에게 대댓글`}
                className="min-h-14 w-full resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3"
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[0.65rem] text-fg-3">
                <span>{draft.length}/{FAN_CAFE_REPLY_MAX_LENGTH}</span>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleComposer(reply.id)}
                    className="inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-xs text-fg-3 transition-colors hover:text-fg"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubmit(reply.id)}
                    disabled={!draft.trim() || isSubmitting}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send size={12} />
                    {isSubmitting ? "저장 중..." : "등록"}
                  </button>
                </div>
              </div>
              {depth >= MAX_REPLY_DEPTH - 1 ? (
                <p className="mt-2 rounded-lg bg-raised/50 px-2 py-1.5 text-[0.65rem] text-fg-3">
                  최대 대댓글 깊이에 도달했습니다.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-panel/45 px-3 py-2 text-xs text-fg-3">
              로그인하면 대댓글을 남길 수 있습니다.
            </p>
          )}
        </div>
      )}
      {children.length > 0 && (
        <div className="relative mt-2">
          <span className="absolute bottom-2 left-3 top-0 w-px bg-line/70" aria-hidden />
          <ReplyThread
            items={children}
            userId={userId}
            onSubmit={onSubmit}
            onToggleComposer={onToggleComposer}
            openComposerFor={openComposerFor}
            draftByReplyId={draftByReplyId}
            onChangeDraft={onChangeDraft}
            submittingReplies={submittingReplies}
            depth={depth + 1}
          />
        </div>
      )}
    </article>
  );
}

function countReplies(items: FanCafeReply[]): number {
  return items.reduce((count, item) => count + 1 + countReplies(item.children ?? []), 0);
}
