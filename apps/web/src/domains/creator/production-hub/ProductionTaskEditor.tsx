import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";

import { productionText, useProductionCopy } from "./production-workboard-copy";
import { CalendarClock, ExternalLink, FileText, ListChecks, MessageSquareMore, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  episodeScope,
  projectScope,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";
import { boardChecklistProgress, boardDueBadge } from "./board/board-card-model";
import { ProductionTaskBriefEditor } from "./ProductionTaskBriefEditor";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { productionProcessLabel } from "./production-labels";
import { productionEpisodeRoomPath, productionSurfacePath } from "./production-project-surfaces";
import { ProductionPill } from "./production-ui";
import {
  BOARD_COLUMNS,
  BOARD_MOVE_TARGETS,
  BOARD_PRIORITY_LABELS,
  BOARD_STATUS_LABELS,
  boardPriorityLabel,
  boardStatusLabel,
  productionTaskEpisodeId,
} from "./production-workboard-model";
import type { ProductionClientCommand } from "./production-api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/** 단축키(a·d)처럼 특정 칸을 고쳐 열 때, 편집기가 처음에 초점을 줄 위치. */
export type ProductionTaskEditorFocusField = "assignees" | "due";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
  readonly isNew: boolean;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly onClose: () => void;
  /** `drawer`: 기존 카드는 보드를 곁에 두고 보는 오른쪽 상세 패널(작은 화면에서는 아래 시트)로 연다. 새 작업은 가운데 대화상자다. */
  readonly presentation?: "dialog" | "drawer";
  /** 있으면 상세 서랍 위쪽에서 상태를 바로 옮길 수 있다(공식 승인은 별도 절차이므로 보드와 같은 이동 규칙을 쓴다). */
  readonly onMoveStatus?: (status: ProductionTaskStatus) => void;
  /** 열자마자 이 칸으로 초점을 옮긴다. 편집할 수 없는 작업이면 아무것도 하지 않는다. */
  readonly initialFocus?: ProductionTaskEditorFocusField;
}
const FIELD =
  "mt-2 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
function toLocalDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function ProductionTaskEditor({ aggregate, task, isNew, canEdit, execute, onClose, presentation = "dialog", onMoveStatus, initialFocus }: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionTaskEditor");
  const drawer = presentation === "drawer";
  const [now] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState(task);
  const [draft, setDraft] = useState(task);
  const [due, setDue] = useState(() => toLocalDate(task.dueAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const composing = useRef(false);
  const editable = canEdit && !["approved", "done", "cancelled", "out-of-scope"].includes(snapshot.status);
  const dueInputRef = useRef<HTMLInputElement | null>(null);
  const assigneesRef = useRef<HTMLFieldSetElement | null>(null);
  const initialFocusApplied = useRef(false);
  // 단축키로 특정 칸을 지목해 연 경우에만, 대화상자의 기본 초점 이동이 끝난 뒤 그 칸으로 초점을 옮긴다.
  useEffect(() => {
    if (!initialFocus || !editable || initialFocusApplied.current) return;
    initialFocusApplied.current = true;
    const frame = requestAnimationFrame(() => {
      if (initialFocus === "due") {
        dueInputRef.current?.focus();
        return;
      }
      const box = assigneesRef.current;
      if (!box) return;
      box.scrollIntoView?.({ block: "nearest" });
      const first = box.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)');
      (first ?? box).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocus, editable]);
  const latest = aggregate.tasks.find((entry) => entry.id === snapshot.id);
  const stale = !isNew && JSON.stringify(latest) !== JSON.stringify(snapshot);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot) || due !== toLocalDate(snapshot.dueAt);
  // 아직 고친 곳이 없으면 다른 곳(예: 보드에서 상태 이동)의 변경을 조용히 따라가고, 고친 내용이 있을 때만 경고한다.
  useEffect(() => {
    if (!stale || dirty || !latest) return;
    setSnapshot(latest);
    setDraft(latest);
    setDue(toLocalDate(latest.dueAt));
  }, [stale, dirty, latest]);
  const assignments = aggregate.assignments.filter(
    (entry) =>
      entry.status === "active" ||
      draft.assignmentIds.includes(entry.id) ||
      draft.reviewerAssignmentIds.includes(entry.id),
  );
  const assignmentName = (id: string) => {
    const assignment = aggregate.assignments.find((entry) => entry.id === id);
    const name = aggregate.parties.find((party) => party.id === assignment?.partyId)?.publicDisplayName ?? id;
    return `${name}${assignment?.status === "active" ? "" : " · 비활성"}`;
  };
  const processKeys = [
    ...new Set([
      ...(aggregate.workflowProfile?.steps.map((step) => canonicalProductionProcessKey(step.key)) ??
        aggregate.tasks.map((entry) => canonicalProductionProcessKey(entry.processKey))),
      canonicalProductionProcessKey(draft.processKey),
    ]),
  ];
  const revisions = [
    ...new Map(
      [...draft.inputRevisionRefs, ...aggregate.submissions.map((submission) => submission.revisionRef)].map(
        (ref) => [`${ref.id}:${ref.revision}`, ref],
      ),
    ).values(),
  ];
  const criteria = draft.completionCriteria.map((value) => value.trim()).filter(Boolean);
  const issues = [
    !draft.title.trim() ? "작업 제목을 입력하세요." : "",
    criteria.length > 30 || criteria.some((value) => value.length > 4000)
      ? "완료 기준은 30개 이하, 각 4000자 이하로 입력하세요."
      : "",
    due && !Number.isFinite(Date.parse(due)) ? "마감 일시를 확인하세요." : "",
  ].filter(Boolean);
  const dueBadge = boardDueBadge(snapshot, now);
  const checklist = boardChecklistProgress(draft);
  const episodeId = productionTaskEpisodeId(draft);
  const manuscriptsPath = productionSurfacePath(aggregate.projectId, "manuscripts", episodeId ? `episode=${encodeURIComponent(episodeId)}` : undefined);
  const patch = (changes: Partial<ProductionTask>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };
  const toggle = (
    field: "assignmentIds" | "reviewerAssignmentIds" | "dependencyTaskIds",
    id: string,
    checked: boolean,
  ) => patch({ [field]: checked ? [...draft[field], id] : draft[field].filter((value) => value !== id) });
  const save = async () => {
    if (saving.current || !editable || issues.length || stale) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const next = {
        ...draft,
        title: draft.title.trim(),
        completionCriteria: criteria,
        dueAt: due ? new Date(due).toISOString() : null,
      };
      await execute(
        {
          type: "upsert-task-batch",
          tasks: [next],
          ...(isNew ? { expectedAbsentTaskIds: [snapshot.id] } : { expectedTasks: [snapshot] }),
        },
        isNew ? "새 작업을 만들었습니다." : "작업과 설명을 저장했습니다.",
      );
      saved = true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "작업을 저장하지 못했습니다. 작성한 내용은 유지됩니다.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
    if (saved) onClose();
  };
  return (
    <ProductionWorkspaceDialog
      title={isNew ? "새 제작 작업" : task.title}
      description={productionText(
        "작업 지시, 담당자, 고정 입력과 완료 기준을 한곳에서 정리하세요. 상태 이동과 공식 승인은 별도 절차로 보호됩니다.",
      )}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      wide
      variant={drawer ? "drawer" : "dialog"}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!composing.current) void save();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-semibold">
              {BOARD_STATUS_LABELS[snapshot.status]}
            </span>
            {!isNew ? (
              <>
                <ProductionPill tone="accent">{productionProcessLabel(aggregate, snapshot.processKey, bt)}</ProductionPill>
                {snapshot.priority === "urgent" || snapshot.priority === "high" ? (
                  <ProductionPill tone={snapshot.priority === "urgent" ? "danger" : "warning"}>{boardPriorityLabel(snapshot.priority, bt)}</ProductionPill>
                ) : null}
                {dueBadge ? (
                  <ProductionPill tone={dueBadge.tone} className="gap-1">
                    <CalendarClock size={12} aria-hidden="true" />
                    {bt(dueBadge.label.ko, dueBadge.label.en)}
                  </ProductionPill>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {onMoveStatus && !isNew && canEdit && !["approved", "done", "cancelled", "out-of-scope"].includes(snapshot.status) ? (
              <select
                aria-label={bt("상태 이동", "Move to status")}
                value=""
                className="min-h-11 max-w-[9rem] rounded-xl border border-line bg-canvas px-2 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onChange={(event) => {
                  const next = BOARD_MOVE_TARGETS.find((status) => status === event.target.value);
                  if (next) onMoveStatus(next);
                }}
              >
                <option value="">{productionText("상태 이동…")}</option>
                {BOARD_COLUMNS.filter((column) => column.id !== "archive").map((column) => {
                  const statuses = BOARD_MOVE_TARGETS.filter((status) => column.statuses.includes(status) && status !== snapshot.status);
                  return statuses.length ? (
                    <optgroup key={column.id} label={bt(column.title, column.titleEn)}>
                      {statuses.map((status) => (
                        <option key={status} value={status}>{boardStatusLabel(status, bt)}</option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            ) : null}
            <span className="max-w-full break-all text-xs text-fg-3">{snapshot.id}</span>
          </div>
        </div>
        {!editable ? (
          <p className="mb-4 rounded-xl border border-line bg-raised p-3 text-sm text-fg-2">
            {canEdit
              ? "승인·완료·보관된 작업은 이 편집기에서 변경하지 않습니다."
              : "읽기 전용입니다. 작업 변경에는 편집 권한이 필요합니다."}
          </p>
        ) : null}
        {stale ? (
          <div role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <p>{productionText("다른 변경이 감지되었습니다. 작성한 내용은 보존했으며 덮어쓰지 않습니다.")}</p>
            {latest ? (
              <button
                type="button"
                disabled={busy}
                className={cn(buttonClass({ variant: "outline" }), "mt-3 min-h-11")}
                onClick={() => {
                  setSnapshot(latest);
                  setDraft(latest);
                  setDue(toLocalDate(latest.dueAt));
                  setError(null);
                }}
              >
                {productionText("편집을 버리고 최신 내용 불러오기")}
              </button>
            ) : null}
          </div>
        ) : null}
        <fieldset disabled={!editable || busy} className="min-w-0 space-y-5">
          <label className="block text-sm font-semibold">
            {productionText("작업 제목")}
            <input
              className={FIELD}
              value={draft.title}
              required
              maxLength={240}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder={productionText("예: 12화 배경 원고 1차 제작")}
            />
          </label>
          <div className={cn("grid gap-4", drawer ? "grid-cols-1 min-[28rem]:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
            <label className="text-xs font-semibold text-fg-2">
              {productionText("우선순위")}
              <select
                className={FIELD}
                value={draft.priority ?? "normal"}
                onChange={(event) => {
                  const priority = (
                    Object.keys(BOARD_PRIORITY_LABELS) as (keyof typeof BOARD_PRIORITY_LABELS)[]
                  ).find((key) => key === event.target.value);
                  if (priority) patch({ priority });
                }}
              >
                {Object.entries(BOARD_PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-fg-2">
              {productionText("제작 공정")}
              <select
                className={FIELD}
                value={canonicalProductionProcessKey(draft.processKey)}
                onChange={(event) => patch({ processKey: event.target.value })}
              >
                {processKeys.map((key) => (
                  <option key={key} value={key}>
                    {aggregate.workflowProfile?.steps.find(
                      (step) =>
                        canonicalProductionProcessKey(step.key) === canonicalProductionProcessKey(key),
                    )?.name ?? key}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-fg-2">
              {productionText("회차")}
              <select
                className={FIELD}
                value={productionTaskEpisodeId(draft) ?? ""}
                onChange={(event) =>
                  patch({
                    scope: event.target.value
                      ? episodeScope(aggregate.projectId, event.target.value)
                      : projectScope(aggregate.projectId),
                  })
                }
              >
                <option value="">{productionText("프로젝트 공통")}</option>
                {aggregate.episodes.map((episode) => (
                  <option key={episode.episodeId} value={episode.episodeId}>
                    {aggregate.episodePlans.find((plan) => plan.episodeId === episode.episodeId)?.title ??
                      episode.episodeId}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-fg-2">
              {productionText("마감 · 내 시간대")}
              <input
                ref={dueInputRef}
                type="datetime-local"
                className={FIELD}
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </label>
          </div>
          <div className={cn("grid gap-4", drawer ? "grid-cols-1" : "sm:grid-cols-2")}>
            {(["assignmentIds", "reviewerAssignmentIds"] as const).map((field) => (
              <fieldset
                key={field}
                ref={field === "assignmentIds" ? assigneesRef : undefined}
                tabIndex={field === "assignmentIds" ? -1 : undefined}
                className="rounded-2xl border border-line p-3"
              >
                <legend className="px-2 text-sm font-semibold">
                  {field === "assignmentIds" ? "담당자" : "검수자"}
                </legend>
                <div className="max-h-44 overflow-y-auto">
                  {assignments.map((assignment) => (
                    <label
                      key={assignment.id}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-raised"
                    >
                      <input
                        type="checkbox"
                        checked={draft[field].includes(assignment.id)}
                        disabled={assignment.status !== "active" && !draft[field].includes(assignment.id)}
                        onChange={(event) => toggle(field, assignment.id, event.target.checked)}
                        className="size-4"
                      />
                      {assignmentName(assignment.id)}
                    </label>
                  ))}
                  {assignments.length === 0 ? (
                    <p className="p-2 text-sm text-fg-3">
                      {productionText("먼저 프로젝트에 담당자를 초대하세요.")}
                    </p>
                  ) : null}
                </div>
              </fieldset>
            ))}
          </div>
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{productionText("작업 설명 · 시각적 블록 편집")}</h3>
              {checklist ? (
                <span className="inline-flex items-center gap-2 text-xs text-fg-2" role="img" aria-label={bt(`체크리스트 ${checklist.done}/${checklist.total} 완료`, `Checklist ${checklist.done} of ${checklist.total} done`)}>
                  <ListChecks size={14} aria-hidden="true" />
                  <span className="tabular-nums" aria-hidden="true">{checklist.done}/{checklist.total}</span>
                  <span aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-raised">
                    <span className="block h-full rounded-full bg-good" style={{ width: `${checklist.percent}%` }} />
                  </span>
                </span>
              ) : null}
            </div>
            <ProductionTaskBriefEditor
              blocks={draft.briefBlocks ?? []}
              disabled={!editable || busy}
              onChange={(briefBlocks) => patch({ briefBlocks })}
            />
          </div>
          <details className="rounded-2xl border border-line p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              {productionText("고정 입력과 선행 작업")}
              <span className="font-normal text-fg-3">
                {productionText("· 입력")}
                {draft.inputRevisionRefs.length}
                {productionText("개 / 선행")}
                {draft.dependencyTaskIds.length}
                {productionText("개")}
              </span>
            </summary>
            <p className="mb-3 text-xs leading-5 text-fg-3">
              {productionText(
                "작업을 시작하려면 사용할 입력 버전을 고정하고 선행 작업을 완료해야 합니다. 최신 버전으로 자동 교체하지 않습니다.",
              )}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-fg-2">
                  {productionText("입력 버전 선택")}
                </legend>
                <div className="max-h-56 overflow-y-auto">
                  {revisions.map((ref) => (
                    <label
                      key={`${ref.id}:${ref.revision}`}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs hover:bg-raised"
                    >
                      <input
                        type="checkbox"
                        checked={draft.inputRevisionRefs.some(
                          (entry) => entry.id === ref.id && entry.revision === ref.revision,
                        )}
                        className="size-4 shrink-0"
                        onChange={(event) =>
                          patch({
                            inputRevisionRefs: event.target.checked
                              ? [...draft.inputRevisionRefs, ref]
                              : draft.inputRevisionRefs.filter(
                                  (entry) => entry.id !== ref.id || entry.revision !== ref.revision,
                                ),
                          })
                        }
                      />
                      <span className="break-all">
                        {ref.id} · v{ref.revision}
                      </span>
                    </label>
                  ))}
                  {revisions.length === 0 ? (
                    <p className="text-xs text-fg-3">
                      {productionText("원고 관리에서 제출본을 등록한 뒤 입력 버전을 연결하세요.")}
                    </p>
                  ) : null}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-fg-2">
                  {productionText("선행 작업 선택")}
                </legend>
                <div className="max-h-56 overflow-y-auto">
                  {aggregate.tasks
                    .filter(
                      (entry) =>
                        entry.id !== draft.id &&
                        (!productionTaskEpisodeId(draft) ||
                          productionTaskEpisodeId(entry) === productionTaskEpisodeId(draft)),
                    )
                    .map((entry) => (
                      <label
                        key={entry.id}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs hover:bg-raised"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0"
                          checked={draft.dependencyTaskIds.includes(entry.id)}
                          onChange={(event) => toggle("dependencyTaskIds", entry.id, event.target.checked)}
                        />
                        <span>
                          {entry.title} · {BOARD_STATUS_LABELS[entry.status]}
                        </span>
                      </label>
                    ))}
                </div>
              </fieldset>
            </div>
          </details>
          <label className="block text-sm font-semibold">
            {productionText("완료 기준 · 한 줄에 하나")}
            <textarea
              className={cn(FIELD, "min-h-28 resize-y")}
              value={draft.completionCriteria.join("\n")}
              onChange={(event) => patch({ completionCriteria: event.target.value.split("\n") })}
              placeholder={productionText("다음 작업자에게 넘기기 전에 확인할 내용을 적어주세요.")}
            />
          </label>
        </fieldset>
        <section aria-label={bt("연결된 원고와 대화", "Linked pages and discussion")} className="mt-4 rounded-2xl border border-line bg-canvas p-3">
          <h3 className="mb-2 text-sm font-semibold">{bt("연결된 원고·대화", "Linked pages & discussion")}</h3>
          <p className="mb-2 text-xs leading-5 text-fg-3">
            {draft.inputRevisionRefs.length > 0
              ? bt(`고정한 입력 원고 ${draft.inputRevisionRefs.length}개: ${draft.inputRevisionRefs.slice(0, 3).map((ref) => `v${ref.revision}`).join(", ")}${draft.inputRevisionRefs.length > 3 ? "…" : ""}`, `${draft.inputRevisionRefs.length} pinned input version(s): ${draft.inputRevisionRefs.slice(0, 3).map((ref) => `v${ref.revision}`).join(", ")}${draft.inputRevisionRefs.length > 3 ? "…" : ""}`)
              : bt("아직 고정한 입력 원고가 없습니다. 아래 '고정 입력과 선행 작업'에서 고르세요.", "No pinned input yet. Choose one under Pinned inputs & prerequisites.")}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a href={manuscriptsPath} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-accent underline">
              <FileText size={13} aria-hidden="true" />
              {productionText("원고 관리에서 입력·산출물 확인")}
              <ExternalLink size={13} aria-hidden="true" />
              <span className="sr-only">{productionText("새 탭")}</span>
            </a>
            {episodeId ? (
              <a href={productionEpisodeRoomPath(aggregate.projectId, episodeId)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-accent underline">
                <MessageSquareMore size={13} aria-hidden="true" />
                {bt("회차 룸에서 핀 코멘트 보기", "See pinned comments in the episode room")}
                <ExternalLink size={13} aria-hidden="true" />
                <span className="sr-only">{productionText("새 탭")}</span>
              </a>
            ) : null}
            <a href={productionSurfacePath(aggregate.projectId, "review")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-accent underline">
              {productionText("공식 검수 열기")}
              <ExternalLink size={13} aria-hidden="true" />
              <span className="sr-only">{productionText("새 탭")}</span>
            </a>
          </div>
        </section>
        {error ? (
          <p role="alert" className="mt-3 whitespace-pre-line rounded-xl bg-bad/10 p-3 text-sm">
            {error}
          </p>
        ) : null}
        <div className={cn("mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5", drawer && "sticky bottom-0 z-10 -mx-4 bg-card px-4 pb-3 sm:-mx-5 sm:px-5")}>
          <p className="text-xs leading-5 text-fg-3">
            {issues[0] ?? (dirty ? "저장하지 않은 변경 있음" : "작업 설명은 자동 저장되지 않습니다.")}
          </p>
          {editable ? (
            <button
              type="submit"
              disabled={busy || stale || issues.length > 0 || (!dirty && !isNew)}
              className={cn(buttonClass(), "min-h-11")}
            >
              <Save size={16} />
              {busy ? "저장 중…" : isNew ? "작업 만들기" : "작업 저장"}
            </button>
          ) : null}
        </div>
      </form>
    </ProductionWorkspaceDialog>
  );
}
