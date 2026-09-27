import { ArrowRight, CheckCheck, Eye, Save } from "lucide-react";
import { useRef, useState } from "react";
import type {
  ProductionProjectAggregate,
  ProductionTask,
} from "@toonstudio/core/production";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { BOARD_PRIORITY_LABELS } from "./production-workboard-model";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import {
  buildProductionBulkEditPlan,
  commonProductionBulkAssignees,
  INITIAL_PRODUCTION_BULK_EDIT,
  type ProductionBulkEditPlan,
  type ProductionBulkTaskEdit,
} from "./production-bulk-task-edit";
import type { ProductionClientCommand } from "./production-api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly tasks: readonly ProductionTask[];
  readonly canEdit: boolean;
  readonly execute: (
    command: ProductionClientCommand,
    message: string
  ) => Promise<void>;
  readonly onClose: () => void;
  readonly onSaved: (count: number) => void;
}
const FIELD =
  "mt-2 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
function localToIso(value: string): string | null {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function ProductionTaskBulkEditor({
  aggregate,
  tasks,
  canEdit,
  execute,
  onClose,
  onSaved,
}: Props) {
  useProductionCopy();
  const [snapshots] = useState(tasks);
  const [edit, setEdit] = useState(INITIAL_PRODUCTION_BULK_EDIT);
  const [localDue, setLocalDue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const composing = useRef(false);
  const at = new Date().toISOString();
  const assignees = commonProductionBulkAssignees(aggregate, snapshots, at);
  let plan: ProductionBulkEditPlan | null = null;
  let problem: string | null = null;
  try {
    plan = buildProductionBulkEditPlan(aggregate, snapshots, edit, at);
  } catch (cause) {
    problem =
      cause instanceof Error
        ? cause.message
        : "변경 내용을 확인하지 못했습니다.";
  }
  const dirty =
    edit.priority !== "keep" ||
    edit.assigneeMode !== "keep" ||
    edit.deadlineMode !== "keep";
  const update = (patch: Partial<ProductionBulkTaskEdit>) => {
    setEdit((current) => ({ ...current, ...patch }));
    setReviewed(false);
    setError(null);
  };
  const assigneeName = (id: string) => {
    const assignment = aggregate.assignments.find((entry) => entry.id === id);
    return (
      aggregate.parties.find((party) => party.id === assignment?.partyId)
        ?.publicDisplayName ?? id
    );
  };
  const dueLabel = (due: string | null) =>
    due ? new Date(due).toLocaleString("ko-KR") : productionText("기한 미정");
  const submit = async () => {
    if (
      saving.current ||
      !canEdit ||
      composing.current ||
      !plan?.tasks.length ||
      problem
    )
      return;
    if (!reviewed) {
      setReviewed(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    let savedCount = 0;
    try {
      const currentPlan = buildProductionBulkEditPlan(
        aggregate,
        snapshots,
        edit,
        new Date().toISOString()
      );
      if (!currentPlan.tasks.length) throw new Error("변경할 작업이 없습니다.");
      await execute(
        {
          type: "upsert-task-batch",
          tasks: currentPlan.tasks,
          expectedTasks: currentPlan.expectedTasks,
        },
        `${currentPlan.tasks.length}개 작업의 선택한 필드를 변경했습니다.`
      );
      savedCount = currentPlan.tasks.length;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "일괄 변경에 실패했습니다. 작성한 설정은 유지됩니다."
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
    if (savedCount) onSaved(savedCount);
  };
  return (
    <ProductionWorkspaceDialog
      title={productionText("선택 작업 일괄 편집")}
      description={productionText(
        "선택한 필드만 변경합니다. 작업 상태·검수자·원고·승인 기록은 유지됩니다."
      )}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
      >
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/25 bg-accent-soft p-4 text-sm">
          <CheckCheck size={18} className="text-accent" />
          <strong>{snapshots.length}개 선택</strong>
          <span className="text-fg-2">· 미리 보기 후 한 번에 저장</span>
        </div>
        <fieldset
          disabled={!canEdit || busy}
          className="grid min-w-0 gap-5 md:grid-cols-3"
        >
          <label className="block text-sm font-semibold">
            {productionText("우선순위")}
            <select
              className={FIELD}
              value={edit.priority}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "keep" ||
                  value === "urgent" ||
                  value === "high" ||
                  value === "normal" ||
                  value === "low"
                )
                  update({ priority: value });
              }}
            >
              <option value="keep">{productionText("변경하지 않음")}</option>
              {Object.entries(BOARD_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {productionText(label)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="block text-sm font-semibold">
              {productionText("담당자 변경")}
              <select
                className={FIELD}
                value={edit.assigneeMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "keep" ||
                    value === "replace" ||
                    value === "clear"
                  )
                    update({ assigneeMode: value });
                }}
              >
                <option value="keep">{productionText("변경하지 않음")}</option>
                <option value="replace">{productionText("담당자 교체")}</option>
                <option value="clear">
                  {productionText("담당 배정 해제")}
                </option>
              </select>
            </label>
            {edit.assigneeMode === "replace" ? (
              <label className="mt-3 block text-xs text-fg-2">
                {productionText("모든 작업을 담당할 수 있는 구성원")}
                <select
                  className={FIELD}
                  value={edit.assignmentId}
                  onChange={(event) =>
                    update({ assignmentId: event.target.value })
                  }
                >
                  <option value="">{productionText("담당자 선택")}</option>
                  {assignees.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {assigneeName(entry.id)} · {entry.roleType}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {edit.assigneeMode === "replace" && !assignees.length ? (
              <p className="mt-2 text-xs leading-5 text-warn">
                {productionText(
                  "선택한 작업 전체를 담당할 수 있는 활성 구성원이 없습니다. 회차별로 나누어 선택하세요."
                )}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-semibold">
              {productionText("마감 변경")}
              <select
                className={FIELD}
                value={edit.deadlineMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "keep" || value === "set" || value === "clear")
                    update({
                      deadlineMode: value,
                      dueAt: localToIso(localDue),
                    });
                }}
              >
                <option value="keep">{productionText("변경하지 않음")}</option>
                <option value="set">{productionText("새 마감 지정")}</option>
                <option value="clear">{productionText("마감 해제")}</option>
              </select>
            </label>
            {edit.deadlineMode === "set" ? (
              <label className="mt-3 block text-xs text-fg-2">
                {productionText("새 마감 · 내 시간대")}
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={localDue}
                  onChange={(event) => {
                    setLocalDue(event.target.value);
                    update({ dueAt: localToIso(event.target.value) });
                  }}
                />
              </label>
            ) : null}
          </div>
        </fieldset>
        {edit.assigneeMode === "clear" ? (
          <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            {productionText(
              "담당 배정을 해제합니다. 작업 상태는 바뀌지 않으므로 진행 중인 작업의 인계를 확인하세요."
            )}
          </p>
        ) : null}
        {problem ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"
          >
            {productionText(problem)}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-4 whitespace-pre-line rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm"
          >
            {error}
          </p>
        ) : null}
        {reviewed && plan && !problem ? (
          <section
            aria-label={productionText("일괄 변경 미리 보기")}
            className="mt-5 rounded-2xl border border-line p-4"
          >
            <h3 className="text-sm font-bold">
              {plan.tasks.length}개 변경 · {plan.unchangedCount}개 유지
            </h3>
            <p className="mt-2 text-xs leading-5 text-fg-3">
              {productionText(
                "하나라도 다른 변경과 충돌하면 전체를 저장하지 않습니다."
              )}
            </p>
            <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
              {plan.tasks.slice(0, showAll ? 200 : 12).map((next, index) => {
                const before = plan.expectedTasks[index];
                if (!before) return null;
                return (
                  <article
                    key={next.id}
                    className="rounded-xl border border-line bg-canvas p-3"
                  >
                    <h4 className="break-words text-sm font-semibold">
                      {next.title}
                    </h4>
                    <dl className="mt-2 space-y-2 text-xs text-fg-2">
                      {next.priority !== before.priority ? (
                        <div>
                          <dt className="font-semibold">
                            {productionText("우선순위")}
                          </dt>
                          <dd className="mt-1 flex flex-wrap items-center gap-2">
                            {productionText(
                              BOARD_PRIORITY_LABELS[before.priority ?? "normal"]
                            )}
                            <ArrowRight
                              size={12}
                              aria-label={productionText("변경 후")}
                            />
                            {productionText(
                              BOARD_PRIORITY_LABELS[next.priority ?? "normal"]
                            )}
                          </dd>
                        </div>
                      ) : null}
                      {next.assignmentIds !== before.assignmentIds ? (
                        <div>
                          <dt className="font-semibold">
                            {productionText("담당자")}
                          </dt>
                          <dd className="mt-1 flex flex-wrap items-center gap-2">
                            <span>
                              {before.assignmentIds
                                .map(assigneeName)
                                .join(" · ") || productionText("미배정")}
                            </span>
                            <ArrowRight
                              size={12}
                              aria-label={productionText("변경 후")}
                            />
                            <span>
                              {next.assignmentIds
                                .map(assigneeName)
                                .join(" · ") || productionText("미배정")}
                            </span>
                          </dd>
                        </div>
                      ) : null}
                      {next.dueAt !== before.dueAt ? (
                        <div>
                          <dt className="font-semibold">
                            {productionText("마감")}
                          </dt>
                          <dd className="mt-1 flex flex-wrap items-center gap-2">
                            <span>{dueLabel(before.dueAt)}</span>
                            <ArrowRight
                              size={12}
                              aria-label={productionText("변경 후")}
                            />
                            <span>{dueLabel(next.dueAt)}</span>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                );
              })}
            </div>
            {!showAll && plan.tasks.length > 12 ? (
              <button
                type="button"
                className={cn(
                  buttonClass({ variant: "outline" }),
                  "mt-3 min-h-11 w-full"
                )}
                onClick={() => setShowAll(true)}
              >
                {productionText("변경할 작업 모두 보기")} ({plan.tasks.length})
              </button>
            ) : null}
          </section>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-xs text-fg-3">
            {!canEdit
              ? productionText("편집 권한이 필요합니다.")
              : !dirty
              ? productionText("변경할 필드를 선택하세요.")
              : !plan?.tasks.length && !problem
              ? productionText("이미 같은 값이므로 변경할 작업이 없습니다.")
              : productionText("선택하지 않은 필드는 유지됩니다.")}
          </p>
          <button
            type="submit"
            disabled={
              !canEdit || busy || Boolean(problem) || !plan?.tasks.length
            }
            className={cn(buttonClass(), "min-h-11")}
          >
            {reviewed ? <Save size={16} /> : <Eye size={16} />}
            {busy
              ? productionText("저장 중…")
              : reviewed
              ? `${plan?.tasks.length ?? 0}개 작업 변경`
              : productionText("변경 미리 보기")}
          </button>
        </div>
      </form>
    </ProductionWorkspaceDialog>
  );
}
