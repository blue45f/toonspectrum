import { useMemo } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_PRODUCTION_STAGES, type ProductionStage, type ProductionTask, type ProductionWorkspace } from "./studio-production-workspace-runtime";
import { productionEpisodeRows } from "./studio-production-matrix";

export function StudioProductionMatrix({ workspace, tasks, labels, onOpen }: {
  readonly workspace: ProductionWorkspace; readonly tasks: readonly ProductionTask[];
  readonly labels: Readonly<Record<ProductionStage,string>>; readonly onOpen: (taskId: string) => void;
}) {
  const bt = useBilingual("StudioProductionMatrix");
  const rows = useMemo(() => productionEpisodeRows(tasks, workspace.hierarchy), [tasks, workspace.hierarchy]);
  const stages = STUDIO_PRODUCTION_STAGES.filter((stage) => tasks.some((task) => (task.stage ?? "planning") === stage));
  const status = { todo: bt("할 일", "To do"), doing: bt("진행 중", "In progress"), blocked: bt("확인 필요", "Blocked"), done: bt("작업 완료", "Task complete") };
  if (!tasks.length) return null;
  return <section className="min-w-0 space-y-2" aria-label={bt("회차별 제작 단계", "Episode production stages")}>
    <p className="text-xs leading-relaxed text-fg-2">{bt("작업을 누르면 기존 편집 목록으로 이동합니다. 작업 완료와 원고 승인은 서로 다릅니다.", "Select a task to open its existing editor. Task completion is not manuscript approval.")}</p>
    <div className="max-w-full overflow-auto rounded-xl border border-line" role="region" aria-label={bt("가로로 이동할 수 있는 공정 표", "Horizontally scrollable production table")}>
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">{bt("회차와 제작 단계에 연결된 실제 작업", "Actual tasks by episode and production stage")}</caption>
        <thead className="bg-panel"><tr><th scope="col" className="min-w-36 border-b border-line p-3">{bt("회차", "Episode")}</th>
          {stages.map((stage) => <th scope="col" className="min-w-44 border-b border-line p-3" key={stage}>{labels[stage]}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id ?? "unassigned"}>
          <th scope="row" className="border-b border-line p-3 align-top">{row.id ? row.title : bt("회차 연결 필요", "Episode not linked")}</th>
          {stages.map((stage) => <td key={stage} className="border-b border-line p-2 align-top">
            {row.tasks.filter((task) => (task.stage ?? "planning") === stage).map((task) => <button type="button" key={task.id}
              className="mb-2 flex min-h-11 w-full max-w-64 flex-col gap-1 rounded-lg border border-line bg-card p-3 text-left hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => onOpen(task.id)} aria-label={`${task.title} · ${status[task.status]} · ${task.owner || bt("미배정", "Unassigned")} · ${task.due || bt("기한 미설정", "No due date")}`}>
              <strong className="break-words text-sm">{task.title}</strong><span className="text-fg-2">{status[task.status]} · {task.owner || bt("미배정", "Unassigned")}</span>
              <span className="text-fg-2">{task.due || bt("기한 미설정", "No due date")}</span>
            </button>)}
            {!row.tasks.some((task) => (task.stage ?? "planning") === stage) ? <span className="px-1 text-fg-3">—</span> : null}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
