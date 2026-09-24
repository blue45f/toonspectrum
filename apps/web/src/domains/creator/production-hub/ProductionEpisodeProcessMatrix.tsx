import {
  CalendarClock,
  CheckSquare2,
  ChevronRight,
  LoaderCircle,
  Save,
  Square,
  UserRound,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ProductionProjectAggregate,
  ProductionTaskStatus,
} from "@toonspectrum/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  buildProductionMatrixCells,
  buildProductionMatrixTaskUpdates,
  productionProcessKey,
  type ProductionMatrixCell,
} from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { productionManuscriptAttention } from "./production-manuscript-ux";
import { newProductionMutationId, type ProductionClientCommand } from "./production-api";

type BulkStatus = Extract<ProductionTaskStatus,
  "ready" | "in-progress" | "internal-review" | "changes-requested" | "approved" | "done" | "blocked"
>;

const STATUS_LABELS: Readonly<Record<BulkStatus, string>> = Object.freeze({
  ready: "준비",
  "in-progress": "작업 중",
  "internal-review": "내부 검수",
  "changes-requested": "수정 요청",
  approved: "승인",
  done: "완료",
  blocked: "차단",
});

function episodeLabel(aggregate: ProductionProjectAggregate, episodeId: string | null): string {
  if (!episodeId) return "프로젝트 공통";
  const plan = aggregate.episodePlans.find((candidate) => candidate.episodeId === episodeId);
  if (plan) return `${plan.episodeNumber}화 · ${plan.title}`;
  const index = aggregate.episodes.findIndex((candidate) => candidate.episodeId === episodeId);
  return index >= 0 ? `${index + 1}화 · ${episodeId}` : episodeId;
}

function assignmentLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((candidate) => candidate.id === assignmentId);
  const party = assignment ? aggregate.parties.find((candidate) => candidate.id === assignment.partyId) : null;
  return party?.internalDisplayName || party?.publicDisplayName || assignment?.roleType || assignmentId;
}

function cellTone(cell: ProductionMatrixCell): string {
  const attention = productionManuscriptAttention(cell.process);
  if (attention.level === "danger") return "border-bad/40 bg-bad/10";
  if (attention.level === "warning") return "border-warn/40 bg-warn/10";
  if (attention.level === "success") return "border-good/35 bg-good/10";
  return "border-line bg-card";
}

