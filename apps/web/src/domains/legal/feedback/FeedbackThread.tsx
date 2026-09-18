import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Reply as ReplyIcon, Send, ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { FeedbackComment } from "@toonspectrum/core/feedback";
import type { FormEvent, KeyboardEvent } from "react";

import { api, getApiErrorMessage } from "@/infrastructure/api";
import { useApp } from "@/shared/lib/store";
import { feedbackTimeLabel } from "@toonspectrum/core/feedback";
import {
  assertFeedbackComments,
  isFeedbackComment,
} from "@toonspectrum/core/feedback-response";

const ROOT_DRAFT = "root";
const MAX_REPLY_DEPTH = 4;
const MAX_REPLY_LENGTH = 1500;

function replyDraftKey(parentId: string): string {
  return `reply:${parentId}`;
}

function normalizeReply(reply: FeedbackComment): FeedbackComment {
  return { ...reply, children: reply.children ?? [] };
}

function insertReply(
  nodes: readonly FeedbackComment[],
  reply: FeedbackComment,
): { nodes: FeedbackComment[]; inserted: boolean } {
  if (!reply.parentId) {
    return { nodes: [...nodes, normalizeReply(reply)], inserted: true };
  }

  let inserted = false;
  const next = nodes.map((node) => {
    if (node.id === reply.parentId) {
      inserted = true;
      return {
        ...node,
        children: [...(node.children ?? []), normalizeReply(reply)],
      };
    }
    const nested = insertReply(node.children ?? [], reply);
    if (!nested.inserted) return node;
    inserted = true;
    return { ...node, children: nested.nodes };
  });
  return { nodes: next, inserted };
}

function readDrafts(storageKey: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

interface ReplyComposerProps {
  id: string;
  label: string;
  value: string;
  sending: boolean;
  readOnly: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

function ReplyComposer({
  id,
  label,
  value,
  sending,
  readOnly,
  compact = false,
  onChange,
  onSubmit,
  onCancel,
}: ReplyComposerProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function keyboardSubmit(event: KeyboardEvent<HTMLTextAreaElement>) {
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
    <form
      className={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "en", "fb-form fb-reply-form{v0}"), { v0: String(compact ? " fb-inline-reply-form" : "") })}
      aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "{v0} 작성"), { v0: String(label) })}
      aria-busy={sending}
      onSubmit={submit}
    >
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, MAX_REPLY_LENGTH))}
        onKeyDown={keyboardSubmit}
        rows={compact ? 2 : 3}
        maxLength={MAX_REPLY_LENGTH}
        disabled={sending}
        placeholder={compact
          ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "상대의 의견에 이어질 답글을 남겨 주세요.")
          : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "같은 증상, 추가 정보, 해결 방법을 공유해 주세요.")}
      />
      {readOnly ? (
        <p className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "입력 내용은 유지됩니다. 목록을 다시 확인한 뒤 등록해 주세요.")}</p>
      ) : null}
      <div className="fb-row">
        <span className="fb-caption">
          {translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "개인정보는 남기지 마세요. · ")}{value.length}/{MAX_REPLY_LENGTH}
        </span>
        <span className="fb-reply-submit-actions">
          {onCancel ? (
            <button
              type="button"
              className="fb-text-button"
              onClick={onCancel}
              disabled={sending}
            >
              <X size={12} aria-hidden="true" />
              {translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "취소")}</button>
          ) : null}
          <button
            type="submit"
            className="fb-button"
            disabled={sending || readOnly || !value.trim()}
          >
            <Send size={13} aria-hidden="true" />
            {sending ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "등록 중…") : compact ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "답글 등록") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "댓글 등록")}
          </button>
        </span>
      </div>
      <p className="fb-caption">
        {onCancel ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "⌘/Ctrl + Enter로 등록 · Esc로 답글 닫기") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "⌘/Ctrl + Enter로 등록")}
      </p>
    </form>
  );
}

