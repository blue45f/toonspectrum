import { CalendarClock, CheckCircle2, ClipboardList, RefreshCw, Route, TriangleAlert } from "lucide-react";

import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

const ACTIVE_REVIEW = new Set(["internal-review", "external-review", "changes-requested", "conditionally-approved"]);
const CLOSED = new Set(["approved", "done", "cancelled", "out-of-scope"]);

function when(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

export function StudioVirtualSpaceTodayBoard({ snapshot, workId, onRefresh, onGuide }: {
  readonly snapshot: StudioVirtualOperationsSnapshot;
  readonly workId: string;
  readonly onRefresh: () => void;
  readonly onGuide?: (destination: "story" | "drawing" | "review" | "production") => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceTodayBoard");
  const locale = bt("ko-KR", "en-US");
  const aggregate = snapshot.project?.aggregate;
  const openTasks = (aggregate?.tasks ?? []).filter((task) => !CLOSED.has(task.status));
  const nextTasks = [...openTasks].sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity)).slice(0, 4);
  const reviews = openTasks.filter((task) => ACTIVE_REVIEW.has(task.status));
  const calendar = [...snapshot.calendar].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).slice(0, 3);
  return <section className="vs2-panel studio-vspace-today-board" aria-label={bt("오늘의 스튜디오 보드", "Studio today board")} data-space-interactive="true">
    <header><div><p><CalendarClock size={15} aria-hidden /> TODAY BOARD</p><h2>{aggregate?.title ?? bt("오늘의 제작 동선", "Today's production flow")}</h2></div>
      <button type="button" onClick={onRefresh} aria-label={bt("새로고침", "Refresh")}><RefreshCw size={16} aria-hidden /></button></header>
    {snapshot.phase === "loading" ? <p role="status">{bt("일정과 작업을 불러오는 중…", "Loading schedule and work…")}</p> : null}
    {snapshot.phase === "unavailable" ? <div className="studio-vspace-empty-state"><TriangleAlert size={18} aria-hidden /><p>{bt("이 작품에 연결된 프로덕션 프로젝트가 아직 없어요. 공간 이동과 제작 도구는 계속 사용할 수 있습니다.", "This work is not linked to a production project yet. Spatial navigation and creation tools remain available.")}</p></div> : null}
    {aggregate ? <>
      <div className="studio-vspace-today-metrics">
        <span><ClipboardList size={15} aria-hidden /><b>{openTasks.length}</b>{bt("진행 작업", "open tasks")}</span>
        <span><CheckCircle2 size={15} aria-hidden /><b>{reviews.length}</b>{bt("검수 대기", "reviews")}</span>
        <span><CalendarClock size={15} aria-hidden /><b>{calendar.length}</b>{bt("예정 일정", "events")}</span>
      </div>
      <h3>{bt("다음 작업", "Next work")}</h3>
      <div className="studio-vspace-today-list">{nextTasks.length ? nextTasks.map((task) => <article key={task.id}>
        <div><strong>{task.title}</strong><small>{task.status} · {when(task.dueAt, locale)}</small></div>
        <button type="button" onClick={() => onGuide?.(ACTIVE_REVIEW.has(task.status) ? "review" : task.processKey.includes("story") ? "story" : "drawing")}><Route size={14} aria-hidden />{bt("공간 안내", "Guide me")}</button>
      </article>) : <p>{bt("열린 작업이 없습니다.", "No open tasks.")}</p>}</div>
      {calendar.length ? <><h3>{bt("다가오는 일정", "Upcoming")}</h3><div className="studio-vspace-today-list">{calendar.map((event) => <article key={event.key}><div><strong>{event.title}</strong><small>{when(event.startsAt, locale)}–{when(event.endsAt, locale)}</small></div><a href={event.url}>{bt("열기", "Open")}</a></article>)}</div></> : null}
      <footer>
        <Link href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/schedule`}>{bt("전체 일정", "Full schedule")}</Link>
        <Link href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/review`}>{bt("검수 관제", "Review control")}</Link>
        <Link href={`/studio/p/${encodeURIComponent(workId)}/production`}>{bt("프로젝트 제작", "Project production")}</Link>
      </footer>
    </> : null}
  </section>;
}
