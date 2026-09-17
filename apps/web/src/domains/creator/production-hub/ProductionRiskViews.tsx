import { useRef, type KeyboardEvent } from "react";

import type {
  ProductionProjectAggregate,
  ProductionRisk,
  ProductionRiskSeverity,
} from "@toonspectrum/core/production";

import { cn } from "@/shared/lib/utils";

import type { ProductionRiskMatrixCell, ProductionRiskViewMode } from "./production-risk-url-state";

export type { ProductionRiskViewMode } from "./production-risk-url-state";

const VIEW_LABELS: Readonly<Record<ProductionRiskViewMode, string>> = Object.freeze({
  priority: "우선순위",
  episode: "회차별",
  matrix: "위험 매트릭스",
});

const SEVERITY_LABELS: Readonly<Record<ProductionRiskSeverity, string>> = Object.freeze({
  watch: "관찰",
  warning: "주의",
  high: "높음",
  critical: "긴급",
});

const PROBABILITY_LEVELS = [1, 2, 3, 4, 5] as const;
const IMPACT_LEVELS = [5, 4, 3, 2, 1] as const;

function assignmentLabel(aggregate: ProductionProjectAggregate, assignmentId: string | null): string {
  if (!assignmentId) return "담당자 미정";
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignment?.publicCreditRole ?? assignmentId;
}

function productionEpisodeLabel(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): string {
  const plan = aggregate.episodePlans.find((entry) => entry.episodeId === episodeId);
  if (plan) return `${plan.episodeNumber}화 · ${plan.title}`;
  const index = aggregate.episodes.findIndex((entry) => entry.episodeId === episodeId);
  return index >= 0 ? `${index + 1}화 · ${episodeId}` : episodeId;
}

