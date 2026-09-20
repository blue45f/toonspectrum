import { canonicalJson, studioReviewTaskAssignmentChoices } from "@toonspectrum/studio-project-model";
import { useId, useMemo, useRef, useState } from "react";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioProjectSectionPath } from "../studio-route-registry";

import { parseStudioReviewProductionRequest, prepareStudioReviewProductionPatch, reviewProductionEligibleUserIds,
  StudioReviewProductionError, type StudioReviewProductionChoice, type StudioReviewProductionReason, type StudioReviewProductionRequest } from "./studio-review-production-model";
import { useStudioReviewProduction } from "./use-studio-review-production";

const EMPTY_CHOICE: StudioReviewProductionChoice = { taskId: "", handoffId: null, roleSelections: {},
  replaceExisting: false, expectedPreviousRef: null, expectedHandoff: null };
function reasonText(reason: StudioReviewProductionReason, bt: (ko: string, en: string) => string) {
  switch (reason) {
    case "access-denied": return bt("현재 작품·검수본·제작 작업을 편집할 권한을 확인하지 못했어요.", "Editing access to the work, review and production tasks could not be confirmed.");
    case "missing-task": return bt("연결할 기존 제작 작업을 선택해 주세요.", "Choose an existing production task.");
    case "missing-handoff": return bt("작업과 같은 제작 범위의 인계서를 선택해 주세요.", "Choose a handoff brief in the same production scope as the task.");
    case "assignment-required": return bt("의견 담당자마다 기존 제작 역할을 선택해 주세요. 없는 역할이나 이 작업의 오래된 담당자는 제작 보드에서 먼저 정리할 수 있어요.", "Select an existing production role for each comment assignee. Create missing roles or update outdated task assignments on the production board first.");
    case "existing-link": return bt("이 작업에는 다른 검수 의견이 연결되어 있어요. 이전 연결을 확인해 교체하거나 다른 작업을 선택해 주세요.", "This task links to another review comment. Review and confirm replacement, or choose a different task.");
    case "conflict": return bt("다른 수정이 먼저 저장되었거나 인계 내용이 바뀌었어요. 최신 작업을 다시 읽고 선택을 확인해 주세요. 자동으로 덮어쓰지 않았어요.", "Another change was saved or the handoff changed. Reload the tasks and check your selection. No automatic overwrite was attempted.");
    case "uncertain": return bt("연결 저장 결과를 확인하지 못했어요. 선택은 남아 있습니다. 다시 확인하면 같은 의견의 연결을 먼저 읽고 필요한 경우에만 저장해요.", "The connection could not be confirmed. Your choices are preserved. An explicit retry reads the same comment connection before saving if needed.");
    case "expired": return bt("작업 정보의 확인 시간이 지나 다시 읽어야 해요. 선택은 남겨 두었습니다.", "Task information needs a fresh read. Your choices are preserved.");
    case "context-changed": return bt("계정이나 화면 상태가 바뀌어 진행 중인 연결을 중단했어요.", "The account or page state changed, so the pending connection was stopped.");
    default: return bt("제작 작업을 확인하지 못했어요. 다시 읽어 주세요.", "Production tasks could not be verified. Please reload.");
  }
}

