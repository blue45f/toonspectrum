import {
  ChevronDown,
  ChevronUp,
  Copy,
  Heart,
  MessageCircle,
  Pencil,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  applyThreadedCommentDelete,
  applyThreadedCommentLike,
  buildThreadedCommentForest,
  countActiveComments,
  replaceThreadedComment,
  type ThreadedCommentDeleteResult,
  type ThreadedCommentNode,
  type ThreadedCommentRecord,
  type ThreadedCommentSort,
} from "./threaded-comment-model";

import Link from "@/compat/router-link";
import { cn, relativeDate } from "@/shared/lib/utils";

import type { Dispatch, KeyboardEvent, SetStateAction } from "react";

const ROOT_DRAFT_KEY = "root";
const REPLY_DRAFT_PREFIX = "reply:";
const EDIT_DRAFT_PREFIX = "edit:";
const SORT_OPTIONS: readonly { value: ThreadedCommentSort; label: string }[] = [
  { value: "oldest", label: "오래된순" },
  { value: "newest", label: "최신순" },
  { value: "popular", label: "공감순" },
];

export interface ThreadedCommentSectionProps<T extends ThreadedCommentRecord> {
  comments: T[];
  setComments: Dispatch<SetStateAction<T[]>>;
  viewerId: string | null;
  onCreate: (text: string, parentId: string | null) => Promise<T>;
  onUpdate: (commentId: string, text: string) => Promise<T>;
  onDelete: (commentId: string) => Promise<ThreadedCommentDeleteResult>;
  onToggleLike: (commentId: string) => Promise<{ liked: boolean; likes: number }>;
  canModerate?: boolean;
  loading?: boolean;
  disabled?: boolean;
  maxLength?: number;
  maxDepth?: number;
  title?: string;
  description?: string;
  emptyText?: string;
  placeholder?: string;
  loginText?: string;
  draftStorageKey?: string;
  className?: string;
  authorHref?: (comment: T) => string | null;
}

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  maxLength: number;
  placeholder: string;
  submitting: boolean;
  compact?: boolean;
  submitLabel?: string;
}

function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  maxLength,
  placeholder,
  submitting,
  compact = false,
  submitLabel = "등록",
}: CommentComposerProps) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className={cn(
      "rounded-xl border border-line bg-canvas/55 p-3 transition-colors focus-within:border-accent/55",
      compact && "bg-panel/55 p-2.5",
    )}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        rows={compact ? 2 : 3}
        aria-label={placeholder}
        placeholder={placeholder}
        className={cn(
          "w-full resize-y bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3",
          compact ? "min-h-14" : "min-h-20",
        )}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-fg-3">
        <span className="numeral">{value.length}/{maxLength}</span>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-fg-3 transition-colors hover:text-fg"
            >
              <X size={12} aria-hidden />
              취소
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || submitting}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send size={12} aria-hidden />
            {submitting ? "저장 중..." : submitLabel}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[0.62rem] text-fg-3">⌘/Ctrl + Enter로 등록 · Esc로 닫기</p>
    </div>
  );
}

