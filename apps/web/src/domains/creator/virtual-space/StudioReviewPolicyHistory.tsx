import { useLayoutEffect, useRef, useState } from "react";
import { canonicalJson, type ReviewPolicyHistoryResponse, type ReviewPolicyPin } from "@toonspectrum/studio-project-model";
import { getAuthSessionRevision, getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioReviewPolicyHistory } from "./studio-review-policy-client";

const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
export function StudioReviewPolicyHistory({ pin, stateVersion }: { readonly pin: ReviewPolicyPin; readonly stateVersion: number | null }) {
  const actor = useSession().data?.user.id;
  return actor ? <HistoryForActor key={JSON.stringify([actor, getAuthSessionRevision(), pin, stateVersion])} actor={actor} pin={pin} /> : null;
}
function HistoryForActor({ actor, pin }: { readonly actor: string; readonly pin: ReviewPolicyPin }) {
  const bt = useBilingual("StudioReviewPolicyHistory");
  const [page, setPage] = useState<ReviewPolicyHistoryResponse | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false);
  useLayoutEffect(() => () => { ++generation.current; }, []);
  const load = async (beforeStateVersion?: number) => {
    if (pending.current || getAuthUserId() !== actor || document.visibilityState === "hidden") return;
    const own = generation.current, session = getAuthSessionRevision();
    const current = () => own === generation.current && session === getAuthSessionRevision() && getAuthUserId() === actor && document.visibilityState !== "hidden";
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await getStudioReviewPolicyHistory(pin.reviewId, beforeStateVersion);
      if (!current()) return;
      if (result.actorId !== actor || canonicalJson(result.pin) !== canonicalJson(pin)
        || (beforeStateVersion !== undefined && result.entries.some((entry) => entry.stateVersion >= beforeStateVersion))) throw new Error("history-context-mismatch");
      setPage(result);
    } catch {
      if (current()) { setPage(null); setError(bt("현재 접근 권한과 검수 이력을 확인하지 못했습니다. 이전 이력은 숨겼습니다. 다시 확인해 주세요.", "Current access and review history could not be verified. Previous history is hidden; check again.")); }
    } finally { pending.current = false; if (own === generation.current) setBusy(false); }
  };
  return <details className="mt-3 rounded-lg border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("정책 변경·표결 이력", "Policy changes and vote history")}</summary>
    <p className="my-2 text-xs text-fg-2">{bt("이 고정 검수본의 기록만 최신순으로 25개씩 확인합니다. 이전 정책의 표결은 이력이며 현재 승인 수를 대신하지 않습니다. 최종 승인 결과는 검수 결정에서 확인합니다.", "Read this pinned review’s records, 25 at a time, newest first. Historical votes do not replace current approval requirements. Final approval remains a separate review decision.")}</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void load()}>{bt("최신 정책·표결 이력 확인", "Load latest policy and vote history")}</button>
      {page?.nextBeforeStateVersion ? <button type="button" className={button} disabled={busy} onClick={() => void load(page.nextBeforeStateVersion!)}>{bt("이전 이력 25개 확인", "Load up to 25 earlier records")}</button> : null}</div>
    {busy ? <p role="status" className="mt-2 text-xs">{bt("현재 권한으로 이력을 확인하고 있습니다.", "Checking history with current access.")}</p> : null}
    {error ? <p role="alert" className="mt-2 text-xs">{error}</p> : null}
    {page ? <div className="mt-3 space-y-3" aria-label={bt("검수 이력 기록", "Review history records")}>
      <p role="status" className="text-xs">{bt(`이 페이지 ${page.entries.length}개 기록`, `${page.entries.length} records on this page`)}</p>
      {page.entries.map((entry) => <article key={entry.id} className="space-y-2 rounded-lg border border-line p-3">
        <h5 className="text-sm font-semibold">{entry.command.type === "configure" ? bt("검토 규칙 변경", "Review policy configured") : entry.command.decision === "approve" ? bt("그룹 승인 의견", "Group approval vote") : bt("그룹 수정 요청", "Group change request")}</h5>
        <p className="break-all text-xs text-fg-2">{bt(`정책 ${entry.policyVersion} · 상태 ${entry.stateVersion}`, `Policy ${entry.policyVersion} · State ${entry.stateVersion}`)} · <time dateTime={entry.createdAt}>{entry.createdAt}</time></p>
        <p className="break-all text-xs">{bt("기록한 사용자", "Recorded by")}: {entry.actorId}</p>
        {entry.command.type === "configure" ? <>
          <p className="whitespace-pre-wrap break-words text-sm">{entry.command.reason}</p>
          <p className="text-xs">{entry.command.definition.mode === "sequential" ? bt("순차 검토", "Sequential") : bt("병렬 검토", "Parallel")}</p>
          <ol className="list-inside list-decimal text-xs">{entry.command.definition.groups.map((group) => <li key={group.id} className="break-words">{group.label} · {bt(`승인 ${group.requiredApprovals}/${group.reviewerIds.length}명 필요`, `${group.requiredApprovals} of ${group.reviewerIds.length} reviewers required`)}</li>)}</ol>
        </> : <><p className="break-all text-xs">{bt("그룹 ID", "Group ID")}: {entry.command.groupId}</p><p className="whitespace-pre-wrap break-words text-sm">{entry.command.note || bt("추가 메모 없음", "No additional note")}</p></>}
      </article>)}
      {!page.entries.length ? <p className="text-xs">{bt("이 범위에 기록된 정책 변경이나 표결이 없습니다.", "No policy changes or votes in this range.")}</p> : null}
    </div> : null}
  </details>;
}
