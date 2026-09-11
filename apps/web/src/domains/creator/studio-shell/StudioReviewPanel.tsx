import {
  Check,
  CheckCircle2,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  addStudioReviewThread,
  recordStudioReviewDecision,
  resolveStudioReviewThread,
  startStudioRevision,
  studioReviewReadiness,
  submitStudioReview,
  type StudioReviewSession,
  type StudioReviewStatus,
  type StudioReviewThread,
  type StudioReviewThreadKind,
} from "../studio-review-workflow";
import {
  archiveStudioReviewSession,
  readStudioReviewHistory,
  type StudioReviewHistoryDocument,
} from "../studio-review-history-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

type Locale = "ko" | "en";

const CURRENT_REVIEWER_ID = "project-owner";

const STATUS_LABELS: Readonly<Record<StudioReviewStatus, Readonly<Record<Locale, string>>>> = {
  draft: { ko: "검토 전", en: "Draft" },
  "in-review": { ko: "검토 중", en: "In review" },
  "changes-requested": { ko: "수정 요청", en: "Changes requested" },
  approved: { ko: "승인 완료", en: "Approved" },
  superseded: { ko: "이전 승인본", en: "Previous approval" },
};

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function statusTone(status: StudioReviewStatus): string {
  if (status === "approved") return "border-success/30 bg-success-soft/20 text-success";
  if (status === "changes-requested") return "border-danger/30 bg-danger-soft/20 text-danger";
  if (status === "in-review") return "border-warning/35 bg-warning-soft/20 text-warning";
  return "border-line bg-panel text-fg-2";
}

function ReviewStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="text-[0.65rem] text-fg-3">{label}</p>
      <b className="mt-1 block truncate text-lg text-fg">{value}</b>
    </div>
  );
}

function ReviewThreadCard({
  thread,
  locale,
  canResolve,
  onResolve,
}: {
  readonly thread: StudioReviewThread;
  readonly locale: Locale;
  readonly canResolve: boolean;
  readonly onResolve: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border p-3",
        thread.status === "resolved"
          ? "border-success/25 bg-success-soft/10"
          : thread.kind === "change-request"
            ? "border-danger/30 bg-danger-soft/10"
            : "border-line bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[0.62rem] font-black uppercase tracking-wide text-accent">
            {thread.kind}
          </span>
          <b className="ml-2 text-xs text-fg">{thread.targetId}</b>
        </div>
        <span className="text-[0.65rem] font-bold text-fg-3">
          {thread.status === "resolved"
            ? (locale === "ko" ? "해결됨" : "Resolved")
            : (locale === "ko" ? "열림" : "Open")}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-fg-2">{thread.messages.at(-1)?.body}</p>
      {thread.status === "open" && canResolve ? (
        <button
          type="button"
          onClick={onResolve}
          className={buttonClass({ variant: "quiet", size: "sm", className: "mt-2 gap-1.5" })}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          {locale === "ko" ? "해결 완료" : "Resolve"}
        </button>
      ) : null}
    </article>
  );
}

