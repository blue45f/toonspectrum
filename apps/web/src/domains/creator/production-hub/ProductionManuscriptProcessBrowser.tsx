import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  FileArchive,
  FileImage,
  FileText,
  GitCompareArrows,
  LayoutGrid,
  ListFilter,
  MessageSquare,
  Rows3,
  Search,
  SearchX,
} from "lucide-react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  productionManuscriptRevisionLabel,
  type ProductionManuscriptProcess,
} from "./production-manuscript-model";
import {
  productionManuscriptAttention,
  productionManuscriptFilterCounts,
  type ProductionManuscriptAttentionFilter,
  type ProductionManuscriptLayout,
  type ProductionManuscriptSort,
} from "./production-manuscript-ux";

interface Props {
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly visibleProcesses: readonly ProductionManuscriptProcess[];
  readonly selectedProcessId: string | null;
  readonly query: string;
  readonly filter: ProductionManuscriptAttentionFilter;
  readonly sort: ProductionManuscriptSort;
  readonly layout: ProductionManuscriptLayout;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly projectHref: string;
  readonly editorHref: string;
  readonly onQueryChange: (value: string) => void;
  readonly onFilterChange: (value: ProductionManuscriptAttentionFilter) => void;
  readonly onSortChange: (value: ProductionManuscriptSort) => void;
  readonly onLayoutChange: (value: ProductionManuscriptLayout) => void;
  readonly onOpenProcess: (
    process: ProductionManuscriptProcess,
    view: "versions" | "feedback",
  ) => void;
  readonly onReset: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ProcessKindIcon({ process, className }: {
  readonly process: ProductionManuscriptProcess;
  readonly className?: string;
}) {
  if (process.processType === "text") return <FileText className={className} aria-hidden="true" />;
  if (process.processType === "package") return <FileArchive className={className} aria-hidden="true" />;
  if (process.processType === "media") return <AudioLines className={className} aria-hidden="true" />;
  return <FileImage className={className} aria-hidden="true" />;
}

function attentionTone(
  level: ReturnType<typeof productionManuscriptAttention>["level"],
): string {
  if (level === "danger") return "border-bad/35 bg-bad/10 text-bad";
  if (level === "warning") return "border-warn/35 bg-warn/10 text-warn";
  if (level === "success") return "border-good/35 bg-good/10 text-good";
  return "border-line bg-raised text-fg-2";
}

function workHref(process: ProductionManuscriptProcess, projectHref: string, editorHref: string): string {
  return process.processType === "text"
    ? `${projectHref}/story?view=documents`
    : editorHref;
}
function FilterChip({ active, label, count, onClick }: {
  readonly active: boolean;
  readonly label: string;
  readonly count: number;
  readonly onClick: () => void;
}) {
  return <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
      active
        ? "border-accent bg-accent text-on-accent"
        : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
    )}
  >
    {label}
    <span className={cn(
      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.625rem]",
      active ? "bg-on-accent/15 text-on-accent" : "bg-raised text-fg-3",
    )}>
      {count}
    </span>
  </button>;
}

function ProcessCard({  process,
  selected,
  projectHref,
  editorHref,
  onOpenProcess,
}: {
  readonly process: ProductionManuscriptProcess;
  readonly selected: boolean;
  readonly projectHref: string;
  readonly editorHref: string;
  readonly onOpenProcess: Props["onOpenProcess"];
}) {
  const attention = productionManuscriptAttention(process);
  return <article
    id={`manuscript-process-${process.artifact.id}`}
    aria-current={selected ? "true" : undefined}
    className={cn(
      "rounded-2xl border bg-panel p-4 transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-accent/35",
      selected ? "border-accent/70 shadow-sm ring-1 ring-accent/15" : "border-line",
      !selected && attention.level === "danger" && "border-bad/35",
      !selected && attention.level === "warning" && "border-warn/30",
    )}
  >
    <div className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-accent">
        <ProcessKindIcon process={process} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-black text-fg">{process.artifact.title}</h3>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.625rem] font-bold text-fg-2">
            {process.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-fg-3">
          {process.artifact.scope.episodeId ?? "프로젝트 공통"}
          {" · 최근 "}{formatDate(process.latestActivityAt)}
        </p>
      </div>
      <span className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold",
        attentionTone(attention.level),
      )}>
        {attention.label}
      </span>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl border border-line bg-card p-2">
        <p className="text-lg font-black text-fg">{process.revisions.length}</p>
        <p className="text-[0.6875rem] text-fg-3">버전</p>
      </div>
      <div className="rounded-xl border border-line bg-card p-2">
        <p className="text-lg font-black text-fg">{process.openReviewCount}</p>
        <p className="text-[0.6875rem] text-fg-3">진행 검수</p>
      </div>
      <div className={cn(
        "rounded-xl border p-2",
        process.openRequiredFeedbackCount > 0 ? "border-bad/30 bg-bad/10" : "border-line bg-card",
      )}>
        <p className="text-lg font-black text-fg">{process.openRequiredFeedbackCount}</p>
        <p className="text-[0.6875rem] text-fg-3">필수 수정</p>
      </div>
    </div>
    {process.headRevision ? <div className="mt-3 rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-fg">
          현재 작업본 · {productionManuscriptRevisionLabel(process.headRevision.kind)}
        </p>
        <span className="font-mono text-[0.625rem] text-fg-3">{process.headRevision.id}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-2">
        {process.headRevision.message ?? "변경 설명 없음"}
      </p>
    </div> : null}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
      <button
        type="button"
        aria-label={process.artifact.title + " " + attention.actionLabel}
        onClick={() => onOpenProcess(process, attention.recommendedView)}
        className={buttonClass({
          variant: attention.level === "danger" ? "solid" : "outline",
          size: "sm",
        })}
      >
        {attention.recommendedView === "feedback"
          ? <MessageSquare className="size-4" aria-hidden="true" />
          : <GitCompareArrows className="size-4" aria-hidden="true" />}        {attention.actionLabel}
      </button>
      <Link
        to={workHref(process, projectHref, editorHref)}
        aria-label={process.artifact.title + " 작업 열기"}
        className={buttonClass({ size: "sm" })}
      >
        작업 열기 <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  </article>;
}

