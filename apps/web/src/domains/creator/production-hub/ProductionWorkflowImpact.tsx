import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { ProductionWorkflowProfile, ProductionTask } from "@toonstudio/core/production";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionWorkflowImpact({ previous, draft, tasks }: {
  readonly previous: ProductionWorkflowProfile | null | undefined;
  readonly draft: ProductionWorkflowProfile;
  readonly tasks: readonly ProductionTask[];
}) {
  const bt = useBilingual("ProductionWorkflowImpact");
  const before = new Map((previous?.steps ?? []).map((step) => [canonicalProductionProcessKey(step.key), step]));
  const after = new Map(draft.steps.map((step) => [canonicalProductionProcessKey(step.key), step]));
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter((key) => before.has(key) && JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key)));
  const affected = new Set([...removed, ...changed]);
  const linked = tasks.filter((task) => affected.has(canonicalProductionProcessKey(task.processKey))).length;
  const stats = [
    [bt("추가할 공정", "Steps to add"), added.length],
    [bt("수정할 공정", "Steps to change"), changed.length],
    [bt("삭제할 공정", "Steps to remove"), removed.length],
    [bt("변경 공정의 기존 작업", "Tasks using changed steps"), linked],
  ] as const;
  return <section aria-label={bt("공정 변경 영향 미리 보기", "Workflow change impact")}
    className="mt-5 rounded-2xl border border-accent/30 bg-accent-soft/30 p-4">
    <h3 className="text-sm font-bold">{bt("저장 전에 변경 범위를 확인하세요", "Review changes before saving")}</h3>
    <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(([label, count]) => <div key={label} className="rounded-xl border border-line bg-card p-3">
        <dt className="text-xs text-fg-2">{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{count}</dd>
      </div>)}
    </dl>
    {removed.length ? <p className="mt-3 break-words text-sm text-warn">
      {bt("삭제 예정", "To remove")}: {removed.map((key) => before.get(key)?.name).join(" · ")}
    </p> : null}
    <p className="mt-3 text-xs leading-6 text-fg-2">
      {bt("공정 순서와 선행 연결은 별개입니다. 기존 작업·담당자·승인 기록은 유지되며, 진행 중인 작업이 있는 공정은 삭제할 수 없습니다. 역할·완료 기준의 기본값은 이후 생성할 작업에 적용됩니다.", "Step order and dependencies are independent. Existing tasks, assignees and approvals remain unchanged. Steps with active tasks cannot be removed. Role and completion defaults apply to newly generated tasks.")}
    </p>
  </section>;
}