export function ProductionRiskViewSwitcher({
  value,
  onChange,
}: {
  readonly value: ProductionRiskViewMode;
  readonly onChange: (value: ProductionRiskViewMode) => void;
}) {
  return (
    <div
      className="flex w-full gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 sm:w-auto"
      role="tablist"
      aria-label="위험 보기 방식"
    >
      {(Object.keys(VIEW_LABELS) as ProductionRiskViewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition-colors",
            value === mode ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

interface RiskViewProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly risks: readonly ProductionRisk[];
  readonly selectedRiskId: string | null;
  readonly onSelect: (riskId: string) => void;
}

interface EpisodeRiskGroup {
  readonly id: string;
  readonly label: string;
  readonly risks: readonly ProductionRisk[];
  readonly order: number;
}

function buildEpisodeGroups(
  aggregate: ProductionProjectAggregate,
  risks: readonly ProductionRisk[],
): readonly EpisodeRiskGroup[] {
  const grouped = new Map<string, ProductionRisk[]>();
  for (const risk of risks) {
    const episodeIds = risk.affectedEpisodeIds.length > 0
      ? [...new Set(risk.affectedEpisodeIds)]
      : ["project"];
    for (const episodeId of episodeIds) {
      const current = grouped.get(episodeId) ?? [];
      current.push(risk);
      grouped.set(episodeId, current);
    }
  }

  const planOrder = new Map(aggregate.episodePlans
    .slice()
    .sort((left, right) => left.episodeNumber - right.episodeNumber)
    .map((plan, index) => [plan.episodeId, index]));

  return Object.freeze([...grouped.entries()]
    .map(([id, groupRisks]): EpisodeRiskGroup => ({
      id,
      label: id === "project" ? "프로젝트 공통" : productionEpisodeLabel(aggregate, id),
      risks: Object.freeze(groupRisks.slice().sort((left, right) =>
        right.priorityScore - left.priorityScore || right.updatedAt.localeCompare(left.updatedAt))),
      order: id === "project" ? -1 : planOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "ko-KR")));
}

export function ProductionRiskEpisodeView({
  aggregate,
  risks,
  selectedRiskId,
  onSelect,
}: RiskViewProps) {
  const groups = buildEpisodeGroups(aggregate, risks);
  if (groups.length === 0) return null;

  return (
    <div className="space-y-3" data-risk-view="episode">
      {groups.map((group) => (
        <section key={group.id} className="rounded-2xl border border-line bg-panel p-3">
          <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
            <div>
              <h3 className="text-xs font-black text-fg">{group.label}</h3>
              <p className="mt-0.5 text-[0.6875rem] text-fg-3">영향 위험 {group.risks.length}건</p>
            </div>
            <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.6875rem] font-black text-fg-2">
              최고 {Math.max(...group.risks.map((risk) => Math.round(risk.priorityScore)))}점
            </span>
          </header>
          <div className="mt-2 space-y-2">
            {group.risks.map((risk) => (
              <button
                key={`${group.id}:${risk.id}`}
                type="button"
                aria-pressed={selectedRiskId === risk.id}
                onClick={() => onSelect(risk.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedRiskId === risk.id
                    ? "border-accent/50 bg-accent-soft"
                    : "border-line bg-card hover:border-accent/35 hover:bg-raised",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-fg">{risk.title}</p>
                    <p className="mt-1 truncate text-[0.6875rem] text-fg-3">
                      {SEVERITY_LABELS[risk.severity]} · {assignmentLabel(aggregate, risk.ownerAssignmentId)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-black text-fg">{Math.round(risk.priorityScore)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function matrixCellClass(probability: number, impact: number): string {
  const exposure = probability * impact;
  if (exposure >= 20) return "border-bad/40 bg-bad/10";
  if (exposure >= 12) return "border-warn/40 bg-warn/10";
  if (exposure >= 6) return "border-accent/35 bg-accent-soft";
  return "border-line bg-panel";
}

interface MatrixRiskViewProps extends RiskViewProps {
  readonly selectedCell: ProductionRiskMatrixCell | null;
  readonly onSelectCell: (cell: ProductionRiskMatrixCell | null) => void;
}

function isSameMatrixCell(
  left: ProductionRiskMatrixCell | null,
  right: ProductionRiskMatrixCell,
): boolean {
  return left?.probability === right.probability && left.impact === right.impact;
}

export function ProductionRiskMatrixView({
  aggregate,
  risks,
  selectedRiskId,
  onSelect,
  selectedCell,
  onSelectCell,
}: MatrixRiskViewProps) {
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedCellRisks = selectedCell
    ? risks.filter((risk) => risk.probability === selectedCell.probability && risk.impact === selectedCell.impact)
    : [];

  const focusCell = (row: number, column: number) => {
    const nextRow = Math.max(0, Math.min(IMPACT_LEVELS.length - 1, row));
    const nextColumn = Math.max(0, Math.min(PROBABILITY_LEVELS.length - 1, column));
    cellRefs.current[nextRow * PROBABILITY_LEVELS.length + nextColumn]?.focus();
  };

  const onCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(row, column + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(row, column - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(row + 1, column);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(row - 1, column);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusCell(row, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusCell(row, PROBABILITY_LEVELS.length - 1);
    }
  };

  return (
    <div className="overflow-x-auto" data-risk-view="matrix">
      <div className="min-w-[46rem]">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-fg">확률 × 영향도 매트릭스</h3>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              셀을 선택하면 해당 조합만 상세 목록에 반영됩니다. 방향키로 셀을 이동할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-bold text-fg-3">
            {selectedCell ? (
              <>
                <span>P{selectedCell.probability} × I{selectedCell.impact} · {selectedCellRisks.length}건 선택</span>
                <button
                  type="button"
                  className="min-h-8 rounded-lg border border-line bg-panel px-2 text-fg-2 hover:border-accent/35 hover:text-fg"
                  onClick={() => onSelectCell(null)}
                >
                  셀 선택 해제
                </button>
              </>
            ) : <span>영향도 ↓ · 발생 가능성 →</span>}
          </div>
        </div>
        <div
          className="grid grid-cols-[5.5rem_repeat(5,minmax(7.5rem,1fr))] gap-2"
          role="grid"
          aria-label="위험 확률 영향도 매트릭스"
          aria-rowcount={6}
          aria-colcount={6}
        >
          <div
            role="columnheader"
            aria-rowindex={1}
            aria-colindex={1}
            className="flex items-center justify-center rounded-xl border border-line bg-raised p-2 text-center text-[0.6875rem] font-black text-fg-2"
          >
            영향 / 가능성
          </div>
          {PROBABILITY_LEVELS.map((probability) => (
            <div
              key={`probability:${probability}`}
              role="columnheader"
              aria-rowindex={1}
              aria-colindex={probability + 1}
              className="rounded-xl border border-line bg-raised p-2 text-center text-[0.6875rem] font-black text-fg-2"
            >
              P{probability}
            </div>
          ))}

          {IMPACT_LEVELS.flatMap((impact, row) => {
            const rowHeader = (
              <div
                key={`impact:${impact}`}
                role="rowheader"
                aria-rowindex={row + 2}
                aria-colindex={1}
                className="flex items-center justify-center rounded-xl border border-line bg-raised p-2 text-center text-[0.6875rem] font-black text-fg-2"
              >
                I{impact}<span className="ml-1 font-medium text-fg-3">영향</span>
              </div>
            );
            const cells = PROBABILITY_LEVELS.map((probability, column) => {
              const cell = { probability, impact } satisfies ProductionRiskMatrixCell;
              const cellRisks = risks.filter((risk) =>
                risk.probability === probability && risk.impact === impact);
              const selected = isSameMatrixCell(selectedCell, cell);
              const refIndex = row * PROBABILITY_LEVELS.length + column;
              return (
                <div
                  key={`${probability}:${impact}`}
                  role="gridcell"
                  aria-rowindex={row + 2}
                  aria-colindex={column + 2}
                  aria-selected={selected}
                  className={cn(
                    "min-h-36 rounded-xl border p-2 transition-colors",
                    matrixCellClass(probability, impact),
                    selected && "ring-2 ring-accent ring-offset-2 ring-offset-card",
                  )}
                >
                  <button
                    ref={(node) => { cellRefs.current[refIndex] = node; }}
                    type="button"
                    aria-label={`발생 가능성 ${probability}, 영향도 ${impact}, 위험 ${cellRisks.length}건`}
                    aria-pressed={selected}
                    onClick={() => onSelectCell(selected ? null : cell)}
                    onKeyDown={(event) => onCellKeyDown(event, row, column)}
                    className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-1.5 text-left outline-none hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="text-[0.625rem] font-bold text-fg-3">P{probability} × I{impact}</span>
                    <span className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[0.625rem] font-black",
                      selected ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg",
                    )}>
                      {cellRisks.length}
                    </span>
                  </button>
                  <div className="mt-1.5 space-y-1.5">
                    {cellRisks.slice(0, 3).map((risk) => (
                      <button
                        key={risk.id}
                        type="button"
                        aria-pressed={selectedRiskId === risk.id}
                        onClick={() => onSelect(risk.id)}
                        className={cn(
                          "w-full rounded-lg border px-2 py-1.5 text-left text-[0.6875rem] font-bold leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          selectedRiskId === risk.id
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-card text-fg hover:border-accent/40",
                        )}
                        title={`${risk.title} · ${assignmentLabel(aggregate, risk.ownerAssignmentId)}`}
                      >
                        <span className="line-clamp-2">{risk.title}</span>
                      </button>
                    ))}
                    {cellRisks.length > 3 ? (
                      <p className="text-center text-[0.625rem] font-bold text-fg-3">
                        외 {cellRisks.length - 3}건
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            });
            return [rowHeader, ...cells];
          })}
        </div>
      </div>
    </div>
  );
}
