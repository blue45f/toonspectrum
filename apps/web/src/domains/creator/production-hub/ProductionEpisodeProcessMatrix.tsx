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
import { useCallback, useMemo, useRef, useState, type UIEvent as ReactUIEvent } from "react";

import type {
  ProductionProjectAggregate,
  ProductionTaskStatus,
} from "@toonstudio/core/production";

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
import {
  buildProductionCompareColumns,
  buildProductionProcessColumns,
  deriveProductionProcessRounds,
  filterProductionMatrixCellsByStageRules,
  productionStageDefaultAssignmentId,
  resolveProductionProcessStages,
  type ProductionProcessStageCustomization,
  type ProductionProcessStageCustomizationInput,
} from "./production-episode-process-matrix-model";

export type { ProductionProcessStageCustomization };
import { linkedReviewScroll } from "../virtual-space/studio-review-comparison-model";

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
  stageCustomizations,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly canEdit: boolean;
  readonly isDemo: boolean;
  readonly execute?: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly onOpenProcess: (process: ProductionManuscriptProcess, view: "versions" | "feedback" | "delivery") => void;
  /** C-6: 팀별 공정 커스텀 단계. 생략하면 기본 콘티→선화→채색→식자를 사용한다. */
  readonly stageCustomizations?: readonly ProductionProcessStageCustomizationInput[];
}) {
  const stages = useMemo(() => resolveProductionProcessStages(stageCustomizations), [stageCustomizations]);
  const cells = useMemo(() => filterProductionMatrixCellsByStageRules({
    aggregate,
    cells: buildProductionMatrixCells(aggregate, processes),
    stages,
  }), [aggregate, processes, stages]);
  const columns = useMemo(() => buildProductionProcessColumns({ cells, stages }), [cells, stages]);
  const rows = useMemo(() => [...new Set(cells.map((cell) => cell.episodeId))].sort((left, right) => episodeLabel(aggregate, left).localeCompare(episodeLabel(aggregate, right), "ko")), [aggregate, cells]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<BulkStatus>("in-progress");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // C-4: 차수 비교 모드. 공정×차수 독립 컬럼을 나란히 보여준다.
  const [compareMode, setCompareMode] = useState(false);
  const [compareScrollLinked, setCompareScrollLinked] = useState(true);
  const compareStripRef = useRef<HTMLDivElement>(null);
  const compareDetailRef = useRef<HTMLDivElement>(null);
  const compareSyncingRef = useRef(false);
  const editable = canEdit && !isDemo && Boolean(execute);

  const roundsByCellKey = useMemo(
    () => new Map(cells.map((cell) => [cell.key, deriveProductionProcessRounds(cell.process)] as const)),
    [cells],
  );
  const compareColumns = useMemo(
    () => (compareMode ? buildProductionCompareColumns({ cells, stages }) : []),
    [compareMode, cells, stages],
  );
  const compareGroups = useMemo(() => {
    const groups: { readonly processKey: string; readonly processLabel: string; readonly columns: typeof compareColumns }[] = [];
    for (const column of compareColumns) {
      const group = groups.find((candidate) => candidate.processKey === column.processKey);
      if (group) continue;
      groups.push({
        processKey: column.processKey,
        processLabel: column.processLabel,
        columns: compareColumns.filter((candidate) => candidate.processKey === column.processKey),
      });
    }
    return groups;
  }, [compareColumns]);

  // C-4: 요약 스트립과 상세 표의 가로 스크롤을 연결한다.
  // C-1 스냅샷 나란히 보기와 같은 studio-review-comparison-model의 상대 스크롤 로직을 재사용한다.
  const handleCompareScroll = useCallback((source: "strip" | "detail") =>
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!compareScrollLinked || compareSyncingRef.current) return;
      const from = source === "strip" ? compareStripRef.current : compareDetailRef.current;
      const to = source === "strip" ? compareDetailRef.current : compareStripRef.current;
      if (!from || !to) return;
      const next = linkedReviewScroll(
        event.currentTarget.scrollLeft,
        from.scrollWidth - from.clientWidth,
        to.scrollWidth - to.clientWidth,
      );
      if (next === null) return;
      compareSyncingRef.current = true;
      to.scrollLeft = next;
      requestAnimationFrame(() => { compareSyncingRef.current = false; });
    }, [compareScrollLinked]);

  const roundForCell = useCallback((cell: ProductionMatrixCell, roundLabel: string) =>
    roundsByCellKey.get(cell.key)?.find((round) => round.label === roundLabel) ?? null,
  [roundsByCellKey]);

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const selectAll = () => setSelected((current) => current.size === cells.length ? new Set() : new Set(cells.map((cell) => cell.key)));

  const apply = async () => {
    if (!editable || !execute || selected.size === 0 || busy) return;
    const dueAt = dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : undefined;
    const selectedCells = cells.filter((cell) => selected.has(cell.key));
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
    // C-6: 담당자를 고르지 않았을 때, 새로 만드는 업무에는 공정의 기본 담당자를 시드한다.
    // 이미 있는 업무는 사용자가 고른 값만 바꾼다.
    const seededUpdates = assignmentId ? updates : updates.map((task, index) => {
      const cell = selectedCells[index];
      if (!cell || cell.task) return task;
      const defaultAssignmentId = productionStageDefaultAssignmentId(stages, productionProcessKey(cell.process));
      return defaultAssignmentId ? { ...task, assignmentIds: [defaultAssignmentId] } : task;
    });
    setBusy(true);
    setNotice("");
    try {
      await execute({
        type: "upsert-task-batch",
        tasks: seededUpdates,
        expectedTasks: cells.filter((cell) => selected.has(cell.key) && cell.task).map((cell) => cell.task!),
      }, `${seededUpdates.length}개 회차·공정 업무를 일괄 업데이트했습니다.`);
      setSelected(new Set());
      setNotice(`${seededUpdates.length}개 셀의 담당자·기한·상태를 저장했습니다.`);
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
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="매트릭스 보기 방식" className="flex overflow-hidden rounded-xl border border-line">
          <button type="button" aria-pressed={!compareMode} onClick={() => setCompareMode(false)} className={cn("min-h-11 px-4 text-xs font-black", !compareMode ? "bg-accent text-white" : "bg-card text-fg-2 hover:bg-raised")}>매트릭스</button>
          <button type="button" aria-pressed={compareMode} onClick={() => setCompareMode(true)} className={cn("min-h-11 px-4 text-xs font-black", compareMode ? "bg-accent text-white" : "bg-card text-fg-2 hover:bg-raised")}>차수 비교</button>
        </div>
        {!compareMode ? <button type="button" onClick={selectAll} className={buttonClass({ variant: "outline", size: "sm" })}>{selected.size === cells.length ? <CheckSquare2 className="size-4" aria-hidden="true" /> : <Square className="size-4" aria-hidden="true" />} {selected.size === cells.length ? "전체 해제" : "전체 선택"}</button> : null}
      </div>
    </div>

    {compareMode ? <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs leading-5 text-fg-2">검수 제출 기준으로 나눈 차수(1차·2차·수정본)를 공정별로 나란히 비교합니다. 요약과 상세를 함께 스크롤할 수 있습니다.</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-fg-2"><input type="checkbox" checked={compareScrollLinked} onChange={(event) => setCompareScrollLinked(event.target.checked)} className="size-5 accent-accent" /> 스크롤 동기화</label>
      </div>
      {compareColumns.length === 0 ? <p className="mt-3 rounded-2xl border border-line bg-panel p-4 text-xs text-fg-2" role="status">비교할 차수 기록이 없습니다. 리비전이 쌓이면 1차·2차·수정본으로 나뉘어 표시됩니다.</p> : <>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Wide comparison strip needs keyboard scrolling. */}
        <div ref={compareStripRef} onScroll={handleCompareScroll("strip")} className="mt-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-line [contain:inline-size]" role="region" aria-label="차수 요약" tabIndex={0}>
          <table className="min-w-[60rem] border-collapse text-left text-xs">
            <caption className="sr-only">공정별 차수 제출 현황 요약입니다.</caption>
            <tbody><tr className="bg-panel">
              <th scope="row" className="sticky left-0 z-10 min-w-48 border-r border-line bg-panel p-3 font-black text-fg">차수 요약</th>
              {compareColumns.map((column) => {
                const holders = cells.filter((cell) => productionProcessKey(cell.process) === column.processKey && roundForCell(cell, column.roundLabel));
                const approvedCount = holders.filter((cell) => roundForCell(cell, column.roundLabel)?.approved).length;
                return <td key={`${column.processKey}:${column.roundLabel}`} className="min-w-36 border-line p-3 [&:not(:last-child)]:border-r">
                  <p className="font-black text-fg">{holders.length}개 회차 {column.roundKind === "submitted" ? "제출" : "진행 중"}</p>
                  {approvedCount > 0 ? <p className="mt-1 font-bold text-good">{approvedCount}개 승인</p> : null}
                </td>;
              })}
            </tr></tbody>
          </table>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Wide comparison table needs keyboard scrolling. */}
        <div ref={compareDetailRef} onScroll={handleCompareScroll("detail")} className="mt-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-line [contain:inline-size]" role="region" aria-label="차수별 상세 비교" tabIndex={0}>
          <table className="min-w-[60rem] border-collapse text-left text-xs">
            <caption className="sr-only">행은 회차, 열은 공정별 차수입니다. 각 차수 셀에서 제출일과 리비전 수를 확인합니다.</caption>
            <thead>
              <tr className="bg-panel">
                <th scope="col" rowSpan={2} className="sticky left-0 z-20 min-w-48 border-b border-r border-line bg-panel p-3 font-black text-fg">회차</th>
                {compareGroups.map((group) => <th key={group.processKey} scope="colgroup" colSpan={group.columns.length} className="border-b border-line p-3 text-center font-black text-fg [&:not(:last-child)]:border-r">{group.processLabel}</th>)}
              </tr>
              <tr className="bg-panel">
                {compareColumns.map((column) => <th key={`${column.processKey}:${column.roundLabel}`} scope="col" className="min-w-36 border-b border-line p-3 font-black text-fg-2 [&:not(:last-child)]:border-r">{column.roundLabel}</th>)}
              </tr>
            </thead>
            <tbody>{rows.map((episodeId) => <tr key={episodeId ?? "project"} className="align-top">
              <th scope="row" className="sticky left-0 z-10 border-r border-t border-line bg-card p-3"><p className="font-black text-fg">{episodeLabel(aggregate, episodeId)}</p></th>
              {compareColumns.map((column) => {
                const cell = cells.find((candidate) => candidate.episodeId === episodeId && productionProcessKey(candidate.process) === column.processKey) ?? null;
                const round = cell ? roundForCell(cell, column.roundLabel) : null;
                if (!cell || !round) return <td key={`${column.processKey}:${column.roundLabel}`} className="border-t border-line bg-panel/20 p-3 text-fg-3">—</td>;
                const attention = productionManuscriptAttention(cell.process);
                return <td key={`${column.processKey}:${column.roundLabel}`} className="border-t border-line p-2">
                  <button type="button" onClick={() => onOpenProcess(cell.process, attention.recommendedView)} className="block w-full rounded-xl border border-line bg-card p-3 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                    <p className="truncate text-[0.6875rem] font-black text-fg">{cell.process.artifact.title}</p>
                    <p className="mt-1 text-[0.625rem] text-fg-3">{round.kind === "submitted" && round.submittedAt ? `제출 ${new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(round.submittedAt))}` : "작업 중"} · 리비전 {round.revisionCount}개</p>
                    {round.approved ? <p className="mt-1 inline-block rounded-full bg-good/15 px-2 py-0.5 text-[0.625rem] font-black text-good">승인됨</p> : null}
                  </button>
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </div> : <>
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
    </>}
  </section>;
}
