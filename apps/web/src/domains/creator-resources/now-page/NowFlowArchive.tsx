import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Gauge,
  ListFilter,
  PackageSearch,
  PanelsTopLeft,
  Shuffle,
  Sparkles,
  Timer,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { NowState } from "../now";
import {
  ACTION_BUTTON,
  FLOW_LINK,
  type ArchiveEntry,
  type ArchiveFilterId,
} from "./config";

function CreationFlowNav({ progressPercent, nextStep }: { progressPercent: number; nextStep: string }) {
  return (
    <nav
      aria-label="오늘의 제작 흐름"
      className="sticky top-16 z-20 -mx-2 flex items-center gap-2 overflow-x-auto rounded-2xl border border-line bg-panel/95 p-2 backdrop-blur sm:mx-0"
    >
      <a className={FLOW_LINK} href="#daily-spark">
        <Sparkles size={14} aria-hidden="true" /> 브리프
      </a>
      <a className={FLOW_LINK} href="#session-plan">
        <Timer size={14} aria-hidden="true" /> 세션
      </a>
      <a className={FLOW_LINK} href="#directing-mode">
        <Compass size={14} aria-hidden="true" /> 연출
      </a>
      <a className={FLOW_LINK} href="#variation-lab">
        <Shuffle size={14} aria-hidden="true" /> 변주
      </a>
      <a className={FLOW_LINK} href="#scene-ingredients">
        <PackageSearch size={14} aria-hidden="true" /> 재료
      </a>
      <a className={FLOW_LINK} href="#storyboard">
        <PanelsTopLeft size={14} aria-hidden="true" /> 5컷
      </a>
      <a className={FLOW_LINK} href="#creation-loop">
        <Gauge size={14} aria-hidden="true" /> 제작
      </a>
      <span className="ml-auto hidden shrink-0 rounded-lg bg-raised px-3 py-2 text-xs font-semibold text-fg-2 lg:block">
        {progressPercent}% · 다음 {nextStep}
      </span>
    </nav>
  );
}

export function NowFlowArchive({
  archive,
  selectedOffset,
  state,
  progressPercent,
  nextStepLabel,
  archiveFilter,
  onArchiveFilterChange,
  onSelectOffset,
}: {
  archive: readonly ArchiveEntry[];
  selectedOffset: number;
  state: NowState;
  progressPercent: number;
  nextStepLabel: string;
  archiveFilter: ArchiveFilterId;
  onArchiveFilterChange: (filter: ArchiveFilterId) => void;
  onSelectOffset: (offset: number) => void;
}) {
  const savedInArchive = archive.filter(({ day }) => state.savedDates.includes(day.iso)).length;
  const completedInArchive = archive.filter(({ day }) => state.completedDates.includes(day.iso)).length;
  const visibleArchive = archive
    .map((entry, offset) => ({ ...entry, offset }))
    .filter(({ day }) => {
      if (archiveFilter === "saved") return state.savedDates.includes(day.iso);
      if (archiveFilter === "completed") return state.completedDates.includes(day.iso);
      return true;
    });

  return (
    <>
      <CreationFlowNav progressPercent={progressPercent} nextStep={nextStepLabel} />

      <section className="space-y-4" aria-labelledby="spark-archive-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              {archive.length}-DAY EDITORIAL ARCHIVE
            </p>
            <h2 id="spark-archive-title" className="mt-1 text-2xl font-bold text-fg">
              놓친 영감 다시 열기
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">
              {archive.length}개의 오리지널 테마를 한 주기 전체로 둘러보고, 저장·완주 상태로 좁혀서 작업을 이어갈 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ACTION_BUTTON}
              onClick={() => onSelectOffset((selectedOffset + 3) % archive.length)}
            >
              <Shuffle size={16} aria-hidden="true" /> 다른 영감
            </button>
            {selectedOffset > 0 && (
              <button type="button" className={ACTION_BUTTON} onClick={() => onSelectOffset(0)}>
                오늘로 돌아가기
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-fg-3">
            <ListFilter size={15} aria-hidden="true" /> 아카이브 보기
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="영감 아카이브 필터">
            {[
              { id: "all" as const, label: "전체", count: archive.length },
              { id: "saved" as const, label: "저장됨", count: savedInArchive },
              { id: "completed" as const, label: "완주", count: completedInArchive },
            ].map((filter) => {
              const active = archiveFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onArchiveFilterChange(filter.id)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-canvas text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  {filter.label}
                  <span className="font-display tabular-nums text-fg-3">{filter.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={selectedOffset >= archive.length - 1}
            onClick={() => onSelectOffset(Math.min(archive.length - 1, selectedOffset + 1))}
          >
            <ChevronLeft size={16} aria-hidden="true" /> 하루 전
          </button>
          <p className="text-center text-xs font-semibold text-fg-3">
            {selectedOffset === 0 ? "오늘의 발행본" : `${selectedOffset}일 전 발행본`}
          </p>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={selectedOffset === 0}
            onClick={() => onSelectOffset(Math.max(0, selectedOffset - 1))}
          >
            하루 후 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        {visibleArchive.length > 0 ? (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" aria-label={`최근 ${archive.length}일 영감`}>
            {visibleArchive.map(({ day, theme, offset }) => {
              const active = offset === selectedOffset;
              const completed = state.completedDates.includes(day.iso);
              const saved = state.savedDates.includes(day.iso);
              return (
                <button
                  key={day.iso}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${day.shortLabel} · ${theme.title}${completed ? " · 완주" : ""}${saved ? " · 저장됨" : ""}`}
                  onClick={() => onSelectOffset(offset)}
                  className={cn(
                    "relative min-h-36 min-w-52 overflow-hidden rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                    active ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/45",
                  )}
                >
                  <span className="absolute -right-1 -top-3 font-display text-6xl font-black tabular-nums text-fg/5" aria-hidden="true">
                    {String(day.index + 1).padStart(2, "0")}
                  </span>
                  <span className="relative flex items-center justify-between gap-2 text-xs font-bold text-fg-3">
                    {offset === 0 ? "오늘" : day.shortLabel}
                    <span className="flex items-center gap-1">
                      {saved && <Bookmark size={13} className="text-accent" fill="currentColor" aria-hidden="true" />}
                      {completed && <CheckCircle2 size={14} className="text-good" aria-hidden="true" />}
                    </span>
                  </span>
                  <span className="relative mt-6 block line-clamp-2 text-base font-bold leading-6 text-fg">{theme.title}</span>
                  <span className="relative mt-3 block text-xs leading-5 text-fg-3">#{theme.moods.join(" #")}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center">
            <p className="font-semibold text-fg">이 조건에 맞는 영감이 아직 없습니다.</p>
            <p className="mt-2 text-sm text-fg-3">오늘의 브리프를 저장하거나 5단계를 완주하면 여기에 모입니다.</p>
            <button type="button" className={`${ACTION_BUTTON} mt-4`} onClick={() => onArchiveFilterChange("all")}>
              전체 아카이브 보기
            </button>
          </div>
        )}
      </section>
    </>
  );
}