function CommentAvatar({ comment }: { comment: ThreadedCommentRecord }) {
  const avatar = comment.author.avatar?.trim() ?? "";
  const initial = comment.author.name.trim().charAt(0) || "?";
  const isImage = /^(?:https?:|data:|blob:|\/)/u.test(avatar);

  if (isImage) {
    return (
      <img
        src={avatar}
        alt=""
        loading="lazy"
        className="size-9 shrink-0 rounded-full bg-raised object-cover ring-1 ring-line"
      />
    );
  }
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold text-fg-2 ring-1 ring-line"
      style={avatar ? { background: avatar } : undefined}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function isEdited(comment: ThreadedCommentRecord): boolean {
  const createdAt = Date.parse(comment.createdAt);
  const updatedAt = Date.parse(comment.updatedAt);
  return Number.isFinite(createdAt) && Number.isFinite(updatedAt) && updatedAt - createdAt > 1_000;
}

function loadDrafts(storageKey: string | undefined): Record<string, string> {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export function ThreadedCommentSection<T extends ThreadedCommentRecord>({
  comments,
  setComments,
  viewerId,
  onCreate,
  onUpdate,
  onDelete,
  onToggleLike,
  canModerate = false,
  loading = false,
  disabled = false,
  maxLength = 1000,
  maxDepth = 4,
  title = "댓글",
  description = "의견을 나누고 서로의 이야기에 답해 보세요.",
  emptyText = "아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.",
  placeholder = "댓글을 입력해 주세요.",
  loginText = "댓글을 남기려면 로그인해 주세요.",
  draftStorageKey,
  className,
  authorHref,
}: ThreadedCommentSectionProps<T>) {
  const [sort, setSort] = useState<ThreadedCommentSort>("oldest");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(() => new Set());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const forest = useMemo(() => buildThreadedCommentForest(comments, sort), [comments, sort]);
  const activeCount = useMemo(() => countActiveComments(comments), [comments]);

  useEffect(() => {
    setDrafts(loadDrafts(draftStorageKey));
    setOpenReplyId(null);
    setEditingId(null);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        const nonEmptyDrafts = Object.fromEntries(
          Object.entries(drafts).filter(([, value]) => value.trim().length > 0),
        );
        if (Object.keys(nonEmptyDrafts).length > 0) {
          window.localStorage.setItem(draftStorageKey, JSON.stringify(nonEmptyDrafts));
        } else {
          window.localStorage.removeItem(draftStorageKey);
        }
      } catch {
        // Storage may be unavailable in private browsing; comments still work in memory.
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [draftStorageKey, drafts]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined" || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("comment-")) return;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [comments.length]);

  function draftKeyForReply(commentId: string) {
    return `${REPLY_DRAFT_PREFIX}${commentId}`;
  }

  function draftKeyForEdit(commentId: string) {
    return `${EDIT_DRAFT_PREFIX}${commentId}`;
  }

  function setDraft(key: string, value: string) {
    setDrafts((current) => ({ ...current, [key]: value.slice(0, maxLength) }));
  }

  function clearDraft(key: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function startBusy(key: string) {
    setBusyKeys((current) => new Set(current).add(key));
  }

  function stopBusy(key: string) {
    setBusyKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  async function createComment(parentId: string | null) {
    if (!viewerId || disabled) return;
    const draftKey = parentId ? draftKeyForReply(parentId) : ROOT_DRAFT_KEY;
    const text = (drafts[draftKey] ?? "").trim();
    if (!text) return;
    const busyKey = `create:${parentId ?? "root"}`;
    if (busyKeys.has(busyKey)) return;
    startBusy(busyKey);
    setError(null);
    try {
      const created = await onCreate(text, parentId);
      setComments((current) => [...current, created]);
      clearDraft(draftKey);
      if (parentId) setOpenReplyId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "댓글을 등록하지 못했습니다.");
    } finally {
      stopBusy(busyKey);
    }
  }

  function beginEdit(comment: T) {
    setEditingId(comment.id);
    setOpenReplyId(null);
    setDraft(draftKeyForEdit(comment.id), comment.text);
  }

  async function saveEdit(commentId: string) {
    const draftKey = draftKeyForEdit(commentId);
    const text = (drafts[draftKey] ?? "").trim();
    if (!text || disabled) return;
    const busyKey = `edit:${commentId}`;
    if (busyKeys.has(busyKey)) return;
    startBusy(busyKey);
    setError(null);
    try {
      const updated = await onUpdate(commentId, text);
      setComments((current) => replaceThreadedComment(current, updated));
      clearDraft(draftKey);
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "댓글을 수정하지 못했습니다.");
    } finally {
      stopBusy(busyKey);
    }
  }

  async function removeComment(commentId: string) {
    if (disabled || !window.confirm("이 댓글을 삭제할까요? 대댓글이 있으면 삭제 표시로 남습니다.")) return;
    const busyKey = `delete:${commentId}`;
    if (busyKeys.has(busyKey)) return;
    startBusy(busyKey);
    setError(null);
    try {
      const result = await onDelete(commentId);
      setComments((current) => applyThreadedCommentDelete(current, commentId, result));
      if (editingId === commentId) setEditingId(null);
      if (openReplyId === commentId) setOpenReplyId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "댓글을 삭제하지 못했습니다.");
    } finally {
      stopBusy(busyKey);
    }
  }

  async function toggleLike(commentId: string) {
    if (!viewerId || disabled) return;
    const busyKey = `like:${commentId}`;
    if (busyKeys.has(busyKey)) return;
    startBusy(busyKey);
    setError(null);
    try {
      const result = await onToggleLike(commentId);
      setComments((current) => applyThreadedCommentLike(current, commentId, result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "댓글 공감을 처리하지 못했습니다.");
    } finally {
      stopBusy(busyKey);
    }
  }

  async function copyPermalink(commentId: string) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = `comment-${commentId}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedId(commentId);
      window.setTimeout(() => setCopiedId((current) => current === commentId ? null : current), 1_500);
    } catch {
      setError("댓글 링크를 복사하지 못했습니다. 주소창의 링크를 복사해 주세요.");
    }
  }

  function toggleRoot(rootId: string) {
    setCollapsedRoots((current) => {
      const next = new Set(current);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function renderNode(node: ThreadedCommentNode<T>, rootId: string) {
    const { comment, depth, children } = node;
    const deleted = comment.deleted || comment.hidden;
    const ownComment = Boolean(viewerId) && comment.author.id === viewerId;
    const canEdit = ownComment && !deleted && !disabled;
    const canDelete = (ownComment || canModerate) && !deleted && !disabled;
    const canReply = Boolean(viewerId) && !deleted && !disabled && depth < maxDepth - 1;
    const replyDraftKey = draftKeyForReply(comment.id);
    const editDraftKey = draftKeyForEdit(comment.id);
    const isReplyOpen = openReplyId === comment.id;
    const isEditing = editingId === comment.id;
    const isRootCollapsed = depth === 0 && collapsedRoots.has(rootId);
    const href = authorHref?.(comment) ?? null;

    return (
      <div key={comment.id} className={cn(depth > 0 && "border-l border-line/70 pl-3 sm:pl-4")}>
        <article
          id={`comment-${comment.id}`}
          tabIndex={-1}
          className={cn(
            "scroll-mt-24 rounded-xl border border-line bg-card/55 p-3 transition-colors target:border-accent target:bg-accent-soft/30 sm:p-3.5",
            depth > 0 && "bg-canvas/35",
          )}
        >
          <div className="flex items-start gap-2.5">
            <CommentAvatar comment={comment} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-fg-3">
                {href && !deleted ? (
                  <Link href={href} className="max-w-48 truncate font-semibold text-fg-2 hover:text-accent">
                    {comment.author.name}
                  </Link>
                ) : (
                  <span className="max-w-48 truncate font-semibold text-fg-2">{comment.author.name}</span>
                )}
                <time dateTime={comment.createdAt}>{relativeDate(comment.createdAt)}</time>
                {isEdited(comment) && !deleted ? <span>수정됨</span> : null}
                {depth > 0 ? <span>대댓글</span> : null}
              </div>

              {isEditing ? (
                <div className="mt-2">
                  <CommentComposer
                    value={drafts[editDraftKey] ?? comment.text}
                    onChange={(value) => setDraft(editDraftKey, value)}
                    onSubmit={() => void saveEdit(comment.id)}
                    onCancel={() => {
                      setEditingId(null);
                      clearDraft(editDraftKey);
                    }}
                    maxLength={maxLength}
                    placeholder="댓글 수정"
                    submitting={busyKeys.has(`edit:${comment.id}`)}
                    compact
                    submitLabel="수정 저장"
                  />
                </div>
              ) : deleted ? (
                <p className="mt-1.5 text-sm italic leading-relaxed text-fg-3">
                  {comment.hidden ? "운영 정책에 따라 숨겨진 댓글입니다." : "삭제된 댓글입니다."}
                </p>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">
                  {comment.text}
                </p>
              )}

              {!isEditing ? (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[0.68rem]">
                  {!deleted ? (
                    <button
                      type="button"
                      onClick={() => void toggleLike(comment.id)}
                      disabled={!viewerId || disabled || busyKeys.has(`like:${comment.id}`)}
                      aria-pressed={comment.viewerLiked}
                      title={viewerId ? "공감" : "로그인 후 공감할 수 있어요"}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-55",
                        comment.viewerLiked && "bg-accent-soft text-accent",
                      )}
                    >
                      <Heart size={12} fill={comment.viewerLiked ? "currentColor" : "none"} aria-hidden />
                      공감 {comment.likes}
                    </button>
                  ) : null}
                  {canReply ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setOpenReplyId((current) => current === comment.id ? null : comment.id);
                      }}
                      aria-expanded={isReplyOpen}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                    >
                      <Reply size={12} aria-hidden />
                      답글
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => beginEdit(comment)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                    >
                      <Pencil size={12} aria-hidden />
                      수정
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => void removeComment(comment.id)}
                      disabled={busyKeys.has(`delete:${comment.id}`)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-50"
                    >
                      <Trash2 size={12} aria-hidden />
                      삭제
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyPermalink(comment.id)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                  >
                    <Copy size={12} aria-hidden />
                    {copiedId === comment.id ? "복사됨" : "링크"}
                  </button>
                  {depth === 0 && children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleRoot(rootId)}
                      aria-expanded={!isRootCollapsed}
                      className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                    >
                      {isRootCollapsed ? <ChevronDown size={12} aria-hidden /> : <ChevronUp size={12} aria-hidden />}
                      답글 {children.length}개 {isRootCollapsed ? "보기" : "접기"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {isReplyOpen ? (
                <div className="mt-2">
                  <CommentComposer
                    value={drafts[replyDraftKey] ?? ""}
                    onChange={(value) => setDraft(replyDraftKey, value)}
                    onSubmit={() => void createComment(comment.id)}
                    onCancel={() => setOpenReplyId(null)}
                    maxLength={maxLength}
                    placeholder={`${comment.author.name}님에게 답글`}
                    submitting={busyKeys.has(`create:${comment.id}`)}
                    compact
                    submitLabel="답글 등록"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </article>

        {children.length > 0 && !isRootCollapsed ? (
          <div className="mt-2 grid gap-2">
            {children.map((child) => renderNode(child, rootId))}
          </div>
        ) : null}
      </div>
    );
  }

  const rootDraft = drafts[ROOT_DRAFT_KEY] ?? "";

  return (
    <section className={cn("rounded-2xl border border-line bg-panel/30 p-4 sm:p-5", className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            <MessageCircle size={15} className="text-accent" aria-hidden />
            {title}
            <span className="numeral text-fg-3">{activeCount}</span>
          </h2>
          {description ? <p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p> : null}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas/45 p-1" aria-label="댓글 정렬">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              aria-pressed={sort === option.value}
              className={cn(
                "min-h-8 rounded-lg px-2.5 text-[0.68rem] font-medium text-fg-3 transition-colors hover:text-fg",
                sort === option.value && "bg-raised text-fg shadow-sm",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {viewerId && !disabled ? (
        <div className="mt-4">
          <CommentComposer
            value={rootDraft}
            onChange={(value) => setDraft(ROOT_DRAFT_KEY, value)}
            onSubmit={() => void createComment(null)}
            maxLength={maxLength}
            placeholder={placeholder}
            submitting={busyKeys.has("create:root")}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-card/40 px-3 py-3 text-center text-xs text-fg-3">
          {disabled ? "현재 이 게시물에는 댓글을 작성할 수 없습니다." : loginText}
        </p>
      )}

      {error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="오류 닫기" className="shrink-0">
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-2.5 rounded-xl border border-line p-3">
              <span className="skeleton size-9 shrink-0 rounded-full" />
              <span className="flex-1 space-y-2 py-0.5">
                <span className="skeleton block h-3 w-24" />
                <span className="skeleton block h-3 w-full" />
              </span>
            </div>
          ))
        ) : forest.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card/30 px-4 py-8 text-center text-xs text-fg-3">
            {emptyText}
          </p>
        ) : (
          forest.map((node) => renderNode(node, node.comment.id))
        )}
      </div>
    </section>
  );
}
