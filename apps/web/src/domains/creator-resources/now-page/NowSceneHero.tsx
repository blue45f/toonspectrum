import {
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Gauge,
  Link2,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

import type { DailyTheme, DirectingMode, KstDay } from "../now";
import { ACTION_BUTTON, PRIMARY_BUTTON } from "./config";

type CopyStatus = "idle" | "copied" | "error";

function ScenePoster({
  theme,
  dayLabel,
  issueNumber,
  mode,
}: {
  theme: DailyTheme;
  dayLabel: string;
  issueNumber: number;
  mode: DirectingMode;
}) {
  return (
    <aside
      className="relative min-h-[25rem] overflow-hidden rounded-3xl border border-line bg-canvas p-5 sm:p-6"
      aria-label="오늘의 장면 DNA 포스터"
    >
      <span className="absolute -right-16 -top-16 size-52 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
      <span className="absolute -bottom-20 -left-10 size-56 rounded-full bg-good/10 blur-3xl" aria-hidden="true" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-line" aria-hidden="true" />
      <span className="absolute inset-y-0 left-1/3 w-px bg-line/70" aria-hidden="true" />

      <div className="relative flex min-h-[22rem] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold tracking-[0.16em] text-accent">SCENE DNA / DAILY ISSUE</p>
            <p className="mt-2 text-xs text-fg-3">{dayLabel}</p>
          </div>
          <span className="font-display text-5xl font-black tabular-nums tracking-tight text-fg">
            {String(issueNumber).padStart(2, "0")}
          </span>
        </div>

        <div className="max-w-md py-10">
          <p className="font-serif text-2xl font-bold leading-snug text-fg sm:text-3xl">{theme.title}</p>
          <div className="mt-5 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <span className="w-[42%] bg-accent" />
            <span className="w-[28%] bg-cool" />
            <span className="w-[18%] bg-good" />
            <span className="w-[12%] bg-warn" />
          </div>
          <p className="mt-4 text-sm leading-7 text-fg-2">{theme.tagline}</p>
        </div>

        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <span className="text-[0.68rem] font-bold tracking-[0.14em] text-fg-3">KEY OBJECT</span>
            <p className="mt-1 text-sm font-semibold leading-6 text-fg">{theme.object}</p>
          </div>
          <div>
            <span className="text-[0.68rem] font-bold tracking-[0.14em] text-fg-3">DIRECTING MODE</span>
            <p className="mt-1 text-sm font-semibold leading-6 text-fg">
              {mode.label} · {mode.lens}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function NowSceneHero({
  selectedOffset,
  day,
  theme,
  mode,
  streak,
  completedThisWeek,
  savedInArchive,
  progressPercent,
  nextStepLabel,
  isSaved,
  briefCopyStatus,
  linkCopyStatus,
  onCopyBrief,
  onToggleSaved,
  onCopyShareLink,
}: {
  selectedOffset: number;
  day: KstDay;
  theme: DailyTheme;
  mode: DirectingMode;
  streak: number;
  completedThisWeek: number;
  savedInArchive: number;
  progressPercent: number;
  nextStepLabel: string;
  isSaved: boolean;
  briefCopyStatus: CopyStatus;
  linkCopyStatus: CopyStatus;
  onCopyBrief: () => void;
  onToggleSaved: () => void;
  onCopyShareLink: () => void;
}) {
  return (
    <section
      id="daily-spark"
      className="relative scroll-mt-28 overflow-hidden rounded-3xl border border-line bg-panel p-5 sm:p-8 lg:p-10"
    >
      <span className="absolute -left-20 top-1/2 size-64 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(25rem,0.92fr)] xl:items-stretch">
        <div className="flex flex-col justify-center">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent">
            <Sparkles size={15} aria-hidden="true" />
            {selectedOffset === 0 ? "TODAY’S SPARK" : "SPARK ARCHIVE"} · {day.label}
            <span className="rounded-full border border-good/30 bg-good/10 px-2 py-1 text-[0.68rem] font-bold text-good">
              HUMAN-CURATED · ORIGINAL
            </span>
          </div>
          <h2 className="mt-5 max-w-4xl text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight text-fg sm:text-6xl">
            {theme.title}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-fg-2 sm:text-lg">{theme.tagline}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {theme.moods.map((mood) => (
              <Link
                key={mood}
                className="rounded-full border border-line bg-canvas/70 px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                to={`/research/assets?q=${encodeURIComponent(mood)}&page=1`}
              >
                #{mood}
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link className={PRIMARY_BUTTON} to="/studio" reloadDocument>
              Studio에서 시작 <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <a className={ACTION_BUTTON} href="#creation-loop">
              <Target size={16} aria-hidden="true" /> 다음 단계 · {nextStepLabel}
            </a>
            <button type="button" className={ACTION_BUTTON} onClick={onCopyBrief}>
              {briefCopyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {briefCopyStatus === "copied" ? "브리프 복사됨" : "브리프 복사"}
            </button>
            <button
              type="button"
              className={cn(ACTION_BUTTON, isSaved && "border-accent/45 bg-accent-soft text-accent")}
              aria-pressed={isSaved}
              onClick={onToggleSaved}
            >
              <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />
              {isSaved ? "영감 저장 해제" : "영감 저장"}
            </button>
            <button type="button" className={ACTION_BUTTON} onClick={onCopyShareLink}>
              {linkCopyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {linkCopyStatus === "copied" ? "링크 복사됨" : "이 영감 링크 복사"}
            </button>
          </div>
          {briefCopyStatus === "copied" && (
            <span className="sr-only" role="status">
              브리프가 클립보드에 복사되었습니다.
            </span>
          )}
          {linkCopyStatus === "copied" && (
            <span className="sr-only" role="status">
              날짜가 포함된 영감 링크가 클립보드에 복사되었습니다.
            </span>
          )}
          {(briefCopyStatus === "error" || linkCopyStatus === "error") && (
            <p className="mt-3 text-sm font-semibold text-bad" role="alert">
              클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.
            </p>
          )}
        </div>

        <ScenePoster theme={theme} dayLabel={day.shortLabel} issueNumber={day.index + 1} mode={mode} />
      </div>

      <div
        className="relative mt-8 grid grid-cols-2 border-t border-line pt-6 sm:grid-cols-4"
        aria-label="이번 주 창작 페이스"
      >
        <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
          <Flame size={18} className="text-warn" aria-hidden="true" />
          <strong className="mt-2 block font-display text-2xl tabular-nums text-fg">{streak}일</strong>
          <span className="text-xs text-fg-3">연속 완주</span>
        </div>
        <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
          <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
          <strong className="mt-2 block font-display text-2xl tabular-nums text-fg">{completedThisWeek}/7</strong>
          <span className="text-xs text-fg-3">최근 7일 완주</span>
        </div>
        <div className="border-r border-line p-3">
          <Bookmark size={18} className="text-accent" aria-hidden="true" />
          <strong className="mt-2 block font-display text-2xl tabular-nums text-fg">{savedInArchive}</strong>
          <span className="text-xs text-fg-3">저장한 영감</span>
        </div>
        <div className="p-3">
          <Gauge size={18} className="text-cool" aria-hidden="true" />
          <strong className="mt-2 block font-display text-2xl tabular-nums text-fg">{progressPercent}%</strong>
          <span className="text-xs text-fg-3">선택한 날 진행률</span>
        </div>
      </div>
    </section>
  );
}