function ProcessMatrix({ processes, selectedProcessId, projectHref, editorHref, onOpenProcess }: {
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly selectedProcessId: string | null;
  readonly projectHref: string;
  readonly editorHref: string;
  readonly onOpenProcess: Props["onOpenProcess"];
}) {
  return <div
    className="overflow-x-auto rounded-2xl border border-line"
    role="region"
    aria-label="공정 한눈 보기 표"
  >
    <table className="w-full min-w-[58rem] border-collapse text-left text-xs">
      <caption className="sr-only">
        공정별 현재 작업본, 최종본, 진행 검수와 필수 수정 상태
      </caption>
      <thead className="sticky top-0 z-10 bg-raised text-fg-2">
        <tr>
          <th scope="col" className="sticky left-0 z-20 border-r border-line bg-raised px-4 py-3 font-black">공정·원고</th>
          <th scope="col" className="px-3 py-3 font-black">현재 작업본</th>
          <th scope="col" className="px-3 py-3 font-black">최종본</th>
          <th scope="col" className="px-3 py-3 text-center font-black">검수</th>
          <th scope="col" className="px-3 py-3 text-center font-black">필수 수정</th>
          <th scope="col" className="px-4 py-3 text-right font-black">다음 행동</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line bg-card">
        {processes.map((process) => {
          const attention = productionManuscriptAttention(process);
          const selected = selectedProcessId === process.artifact.id;
          return <tr
            key={process.artifact.id}
            id={`manuscript-process-${process.artifact.id}`}
            aria-current={selected ? "true" : undefined}
            className={cn(selected && "bg-accent-soft/35")}
          >
            <td className={cn(
              "sticky left-0 z-[5] border-r border-line px-4 py-3",
              selected ? "bg-accent-soft" : "bg-card",
            )}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-accent">
                  <ProcessKindIcon process={process} className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black text-fg">{process.artifact.title}</p>
                  <p className="mt-0.5 text-fg-3">
                    {process.artifact.scope.episodeId ?? "프로젝트 공통"} · {process.label}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-3 py-3 text-fg-2">
              {process.headRevision ? <>
                <p className="font-bold text-fg">
                  {productionManuscriptRevisionLabel(process.headRevision.kind)}
                </p>
                <p className="mt-0.5 text-fg-3">{formatDate(process.headRevision.createdAt)}</p>
              </> : "—"}
            </td>
            <td className="px-3 py-3">
              {process.approvedRevision ? <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2 py-1 font-bold text-good">
                <BadgeCheck className="size-3.5" aria-hidden="true" /> 확정
              </span> : <span className="font-bold text-fg-3">미지정</span>}
            </td>
            <td className="px-3 py-3 text-center font-black text-fg">{process.openReviewCount}</td>
            <td className={cn(
              "px-3 py-3 text-center font-black",
              process.openRequiredFeedbackCount > 0 ? "text-bad" : "text-fg-3",
            )}>
              {process.openRequiredFeedbackCount}
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  aria-label={process.artifact.title + " " + attention.actionLabel}
                  onClick={() => onOpenProcess(process, attention.recommendedView)}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  {attention.actionLabel}
                </button>
                <Link
                  to={workHref(process, projectHref, editorHref)}
                  aria-label={process.artifact.title + " 작업 열기"}
                  className={buttonClass({ size: "sm" })}
                >
                  열기
                </Link>
              </div>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export function ProductionManuscriptProcessBrowser({
  processes,
  visibleProcesses,
  selectedProcessId,
  query,
  filter,
  sort,
  layout,
  searchRef,
  projectHref,
  editorHref,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onLayoutChange,
  onOpenProcess,
  onReset,
}: Props) {
  const counts = productionManuscriptFilterCounts(processes);
  const filters = [
    { id: "all" as const, label: "전체", count: counts.all },
    { id: "required-feedback" as const, label: "필수 수정", count: counts.requiredFeedback },
    { id: "in-review" as const, label: "검수 중", count: counts.inReview },
    { id: "missing-final" as const, label: "최종본 필요", count: counts.missingFinal },
    { id: "approved" as const, label: "최종본 확정", count: counts.approved },
  ];
  const filtered = Boolean(query.trim()) || filter !== "all";
  return <section
    className="rounded-3xl border border-line bg-card p-4 sm:p-6"
    aria-labelledby="manuscript-process-list-title"
  >
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
          <ListFilter className="size-4" aria-hidden="true" /> PROCESS EXPLORER
        </p>
        <h2 id="manuscript-process-list-title" className="mt-2 text-xl font-black text-fg">
          공정과 원고
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">
          먼저 해결할 항목을 위로 모으고, 카드 또는 한눈 보기로 현재 작업본·최종본·검수를 비교합니다.
        </p>
      </div>
      <Link
        to={`${projectHref}/production?view=documents`}
        className={buttonClass({ variant: "outline", size: "sm" })}
      >
        공정·문서 관리 <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>

    <div className="mt-5 rounded-2xl border border-line bg-panel/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">원고·공정 검색</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="원고명, 공정, 회차 검색  /"
            className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2">
            정렬
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as ProductionManuscriptSort)}              className="bg-transparent text-fg outline-none"
            >
              <option value="attention">확인 필요순</option>
              <option value="recent">최근 활동순</option>
              <option value="process">공정순</option>
            </select>
          </label>
          <div className="inline-flex rounded-xl border border-line bg-card p-1" role="group" aria-label="원고 표시 방식">
            <button
              type="button"
              aria-pressed={layout === "cards"}
              aria-label="카드 보기"
              title="카드 보기"
              onClick={() => onLayoutChange("cards")}
              className={cn(
                "flex min-h-9 min-w-9 items-center justify-center rounded-lg",
                layout === "cards" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised",
              )}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={layout === "matrix"}
              aria-label="한눈 보기"
              title="한눈 보기 (G)"
              onClick={() => onLayoutChange("matrix")}
              className={cn(
                "flex min-h-9 min-w-9 items-center justify-center rounded-lg",
                layout === "matrix" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised",              )}
            >
              <Rows3 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="원고 상태 필터">
        {filters.map((item) => <FilterChip
          key={item.id}
          active={filter === item.id}
          label={item.label}
          count={item.count}
          onClick={() => onFilterChange(item.id)}
        />)}
      </div>
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-3" aria-live="polite">
      <p>
        {visibleProcesses.length}개 표시
        {filtered ? ` · 전체 ${processes.length}개 중 필터됨` : ""}
      </p>
      {filtered ? <button type="button" onClick={onReset} className="font-bold text-accent hover:underline">
        검색·필터 초기화
      </button> : null}
    </div>

    {visibleProcesses.length > 0 ? (
      layout === "matrix" ? <div className="mt-3">
        <p className="mb-2 text-[0.6875rem] text-fg-3 sm:hidden">
          표를 좌우로 밀어 현재 작업본과 최종본을 함께 확인하세요.
        </p>
        <ProcessMatrix
          processes={visibleProcesses}
          selectedProcessId={selectedProcessId}
          projectHref={projectHref}
          editorHref={editorHref}
          onOpenProcess={onOpenProcess}
        />
      </div> : <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {visibleProcesses.map((process) => <ProcessCard
          key={process.artifact.id}
          process={process}
          selected={selectedProcessId === process.artifact.id}
          projectHref={projectHref}
          editorHref={editorHref}
          onOpenProcess={onOpenProcess}
        />)}
      </div>
    ) : <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
      <SearchX className="mx-auto size-8 text-fg-3" aria-hidden="true" />
      <p className="mt-3 font-black text-fg">검색 조건에 맞는 원고가 없습니다</p>
      <p className="mt-1 text-sm text-fg-2">
        회차·검색어·상태 필터를 바꾸거나 전체 원고를 다시 표시하세요.
      </p>
      <button
        type="button"
        onClick={onReset}        className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
      >
        검색·필터 초기화
      </button>
    </div>}
  </section>;
}
