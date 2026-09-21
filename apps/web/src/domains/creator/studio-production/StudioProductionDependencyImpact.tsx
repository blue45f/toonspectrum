import { useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ProductionTask } from "./studio-production-workspace-runtime";
import { productionDependencyImpact } from "./studio-production-calendar";

export function StudioProductionDependencyImpact({ tasks, taskId }: { readonly tasks: readonly ProductionTask[]; readonly taskId: string }) {
  const bt = useBilingual("StudioProductionDependencyImpact");
  const [open, setOpen] = useState(false);
  const impact = useMemo(() => open ? productionDependencyImpact(tasks, taskId) : null, [open, tasks, taskId]);
  return <details className="mt-3 rounded-lg border border-line p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer text-xs font-semibold">{bt("선행 작업·후속 영향 확인", "Check dependencies and downstream impact")}</summary>
    {impact ? <div className="space-y-3 text-xs">
      <p className="text-fg-2">{bt("현재 저장된 의존성의 영향만 표시합니다. 예상 소요와 가용 시간은 계산하지 않으며 기한·담당자를 자동 변경하지 않습니다.", "Shows recorded dependency impact only. No effort or availability is inferred; due dates and assignees are unchanged.")}</p>
      <section><h4 className="font-semibold">{bt("미완료·확인 필요 선행 작업", "Unfinished or missing prerequisites")}</h4>
        {impact.unresolved.length ? <ul>{impact.unresolved.map(({ id, task }) => <li key={id} className="mt-1 break-words">{task?.title ?? bt("확인할 수 없는 선행 작업", "Unavailable prerequisite")}</li>)}</ul>
          : <p>{bt("미완료 선행 작업이 없습니다.", "No unfinished prerequisites.")}</p>}
      </section>
      <section><h4 className="font-semibold">{bt("영향을 받을 수 있는 후속 작업", "Potentially affected downstream tasks")}</h4>
        {impact.descendants.length ? <ul>{impact.descendants.map((task) => <li key={task.id} className="mt-1 break-words">{task.title} · {task.due || bt("기한 미정", "No due date")}</li>)}</ul>
          : <p>{bt("연결된 후속 작업이 없습니다.", "No linked downstream tasks.")}</p>}
      </section>
    </div> : null}
  </details>;
}
