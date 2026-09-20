import { canonicalJson } from "@toonspectrum/studio-project-model";
import { useId, useLayoutEffect, useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioReviewProduction } from "../review-production/use-studio-review-production";
import type { StudioReviewProductionRequest } from "../review-production/studio-review-production-model";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { studioProjectSectionPath } from "../studio-route-registry";
import { useStudioReviewTaskCompletion } from "./use-studio-review-task-completion";
import type { StudioReviewTaskCompletionRequest } from "./studio-review-task-completion-client";

function Criteria({ request, actorId }: { readonly request: StudioReviewTaskCompletionRequest; readonly actorId: string }) {
  const bt = useBilingual("StudioReviewTaskCompletion"), { snapshot, refresh, confirm } = useStudioReviewTaskCompletion(request, actorId);
  const [checks, setChecks] = useState<{ digest: string; indices: number[] }>({ digest: "", indices: [] });
  const context = snapshot.context, busy = snapshot.phase === "loading" || snapshot.phase === "saving";
  const proof = context?.proofDigest ?? null;
  useLayoutEffect(() => {
    setChecks((previous) => previous.digest && previous.digest !== proof ? { digest: "", indices: [] } : previous);
  }, [proof]);
  const checked = context && checks.digest === context.proofDigest ? checks.indices : [];
  const current = context?.evidence?.current === true;
  return <section className="mt-3 rounded-lg border border-line p-3" aria-label={bt("완료 기준 검토", "Review completion criteria")}>
    {context ? <>
      <p className="text-sm font-semibold">{context.taskTitle}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{context.commentBody}</p>
      <p className="mt-2 text-xs text-fg-3">{bt("서버가 원래 검수 의견과 더 최신 저장 원고에서 만든 수정 검수본의 연결을 확인했어요. 기준을 직접 검토해 주세요.", "The server verified the original comment and its replacement capture from a newer saved manuscript. Review each criterion yourself.")}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm"><Link className="inline-flex min-h-11 items-center underline" href={studioVirtualSpaceReviewHref(context.reference.subject)}>{bt("원래 검수본 확인", "View original review")}</Link>
        <Link className="inline-flex min-h-11 items-center underline" href={studioVirtualSpaceReviewHref(context.replacement)}>{bt("해결에 사용한 수정 검수본 확인", "View replacement used for resolution")}</Link></div>
      {context.evidence ? <p role="status" className="mt-2 text-sm">{current
        ? bt("검수 근거와 함께 작업 완료가 기록되어 있어요.", "Task completion is recorded with verified review evidence.")
        : bt("이전 완료 기록은 보존되어 있어요. 이후 기준·연결·해결 또는 작업 상태가 바뀌어 다시 확인해야 합니다.", "The earlier completion is preserved. The criteria, link, resolution or task state changed and needs another confirmation.")}
        {" "}{context.evidence.receipt.completedBy === actorId ? bt("본인", "You") : bt("작품 편집자", "Work editor")}{" · "}{new Date(context.evidence.receipt.completedAt).toLocaleString()}</p> : null}
      {!current ? <fieldset disabled={busy} className="mt-3 space-y-2"><legend className="text-sm font-semibold">{bt("인계서의 정확한 완료 기준", "Exact handoff completion criteria")}</legend>
        {context.criteria.map((criterion, index) => <label key={`${context.proofDigest}:${index}`} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={checked.includes(index)} onChange={(event) => setChecks({ digest: context.proofDigest,
            indices: event.target.checked ? [...checked, index] : checked.filter((value) => value !== index) })} />{criterion}
        </label>)}
      </fieldset> : null}
    </> : null}
    {snapshot.reason ? <p role="status" className="mt-3 text-sm">{snapshot.phase === "uncertain"
      ? bt("완료 저장 응답을 확인하지 못했어요. 같은 요청의 서버 기록을 다시 확인할 수 있습니다. 자동으로 다시 저장하지 않았어요.", "The completion response was not confirmed. You can recheck the same request. It was not automatically submitted again.")
      : bt("현재 권한·해결된 의견·수정 검수본·인계 기준을 다시 확인해야 해요. 변경된 근거로 이전 체크를 사용하지 않습니다.", "Access, resolved comment, replacement capture and handoff criteria need a fresh check. Earlier checks do not apply to changed evidence.")}</p> : null}
    <p className="mt-3 text-xs text-fg-3">{bt("작업 완료만 기록합니다. 검수 승인·공식 승인 버전·배포는 실행하지 않아요.", "This records task completion only. It does not approve a review, create an approved revision or release anything.")}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {!current && context ? <Button className="min-h-11" disabled={busy || checked.length !== context.criteria.length} onClick={() => confirm(context.proofDigest, context.criteria)}>
        {snapshot.phase === "uncertain" ? bt("같은 완료 요청 다시 확인", "Recheck this completion request") : bt("기준을 확인하고 작업 완료", "Confirm criteria and complete task")}</Button> : null}
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={refresh}>{bt("최신 근거 다시 읽기", "Reload current evidence")}</Button>
    </div>
  </section>;
}

function CompletionChoices({ request, actorId }: { readonly request: StudioReviewProductionRequest; readonly actorId: string }) {
  const bt = useBilingual("StudioReviewTaskCompletion"), { snapshot, refresh } = useStudioReviewProduction(request, actorId);
  const [taskId, setTaskId] = useState("");
  const tasks = snapshot.authority?.workspace.document.tasks.filter((task) => task.reviewRef?.commentId === request.commentId
    && canonicalJson(task.reviewRef.subject) === canonicalJson(request.subject)) ?? [];
  const selected = tasks.find((task) => task.id === taskId);
  return <div className="mt-3">
    <label className="block text-sm">{bt("이 의견에 연결된 작업", "Task linked to this comment")}
      <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" value={selected?.id ?? ""} onChange={(event) => setTaskId(event.target.value)}>
        <option value="">{bt("작업 선택", "Select task")}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
      </select>
    </label>
    {snapshot.authority && !tasks.length ? <p className="mt-2 text-sm">{bt("연결된 작업이 없어요. 먼저 이 저장된 의견을 제작 작업과 인계서에 연결해 주세요.", "No task is linked. First connect this saved comment to a production task and handoff.")}</p> : null}
    {selected ? <Criteria key={canonicalJson({ taskId, ref: selected.reviewRef, actorId })} request={{ ...request, taskId }} actorId={actorId} /> : null}
    <div className="mt-3 flex gap-2"><Button variant="outline" className="min-h-11" onClick={refresh}>{bt("연결 작업 다시 읽기", "Reload linked tasks")}</Button>
      <Link href={studioProjectSectionPath(request.subject.workId, "production")} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">{bt("제작 보드 열기", "Open production board")}</Link></div>
  </div>;
}

export function StudioReviewTaskCompletion({ request }: { readonly request: StudioReviewProductionRequest }) {
  const bt = useBilingual("StudioReviewTaskCompletion"), actorId = useSession().data?.user?.id, [expanded, setExpanded] = useState(false), id = useId();
  if (!actorId) return null;
  return <div><Button variant="outline" size="sm" className="min-h-11" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
    {bt("해결된 의견의 작업 완료 검토", "Review task completion for resolved comment")}</Button>
    <div id={id}>{expanded ? <CompletionChoices key={canonicalJson({ request, actorId })} request={request} actorId={actorId} /> : null}</div>
  </div>;
}