/** One canonical review workflow for comments, change requests, approval and protected revisions. */
export function StudioReviewPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const session = workspace.state?.reviewSession ?? null;
  const [kind, setKind] = useState<StudioReviewThreadKind>("comment");
  const [targetId, setTargetId] = useState("document");
  const [body, setBody] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [history, setHistory] = useState<StudioReviewHistoryDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setHistory(readStudioReviewHistory(window.localStorage, projectId));
    } catch {
      setHistory(null);
    }
  }, [projectId, session?.versionId]);

  const readiness = useMemo(() => session ? studioReviewReadiness(session) : null, [session]);
  const openThreads = session?.threads.filter((thread) => thread.status === "open").length ?? 0;
  const currentReviewerApproved = session?.decisions.some(
    (decision) => decision.reviewerId === CURRENT_REVIEWER_ID && decision.decision === "approved",
  ) ?? false;
  const canCurrentReviewerApprove = Boolean(
    session
      && session.status !== "draft"
      && session.status !== "approved"
      && session.status !== "superseded"
      && (readiness?.openChangeRequestCount ?? 0) === 0
      && !currentReviewerApproved,
  );
  const missingOtherApprovalCount = readiness?.missingApprovalReviewerIds.filter(
    (reviewerId) => reviewerId !== CURRENT_REVIEWER_ID,
  ).length ?? 0;
  const immutable = session?.status === "approved" || session?.status === "superseded";

  const persist = (next: StudioReviewSession, success: string): boolean => {
    const result = workspace.update((current) => ({ ...current, reviewSession: next }));
    if (!result) {
      setError(locale === "ko" ? "검토 상태를 저장하지 못했습니다." : "Review state could not be saved.");
      return false;
    }
    setMessage(success);
    setError(null);
    return true;
  };

  const submit = () => {
    if (!session) return;
    try {
      const requiredReviewerIds = session.requiredReviewerIds.includes(CURRENT_REVIEWER_ID)
        ? session.requiredReviewerIds
        : [...session.requiredReviewerIds, CURRENT_REVIEWER_ID];
      persist(
        submitStudioReview({ ...session, requiredReviewerIds }, new Date().toISOString()),
        locale === "ko" ? "검토를 시작했습니다." : "Review started.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review could not be submitted.");
    }
  };

  const addThread = () => {
    if (!session || !body.trim() || !targetId.trim()) {
      setError(locale === "ko" ? "대상과 내용을 입력해 주세요." : "Enter a target and message.");
      return;
    }
    const at = new Date().toISOString();
    try {
      const next = addStudioReviewThread(session, {
        id: createId("thread"),
        kind,
        targetId: targetId.trim(),
        status: "open",
        messages: [{
          id: createId("message"),
          authorId: CURRENT_REVIEWER_ID,
          body: body.trim(),
          createdAt: at,
        }],
        resolvedBy: null,
        resolvedAt: null,
      }, at);
      if (persist(next, locale === "ko" ? "검토 내용을 추가했습니다." : "Review note added.")) {
        setBody("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review note could not be added.");
    }
  };

  const resolve = (threadId: string) => {
    if (!session) return;
    try {
      persist(
        resolveStudioReviewThread(session, threadId, CURRENT_REVIEWER_ID, new Date().toISOString()),
        locale === "ko" ? "수정 내용을 해결했습니다." : "Review item resolved.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review item could not be resolved.");
    }
  };

  const decide = (decision: "approved" | "changes-requested") => {
    if (!session) return;
    if (decision === "approved" && !canCurrentReviewerApprove) {
      setError(locale === "ko"
        ? "열린 수정 요청을 해결하거나 이미 기록된 승인을 확인해 주세요."
        : "Resolve open change requests or review the existing approval first.");
      return;
    }
    try {
      const next = recordStudioReviewDecision(session, {
        reviewerId: CURRENT_REVIEWER_ID,
        decision,
        note: decisionNote.trim(),
        decidedAt: new Date().toISOString(),
      });
      if (persist(next, decision === "approved"
        ? (locale === "ko" ? "내 승인을 기록했습니다." : "Your approval was recorded.")
        : (locale === "ko" ? "수정을 요청했습니다." : "Changes requested."))) {
        setDecisionNote("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review decision could not be recorded.");
    }
  };

  const startRevision = () => {
    if (!session || session.status !== "approved") return;
    try {
      const transition = startStudioRevision(session, {
        nextVersionId: `${session.versionId}-revision-${Date.now()}`,
        actorId: CURRENT_REVIEWER_ID,
        createdAt: new Date().toISOString(),
      });
      const archived = archiveStudioReviewSession(window.localStorage, projectId, transition.previous);
      if (persist(transition.next, locale === "ko"
        ? "승인본은 보관하고 새 초안을 시작했습니다."
        : "The approved version was archived and a new draft was created.")) {
        setHistory(archived);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A new revision could not be created.");
    }
  };

  if (!session) {
    return (
      <section className="rounded-3xl border border-line bg-card p-6 text-sm text-fg-2">
        {workspace.error ?? (locale === "ko" ? "검토 상태를 불러오는 중입니다." : "Loading review state.")}
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="review-workspace-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <ShieldCheck size={14} aria-hidden="true" /> REVIEW
          </p>
          <h2 id="review-workspace-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "댓글·수정·승인을 한 흐름으로" : "Comments, changes and approval in one flow"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "승인된 결과는 자동으로 보호됩니다. 다시 수정할 때는 승인본을 보관하고 새 초안을 시작합니다."
              : "Approved work is protected automatically. Editing starts a new draft while the approved version stays archived."}
          </p>
        </div>
        <span className={cn(
          "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold",
          statusTone(session.status),
        )}>
          {STATUS_LABELS[session.status][locale]}
        </span>
      </div>

      {workspace.error || error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger">
          {error ?? workspace.error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success">
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <ReviewStat label={locale === "ko" ? "버전" : "Version"} value={session.versionId} />
        <ReviewStat label={locale === "ko" ? "열린 항목" : "Open items"} value={openThreads} />
        <ReviewStat
          label={locale === "ko" ? "승인" : "Approvals"}
          value={`${session.decisions.filter((item) => item.decision === "approved").length}/${session.requiredReviewerIds.length || 1}`}
        />
        <ReviewStat
          label={locale === "ko" ? "보관된 승인본" : "Archived approvals"}
          value={history?.sessions.length ?? 0}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {session.status === "draft" ? (
          <button type="button" onClick={submit} className={buttonClass({ className: "gap-1.5" })}>
            <Send size={15} aria-hidden="true" />
            {locale === "ko" ? "검토 시작" : "Start review"}
          </button>
        ) : null}
        {!immutable && session.status !== "draft" ? (
          <>
            {!currentReviewerApproved ? (
              <button
                type="button"
                onClick={() => decide("approved")}
                disabled={!canCurrentReviewerApprove}
                className={buttonClass({ className: "gap-1.5" })}
              >
                <Check size={15} aria-hidden="true" />
                {locale === "ko" ? "승인" : "Approve"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => decide("changes-requested")}
              className={buttonClass({ variant: "outline", className: "gap-1.5" })}
            >
              {locale === "ko" ? "수정 요청" : "Request changes"}
            </button>
          </>
        ) : null}
        {session.status === "approved" ? (
          <button type="button" onClick={startRevision} className={buttonClass({ className: "gap-1.5" })}>
            <RefreshCcw size={15} aria-hidden="true" />
            {locale === "ko" ? "새 초안에서 수정" : "Edit in a new draft"}
          </button>
        ) : null}
      </div>

      {(readiness?.openChangeRequestCount ?? 0) > 0 ? (
        <div className="mt-4 rounded-xl border border-warning/35 bg-warning-soft/15 p-3 text-xs leading-5 text-warning">
          {locale === "ko"
            ? `승인 전에 열린 수정 요청 ${readiness?.openChangeRequestCount ?? 0}개를 해결해 주세요.`
            : `Resolve ${readiness?.openChangeRequestCount ?? 0} open change requests before approval.`}
        </div>
      ) : currentReviewerApproved && missingOtherApprovalCount > 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3 text-xs leading-5 text-fg-2">
          {locale === "ko"
            ? `내 승인은 기록됐습니다. 다른 검토자 ${missingOtherApprovalCount}명의 결정을 기다리고 있어요.`
            : `Your approval is recorded. Waiting for ${missingOtherApprovalCount} other reviewers.`}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[22rem_1fr]">
        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg">
            <MessageSquarePlus size={16} className="text-accent" aria-hidden="true" />
            {locale === "ko" ? "검토 내용 추가" : "Add review item"}
          </h3>
          <select
            value={kind}
            disabled={immutable}
            onChange={(event) => setKind(event.target.value as StudioReviewThreadKind)}
            className="mt-3 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
          >
            <option value="comment">{locale === "ko" ? "댓글" : "Comment"}</option>
            <option value="change-request">{locale === "ko" ? "수정 요청" : "Change request"}</option>
            <option value="paint-over">{locale === "ko" ? "덧그림 의견" : "Paint-over"}</option>
          </select>
          <input
            value={targetId}
            disabled={immutable}
            onChange={(event) => setTargetId(event.target.value)}
            aria-label={locale === "ko" ? "검토 대상" : "Review target"}
            className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
            placeholder={locale === "ko" ? "예: 컷 34, 대사 12" : "Example: panel 34, dialogue 12"}
          />
          <textarea
            value={body}
            disabled={immutable}
            onChange={(event) => setBody(event.target.value)}
            aria-label={locale === "ko" ? "검토 내용" : "Review message"}
            rows={4}
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm leading-6 text-fg"
          />
          <button
            type="button"
            disabled={immutable}
            onClick={addThread}
            className={buttonClass({ size: "sm", className: "mt-2 w-full gap-1.5" })}
          >
            <MessageSquarePlus size={14} aria-hidden="true" />
            {locale === "ko" ? "추가" : "Add"}
          </button>
          {!immutable && session.status !== "draft" ? (
            <textarea
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              aria-label={locale === "ko" ? "승인 메모" : "Decision note"}
              rows={2}
              className="mt-4 w-full rounded-xl border border-line bg-card px-3 py-2 text-xs leading-5 text-fg"
              placeholder={locale === "ko" ? "승인 또는 수정 요청 메모" : "Approval or change-request note"}
            />
          ) : null}
        </div>

        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="text-sm font-black text-fg">
            {locale === "ko" ? "댓글·수정 요청" : "Comments and change requests"}
          </h3>
          <div className="mt-3 space-y-3">
            {session.threads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">
                {locale === "ko" ? "아직 검토 내용이 없습니다." : "No review items yet."}
              </p>
            ) : null}
            {session.threads.map((thread) => (
              <ReviewThreadCard
                key={thread.id}
                thread={thread}
                locale={locale}
                canResolve={!immutable}
                onResolve={() => resolve(thread.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
