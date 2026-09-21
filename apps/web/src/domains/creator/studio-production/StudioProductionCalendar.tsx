import { useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ProductionTask } from "./studio-production-workspace-runtime";
import { productionCalendarGroups } from "./studio-production-calendar";

export function StudioProductionCalendar({ tasks, today, onOpen }: {
  readonly tasks: readonly ProductionTask[]; readonly today: string; readonly onOpen: (id: string) => void;
}) {
  const bt = useBilingual("StudioProductionCalendar");
  const [month, setMonth] = useState(today.slice(0, 7));
  const { groups, undated } = productionCalendarGroups(tasks, month);
  const states = { todo: bt("할 일", "To do"), doing: bt("진행 중", "In progress"), blocked: bt("차단됨", "Blocked"), done: bt("완료", "Done") };
  const items = (entries: readonly ProductionTask[]) => <ul className="space-y-2">{entries.map((task) => <li key={task.id}>
    <button type="button" className="min-h-11 w-full rounded-lg border border-line px-3 py-2 text-left text-sm" onClick={() => onOpen(task.id)}>
      <span className="block break-words font-semibold">{task.title}</span>
      <span className="block text-xs text-fg-2">{task.owner || bt("미배정", "Unassigned")} · {task.progress}% · {states[task.status]}</span>
    </button>
  </li>)}</ul>;
  return <section className="space-y-3 rounded-xl border border-line p-3" aria-label={bt("제작 일정", "Production calendar")}>
    <div className="flex flex-wrap items-center gap-3">
      <label className="min-w-0 text-sm">{bt("표시할 달", "Visible month")}<input type="month" className="ml-2 min-h-11 max-w-full rounded-lg border border-line bg-panel px-2" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setMonth(today.slice(0, 7))}>{bt("이번 달", "This month")}</button>
    </div>
    <p className="text-xs text-fg-2">{bt("현재 표시 조건에 맞는 실제 마감일입니다. 항목을 눌러 기존 작업으로 돌아갑니다. 기한이나 승인을 자동 변경하지 않습니다.", "Actual due dates matching current filters. Open an item to return to its existing task. Dates and approvals are never changed automatically.")}</p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <section key={group.day} className="rounded-lg border border-line p-3">
      <h3 className="mb-2 text-sm font-bold"><time dateTime={group.day}>{group.day}</time>{group.day === today ? ` · ${bt("오늘", "Today")}` : ""}</h3>{items(group.tasks)}
    </section>)}</div>
    {!groups.length ? <p role="status" className="text-sm">{bt("이 달에 해당하는 작업이 없습니다.", "No matching tasks in this month.")}</p> : null}
    {undated.length ? <section className="rounded-lg border border-line p-3"><h3 className="mb-2 text-sm font-bold">{bt("기한 확인 필요", "Due date needs checking")}</h3>{items(undated)}</section> : null}
  </section>;
}