export function ProductionEpisodeProcessMatrix({
  aggregate,
  processes,
  canEdit,
  isDemo,
  execute,
  onOpenProcess,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly canEdit: boolean;
  readonly isDemo: boolean;
  readonly execute?: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly onOpenProcess: (process: ProductionManuscriptProcess, view: "versions" | "feedback" | "delivery") => void;
}) {
  const cells = useMemo(() => buildProductionMatrixCells(aggregate, processes), [aggregate, processes]);
  const rows = useMemo(() => [...new Set(cells.map((cell) => cell.episodeId))].sort((left, right) => episodeLabel(aggregate, left).localeCompare(episodeLabel(aggregate, right), "ko")), [aggregate, cells]);
  const columns = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    for (const cell of cells) {
      const key = productionProcessKey(cell.process);
      if (!map.has(key)) map.set(key, { key, label: cell.process.label });
    }
    return [...map.values()];
  }, [cells]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<BulkStatus>("in-progress");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const editable = canEdit && !isDemo && Boolean(execute);

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const selectAll = () => setSelected((current) => current.size === cells.length ? new Set() : new Set(cells.map((cell) => cell.key)));

  const apply = async () => {
    if (!editable || !execute || selected.size === 0 || busy) return;
    const dueAt = dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : undefined;
    const updates = buildProductionMatrixTaskUpdates({
      aggregate,
      cells,
      selectedKeys: selected,
      assignmentId: assignmentId || undefined,
      dueAt,
      status,
      idFactory: () => newProductionMutationId(),
      now: new Date().toISOString(),
    });
    if (!updates.length) return;
    setBusy(true);
    setNotice("");
    try {
      await execute({
        type: "upsert-task-batch",
        tasks: updates,
        expectedTasks: cells.filter((cell) => selected.has(cell.key) && cell.task).map((cell) => cell.task!),
      }, `${updates.length}개 회차·공정 업무를 일괄 업데이트했습니다.`);
      setSelected(new Set());
      setNotice(`${updates.length}개 셀의 담당자·기한·상태를 저장했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "회차·공정 업무를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!cells.length) return null;

  return <section className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="production-matrix-title" data-production-process-matrix="">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">EPISODE × PROCESS MATRIX</p><h2 id="production-matrix-title" className="mt-2 text-xl font-black text-fg">회차와 공정을 한 표에서 운영합니다</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">각 셀에서 담당자·기한·HEAD·FINAL·필수 수정을 확인하고, 여러 셀을 선택해 실제 Production 업무를 일괄 갱신합니다.</p></div>
      <button type="button" onClick={selectAll} className={buttonClass({ variant: "outline", size: "sm" })}>{selected.size === cells.length ? <CheckSquare2 className="size-4" aria-hidden="true" /> : <Square className="size-4" aria-hidden="true" />} {selected.size === cells.length ? "전체 해제" : "전체 선택"}</button>
    </div>

    <div className="mt-5 space-y-3 sm:hidden" aria-label="회차별 공정 운영 카드">
      {rows.map((episodeId) => <section key={episodeId ?? "project"} className="rounded-2xl border border-line bg-panel p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black text-fg">{episodeLabel(aggregate, episodeId)}</h3>
          <span className="text-[0.6875rem] font-bold text-fg-3">{cells.filter((cell) => cell.episodeId === episodeId).length}개 공정</span>
        </div>
        <div className="mt-3 space-y-2">
          {cells.filter((cell) => cell.episodeId === episodeId).map((cell) => {
            const attention = productionManuscriptAttention(cell.process);
            return <article key={cell.key} className={cn("rounded-xl border p-3", cellTone(cell))}>
              <div className="flex items-start gap-2">
                <button type="button" aria-pressed={selected.has(cell.key)} onClick={() => toggle(cell.key)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  {selected.has(cell.key) ? <CheckSquare2 className="size-5 text-accent" aria-hidden="true" /> : <Square className="size-5" aria-hidden="true" />}
                  <span className="sr-only">{cell.process.artifact.title} 선택</span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-fg">{cell.process.artifact.title}</p>
                  <p className="mt-1 text-[0.625rem] text-fg-3">HEAD {cell.process.headRevision?.id.slice(0, 10) ?? "없음"} · FINAL {cell.process.approvedRevision?.id.slice(0, 10) ?? "미지정"}</p>
                  <p className="mt-2 text-xs text-fg-2">담당 {cell.assigneeNames.join(", ") || "미배정"} · 검수 {cell.process.openReviewCount}건 · 필수 {cell.process.openRequiredFeedbackCount}</p>
                </div>
              </div>
              <button type="button" onClick={() => onOpenProcess(cell.process, attention.recommendedView)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:bg-raised">
                <span>{attention.actionLabel}</span><ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </article>;
          })}
        </div>
      </section>)}
    </div>

    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Wide matrix needs keyboard scrolling. */}
    <div className="mt-5 hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-line [contain:inline-size] sm:block" role="region" aria-label="회차별 공정 운영 표" tabIndex={0}>
      <table className="min-w-[60rem] border-collapse text-left text-xs">
        <caption className="sr-only">행은 회차, 열은 제작 공정입니다. 각 셀에서 현재 버전과 업무 상태를 확인합니다.</caption>
        <thead><tr className="bg-panel"><th scope="col" className="sticky left-0 z-20 min-w-48 border-b border-r border-line bg-panel p-3 font-black text-fg">회차</th>{columns.map((column) => <th key={column.key} scope="col" className="min-w-56 border-b border-line p-3 font-black text-fg">{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((episodeId) => <tr key={episodeId ?? "project"} className="align-top"><th scope="row" className="sticky left-0 z-10 border-r border-t border-line bg-card p-3"><p className="font-black text-fg">{episodeLabel(aggregate, episodeId)}</p><p className="mt-1 text-[0.625rem] text-fg-3">{cells.filter((cell) => cell.episodeId === episodeId).length}개 공정</p></th>{columns.map((column) => {
          const matching = cells.filter((cell) => cell.episodeId === episodeId && productionProcessKey(cell.process) === column.key);
          const cell = matching[0] ?? null;
          if (!cell) return <td key={column.key} className="border-t border-line bg-panel/20 p-3 text-fg-3">—</td>;
          const attention = productionManuscriptAttention(cell.process);
          return <td key={column.key} className="border-t border-line p-2"><article className={cn("rounded-xl border p-3", cellTone(cell))}>
            <div className="flex items-start gap-2"><button type="button" aria-pressed={selected.has(cell.key)} onClick={() => toggle(cell.key)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{selected.has(cell.key) ? <CheckSquare2 className="size-5 text-accent" aria-hidden="true" /> : <Square className="size-5" aria-hidden="true" />}<span className="sr-only">{cell.process.artifact.title} 선택</span></button><div className="min-w-0 flex-1"><p className="truncate font-black text-fg">{cell.process.artifact.title}</p><p className="mt-1 text-[0.625rem] text-fg-3">HEAD {cell.process.headRevision?.id.slice(0, 10) ?? "없음"} · FINAL {cell.process.approvedRevision?.id.slice(0, 10) ?? "미지정"}</p></div></div>
            <dl className="mt-3 grid gap-1.5"><div className="flex justify-between gap-2"><dt className="text-fg-3">담당</dt><dd className="truncate font-bold text-fg-2">{cell.assigneeNames.join(", ") || "미배정"}</dd></div><div className="flex justify-between gap-2"><dt className="text-fg-3">기한</dt><dd className="font-bold text-fg-2">{cell.task?.dueAt ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(cell.task.dueAt)) : "미정"}</dd></div><div className="flex justify-between gap-2"><dt className="text-fg-3">검수</dt><dd className="font-bold text-fg-2">{cell.process.openReviewCount}건 · 필수 {cell.process.openRequiredFeedbackCount}</dd></div></dl>
            <button type="button" onClick={() => onOpenProcess(cell.process, attention.recommendedView)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:bg-raised"><span>{attention.actionLabel}</span><ChevronRight className="size-4" aria-hidden="true" /></button>
            {matching.length > 1 ? <p className="mt-2 text-[0.625rem] text-fg-3">같은 공정 원고 {matching.length - 1}개 추가</p> : null}
          </article></td>;
        })}</tr>)}</tbody>
      </table>
    </div>

    <div className="mt-4 rounded-2xl border border-line bg-panel p-4" aria-label="선택 공정 일괄 변경">
      <div className="flex flex-wrap items-center gap-2"><Workflow className="size-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-black text-fg">선택 {selected.size}개 일괄 변경</h3>{!editable ? <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.625rem] font-bold text-fg-3">{isDemo ? "데모에서는 읽기 전용" : "편집 권한 필요"}</span> : null}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto] xl:items-end">
        <label className="text-xs font-bold text-fg-2"><UserRound className="mr-1 inline size-4" aria-hidden="true" /> 담당자
          <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"><option value="">변경하지 않음</option>{aggregate.assignments.filter((assignment) => assignment.status === "active" || assignment.status === "onboarding").map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(aggregate, assignment.id)} · {assignment.roleType}</option>)}</select>
        </label>
        <label className="text-xs font-bold text-fg-2"><CalendarClock className="mr-1 inline size-4" aria-hidden="true" /> 기한
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-bold text-fg-2">상태
          <select value={status} onChange={(event) => setStatus(event.target.value as BulkStatus)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <button type="button" disabled={!editable || selected.size === 0 || busy} onClick={() => void apply()} className={buttonClass({ size: "sm", className: "min-h-11" })}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />} 일괄 저장</button>
      </div>
      {notice ? <p className="mt-3 text-xs text-fg-2" role="status">{notice}</p> : null}
    </div>
  </section>;
}
