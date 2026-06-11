import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, ImageOff, MessagesSquare, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "@/src/compat/router-link";
import { Container } from "@/components/section";
import { useAdminGate, AdminGateFallback } from "@/src/components/admin/admin-gate";
import { adminFetch, type AdminApiError } from "@/src/components/admin/admin-client";
import { useDocumentTitle } from "@/src/hooks/use-document-title";
import { COMMUNITY_SCOPE_LABEL_WITH_ALL } from "@/lib/community-ui";
import { cn, relativeDate } from "@/lib/utils";
import type { FanCafeScopeFilter } from "@/lib/types";

interface ModerationPost {
  id: string;
  scope: string;
  targetId: string;
  targetLabel: string;
  kind: string;
  title: string;
  excerpt: string;
  imageCount: number;
  hidden: boolean;
  createdAt: string | null;
  author: { id: string; name: string | null; email: string | null };
  replyCount: number;
}

const SCOPE_FILTERS: { value: FanCafeScopeFilter; label: string }[] = (
  ["all", "title", "author", "pencafe", "cafe"] as const
).map((value) => ({ value, label: COMMUNITY_SCOPE_LABEL_WITH_ALL[value] }));

const VISIBILITY_FILTERS = [
  { value: "all", label: "전체" },
  { value: "visible", label: "노출 중" },
  { value: "hidden", label: "숨김" },
] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number]["value"];

// 커뮤니티 모더레이션 분할 라우트(/admin/community) — 게시글 숨김/해제·첨부 제거·완전 삭제.
export function AdminCommunityPage() {
  useDocumentTitle("커뮤니티 관리");
  const { gate, uid } = useAdminGate();

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <MessagesSquare size={13} /> ADMIN · COMMUNITY
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">커뮤니티 글 관리</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-3">
          신고·권리침해 대응 — 게시글 숨김(가역), 첨부 이미지 제거, 완전 삭제(비가역)를 처리합니다.
        </p>
        <Link href="/admin" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
          <ArrowLeft size={13} />
          관리자 콘솔로
        </Link>
      </header>

      <AdminGateFallback gate={gate} />
      {gate.kind === "admin" && uid && <ModerationBoard uid={uid} />}
    </Container>
  );
}

function ModerationBoard({ uid }: { uid: string }) {
  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<FanCafeScopeFilter>("all");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQueryText(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (scope !== "all") params.set("scope", scope);
    if (visibility !== "all") params.set("visibility", visibility);
    if (queryText) params.set("q", queryText);
    adminFetch<{ items: ModerationPost[] }>(`/community/posts?${params.toString()}`, uid)
      .then((data) => alive && setPosts(data.items ?? []))
      .catch((e: AdminApiError) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [queryText, refreshTick, scope, uid, visibility]);

  async function run(postId: string, action: () => Promise<void>) {
    if (busyId) return;
    setBusyId(postId);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleHidden(post: ModerationPost) {
    void run(post.id, async () => {
      await adminFetch(`/content/fan_post/${encodeURIComponent(post.id)}/visibility`, uid, {
        method: "POST",
        body: JSON.stringify({ hidden: !post.hidden }),
      });
      setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, hidden: !post.hidden } : item)));
    });
  }

  function clearAttachments(post: ModerationPost) {
    if (!window.confirm(`이 글의 첨부 이미지 ${post.imageCount}장을 모두 제거할까요? (본문은 유지)`)) return;
    void run(post.id, async () => {
      await adminFetch(`/community/posts/${encodeURIComponent(post.id)}/attachments/clear`, uid, { method: "POST" });
      setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, imageCount: 0 } : item)));
    });
  }

  function deletePost(post: ModerationPost) {
    if (!window.confirm(`"${post.title}" 글을 완전히 삭제할까요? 답글도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    void run(post.id, async () => {
      await adminFetch(`/community/posts/${encodeURIComponent(post.id)}`, uid, { method: "DELETE" });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-xs">
          <Search size={14} />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            maxLength={80}
            placeholder="제목·본문·보드·작성자 검색"
            className="h-7 w-56 min-w-0 border-none bg-transparent text-xs outline-none placeholder:text-fg-3"
          />
        </div>
        <div className="inline-flex flex-wrap rounded-xl border border-line bg-raised/40">
          {SCOPE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              aria-pressed={scope === option.value}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl",
                scope === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-line bg-raised/40">
          {VISIBILITY_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setVisibility(option.value)}
              aria-pressed={visibility === option.value}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl",
                visibility === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRefreshTick((tick) => tick + 1)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-fg-3 transition-colors hover:text-fg"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin motion-reduce:animate-none")} /> 갱신
        </button>
      </div>

      {(error || actionError) && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{error ?? actionError}</p>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-10 text-center text-sm text-fg-3">
          조건에 맞는 게시글이 없어요.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {posts.map((post) => {
            const busy = busyId === post.id;
            return (
              <li
                key={post.id}
                className={cn("rounded-xl border border-line bg-card/60 p-4", post.hidden && "opacity-75")}
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
                  <span className="rounded-full border border-line bg-raised/45 px-2 py-0.5 font-medium">
                    {COMMUNITY_SCOPE_LABEL_WITH_ALL[(post.scope as FanCafeScopeFilter) ?? "all"] ?? post.scope} ·{" "}
                    {post.targetLabel}
                  </span>
                  {post.hidden && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 font-medium text-warn">
                      <EyeOff size={10} /> 숨김
                    </span>
                  )}
                  {post.imageCount > 0 && (
                    <span className="rounded-full bg-raised/60 px-2 py-0.5">이미지 {post.imageCount}</span>
                  )}
                  <span className="ml-auto">{post.createdAt ? relativeDate(post.createdAt) : "—"}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-fg">
                  {post.hidden ? (
                    post.title
                  ) : (
                    <Link
                      href={`/community/post/${encodeURIComponent(post.id)}`}
                      className="transition-colors hover:text-accent"
                    >
                      {post.title}
                    </Link>
                  )}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">{post.excerpt}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
                  <span>
                    {post.author.name ?? "이름 없음"}
                    {post.author.email ? ` · ${post.author.email}` : ""}
                  </span>
                  <span>· 답글 {post.replyCount}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleHidden(post)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent/45 hover:text-accent disabled:opacity-45"
                  >
                    {post.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    {post.hidden ? "노출 복구" : "숨기기"}
                  </button>
                  {post.imageCount > 0 && (
                    <button
                      type="button"
                      onClick={() => clearAttachments(post)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-warn/45 hover:text-warn disabled:opacity-45"
                    >
                      <ImageOff size={13} />
                      첨부 제거
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deletePost(post)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg-3 transition-colors hover:border-bad/45 hover:text-bad disabled:opacity-45"
                  >
                    <Trash2 size={13} />
                    완전 삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
