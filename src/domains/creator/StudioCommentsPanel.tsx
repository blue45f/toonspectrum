import {
  CheckCircle2,
  CircleDot,
  CornerDownRight,
  HardDrive,
  MapPin,
  MessageSquareText,
  Reply,
  RotateCcw,
  Send,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import {
  addStudioCommentReply,
  addStudioCommentThread,
  assignStudioCommentThread,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
  STUDIO_COMMENTS_MAX_BODY_LENGTH,
  STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH,
  STUDIO_COMMENTS_MAX_REPLIES_PER_THREAD,
  STUDIO_COMMENTS_MAX_THREADS,
  STUDIO_COMMENTS_MAX_TOTAL_MESSAGES,
  studioCommentAnchorsEqual,
  type StudioCommentActor,
  type StudioCommentAnchor,
  type StudioCommentsDocument,
} from "./studio-comments";

export interface StudioCommentAnchorOption {
  anchor: StudioCommentAnchor;
  label: string;
}

export interface StudioCommentsPanelProps {
  open: boolean;
  onClose: () => void;
  document: StudioCommentsDocument;
  onChange: (document: StudioCommentsDocument) => void;
  activeAnchor: StudioCommentAnchor | null;
  currentActor: StudioCommentActor;
  anchorOptions?: readonly StudioCommentAnchorOption[];
  onSelectAnchor?: (anchor: StudioCommentAnchor) => void;
  /** Figma식 자유 위치 핀: 패널을 닫고 캔버스 클릭 한 번으로 point 앵커를 잡는 모드를 무장한다. */
  onArmPinPlacement?: () => void;
}

type CommentFilter = "current" | "all" | "open" | "resolved";

const FILTERS: readonly { value: CommentFilter; label: string }[] = [
  { value: "current", label: "현재 위치" },
  { value: "all", label: "전체" },
  { value: "open", label: "열림" },
  { value: "resolved", label: "해결됨" },
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const FIELD_CLASS =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

const QUIET_BUTTON_CLASS =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function createCommentId(prefix: "comment" | "reply"): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? DATE_FORMATTER.format(time) : value;
}

function actorInitial(actor: StudioCommentActor): string {
  return Array.from(actor.displayName.trim())[0] ?? "?";
}

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function fallbackAnchorLabel(anchor: StudioCommentAnchor): string {
  if (anchor.type === "page") return `페이지 · ${shortId(anchor.pageId)}`;
  if (anchor.type === "frame") return `컷 · ${shortId(anchor.frameId)}`;
  if (anchor.type === "point") return `위치 · ${Math.round(anchor.x * 100)}%, ${Math.round(anchor.y * 100)}%`;
  return `요소 · ${shortId(anchor.elementId)}`;
}

function anchorKey(anchor: StudioCommentAnchor): string {
  if (anchor.type === "page") return `page:${anchor.pageId}`;
  if (anchor.type === "frame") return `frame:${anchor.pageId}:${anchor.frameId}`;
  if (anchor.type === "point") return `point:${anchor.pageId}:${anchor.x.toFixed(4)}:${anchor.y.toFixed(4)}`;
  return `element:${anchor.pageId}:${anchor.frameId ?? ""}:${anchor.elementId}`;
}

function getAnchorLabel(
  anchor: StudioCommentAnchor,
  options: readonly StudioCommentAnchorOption[]
): string {
  return options.find((option) => studioCommentAnchorsEqual(option.anchor, anchor))?.label
    ?? fallbackAnchorLabel(anchor);
}

export function StudioCommentsPanel({
  open,
  onClose,
  document,
  onChange,
  activeAnchor,
  currentActor,
  anchorOptions = [],
  onSelectAnchor,
  onArmPinPlacement,
}: StudioCommentsPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const replyEditorRef = useRef<HTMLTextAreaElement>(null);
  const assigneeEditorRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<CommentFilter>("current");
  const [newComment, setNewComment] = useState("");
  const [replyingThreadId, setReplyingThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [assigningThreadId, setAssigningThreadId] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || typeof globalThis.document === "undefined") return;
    const previousFocus = globalThis.document.activeElement;
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";

    const animationFrame = globalThis.requestAnimationFrame(() => {
      if (composerRef.current && !composerRef.current.disabled) composerRef.current.focus();
      else dialogRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.tabIndex !== -1 && element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && globalThis.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && globalThis.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    globalThis.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      globalThis.cancelAnimationFrame(animationFrame);
      globalThis.document.body.style.overflow = previousOverflow;
      globalThis.document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof globalThis.document === "undefined") return;
    const animationFrame = globalThis.requestAnimationFrame(() => {
      if (replyingThreadId) replyEditorRef.current?.focus();
      else if (assigningThreadId) assigneeEditorRef.current?.focus();
    });
    return () => globalThis.cancelAnimationFrame(animationFrame);
  }, [assigningThreadId, open, replyingThreadId]);

  if (!open || typeof globalThis.document === "undefined") return null;

  const totalMessages = document.threads.reduce(
    (count, thread) => count + 1 + thread.replies.length,
    0
  );
  const openCount = document.threads.filter((thread) => !thread.resolved).length;
  const resolvedCount = document.threads.length - openCount;
  const currentCount = activeAnchor
    ? document.threads.filter((thread) =>
        studioCommentAnchorsEqual(thread.anchor, activeAnchor)
      ).length
    : 0;
  const filterCounts: Record<CommentFilter, number> = {
    current: currentCount,
    all: document.threads.length,
    open: openCount,
    resolved: resolvedCount,
  };
  const visibleThreads = document.threads
    .filter((thread) => {
      if (filter === "current") {
        return activeAnchor
          ? studioCommentAnchorsEqual(thread.anchor, activeAnchor)
          : false;
      }
      if (filter === "open") return !thread.resolved;
      if (filter === "resolved") return thread.resolved;
      return true;
    })
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const canAddThread =
    document.threads.length < STUDIO_COMMENTS_MAX_THREADS
    && totalMessages < STUDIO_COMMENTS_MAX_TOTAL_MESSAGES;

  const applyChange = (operation: () => StudioCommentsDocument, fallbackMessage: string): boolean => {
    try {
      const nextDocument = operation();
      if (nextDocument !== document) onChange(nextDocument);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackMessage);
      return false;
    }
  };

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeAnchor) {
      setError("댓글을 연결할 페이지, 컷 또는 요소를 먼저 선택해 주세요.");
      return;
    }
    const saved = applyChange(
      () => addStudioCommentThread(document, {
        id: createCommentId("comment"),
        anchor: activeAnchor,
        author: currentActor,
        body: newComment,
      }),
      "댓글을 저장하지 못했어요."
    );
    if (saved) setNewComment("");
  };

  const submitReply = (event: FormEvent<HTMLFormElement>, threadId: string) => {
    event.preventDefault();
    const saved = applyChange(
      () => addStudioCommentReply(document, threadId, {
        id: createCommentId("reply"),
        author: currentActor,
        body: replyBody,
      }),
      "답글을 저장하지 못했어요."
    );
    if (saved) {
      setReplyBody("");
      setReplyingThreadId(null);
    }
  };

  const submitAssignee = (event: FormEvent<HTMLFormElement>, threadId: string) => {
    event.preventDefault();
    const displayName = assigneeName.trim().slice(0, STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH);
    if (!displayName) {
      setError("담당자 표시 이름을 입력해 주세요.");
      return;
    }
    const assignee = displayName === currentActor.displayName
      ? currentActor
      : { displayName };
    const saved = applyChange(
      () => assignStudioCommentThread(document, threadId, assignee),
      "담당자를 지정하지 못했어요."
    );
    if (saved) setAssigningThreadId(null);
  };

  const assignToCurrentActor = (threadId: string) => {
    const saved = applyChange(
      () => assignStudioCommentThread(document, threadId, currentActor),
      "담당자를 지정하지 못했어요."
    );
    if (saved) setAssigningThreadId(null);
  };

  const clearAssignee = (threadId: string) => {
    const saved = applyChange(
      () => assignStudioCommentThread(document, threadId, null),
      "담당자 배정을 해제하지 못했어요."
    );
    if (saved) setAssigningThreadId(null);
  };

  const navigateToAnchor = (anchor: StudioCommentAnchor) => {
    if (!onSelectAnchor) return;
    onSelectAnchor(anchor);
    onClose();
  };

  let emptyTitle = "이 조건에 맞는 댓글이 없어요";
  let emptyDescription = "필터를 바꾸거나 새 댓글을 등록하면 여기에 표시됩니다.";
  if (filter === "current" && !activeAnchor) {
    emptyTitle = "선택한 위치가 없어요";
    emptyDescription = "캔버스에서 페이지, 컷 또는 요소를 선택하거나 전체 댓글을 확인하세요.";
  } else if (filter === "current") {
    emptyDescription = "이 위치의 첫 댓글을 위에서 남겨 보세요.";
  }

  const activeAnchorLabel = activeAnchor
    ? getAnchorLabel(activeAnchor, anchorOptions)
    : "선택한 위치 없음";

  const modal = (
    <div className="fixed inset-0 z-[80] isolate flex items-stretch justify-center p-0 text-fg sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[oklch(0.08_0.01_70/0.84)] backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden border-line bg-panel shadow-2xl outline-none sm:rounded-2xl sm:border"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <MessageSquareText size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-sm font-bold text-fg">편집 댓글</h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-cool/30 bg-cool/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-cool">
                <HardDrive size={10} aria-hidden />
                로컬 우선 · 문서에 포함
              </span>
            </div>
            <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-fg-3">
              선택한 위치에 검토 의견을 연결하고 해결 상태를 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="편집 댓글 닫기"
            title="닫기 (Esc)"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="border-b border-line bg-card/35 px-4 py-3 sm:px-5">
            <p className="text-xs font-semibold text-fg-2">문서에 함께 저장되는 검토 메모입니다.</p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              실시간 동기화, 알림, 계정 조회, 서버 권한 검사는 제공하지 않습니다. 프로젝트 파일을 공유할 때 댓글도 함께 포함됩니다.
            </p>
          </div>

          <form onSubmit={submitComment} className="border-b border-line px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${titleId}-body`} className="text-xs font-bold text-fg">새 댓글</label>
                <p className="mt-0.5 truncate text-[0.68rem] text-fg-3" title={activeAnchorLabel}>
                  연결 위치 · {activeAnchorLabel}
                </p>
              </div>
              {onArmPinPlacement && (
                <button
                  type="button"
                  onClick={onArmPinPlacement}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/40 px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  title="캔버스의 원하는 지점을 클릭해 그 위치에 댓글을 답니다 (Figma 스타일)"
                >
                  <MapPin size={13} aria-hidden="true" /> 캔버스에 핀 찍기
                </button>
              )}
              {anchorOptions.length > 0 && onSelectAnchor && (
                <div className="w-full sm:w-64">
                  <label htmlFor={`${titleId}-anchor`} className="sr-only">댓글 연결 위치</label>
                  <select
                    id={`${titleId}-anchor`}
                    value={activeAnchor ? anchorKey(activeAnchor) : ""}
                    onChange={(event) => {
                      const option = anchorOptions.find(
                        (candidate) => anchorKey(candidate.anchor) === event.target.value
                      );
                      if (option) onSelectAnchor(option.anchor);
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="">위치를 선택하세요</option>
                    {anchorOptions.map((option) => (
                      <option key={anchorKey(option.anchor)} value={anchorKey(option.anchor)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <textarea
              ref={composerRef}
              id={`${titleId}-body`}
              value={newComment}
              maxLength={STUDIO_COMMENTS_MAX_BODY_LENGTH}
              rows={3}
              disabled={!activeAnchor || !canAddThread}
              placeholder={activeAnchor
                ? "수정할 점이나 확인이 필요한 내용을 구체적으로 남겨 주세요."
                : "먼저 페이지, 컷 또는 요소를 선택해 주세요."}
              onChange={(event) =>
                setNewComment(event.target.value.slice(0, STUDIO_COMMENTS_MAX_BODY_LENGTH))
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className={`${FIELD_CLASS} mt-2 min-h-24 resize-y`}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.68rem] text-fg-3">
                {canAddThread ? "⌘/Ctrl + Enter로 등록" : "댓글 문서의 저장 한도에 도달했어요."}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[0.68rem] tabular-nums text-fg-3">
                  {newComment.length.toLocaleString("ko-KR")}/{STUDIO_COMMENTS_MAX_BODY_LENGTH.toLocaleString("ko-KR")}
                </span>
                <button
                  type="submit"
                  disabled={!activeAnchor || !canAddThread || !newComment.trim()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={13} aria-hidden />
                  댓글 등록
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div role="alert" className="flex items-start gap-2 border-b border-bad/35 bg-bad/10 px-4 py-2.5 text-xs leading-relaxed text-bad sm:px-5">
              <CircleDot size={14} className="mt-0.5 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="오류 메시지 닫기"
                className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-bad/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          )}

          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-line bg-panel/95 px-4 py-2.5 backdrop-blur-sm sm:px-5">
            <span className="mr-1 text-[0.68rem] font-semibold text-fg-3">필터</span>
            {FILTERS.map((item) => {
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  disabled={item.value === "current" && !activeAnchor}
                  onClick={() => setFilter(item.value)}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 ${
                    active
                      ? "border-accent/45 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  }`}
                >
                  {item.label}
                  <span className="tabular-nums text-[0.65rem] opacity-75">{filterCounts[item.value]}</span>
                </button>
              );
            })}
            <span className="ml-auto text-[0.65rem] tabular-nums text-fg-3">
              메시지 {totalMessages}/{STUDIO_COMMENTS_MAX_TOTAL_MESSAGES}
            </span>
          </div>

          {visibleThreads.length === 0 ? (
            <div className="grid min-h-52 place-items-center px-6 py-10 text-center" aria-live="polite">
              <div className="max-w-sm">
                <MessageSquareText size={28} className="mx-auto text-fg-3" aria-hidden />
                <h3 className="mt-3 text-sm font-bold text-fg">{emptyTitle}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-fg-3">{emptyDescription}</p>
                {filter === "current" && !activeAnchor && document.threads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`${QUIET_BUTTON_CLASS} mt-4`}
                  >
                    전체 댓글 보기
                  </button>
                )}
              </div>
            </div>
          ) : (
            <ol aria-label={`${FILTERS.find((item) => item.value === filter)?.label ?? "전체"} 댓글`}>
              {visibleThreads.map((thread) => {
                const canReply =
                  !thread.resolved
                  && thread.replies.length < STUDIO_COMMENTS_MAX_REPLIES_PER_THREAD
                  && totalMessages < STUDIO_COMMENTS_MAX_TOTAL_MESSAGES;
                const isReplying = replyingThreadId === thread.id;
                const isAssigning = assigningThreadId === thread.id;
                const locationLabel = getAnchorLabel(thread.anchor, anchorOptions);

                return (
                  <li key={thread.id} className="border-b border-line last:border-b-0">
                    <article className="px-4 py-4 sm:px-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-raised text-xs font-bold text-fg-2">
                          {actorInitial(thread.author)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <strong className="text-xs text-fg">{thread.author.displayName}</strong>
                            <time dateTime={thread.createdAt} className="text-[0.68rem] text-fg-3">
                              {formatDate(thread.createdAt)}
                            </time>
                            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.62rem] font-semibold ${
                              thread.resolved
                                ? "border-good/35 bg-good/10 text-good"
                                : "border-warn/35 bg-warn/10 text-warn"
                            }`}>
                              {thread.resolved
                                ? <CheckCircle2 size={10} aria-hidden />
                                : <CircleDot size={10} aria-hidden />}
                              {thread.resolved ? "해결됨" : "열림"}
                            </span>
                          </div>
                          {onSelectAnchor ? (
                            <button
                              type="button"
                              onClick={() => navigateToAnchor(thread.anchor)}
                              aria-label={`${locationLabel} 위치로 이동하고 댓글 패널 닫기`}
                              className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md text-[0.68rem] font-semibold text-cool hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <MapPin size={11} className="shrink-0" aria-hidden />
                              <span className="truncate">{locationLabel}</span>
                              <CornerDownRight size={11} className="shrink-0" aria-hidden />
                            </button>
                          ) : (
                            <span className="mt-1 inline-flex max-w-full items-center gap-1 text-[0.68rem] font-semibold text-fg-3">
                              <MapPin size={11} className="shrink-0" aria-hidden />
                              <span className="truncate">{locationLabel}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-fg">
                        {thread.body}
                      </p>

                      {thread.replies.length > 0 && (
                        <ol aria-label={`${thread.author.displayName} 댓글의 답글`} className="mt-3">
                          {thread.replies.map((reply) => (
                            <li key={reply.id} className="border-t border-line/70 py-3">
                              <div className="flex min-w-0 items-start gap-2.5 pl-4 sm:pl-8">
                                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-[0.68rem] font-bold text-fg-2">
                                  {actorInitial(reply.author)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <strong className="text-[0.72rem] text-fg-2">{reply.author.displayName}</strong>
                                    <time dateTime={reply.createdAt} className="text-[0.65rem] text-fg-3">
                                      {formatDate(reply.createdAt)}
                                    </time>
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-fg-2">
                                    {reply.body}
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          aria-expanded={isReplying}
                          disabled={!canReply}
                          title={thread.resolved ? "다시 열면 답글을 남길 수 있어요." : undefined}
                          onClick={() => {
                            setReplyingThreadId(isReplying ? null : thread.id);
                            setReplyBody("");
                            setAssigningThreadId(null);
                            setError(null);
                          }}
                          className={QUIET_BUTTON_CLASS}
                        >
                          <Reply size={13} aria-hidden />
                          답글{thread.replies.length > 0 ? ` ${thread.replies.length}` : ""}
                        </button>
                        <button
                          type="button"
                          aria-expanded={isAssigning}
                          onClick={() => {
                            setAssigningThreadId(isAssigning ? null : thread.id);
                            setAssigneeName(thread.assignee?.displayName ?? "");
                            setReplyingThreadId(null);
                            setError(null);
                          }}
                          className={QUIET_BUTTON_CLASS}
                        >
                          <UserRoundCheck size={13} aria-hidden />
                          {thread.assignee ? `담당 · ${thread.assignee.displayName}` : "담당자 지정"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const saved = applyChange(
                              () => thread.resolved
                                ? reopenStudioCommentThread(document, thread.id)
                                : resolveStudioCommentThread(document, thread.id, currentActor),
                              thread.resolved
                                ? "댓글을 다시 열지 못했어요."
                                : "댓글을 해결 처리하지 못했어요."
                            );
                            if (saved && !thread.resolved) {
                              setReplyingThreadId(null);
                              setReplyBody("");
                            }
                          }}
                          className={`${QUIET_BUTTON_CLASS} ${
                            thread.resolved ? "text-warn hover:text-warn" : "text-good hover:text-good"
                          }`}
                        >
                          {thread.resolved
                            ? <RotateCcw size={13} aria-hidden />
                            : <CheckCircle2 size={13} aria-hidden />}
                          {thread.resolved ? "다시 열기" : "해결"}
                        </button>
                      </div>

                      {isReplying && (
                        <form onSubmit={(event) => submitReply(event, thread.id)} className="mt-3 bg-raised/25 p-3">
                          <label htmlFor={`${titleId}-reply-${thread.id}`} className="block text-[0.7rem] font-semibold text-fg-2">
                            {thread.author.displayName}에게 답글
                          </label>
                          <textarea
                            ref={replyEditorRef}
                            id={`${titleId}-reply-${thread.id}`}
                            value={replyBody}
                            maxLength={STUDIO_COMMENTS_MAX_BODY_LENGTH}
                            rows={2}
                            onChange={(event) =>
                              setReplyBody(event.target.value.slice(0, STUDIO_COMMENTS_MAX_BODY_LENGTH))
                            }
                            onKeyDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.form?.requestSubmit();
                              }
                            }}
                            placeholder="답글을 입력하세요."
                            className={`${FIELD_CLASS} mt-1.5 resize-y`}
                          />
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[0.65rem] text-fg-3">
                              {replyBody.length.toLocaleString("ko-KR")}/{STUDIO_COMMENTS_MAX_BODY_LENGTH.toLocaleString("ko-KR")}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingThreadId(null);
                                  setReplyBody("");
                                }}
                                className={QUIET_BUTTON_CLASS}
                              >
                                취소
                              </button>
                              <button
                                type="submit"
                                disabled={!replyBody.trim()}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Send size={12} aria-hidden />
                                답글 등록
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      {isAssigning && (
                        <form onSubmit={(event) => submitAssignee(event, thread.id)} className="mt-3 bg-raised/25 p-3">
                          <label htmlFor={`${titleId}-assignee-${thread.id}`} className="block text-[0.7rem] font-semibold text-fg-2">
                            담당자
                          </label>
                          <div className="mt-1.5 flex min-w-0 flex-col gap-2 sm:flex-row">
                            <input
                              ref={assigneeEditorRef}
                              id={`${titleId}-assignee-${thread.id}`}
                              type="text"
                              value={assigneeName}
                              maxLength={STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH}
                              onChange={(event) =>
                                setAssigneeName(event.target.value.slice(0, STUDIO_COMMENTS_MAX_DISPLAY_NAME_LENGTH))
                              }
                              placeholder="담당자 표시 이름"
                              className={`${FIELD_CLASS} min-w-0 flex-1`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => assignToCurrentActor(thread.id)} className={QUIET_BUTTON_CLASS}>
                                나에게
                              </button>
                              {thread.assignee && (
                                <button type="button" onClick={() => clearAssignee(thread.id)} className={QUIET_BUTTON_CLASS}>
                                  배정 해제
                                </button>
                              )}
                              <button
                                type="submit"
                                disabled={!assigneeName.trim()}
                                className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                지정
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 text-[0.65rem] leading-relaxed text-fg-3">
                            표시 이름만 문서에 저장됩니다. 계정 조회나 서버 권한 부여는 하지 않아요.
                          </p>
                        </form>
                      )}

                      {thread.resolved && thread.resolvedAt && (
                        <p className="mt-3 text-[0.65rem] leading-relaxed text-fg-3">
                          {thread.resolvedBy?.displayName ?? "작성자 미상"} · {formatDate(thread.resolvedAt)} 해결 처리
                        </p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, globalThis.document.body);
}
