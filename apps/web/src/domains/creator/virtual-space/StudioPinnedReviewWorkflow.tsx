import { StudioReviewPolicyPanel } from "./StudioReviewPolicyPanel";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { decideStudioReview, listStudioArtifactRevisions, reopenStudioReviewComment, resolveStudioReviewComment } from "../project-graph/studio-project-graph-client";
import type { StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceVerifiedReview } from "./studio-virtual-space-review-invitation";

const RESOLUTION_KINDS = new Set(["autosave", "checkpoint", "submission", "approved"]);
const buttonClass = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";

/** Durable review decisions use the existing graph authority; a social reaction grants nothing. */
interface WorkflowProps {
  readonly verified: StudioVirtualSpaceVerifiedReview;
  readonly onRefresh: () => void;
  readonly onRevoked: () => void;
}
export function StudioPinnedReviewWorkflow(props: WorkflowProps) {
  const session = useSession();
  const actorId = session.data?.user.id;
  return <PinnedReviewWorkflowForActor key={JSON.stringify([actorId ?? null, props.verified.subject])} {...props} actorId={actorId} />;
}

function PinnedReviewWorkflowForActor({ verified, onRefresh, onRevoked, actorId }: WorkflowProps & { readonly actorId: string | undefined }) {
  const bt = useBilingual("StudioPinnedReviewWorkflow");
  const selectId = useId();
  const [revisions, setRevisions] = useState<readonly StudioRevisionRecord[] | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [approvalConfirmation, setApprovalConfirmation] = useState(false);
  const [hasPolicy, setHasPolicy] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useLayoutEffect(() => invalidate, [invalidate]);
  const pending = useRef(false);
  const subject = verified.subject;
  useEffect(() => {
    setRevisions(null); setRevisionId(""); setApprovalConfirmation(false); setNotice("");
    return invalidate;
  }, [subject.reviewId, subject.revisionId, actorId, invalidate]);
  const active = verified.review.status === "open" || verified.review.status === "changes-requested";
  const canDecide = Boolean(actorId && (verified.project.access.manageMembers || verified.review.reviewerIds.includes(actorId)));
  const openComments = verified.review.comments.filter((comment) => comment.status === "open" || comment.status === "reopened");
  const blockedApproval = openComments.some((comment) => comment.severity === "required");
  const current = (own: number, sessionRevision: number) => own === generation.current
    && sessionRevision === getAuthSessionRevision() && document.visibilityState !== "hidden";
  const loadRevisions = async () => {
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    setLoading(true); setNotice("");
    try {
      const fresh = await verifyStudioVirtualSpaceReviewSubject(subject, "view");
      if (!current(own, sessionRevision)) return;
      if (!fresh.ok) { onRevoked(); return; }
      if (!fresh.project.access.edit) { setRevisions(null); onRefresh(); return; }
      const values = await listStudioArtifactRevisions(subject.artifactId);
      if (!current(own, sessionRevision)) return;
      const candidates = values.filter((revision) => revision.artifactId === subject.artifactId && RESOLUTION_KINDS.has(revision.kind));
      setRevisions(candidates); setRevisionId("");
      if (!candidates.length) setNotice(bt("수정 결과로 연결할 저장 버전이 없어요. 작업을 저장하고 새 검수본을 만들어 주세요.", "There is no saved revision to link. Save your changes and create a new review snapshot."));
    } catch { if (current(own, sessionRevision)) setNotice(bt("저장 버전 목록을 확인하지 못했어요. 다시 확인해 주세요.", "Saved revisions could not be verified. Try checking again.")); }
    finally { if (own === generation.current) setLoading(false); }
  };
  const run = async (operation: "resolve" | "reopen" | "changes-requested" | "approved", commentId?: string) => {
    if (pending.current || document.visibilityState === "hidden") return;
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    pending.current = true; setBusy(true); setNotice("");
    try {
      const fresh = await verifyStudioVirtualSpaceReviewSubject(subject, "view");
      if (!current(own, sessionRevision)) return;
      if (!fresh.ok) { onRevoked(); return; }
      if (!["open", "changes-requested"].includes(fresh.review.status)) { onRefresh(); return; }
      if (operation === "resolve" || operation === "reopen") {
        const comment = fresh.review.comments.find((value) => value.id === commentId);
        if (!fresh.project.access.edit || !comment) { onRefresh(); return; }
        if (operation === "resolve") {
          const values = await listStudioArtifactRevisions(subject.artifactId);
          if (!current(own, sessionRevision)) return;
          if (!values.some((value) => value.id === revisionId && value.artifactId === subject.artifactId && RESOLUTION_KINDS.has(value.kind))) {
            setNotice(bt("선택한 수정 버전을 확인할 수 없어요. 저장 버전을 다시 골라 주세요.", "The selected resolution revision is unavailable. Choose a saved revision again.")); return;
          }
          await resolveStudioReviewComment(comment.id, revisionId);
        } else await reopenStudioReviewComment(comment.id);
      } else {
        if (!actorId || !(fresh.project.access.manageMembers || fresh.review.reviewerIds.includes(actorId))) {
          setNotice(bt("검수 결정 권한이 없어요. 지정 검토자나 관리자에게 요청해 주세요.", "Only a designated reviewer or manager can decide this review.")); onRefresh(); return;
        }
        if (operation === "approved" && fresh.review.comments.some((value) => value.severity === "required" && ["open", "reopened"].includes(value.status))) {
          setNotice(bt("아직 해결되지 않은 필수 수정 의견이 있어요.", "Required changes remain unresolved.")); onRefresh(); return;
        }
        await decideStudioReview(subject.reviewId, operation);
      }
      if (!current(own, sessionRevision)) return;
      setApprovalConfirmation(false); setNotice(bt("검토 기록을 저장했어요.", "The review record was saved.")); onRefresh();
    } catch { if (current(own, sessionRevision)) setNotice(bt("결과를 확인하지 못했어요. 다시 실행하기 전에 검토 기록을 새로 확인해 주세요.", "The result could not be confirmed. Refresh the review before trying again.")); }
    finally { pending.current = false; if (own === generation.current) setBusy(false); }
  };
  const statuses = { open: bt("검토 중", "In review"), "changes-requested": bt("수정 요청됨", "Changes requested"), approved: bt("검수 승인됨", "Review approved"), rejected: bt("반려됨", "Rejected"), cancelled: bt("취소됨", "Cancelled") };
  return <div className="mt-5 border-t border-line pt-4" aria-label={bt("수정과 검수 결정", "Revision and review decisions")}>
    <h3 className="font-semibold">{statuses[verified.review.status]}</h3>
    {!active ? <p className="mt-2 text-sm text-fg-2">{bt("결정된 검수본과 의견을 보관한 기록입니다. 후속 작업은 새 검수본으로 이어가세요.", "This record preserves the decided snapshot and its notes. Continue subsequent work with a new review snapshot.")}</p> : null}
    {active && verified.project.access.edit && verified.review.comments.length > 0 ? <div className="mt-3 space-y-3">
      <button type="button" className={buttonClass} disabled={busy || loading} onClick={() => { void loadRevisions(); }}>{loading ? bt("확인 중…", "Checking…") : bt("수정한 저장 버전 선택", "Choose a saved resolution version")}</button>
      {revisions?.length ? <div><label htmlFor={selectId} className="block text-sm">{bt("의견을 해결한 버전", "Revision that resolves the note")}</label>
        <select id={selectId} className="mt-1 min-h-11 max-w-full rounded-lg border border-line bg-card px-2" value={revisionId} disabled={busy} onChange={(event) => setRevisionId(event.target.value)}>
          <option value="">{bt("직접 선택해 주세요", "Choose a revision")}</option>
          {revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.message || revision.id} · {revision.createdAt}</option>)}
        </select></div> : null}
      {verified.review.comments.map((comment) => <div key={comment.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
        <p className="min-w-0 flex-1 break-words text-sm">{comment.body}</p>
        {comment.status === "open" || comment.status === "reopened"
          ? <button type="button" className={buttonClass} disabled={busy || !revisionId} onClick={() => { void run("resolve", comment.id); }}>{bt("선택 버전으로 해결 기록", "Record resolution with selected version")}</button>
          : <button type="button" className={buttonClass} disabled={busy} onClick={() => { void run("reopen", comment.id); }}>{bt("다시 수정 요청", "Reopen this note")}</button>}
        {comment.resolutionRevisionId ? <p className="w-full break-all text-xs text-fg-3">{bt("수정 결과 버전", "Resolution revision")} · {comment.resolutionRevisionId}</p> : null}
      </div>)}
    </div> : null}
    {active && canDecide ? <div className="mt-4 space-y-2">
      <p className="text-sm text-fg-2">{bt("이 검수 버전의 검토 결과를 기록합니다. 게시·배포는 별도 작업입니다.", "Record the decision for this exact review version. Publishing and deployment are separate actions.")}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => { void run("changes-requested"); }}>{bt("수정 요청으로 기록", "Request changes")}</button>
        <button type="button" className={buttonClass} disabled={busy || blockedApproval || hasPolicy} onClick={() => setApprovalConfirmation(true)}>{bt("이 검수본 승인", "Approve this review snapshot")}</button></div>
      {blockedApproval ? <p className="text-sm">{bt("필수 수정 의견을 해결해야 승인할 수 있어요.", "Resolve required notes before approving.")}</p> : null}
      {approvalConfirmation ? <div className="rounded-lg border border-line p-3"><p className="text-sm">{bt("승인 후 이 검수의 결정을 바꿀 수 없습니다. 이 버전을 승인할까요?", "The decision cannot be replaced after approval. Approve this version?")}</p>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => { void run("approved"); }}>{bt("승인 확정", "Confirm approval")}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setApprovalConfirmation(false)}>{bt("돌아가기", "Back")}</button></div>
      </div> : null}
    </div> : null}
    <StudioReviewPolicyPanel verified={verified} onRefresh={onRefresh} onPolicyKnown={setHasPolicy} />
    {notice ? <p role="status" className="mt-3 text-sm">{notice}</p> : null}
  </div>;
}