interface ReplyItemProps {
  reply: FeedbackComment;
  depth: number;
  userId: string | null;
  readOnly: boolean;
  activeParentId: string | null;
  drafts: Record<string, string>;
  sendingKey: string | null;
  onOpenReply: (reply: FeedbackComment) => void;
  onChangeDraft: (parentId: string, value: string) => void;
  onSubmitReply: (parentId: string) => void;
  onCancelReply: () => void;
}

function ReplyItem({
  reply,
  depth,
  userId,
  readOnly,
  activeParentId,
  drafts,
  sendingKey,
  onOpenReply,
  onChangeDraft,
  onSubmitReply,
  onCancelReply,
}: ReplyItemProps) {
  const composerId = `feedback-reply-${reply.id}`;
  const replyOpen = activeParentId === reply.id;
  const canReply = Boolean(userId) && !readOnly && depth < MAX_REPLY_DEPTH;

  return (
    <li className="fb-reply" data-official={reply.isOfficial || undefined} data-depth={depth}>
      <div className="fb-meta">
        <strong>{reply.author.name}</strong>
        {reply.isOfficial ? (
          <span className="fb-official">
            <ShieldCheck size={13} aria-hidden="true" />{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "운영자")}</span>
        ) : null}
        <time dateTime={reply.createdAt}>{feedbackTimeLabel(reply.createdAt)}</time>
      </div>
      <p>{reply.text}</p>
      {canReply ? (
        <div className="fb-reply-actions">
          <button
            type="button"
            className="fb-text-button"
            aria-expanded={replyOpen}
            aria-controls={replyOpen ? composerId : undefined}
            onClick={() => replyOpen ? onCancelReply() : onOpenReply(reply)}
          >
            <ReplyIcon size={12} aria-hidden="true" />
            {translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "답글")}</button>
        </div>
      ) : null}
      {replyOpen ? (
        <ReplyComposer
          id={composerId}
          label={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "{v0}님에게 답글"), { v0: String(reply.author.name) })}
          value={drafts[replyDraftKey(reply.id)] ?? ""}
          sending={sendingKey === replyDraftKey(reply.id)}
          readOnly={readOnly}
          compact
          onChange={(value) => onChangeDraft(reply.id, value)}
          onSubmit={() => onSubmitReply(reply.id)}
          onCancel={onCancelReply}
        />
      ) : null}
      {reply.children?.length ? (
        <ul className="fb-nested-replies">
          {reply.children.map((child) => (
            <ReplyItem
              key={child.id}
              reply={child}
              depth={depth + 1}
              userId={userId}
              readOnly={readOnly}
              activeParentId={activeParentId}
              drafts={drafts}
              sendingKey={sendingKey}
              onOpenReply={onOpenReply}
              onChangeDraft={onChangeDraft}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface Props {
  postId: string;
  userId: string | null;
  revision: number;
  readOnly?: boolean;
  onAdded: (reply: FeedbackComment) => void;
}

export function FeedbackThread({
  postId,
  userId,
  revision,
  readOnly = false,
  onAdded,
}: Props) {
  const id = useId();
  const storageKey = `feedback-comment-drafts:${postId}:${userId ?? "guest"}`;
  const [replies, setReplies] = useState<FeedbackComment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [tick, setTick] = useState(0);
  const [success, setSuccess] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    setDrafts(readDrafts(storageKey));
    setActiveParentId(null);
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        const nonEmpty = Object.fromEntries(
          Object.entries(drafts).filter(([, value]) => value.trim().length > 0),
        );
        if (Object.keys(nonEmpty).length > 0) {
          window.localStorage.setItem(storageKey, JSON.stringify(nonEmpty));
        } else {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Storage may be unavailable; the in-memory draft still works.
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [drafts, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    api.get<unknown>(`/feedback/posts/${encodeURIComponent(postId)}/replies`, {
      signal: controller.signal,
      timeout: 20_000,
      referrerPolicy: "no-referrer",
    })
      .then((rows) => {
        if (controller.signal.aborted) return;
        assertFeedbackComments(rows, postId);
        setReplies(rows);
      })
      .catch(async (cause: unknown) => {
        const message = await getApiErrorMessage(cause, "댓글을 불러오지 못했어요.");
        if (!controller.signal.aborted) setLoadError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, revision, tick]);

  function setDraft(key: string, value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  function clearDraft(key: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function send(parentId: string | null) {
    const key = parentId ? replyDraftKey(parentId) : ROOT_DRAFT;
    const text = (drafts[key] ?? "").trim();
    if (!userId || readOnly || busy.current || !text) return;

    busy.current = true;
    setSendingKey(key);
    setSendError("");
    setSuccess("");
    try {
      const reply = await api.post<unknown>(
        `/feedback/posts/${encodeURIComponent(postId)}/replies`,
        { text, parentId },
        { timeout: 30_000, referrerPolicy: "no-referrer" },
      );
      if (useApp.getState().userId !== userId) return;
      if (!isFeedbackComment(reply, postId)) {
        throw new Error(
          "댓글 등록 결과를 확인하지 못했어요. 중복 등록을 피하려면 댓글 목록을 먼저 확인해 주세요.",
        );
      }
      setReplies((current) => {
        const result = insertReply(current, reply);
        return result.inserted ? result.nodes : [...current, normalizeReply(reply)];
      });
      clearDraft(key);
      if (parentId) setActiveParentId(null);
      setSuccess(parentId ? "답글이 등록되었습니다." : "댓글이 등록되었습니다.");
      onAdded(reply);
    } catch (cause) {
      setSendError(await getApiErrorMessage(
        cause,
        "댓글을 보내지 못했어요. 입력 내용은 유지됩니다.",
      ));
    } finally {
      busy.current = false;
      setSendingKey(null);
    }
  }

  return (
    <section className="fb-thread" aria-label={translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "댓글과 운영자 답변")}>
      <h4>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "함께 나누는 의견")}</h4>
      {loading ? (
        <p role="status" className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "댓글을 불러오고 있어요.")}</p>
      ) : loadError ? (
        <div className="fb-error" role="alert">
          <p>{loadError}</p>
          <button
            className="fb-text-button"
            type="button"
            onClick={() => setTick((value) => value + 1)}
          >
            {translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "댓글 다시 불러오기")}</button>
        </div>
      ) : replies.length ? (
        <ul className="fb-replies">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              depth={0}
              userId={userId}
              readOnly={readOnly}
              activeParentId={activeParentId}
              drafts={drafts}
              sendingKey={sendingKey}
              onOpenReply={(target) => {
                setActiveParentId(target.id);
                setSendError("");
                setSuccess("");
              }}
              onChangeDraft={(parentId, value) => setDraft(replyDraftKey(parentId), value)}
              onSubmitReply={(parentId) => void send(parentId)}
              onCancelReply={() => setActiveParentId(null)}
            />
          ))}
        </ul>
      ) : (
        <p className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "아직 댓글이 없어요. 같은 경험이나 도움이 되는 정보를 남겨주세요.")}</p>
      )}

      {userId ? (
        <ReplyComposer
          id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "en", "{v0}-reply"), { v0: String(id) })}
          label={translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "공개 댓글")}
          value={drafts[ROOT_DRAFT] ?? ""}
          sending={sendingKey === ROOT_DRAFT}
          readOnly={readOnly}
          onChange={(value) => setDraft(ROOT_DRAFT, value)}
          onSubmit={() => void send(null)}
        />
      ) : (
        <p className="fb-notice">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackThread", "ko", "로그인하면 댓글과 답글을 남길 수 있어요.")}</p>
      )}
      {sendError ? <p className="fb-error" role="alert">{sendError}</p> : null}
      <p className="fb-success" role="status">{success}</p>
    </section>
  );
}
