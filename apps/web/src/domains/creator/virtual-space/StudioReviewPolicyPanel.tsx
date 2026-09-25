import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { canonicalJson, type ReviewPolicyCommand, type ReviewPolicyResponse } from "@toonspectrum/studio-project-model";
import { getAuthSessionRevision, getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { decideStudioReview } from "../project-graph/studio-project-graph-client";
import type { StudioVirtualSpaceVerifiedReview } from "./studio-virtual-space-review-invitation";
import { applyStudioReviewPolicyCommand, getStudioReviewPolicy } from "./studio-review-policy-client";
import { StudioReviewPolicyHistory } from "./StudioReviewPolicyHistory";
import { StudioReviewPolicyEditor } from "./StudioReviewPolicyEditor";

const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
interface Props { readonly verified: StudioVirtualSpaceVerifiedReview; readonly onRefresh: () => void; readonly onPolicyKnown: (configured: boolean) => void }
export function StudioReviewPolicyPanel(props: Props) {
  const actor = useSession().data?.user.id ?? null;
  return actor ? <PolicyForActor key={JSON.stringify([actor, props.verified.subject])} {...props} actor={actor} /> : null;
}
function PolicyForActor({ verified, actor, onRefresh, onPolicyKnown }: Props & { readonly actor: string }) {
  const bt = useBilingual("StudioReviewPolicyPanel");
  const [record, setRecord] = useState<ReviewPolicyResponse | null>(null), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [editBase, setEditBase] = useState<ReviewPolicyResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState(false);
  const [attempt, setAttempt] = useState<ReviewPolicyCommand | null>(null);
  const pending = useRef(false), generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useLayoutEffect(() => invalidate, [invalidate]);
  const pin = { reviewId: verified.subject.reviewId, artifactId: verified.subject.artifactId,
    revisionId: verified.subject.revisionId, rootGraphHash: verified.subject.rootGraphHash };
  const active = ["open", "changes-requested"].includes(verified.review.status);
  const valid = (value: ReviewPolicyResponse) => value.actorId === actor && (!value.policy || canonicalJson(value.policy.pin) === canonicalJson(pin));
  const run = async (action: "load" | "approve" | ReviewPolicyCommand) => {
    if (pending.current || getAuthUserId() !== actor || document.visibilityState === "hidden") return;
    const own = generation.current, session = getAuthSessionRevision();
    const current = () => own === generation.current && session === getAuthSessionRevision()
      && getAuthUserId() === actor && document.visibilityState !== "hidden";
    pending.current = true; setBusy(true); setNotice("");
    try {
      if (action === "approve") {
        if (!confirm || !record?.policy?.satisfied) return;
        const expected = { ...pin, policyVersion: record.policy.policyVersion, stateVersion: record.policy.stateVersion };
        const fresh = await getStudioReviewPolicy(pin.reviewId); if (!current()) return;
        if (!valid(fresh) || !fresh.policy?.satisfied || fresh.policy.policyVersion !== expected.policyVersion || fresh.policy.stateVersion !== expected.stateVersion) throw new Error("changed-policy");
        const decision = await decideStudioReview(pin.reviewId, "approved", expected); if (!current()) return;
        if (decision.id !== pin.reviewId || decision.status !== "approved") throw new Error("approval-result-mismatch");
        setConfirm(false); setNotice(bt("이 고정 검수본의 최종 승인 기록을 확인했습니다.", "The final approval of this pinned review was confirmed.")); onRefresh(); return;
      }
      if (typeof action !== "string") setAttempt(action);
      const value = action === "load" ? await getStudioReviewPolicy(pin.reviewId) : await applyStudioReviewPolicyCommand(action);
      if (!current()) return;
      if (!valid(value)) throw new Error("changed-context");
      setRecord(value); onPolicyKnown(Boolean(value.policy)); setConfirm(false);
      if (action !== "load") { setAttempt(null); setEditBase(null); setNotes({}); }
      setNotice(action === "load" ? bt("현재 서버의 그룹 검수 기록입니다.", "Current group review records from the server.")
        : value.replayed ? bt("같은 요청의 기록을 확인했습니다. 아래에는 현재 정책과 표결이 표시됩니다.", "The same request was reconciled. Current policy and votes are shown below.")
          : bt("그룹 검수 기록을 저장했습니다. 최종 검수 승인은 별도로 확정합니다.", "The group review record was saved. Final review approval is a separate action."));
    } catch {
      if (current()) { setRecord(null); setEditBase(null); setConfirm(false); }
      if (current()) setNotice(bt("현재 정책·권한 또는 결과를 확인하지 못했습니다. 정책을 새로 확인하고, 결과가 불명인 요청은 같은 식별자로 확인하세요. 서버 기능이나 준비된 스키마가 없으면 정책 없음으로 처리하지 않습니다.", "The policy, access or result could not be verified. Refresh the policy and reconcile uncertain requests with the same identity. An unavailable API/schema is not treated as no policy."));
    } finally { pending.current = false; if (own === generation.current) setBusy(false); }
  };
  const policy = record?.policy, blocked = verified.review.comments.some((note) => note.severity === "required" && ["open", "reopened"].includes(note.status));
  return <details className="mt-4 rounded-xl border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("그룹별 검수·승인 정책", "Group review and approval policy")}</summary>
    <p className="my-2 text-xs text-fg-2">{bt("제작·권리·최종 검토를 병렬 또는 순서대로 진행합니다. 모든 표결은 이 고정 버전에만 적용되고, 정책·담당자 변경은 서버에서 다시 검사합니다. 그룹 표결만으로 게시하거나 최종 승인하지 않습니다.", "Review production, rights and final checks in parallel or sequence. Votes apply only to this pinned revision; policy and current reviewers are verified by the server. Group votes do not publish or finally approve the work.")}</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void run("load")}>{bt("그룹 검수 기록 확인", "Load group review records")}</button>
      {record?.canConfigure && active ? <button type="button" className={button} disabled={busy || !!attempt} onClick={() => setEditBase(record)}>{bt("그룹 정책 설정·변경", "Configure group policy")}</button> : null}</div>
    {attempt ? <div className="mt-3 rounded-lg border border-line p-3 text-xs"><p>{bt("이 요청의 반영 결과가 불명입니다. 다른 내용으로 새 요청을 만들기 전에 같은 요청을 확인하세요.", "This request is not yet confirmed. Reconcile the same request before creating a different one.")}</p>
      <button type="button" className={`${button} mt-2`} disabled={busy} onClick={() => void run(attempt)}>{bt("동일 요청 결과 확인", "Reconcile the same request")}</button>
      <button type="button" className={`${button} ml-2 mt-2`} disabled={busy || !record} onClick={() => { setAttempt(null); setEditBase(null); setConfirm(false); }}>{bt("현재 기록 확인 후 요청 편집 종료", "Close request editing after checking records")}</button></div> : null}
    {record && !policy ? <p className="mt-3 text-sm">{bt("이 검수본에는 추가 그룹 정책이 설정되지 않았습니다. 기존 지정 검토자·필수 의견 규칙은 계속 적용됩니다.", "No additional group policy is configured for this review. Existing designated-reviewer and required-note rules remain in force.")}</p> : null}
    {policy ? <div className="mt-3 space-y-3">
      <p className="text-xs">{bt(`정책 버전 ${policy.policyVersion} · 상태 버전 ${policy.stateVersion}`, `Policy version ${policy.policyVersion} · State version ${policy.stateVersion}`)} · {policy.definition.mode === "sequential" ? bt("순차 검토", "Sequential") : bt("병렬 검토", "Parallel")}</p>
      {policy.definition.groups.map((group) => {
        const state = policy.groups.find((item) => item.id === group.id)!;
        const ownVote = policy.votes.find((vote) => vote.groupId === group.id && vote.actorId === actor);
        const canVote = active && state.eligibleIds.includes(actor) && !attempt;
        const approved = ownVote?.decision === "approve" && !state.staleVoterIds.includes(actor);
        return <section key={group.id} className="space-y-2 rounded-lg border border-line p-3" aria-label={group.label}>
          <h4 className="font-semibold">{group.label} · {state.satisfied ? bt("그룹 충족", "Satisfied") : state.ready ? bt("검토 필요", "Needs review") : bt("앞 그룹 검토 대기", "Waiting for prior groups")}</h4>
          <p className="text-xs">{bt(`승인 ${state.approvalCount}/${state.requiredApprovals} · 현재 검토자 ${state.eligibleIds.length}명`, `${state.approvalCount}/${state.requiredApprovals} approvals · ${state.eligibleIds.length} current reviewers`)}</p>
          {state.staleVoterIds.length ? <p className="text-xs">{bt("접근 권한이나 선행 그룹 결정이 바뀐 표결은 승인 수에서 제외됩니다.", "Votes invalidated by access or preceding decisions are excluded from the approval count.")}</p> : null}
          {ownVote ? <p className="text-xs text-fg-2">{bt("내 최근 표결", "My latest vote")} · {ownVote.decision === "approve" ? bt("승인 의견", "Approval vote") : bt("수정 요청", "Changes requested")} · <time dateTime={ownVote.decidedAt}>{ownVote.decidedAt}</time></p> : null}
          {canVote ? <div className="space-y-2">
            <label className="block text-xs">{bt("검토 메모·수정 이유", "Review note or change reason")}<textarea className="mt-1 w-full rounded-lg border border-line bg-panel p-2 text-sm" rows={2} maxLength={2000} value={notes[group.id] ?? ""} disabled={busy} onChange={(event) => setNotes((prior) => ({ ...prior, [group.id]: event.target.value }))} /></label>
            <div className="flex flex-wrap gap-2">{(["approve", "request-changes"] as const).map((decision) => <button key={decision} type="button" className={button}
              disabled={busy || (decision === "approve" ? !state.ready || approved : !(notes[group.id] ?? "").trim())}
              onClick={() => void run({ id: crypto.randomUUID(), type: "vote", pin, expectedPolicyVersion: policy.policyVersion, expectedStateVersion: policy.stateVersion,
                groupId: group.id, decision, note: (notes[group.id] ?? "").trim() })}>
              {decision === "approve" ? bt("이 그룹 승인 의견 기록", "Record this group approval") : bt("이 그룹 수정 요청 기록", "Record this group change request")}
            </button>)}</div>
          </div> : null}
        </section>;
      })}
      {active && (record.canConfigure || record.eligibleReviewerIds.includes(actor)) ? <div className="space-y-2">
        <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" checked={confirm} disabled={busy || !policy.satisfied || blocked || !!attempt} onChange={(event) => setConfirm(event.target.checked)} />
          {bt("현재 고정본·정책·모든 그룹 표결을 확인했고 이 검수를 최종 승인합니다. 게시·배포는 별도입니다.", "I reviewed this pinned version, policy and all group votes and confirm final approval. Publishing and deployment are separate.")}</label>
        {blocked ? <p className="text-xs">{bt("미해결 필수 의견이 있어 최종 승인할 수 없습니다.", "Unresolved required notes block final approval.")}</p> : null}
        <button type="button" className={button} disabled={busy || !confirm || !policy.satisfied || blocked || !!attempt} onClick={() => void run("approve")}>{bt("그룹 검토를 확인하고 최종 승인", "Confirm groups and approve review")}</button>
      </div> : null}
    </div> : null}
    {editBase ? <StudioReviewPolicyEditor initial={editBase.policy?.definition ?? null} eligibleIds={editBase.eligibleReviewerIds} disabled={busy || !!attempt}
      onCancel={() => setEditBase(null)} onSave={(definition, reason) => void run({ id: crypto.randomUUID(), type: "configure", pin,
        expectedPolicyVersion: editBase.policy?.policyVersion ?? 0, expectedStateVersion: editBase.policy?.stateVersion ?? 0, definition, reason })} /> : null}
    <StudioReviewPolicyHistory pin={pin} stateVersion={policy?.stateVersion ?? null} />
    {notice ? <p role="status" className="mt-3 text-xs">{notice}</p> : null}
  </details>;
}
