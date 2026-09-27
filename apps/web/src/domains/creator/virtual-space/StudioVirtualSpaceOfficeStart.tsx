import { Armchair, ArrowUpRight, ClipboardList, RefreshCw, UsersRound, X } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import { STUDIO_VIRTUAL_PRODUCTION_DESTINATIONS, STUDIO_VIRTUAL_TASK_STATUS_LABELS, studioVirtualProductionDestination, type StudioVirtualProductionDestination } from "./studio-virtual-space-production-route";
import "./studio-virtual-space-office-start.css";

const CLOSED_TASKS = new Set(["approved", "done", "cancelled", "out-of-scope"]);
const dueTime = (value: string | null | undefined) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : Infinity;
};

export function StudioVirtualSpaceOfficeStart({ snapshot, workId, personal = false, peerCount, onOpenWork, onOpenPeople, onOpenSeats, onRefresh, onGuide, onDismiss }: {
  readonly snapshot: StudioVirtualOperationsSnapshot;
  readonly workId: string;
  readonly personal?: boolean;
  readonly peerCount: number;
  readonly onOpenWork: () => void;
  readonly onOpenPeople: () => void;
  readonly onOpenSeats: () => void;
  readonly onRefresh: () => void;
  readonly onGuide?: (destination: StudioVirtualProductionDestination) => void;
  readonly onDismiss?: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceOfficeStart");
  const scopeChanged = Boolean(snapshot.project && snapshot.project.aggregate.workId !== workId);
  const project = !personal && snapshot.phase === "ready" && !scopeChanged ? snapshot.project?.aggregate : null;
  const tasks = (project?.tasks ?? []).filter((task) => !CLOSED_TASKS.has(task.status));
  const assignedIds = new Set(snapshot.inbox.filter((item) => item.projectId === project?.projectId || item.projectId === workId).map((item) => item.taskId));
  const assignedTasks = tasks.filter((task) => assignedIds.has(task.id));
  const nextTask = [...(assignedTasks.length ? assignedTasks : tasks)].sort((a, b) => dueTime(a.dueAt) - dueTime(b.dueAt))[0];
  const destination = nextTask ? studioVirtualProductionDestination(nextTask) : null;
  const due = nextTask ? dueTime(nextTask.dueAt) : Infinity;
  const count = Number.isFinite(peerCount) ? Math.max(0, Math.floor(peerCount)) : 0;

  return <section className="studio-vspace-office-start" aria-label={bt("스튜디오에서 작업 시작", "Start work in the studio")} data-space-interactive="true">
    <header><div><p>{bt("나의 웹툰 작업실", "Your webtoon office")}</p><h2>{bt("무엇부터 할까요?", "What will you work on?")}</h2></div>
      {onDismiss ? <button type="button" className="studio-vspace-office-dismiss" onClick={onDismiss} aria-label={bt("작업 시작 안내 접기", "Collapse work start guide")}><X size={18} aria-hidden /></button> : null}
    </header>
    {nextTask ? <div className="studio-vspace-office-next">
      <span>{assignedTasks.length ? bt("내 다음 작업", "Your next task") : bt("팀의 다음 작업", "Team's next task")}</span>
      <strong>{nextTask.title}</strong>
      <small>{bt(...STUDIO_VIRTUAL_TASK_STATUS_LABELS[nextTask.status])} · {Number.isFinite(due)
        ? bt(`마감 ${new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(due)}`, `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(due)}`)
        : bt("마감 미정", "No due date")}</small>
      {destination && onGuide ? <button type="button" onClick={() => onGuide(destination)}>{bt(...STUDIO_VIRTUAL_PRODUCTION_DESTINATIONS[destination])}{bt("로 이동", " · walk there")}<ArrowUpRight size={16} aria-hidden /></button> : null}
    </div> : personal ? <p>{bt("내 작품을 열어 원고 작업을 시작하세요. 이곳은 혼자 사용하는 로컬 작업실이에요.", "Open a work to start your manuscript. This is your personal local office.")}</p>
      : snapshot.phase === "loading" || scopeChanged ? <p role="status">{bt("오늘의 작업을 확인하고 있어요. 작업함은 바로 열 수 있어요.", "Checking today's tasks. You can open your work inbox now.")}</p>
        : snapshot.phase === "unavailable" || snapshot.error ? <div className="studio-vspace-office-unavailable"><p role="status">{bt("오늘의 작업을 확인하지 못했어요. 작업함에서 작품 연결과 작업을 확인할 수 있어요.", "Today's tasks could not be confirmed. Check the work connection and tasks in your inbox.")}</p><button type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden />{bt("다시 확인", "Try again")}</button></div>
          : <p>{bt("지금 표시할 진행 작업이 없어요. 작업함에서 다음 작업을 선택하세요.", "There are no open tasks to show. Choose your next task in the inbox.")}</p>}
    <div className="studio-vspace-office-actions">
      {personal ? <Link href="/studio"><ClipboardList size={19} aria-hidden /><strong>{bt("내 작품 열기", "Open my works")}</strong><span>{bt("원고 작업 시작", "Start a manuscript")}</span></Link>
        : <button type="button" onClick={onOpenWork}><ClipboardList size={19} aria-hidden /><strong>{bt("내 작업 열기", "Open my work")}</strong><span>{bt("원고·검수 확인", "Manuscripts & reviews")}</span></button>}
      <button type="button" onClick={onOpenPeople} disabled={personal}><UsersRound size={19} aria-hidden /><strong>{bt("동료 찾기", "Find teammates")}</strong><span>{personal ? bt("개인 작업실 · 동료 없음", "Personal office · no teammates") : count ? bt(`현재 공간 ${count}명`, `${count} in this space`) : bt("현재 접속한 동료 없음", "No teammates connected")}</span></button>
      <button type="button" onClick={onOpenSeats}><Armchair size={19} aria-hidden /><strong>{bt("작업 자리", "Work desk")}</strong><span>{personal ? bt("작업 위치로 이동", "Go to your workspace") : bt("빈 자리 확인·이동", "Find an available desk")}</span></button>
    </div>
    <footer><Link href={personal ? "/studio/new" : `/studio/p/${encodeURIComponent(workId)}/production?view=documents`}>{personal ? bt("새 작품 만들기", "Create a work") : bt("원고 목록 바로 열기", "Open manuscript list")}<ArrowUpRight size={15} aria-hidden /></Link></footer>
  </section>;
}
