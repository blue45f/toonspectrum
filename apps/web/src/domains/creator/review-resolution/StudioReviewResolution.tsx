import { canonicalJson } from "@toonspectrum/studio-project-model";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useStudioStableHandlers } from "../studio-stable-handlers";
import { StudioPinnedReviewComparisonImages } from "../virtual-space/StudioPinnedReviewComparison";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import type { StudioReviewResolutionReason } from "./studio-review-resolution-authority";
import { parseStudioReviewResolutionRequest, type StudioReviewResolutionRequest } from "./studio-review-resolution-route";
import { useStudioReviewResolution } from "./use-studio-review-resolution";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-sm disabled:opacity-50";
function reasonText(reason: StudioReviewResolutionReason, bt: (ko: string, en: string) => string) {
  switch (reason) {
    case "access-denied": return bt("현재 두 검수본과 원래 의견을 편집할 권한을 확인하지 못했어요.", "Editing access to both snapshots and the original note could not be confirmed.");
    case "invalid-source": return bt("이 검수본을 해당 의견의 후속 저장본으로 확인할 수 없어 해결을 기록하지 않았어요.", "This snapshot could not be verified as a subsequent saved source for this note. No resolution was recorded.");
    case "closed": return bt("원래 검수가 이미 종료되어 의견을 변경할 수 없어요. 새 검수본에서 검토를 이어가 주세요.", "The original review is closed. Continue reviewing the new snapshot.");
    case "conflict": return bt("이 의견의 해결 상태가 달라졌어요. 검토 기록을 다시 확인해 주세요.", "This note's resolution changed. Check its current review record.");
    case "uncertain": return bt("해결 기록의 저장 응답을 확인하지 못했어요. 같은 기록을 다시 읽을 수 있으며, 저장 요청은 반복하지 않습니다.", "The resolution response was not confirmed. You can re-read the record; the save request will not be repeated.");
    case "expired": return bt("확인 시간이 지나 두 검수본을 다시 확인해야 해요.", "Check both snapshots again after their verification expires.");
    case "context-changed": return bt("계정이나 화면 상태가 바뀌어 확인을 중단했어요.", "Verification stopped because the account or page state changed.");
    default: return bt("수정 검수본의 저장 버전을 확인하지 못했어요. 다시 확인해 주세요.", "The saved correction version could not be verified. Try checking again.");
  }
}
interface Props { readonly request: StudioReviewResolutionRequest; readonly onRecorded: () => void; readonly onRevoked: () => void }
function ResolutionForActor({ request, actorId, onRecorded, onRevoked }: Props & { readonly actorId: string }) {
  const bt = useBilingual("StudioReviewResolution"), [confirmed, setConfirmed] = useState(false);
  const { snapshot, check, resolve, invalidate } = useStudioReviewResolution(request, actorId);
  const events = useStudioStableHandlers({ onRecorded, onRevoked });
  useEffect(() => { if (snapshot.phase === "resolved") events.onRecorded(); }, [snapshot.phase, events]);
  useEffect(() => { if (!snapshot.authority) setConfirmed(false); }, [snapshot.authority]);
  const authority = snapshot.authority, busy = snapshot.phase === "checking" || snapshot.phase === "resolving";
  return <section className="mt-4 space-y-3 rounded-xl border border-line bg-panel p-4" aria-label={bt("수정 검수본으로 의견 해결", "Resolve the note using a correction snapshot")}>
    <h3 className="font-semibold">{bt("새 검수본으로 수정 결과 확인", "Check corrections in the new snapshot")}</h3>
    <p className="text-sm text-fg-3">{bt("두 검수본의 내용을 비교한 뒤 이 의견이 해결됐는지 선택해 주세요. 새 검수본 생성만으로 의견을 해결하거나 검수를 승인하지 않습니다.", "Compare both snapshots and decide whether this note is resolved. Creating a new snapshot does not resolve notes or approve a review.")}</p>
    {snapshot.reason ? <p role="status" className="text-sm">{reasonText(snapshot.reason, bt)}</p> : null}
    {snapshot.phase === "resolved" ? <p role="status" className="text-sm font-semibold">{bt("이 의견은 새 검수본의 저장 버전으로 해결 기록이 확인됐어요. 검수 승인은 새 검수본에서 별도로 진행해 주세요.", "This note's resolution is recorded against the new snapshot's saved version. Review approval is a separate action on the new snapshot.")}</p> : null}
    {authority ? <>
      <p className="whitespace-pre-wrap break-words text-sm">{authority.comment.body}</p>
      <StudioPinnedReviewComparisonImages key={canonicalJson(request)} base={request.origin.subject} title={authority.origin.review.title}
        choice={{ subject: request.replacement, title: authority.replacement.review.title,
          artifactTitle: authority.replacement.project.artifacts.find((artifact) => artifact.id === request.replacement.artifactId)?.title ?? "",
          createdAt: authority.replacement.review.createdAt }} onRevoked={() => { invalidate(); events.onRevoked(); }} />
      {snapshot.phase === "ready" || snapshot.phase === "resolving" ? <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
        {bt("두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요.", "I compared both snapshots and checked the correction for this note.")}
      </label> : null}
    </> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={busy} onClick={() => { setConfirmed(false); check(); }}>
        {busy ? bt("확인 중…", "Checking…") : snapshot.phase === "uncertain" ? bt("해결 기록 다시 확인", "Recheck resolution record") : bt("수정 검수본 확인", "Check correction snapshot")}</button>
      {snapshot.phase === "ready" || snapshot.phase === "resolving" ? <Button type="button" className="min-h-11" disabled={!confirmed || busy || !authority}
        onClick={() => resolve(confirmed)}>{bt("이 수정본으로 해결 기록", "Record resolution with this correction")}</Button> : null}
      <a className={control} href={studioVirtualSpaceReviewHref(request.replacement)}>{bt("새 검수본에서 검토·승인", "Review and approve the new snapshot")}</a>
    </div>
  </section>;
}
export function StudioReviewResolution({ request: raw, ...events }: Props) {
  const actorId = useSession().data?.user.id ?? null, requestKey = canonicalJson(raw);
  const request = useMemo(() => parseStudioReviewResolutionRequest(JSON.parse(requestKey)), [requestKey]);
  return request && actorId ? <ResolutionForActor key={canonicalJson({ request, actorId })} request={request} actorId={actorId} {...events} /> : null;
}
