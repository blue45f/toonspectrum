"use client";

import {
  BookOpenText,
  ImagePlus,
  MessageCircle,
  Bell,
  CornerDownRight,
  RefreshCw,
  Send,
  Tag,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";


import { KIND_LABEL } from "./fan-cafe-utils";

import type { FanCafePost, FanCafePostKind, FanCafeReply, FanCafeScopeFilter } from "@/lib/types";


import {
  COMMUNITY_SORT_OPTIONS,
  COMMUNITY_SORT_LABEL,
  COMMUNITY_SCOPE_LABEL,
  COMMUNITY_SCOPE_LABEL_WITH_ALL,
  FAN_CAFE_SCOPE_COPY,
} from "@/lib/community-ui";
import { ensureArray, resolveApiError, safeParseJson } from "@/lib/http-safe";
import { ATTACHMENT_MAX_COUNT, fileToAttachmentDataUrl } from "@/lib/image-attach";
import { useApp } from "@/lib/store";
import { cn, relativeDate } from "@/lib/utils";
import Link from "@/src/compat/router-link";

const TAG_CHIP_LIMIT = 10;
const FAN_CAFE_REPLY_MAX_LENGTH = 700;
const FAN_CAFE_POST_TITLE_MAX_LENGTH = 80;
const FAN_CAFE_POST_TEXT_MAX_LENGTH = 1200;
const FAN_CAFE_POST_TAGS_MAX_LENGTH = 80;
const FAN_CAFE_ACTIVITY_STORAGE_KEY = "webtoon-index-fan-cafe-activity-log-v1";

type FanCafeKindFilter = FanCafePostKind | "all";

const KIND_ITEMS: { value: FanCafeKindFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "talk", label: KIND_LABEL.talk },
  { value: "theory", label: KIND_LABEL.theory },
  { value: "fanart", label: KIND_LABEL.fanart },
  { value: "cheer", label: KIND_LABEL.cheer },
];

const MAX_REPLY_DEPTH = 4;