function ConnectionForm({ request, actorId, onClose }: { readonly request: StudioReviewProductionRequest; readonly actorId: string; readonly onClose: () => void }) {
  const bt = useBilingual("StudioReviewProductionConnection"), [choice, setChoice] = useState(EMPTY_CHOICE);
  const { snapshot, refresh, connect } = useStudioReviewProduction(request, actorId);
  const authority = snapshot.authority, document = authority?.workspace.document;
  const task = document?.tasks.find((item) => item.id === choice.taskId);
  const handoffs = document?.handoffs.filter((item) => item.hierarchyNodeId === task?.hierarchyNodeId) ?? [];
  const handoff = handoffs.find((item) => item.id === choice.handoffId);
  const roleChoices = authority && task ? studioReviewTaskAssignmentChoices({ assigneeUserIds: authority.comment.assigneeIds,
    task, roleAssignments: authority.workspace.document.roleAssignments, hierarchy: authority.workspace.document.hierarchy,
    eligibleUserIds: reviewProductionEligibleUserIds(authority) }) : [];
  const desiredRef = { ...request, handoffId: choice.handoffId };
  const differentRef = task?.reviewRef && canonicalJson(task.reviewRef) !== canonicalJson(desiredRef);
  let validation: StudioReviewProductionReason | null = null;
  if (authority) {
    try { prepareStudioReviewProductionPatch(authority, choice); }
    catch (error) { validation = error instanceof StudioReviewProductionError ? error.reason : "unavailable"; }
  }
  const busy = snapshot.phase === "saving" || snapshot.phase === "loading", connected = snapshot.phase === "connected";
  const boardHref = studioProjectSectionPath(request.subject.workId, "production");
  return <section aria-label={bt("저장된 의견을 제작 작업에 연결", "Connect saved comment to a production task")} className="mt-3 rounded-xl border border-line bg-card p-4">
    <p className="text-sm text-fg-3">{bt("이미 저장된 의견을 기존 작업에 연결합니다. 완료 조건은 선택한 인계서에서 관리해요.", "Connect this saved comment to an existing task. Completion criteria stay in the selected handoff brief.")}</p>
    {connected ? <p role="status" className="mt-3 text-sm font-semibold">{bt("제작 작업에 연결했어요. 의견과 원래 검수본은 그대로 보존됩니다.", "Connected to the production task. The comment and original review are preserved.")}</p> : null}
    {snapshot.reason ? <p role="status" className="mt-3 text-sm">{reasonText(snapshot.reason, bt)}</p> : null}
    {authority && !connected ? <fieldset disabled={busy} className="mt-3 space-y-3">
      <label className="block text-sm">{bt("기존 제작 작업", "Existing production task")}
        <select aria-label={bt("기존 제작 작업", "Existing production task")} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-2" value={choice.taskId} onChange={(event) => {
          const selected = document?.tasks.find((item) => item.id === event.target.value);
          setChoice({ ...EMPTY_CHOICE, taskId: event.target.value, expectedPreviousRef: selected?.reviewRef ?? null });
        }}>
          <option value="">{bt("작업 선택", "Select task")}</option>
          {document?.tasks.map((item) => <option key={item.id} value={item.id}>{item.title}{item.reviewRef ? bt(" · 연결된 의견 있음", " · has a comment") : ""}</option>)}
        </select>
      </label>
      {!document?.tasks.length ? <p>{bt("기존 제작 작업이 없어요. 제작 보드에서 작업을 만든 뒤 다시 읽어 주세요.", "No production tasks exist. Create one on the production board, then reload.")}</p> : null}
      {task ? <>
        <label className="block text-sm">{bt("기존 인계서 · 완료 조건", "Existing handoff · completion criteria")}
          <select aria-label={bt("기존 인계서 · 완료 조건", "Existing handoff · completion criteria")} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-2" value={choice.handoffId ?? ""} onChange={(event) => {
            const selected = handoffs.find((item) => item.id === event.target.value);
            setChoice((current) => ({ ...current, handoffId: selected?.id ?? null, expectedHandoff: selected ? canonicalJson(selected) : null, replaceExisting: false }));
          }}>
            <option value="">{bt("인계서 연결 없이 작업에만 연결", "Connect to task without a handoff")}</option>
            {handoffs.map((item) => <option key={item.id} value={item.id}>{item.scenePurpose || `${item.fromRole} → ${item.toRole}`}</option>)}
          </select>
        </label>
        {handoff ? <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">{bt("이 인계서의 완료 조건", "Completion criteria in this handoff")}</p>
          {handoff.acceptanceCriteria.length ? <ul className="mt-2 list-disc pl-5">{handoff.acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
            : <p>{bt("완료 조건이 아직 없어요. 제작 보드에서 추가할 수 있습니다.", "No completion criteria yet. Add them on the production board.")}</p>}
        </div> : null}
        {!handoffs.length ? <p className="text-sm">{bt("이 작업과 같은 범위의 인계서가 없어요. 제작 보드에서 만들 수 있습니다.", "No handoff matches this task scope. Create one on the production board.")}</p> : null}
        {roleChoices.map((item, index) => {
          const member = authority.team.members.find((candidate) => candidate.userId === item.userId);
          // Match the review roster: the team parser's raw-ID fallback is not a display name.
          const name = member?.name.trim(), displayName = name && name !== item.userId ? name
            : `${bt("이름 확인이 필요한 담당자", "Assignee name unavailable")} ${index + 1}`;
          return <label key={item.userId} className="block text-sm">{bt("의견 담당자의 제작 역할", "Production role for comment assignee")} · {displayName}
            <select aria-label={`${bt("제작 역할", "Production role")} · ${displayName}`} value={choice.roleSelections[item.userId] ?? ""}
              className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-2" onChange={(event) => setChoice((current) => ({
                ...current, roleSelections: { ...current.roleSelections, [item.userId]: event.target.value },
              }))}>
              <option value="">{bt("기존 역할 선택", "Select existing role")}</option>
              {item.roleAssignmentIds.map((id) => { const role = document?.roleAssignments.find((candidate) => candidate.id === id);
                return <option key={id} value={id}>{role?.displayName} · {role?.roles.join(", ")}</option>; })}
            </select>
            {!item.roleAssignmentIds.length ? <span className="mt-1 block">{bt("현재 배정할 수 있는 제작 역할이 없어요.", "No eligible production role is available.")}</span> : null}
          </label>;
        })}
        {differentRef ? <div className="rounded-lg border border-line p-3 text-sm">
          <p>{bt("현재 연결", "Current connection")}: {task.reviewRef?.subject.reviewId} · {task.reviewRef?.commentId}</p>
          <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={choice.replaceExisting} onChange={(event) => setChoice((current) => ({
            ...current, replaceExisting: event.target.checked, expectedPreviousRef: task.reviewRef ?? null,
          }))} />{bt("이전 연결을 이 의견으로 교체", "Replace the previous connection with this comment")}</label>
        </div> : null}
      </> : null}
      {validation && choice.taskId ? <p role="status" className="text-sm">{reasonText(validation, bt)}</p> : null}
    </fieldset> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {!connected && <Button type="button" className="min-h-11" disabled={busy || (!authority && snapshot.phase !== "uncertain") || (authority !== null && validation !== null)} onClick={() => connect(choice)}>
        {busy ? bt("확인 중…", "Checking…") : snapshot.phase === "uncertain" ? bt("같은 연결 다시 확인", "Retry this connection") : bt("선택한 작업에 연결", "Connect to selected task")}
      </Button>}
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { if (connected) setChoice(EMPTY_CHOICE); refresh(); }}>
        {connected ? bt("다른 작업에 연결", "Connect another task") : bt("최신 작업 다시 읽기", "Reload current tasks")}</Button>
      <Link href={boardHref} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">{bt("제작 보드 열기", "Open production board")}</Link>
      <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>{bt("닫기", "Close")}</Button>
    </div>
  </section>;
}

export function StudioReviewProductionConnection({ request: raw }: { readonly request: StudioReviewProductionRequest }) {
  const bt = useBilingual("StudioReviewProductionConnection"), session = useSession(), actorId = session.data?.user?.id ?? null;
  const requestKey = canonicalJson(raw), request = useMemo(() => parseStudioReviewProductionRequest(JSON.parse(requestKey)), [requestKey]);
  const [expanded, setExpanded] = useState(false);
  const regionId = useId(), trigger = useRef<HTMLButtonElement>(null);
  if (!request || !actorId) return null;
  return <div>
    <Button ref={trigger} type="button" variant="outline" size="sm" className="min-h-11" aria-expanded={expanded} aria-controls={regionId}
      onClick={() => setExpanded((value) => !value)}>{expanded ? bt("연결 선택 닫기", "Close connection choices") : bt("제작 작업에 연결", "Connect to production task")}</Button>
    <div id={regionId}>{expanded ? <ConnectionForm key={canonicalJson({ request, actorId })} request={request} actorId={actorId}
      onClose={() => { setExpanded(false); trigger.current?.focus(); }} /> : null}</div>
  </div>;
}