// 글쓰기 잠금(예: 장르 카페 미가입) — 잠금 사유와 해제 액션을 패널 밖에서 주입한다.
export interface FanCafeComposeLock {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FanCafePanel({
  scope,
  targetId,
  targetLabel,
  compact = false,
  composeLock = null,
  onTopLevelReplyDelta,
  onTopLevelPostCreated,
}: {
  scope: FanCafeScopeFilter;
  targetId?: string;
  targetLabel: string;
  compact?: boolean;
  composeLock?: FanCafeComposeLock | null;
  onTopLevelReplyDelta?: (post: FanCafePost, delta: number) => void;
  onTopLevelPostCreated?: (post: FanCafePost) => void;
}) {
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
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
  const [images, setImages] = useState<string[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
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
  const attachInputRef = useRef<HTMLInputElement | null>(null);
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
  const authHeaders = useMemo(() => (sessionToken ? { "x-user-id": sessionToken } : undefined), [sessionToken]);

  function appendDemoActivity(action: string, label: string, detail?: string) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FAN_CAFE_ACTIVITY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const current = Array.isArray(parsed) ? parsed : [];
      const next = [
        ...current,
        {
          id: `fan-cafe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
          action,
          label,
          detail,
          scope,
          targetLabel,
        },
      ].slice(-20);
      window.localStorage.setItem(FAN_CAFE_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Demo activity is optional; storage failures should not block the UI.
    }
  }

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
      const nextItems = ensureArray<FanCafePost>(parsedData.items);
      setPosts((current) => [...current, ...nextItems]);
      setNextCursor(parsedData.nextCursor ?? null);
      setHasMore(Boolean(parsedData.hasMore));
    } catch {
      setError("추가 게시글을 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setAttachBusy(true);
    try {
      const incoming = [...files].slice(0, ATTACHMENT_MAX_COUNT - images.length);
      if (incoming.length === 0) {
        setError(`이미지는 최대 ${ATTACHMENT_MAX_COUNT}장까지 첨부할 수 있어요.`);
        return;
      }
      const converted: string[] = [];
      for (const file of incoming) {
        converted.push(await fileToAttachmentDataUrl(file));
      }
      setImages((current) => [...current, ...converted].slice(0, ATTACHMENT_MAX_COUNT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setAttachBusy(false);
    }
  }

  async function submit() {
    if (!userId) return;
    if (!title.trim() || !text.trim()) return;
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
          images,
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
      setImages([]);
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
            composeLock ? (
              <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
                <UsersRound className="mx-auto mb-2 text-accent" size={20} />
                <p className="text-sm font-medium text-fg">{composeLock.message}</p>
                <p className="mt-1 text-xs text-fg-3">읽기는 누구에게나 열려 있습니다.</p>
                {composeLock.actionLabel && composeLock.onAction ? (
                  <button
                    type="button"
                    onClick={composeLock.onAction}
                    className="mt-4 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2"
                  >
                    {composeLock.actionLabel}
                  </button>
                ) : null}
              </div>
            ) : userId ? (
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
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(event) => {
                    void attachFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={attachBusy || images.length >= ATTACHMENT_MAX_COUNT}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-raised/55 px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-canvas/55 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ImagePlus size={14} />
                    {attachBusy ? "이미지 처리 중..." : `이미지 첨부 ${images.length}/${ATTACHMENT_MAX_COUNT}`}
                  </button>
                  <span className="text-[0.65rem] text-fg-3">긴 변 1600px·장당 2MB로 자동 축소</span>
                </div>
                {images.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {images.map((src, index) => (
                      <li key={`${index}-${src.slice(-24)}`} className="relative">
                        <img
                          src={src}
                          alt={`첨부 미리보기 ${index + 1}`}
                          className="size-16 rounded-lg border border-line object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`첨부 이미지 ${index + 1} 제거`}
                          onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-canvas text-fg-3 transition-colors hover:text-bad"
                        >
                          <X size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!title.trim() || !text.trim() || isSubmittingPost || attachBusy}
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
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => appendDemoActivity("blocked", "로그인 전 작성 차단", "약관 확인 후 로그인 필요")}
                    className="rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg"
                  >
                    차단 로그 남기기
                  </button>
                  <a className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent" href="/terms">
                    약관 보기
                  </a>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
              <Sparkles className="mx-auto mb-2 text-accent" size={20} />
              <p className="text-sm font-medium text-fg">현재 통합 피드에서는 작성이 제한돼요.</p>
              <p className="mt-1 text-xs text-fg-3">작품·작가·펜카페 보드로 이동해 작성할 수 있습니다.</p>
              <button
                type="button"
                onClick={() => appendDemoActivity("blocked", "통합 피드 작성 차단", "대상 보드에서 작성 가능")}
                className="mt-4 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg"
              >
                작성 제한 로그 남기기
              </button>
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
                onReplyCreated={(replyPost, delta) => applyTopLevelReplyDelta(replyPost, delta)}
                onDeleted={(id) => setPosts((current) => current.filter((p) => p.id !== id))}
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
  onDeleted,
}: {
  post: FanCafePost;
  compact?: boolean;
  onReplyCreated?: (post: FanCafePost, delta: number) => void;
  onDeleted?: (id: string) => void;
}) {
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
  const isOwner = !!userId && post.author?.id === userId;
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!userId || deleting) return;
    if (!window.confirm("이 글을 삭제할까요? 답글도 함께 삭제됩니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
        headers: { "x-user-id": sessionToken ?? "" },
      });
      if (res.ok) onDeleted?.(post.id);
      else setDeleting(false);
    } catch {
      setDeleting(false);
    }
  }
  const [open, setOpen] = useState(false);
  const [loadedCount, setLoadedCount] = useState<number | null>(
    post.replies ? countReplies(post.replies) : null
  );
  const displayReplyCount = loadedCount ?? post.replyCount;

  return (
    <article className="group rounded-2xl border border-line bg-card p-4 transition-[border-color,background-color,transform] duration-200 hover:border-line-strong hover:bg-raised/30 sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-[oklch(0.97_0.012_85)] ring-1 ring-[oklch(0.95_0.01_85/0.14)] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]"
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
            <Link
              href={`/community/post/${encodeURIComponent(post.id)}`}
              className="rounded-sm transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {post.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">{post.author.name}</p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="내 글 삭제"
            title="삭제"
            className="shrink-0 rounded-lg p-1.5 text-fg-3 opacity-0 transition-colors hover:bg-raised hover:text-bad focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{post.text}</p>
      <FanPostImages title={post.title} images={post.images} />
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
          {loadedCount !== null && displayReplyCount > 0 ? (
            <span className="text-[0.68rem] text-fg-3">대화 {displayReplyCount}개</span>
          ) : null}
        </div>
        {open && (
          <FanPostReplySection
            postId={post.id}
            initialReplies={post.replies}
            onCountChange={setLoadedCount}
            onReplyDelta={(delta) => onReplyCreated?.(post, delta)}
            className="mt-4"
          />
        )}
      </div>
    </article>
  );
}

// 첨부 이미지 그리드 — 서버에서 webp/jpeg/png 데이터 URL만 통과하므로 그대로 <img>로 렌더(텍스트는 항상 텍스트 노드).
export function FanPostImages({ title, images }: { title: string; images?: string[] }) {
  const list = images ?? [];
  if (list.length === 0) return null;
  return (
    <div className={cn("mt-3 grid gap-2", list.length === 1 ? "grid-cols-1 sm:max-w-sm" : "grid-cols-2 sm:grid-cols-3")}>
      {list.map((src, index) => (
        <img
          key={`${index}-${src.slice(-24)}`}
          src={src}
          alt={`${title} 첨부 이미지 ${index + 1}`}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full rounded-xl border border-line object-cover",
            list.length === 1 ? "max-h-96 object-contain bg-canvas/40" : "aspect-square"
          )}
        />
      ))}
    </div>
  );
}

// 소프트 삭제 마스킹(서버 maskDeletedReply와 동일 형태) — 하위 답글 자리 보존.
function maskReplyNode(tree: FanCafeReply[], replyId: string): FanCafeReply[] {
  return tree.map((item) => {
    if (item.id === replyId) {
      return { ...item, deleted: true, text: "", author: { name: "삭제됨", avatar: "#5b5751" } };
    }
    if (!item.children || item.children.length === 0) return item;
    return { ...item, children: maskReplyNode(item.children, replyId) };
  });
}

function removeReplyNode(tree: FanCafeReply[], replyId: string): FanCafeReply[] {
  return tree
    .filter((item) => item.id !== replyId)
    .map((item) =>
      item.children && item.children.length > 0 ? { ...item, children: removeReplyNode(item.children, replyId) } : item
    );
}

// 토론 글 답글 패널 — 목록 카드(FanPostCard)와 토론 스레드 분할 라우트(/community/post/:id)가 공유한다.
export function FanPostReplySection({
  postId,
  initialReplies,
  onCountChange,
  onReplyDelta,
  className,
}: {
  postId: string;
  initialReplies?: FanCafeReply[];
  /** 로드/작성/삭제 후 전체(마스킹 포함) 답글 수를 알려준다. */
  onCountChange?: (count: number) => void;
  /** 서버 집계 기준 답글 수 변화량(+1 작성, -1 완전 삭제). 소프트 삭제는 0. */
  onReplyDelta?: (delta: number) => void;
  className?: string;
}) {
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
  const [loaded, setLoaded] = useState(Boolean(initialReplies));
  const [replies, setReplies] = useState<FanCafeReply[]>(initialReplies ?? []);
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

  // 트리가 바뀔 때마다(로드/작성/삭제) 부모에 전체 답글 수를 알린다 — 비동기 핸들러의 stale 트리 의존 제거.
  useEffect(() => {
    if (!loaded) return;
    onCountChange?.(countReplies(replies));
  }, [loaded, onCountChange, replies]);

  useEffect(() => {
    if (!replyAutoRefreshEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        refreshReplies();
      }
    };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [replyAutoRefreshEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      replyRefreshControllerRef.current?.abort();
      setIsLoadingReplies(true);
      setError(null);
      const controller = new AbortController();
      replyRefreshControllerRef.current = controller;

      fetch(`/api/community/posts/${encodeURIComponent(postId)}/replies`, {
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
    // onCountChange는 부모 setState라 참조 변동이 잦다 — postId/tick 기준으로만 재요청한다.
  }, [postId, replyRefreshTick]);

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
      const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/replies`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { "x-user-id": sessionToken } : {}) },
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
      onReplyDelta?.(1);
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

  // 본인 답글 삭제 — 하위 답글이 있으면 서버가 소프트 삭제(자리 표시)로 남긴다.
  async function deleteReply(replyId: string) {
    if (!userId || !sessionToken) return;
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`,
        { method: "DELETE", cache: "no-store", headers: { "x-user-id": sessionToken } }
      );
      const data = await safeParseJson<unknown>(res);
      if (!res.ok) {
        setError(resolveApiError(data, "댓글을 삭제하지 못했습니다."));
        return;
      }
      const result = (data ?? {}) as { deleted?: boolean; soft?: boolean };
      if (!result.deleted) {
        setError("댓글을 삭제하지 못했습니다.");
        return;
      }
      setReplies((current) => (result.soft ? maskReplyNode(current, replyId) : removeReplyNode(current, replyId)));
      if (!result.soft) onReplyDelta?.(-1);
      setReplySyncAt(new Date().toISOString());
    } catch {
      setError("댓글을 삭제하지 못했습니다.");
    }
  }

  const rootDraft = getDraft("__root__");
  const isRootSubmitting = Boolean(submittingReplies.__root__);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
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
            <RefreshCw size={12} className={cn(isLoadingReplies && "animate-spin motion-reduce:animate-none")} />
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
          onDelete={deleteReply}
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
  );
}

function ReplyThread({
  items,
  userId,
  onSubmit,
  onDelete,
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
  onDelete: (replyId: string) => Promise<void>;
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
          onDelete={onDelete}
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
  onDelete,
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
  onDelete: (replyId: string) => Promise<void>;
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
  const isDeleted = Boolean(reply.deleted);
  const isOwnReply = !isDeleted && Boolean(userId) && reply.author.id === userId;

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
        {isOwnReply ? (
          <button
            type="button"
            onClick={() => void onDelete(reply.id)}
            aria-label="내 댓글 삭제"
            title="삭제"
            className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-lg px-1.5 text-fg-3 transition-colors hover:bg-raised hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Trash2 size={12} />
            삭제
          </button>
        ) : null}
      </div>
      {isDeleted ? (
        <p className="text-sm italic leading-relaxed text-fg-3">삭제된 댓글입니다.</p>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{reply.text}</p>
      )}
      {!isDeleted && canReply && (
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
            onDelete={onDelete}
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
