import {
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Gauge,
  Link2,
  RotateCcw,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { DailyTheme, DirectingMode, KstDay } from "../now";
import { ACTION_BUTTON, PRIMARY_BUTTON } from "./config";

type CopyStatus = "idle" | "copied" | "error";

/** 머리말 보조 행동(복사·저장) — 모바일은 한 줄 3칸에 아이콘 위·라벨 아래, 넓은 화면은 가로 버튼. */
const QUICK_ACTION =
  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-line bg-canvas/60 px-1 py-2 text-sm font-bold text-fg transition-colors hover:border-accent/55 hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-4";

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
      className="relative hidden min-h-[22rem] overflow-hidden rounded-3xl border border-line bg-canvas p-6 lg:block"
      aria-label="오늘의 장면 DNA 포스터"
    >
      <span className="absolute -right-16 -top-16 size-52 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
      <span className="absolute -bottom-20 -left-10 size-56 rounded-full bg-good/10 blur-3xl" aria-hidden="true" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-line" aria-hidden="true" />
      <span className="absolute inset-y-0 left-1/3 w-px bg-line/70" aria-hidden="true" />

      <div className="relative flex h-full min-h-[19rem] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold tracking-[0.16em] text-accent">SCENE DNA / DAILY ISSUE</p>
            <p className="mt-2 text-xs text-fg-2">{dayLabel}</p>
          </div>
          <span className="font-display text-5xl font-black tabular-nums tracking-tight text-fg">
            {String(issueNumber).padStart(2, "0")}
          </span>
        </div>

        <div className="max-w-md py-8">
          <p className="font-serif text-2xl font-bold leading-snug text-fg xl:text-3xl">{theme.title}</p>
          <div className="mt-5 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <span className="w-[42%] bg-accent" />
            <span className="w-[28%] bg-cool" />
            <span className="w-[18%] bg-good" />
            <span className="w-[12%] bg-warn" />
          </div>
        </div>

        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-bold tracking-[0.14em] text-fg-3">KEY OBJECT</span>
            <p className="mt-1 text-sm font-semibold leading-6 text-fg">{theme.object}</p>
          </div>
          <div>
            <span className="text-xs font-bold tracking-[0.14em] text-fg-3">DIRECTING MODE</span>
            <p className="mt-1 text-sm font-semibold leading-6 text-fg">
              {mode.label} · {mode.lens}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface PaceStat {
  readonly icon: LucideIcon;
  readonly tone: string;
  readonly value: string;
  readonly label: string;
}

/**
 * 오늘의 영감 머리말 — 오늘의 장면(제목·한 줄 설명·분위기 태그), 바로 할 일 두 개(Studio 시작·다음 단계),
 * 보조 행동 세 개(브리프 복사·저장·링크 복사), 이번 주 페이스. 장면 DNA 포스터는 넓은 화면에서만 옆에 둔다.
 */
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
  onOpenNextStep,
  onBackToToday,
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
  /** "다음 단계" — 오늘 미션 탭의 진행률 카드로 이동한다. */
  onOpenNextStep: () => void;
  /** 지난 영감을 보고 있을 때만 전달 — 오늘 발행본으로 돌아간다. */
  onBackToToday?: () => void;
}) {
  const bt = useBilingual("NowSceneHero");
  const paceStats: readonly PaceStat[] = [
    { icon: Flame, tone: "text-warn", value: `${streak}${bt("일", "d")}`, label: bt("연속 완주", "Streak") },
    { icon: CheckCircle2, tone: "text-good", value: `${completedThisWeek}/7`, label: bt("최근 7일 완주", "Last 7 days") },
    { icon: Bookmark, tone: "text-accent", value: String(savedInArchive), label: bt("저장한 영감", "Saved") },
    { icon: Gauge, tone: "text-cool", value: `${progressPercent}%`, label: bt("선택한 날 진행률", "Day progress") },
  ];

  return (
    <section
      id="daily-spark"
      className="relative scroll-mt-28 overflow-hidden rounded-3xl border border-line bg-panel p-4 sm:p-8"
      aria-labelledby="daily-spark-title"
    >
      <span className="absolute -left-20 top-1/2 size-64 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent">
            <Sparkles size={15} aria-hidden="true" />
            {selectedOffset === 0 ? "TODAY’S SPARK" : "SPARK ARCHIVE"} · {day.label}
            <span className="rounded-full border border-good/40 bg-good/15 px-2 py-0.5 text-xs font-bold text-fg max-sm:hidden">
              HUMAN-CURATED · ORIGINAL
            </span>
          </div>
          <h2 id="daily-spark-title" className="mt-3 max-w-4xl text-balance break-keep font-display text-[1.75rem] font-bold leading-[1.15] tracking-tight text-fg sm:mt-4 sm:text-5xl">
            {theme.title}
          </h2>
          <p className="mt-2 max-w-2xl break-keep text-base leading-7 text-fg-2 sm:mt-3 sm:text-lg sm:leading-8">{theme.tagline}</p>
          <div className="mt-3 flex flex-wrap gap-2" aria-label={bt("분위기 태그로 레퍼런스 찾기", "Find references by mood")}>
            {theme.moods.map((mood) => (
              <Link
                key={mood}
                className="inline-flex min-h-11 items-center rounded-full border border-line bg-canvas/70 px-3.5 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                to={`/research/assets?q=${encodeURIComponent(mood)}&page=1`}
              >
                #{mood}
              </Link>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:mt-6 sm:flex sm:flex-wrap">
            <Link className={PRIMARY_BUTTON} to="/studio" reloadDocument>
              {bt("Studio에서 시작", "Start in Studio")} <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <button type="button" className={ACTION_BUTTON} onClick={onOpenNextStep}>
              <Target size={16} aria-hidden="true" /> {bt("다음 단계", "Next step")} · {nextStepLabel}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <button type="button" className={QUICK_ACTION} onClick={onCopyBrief}>
              {briefCopyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {briefCopyStatus === "copied" ? "브리프 복사됨" : "브리프 복사"}
            </button>
            {/* 좁은 화면 3칸에 맞춘 짧은 라벨 — 접근 가능한 이름은 보이는 라벨을 포함한 전체 문장. */}
            <button
              type="button"
              className={cn(QUICK_ACTION, isSaved && "border-accent/45 bg-accent-soft text-accent")}
              aria-pressed={isSaved}
              aria-label={isSaved ? "영감 저장 해제" : "영감 저장"}
              onClick={onToggleSaved}
            >
              <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />
              {isSaved ? "저장 해제" : "영감 저장"}
            </button>
            <button
              type="button"
              className={QUICK_ACTION}
              aria-label={linkCopyStatus === "copied" ? "링크 복사됨" : "이 영감 링크 복사"}
              onClick={onCopyShareLink}
            >
              {linkCopyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {linkCopyStatus === "copied" ? "링크 복사됨" : "링크 복사"}
            </button>
          </div>
          {onBackToToday ? (
            <button type="button" className={cn(ACTION_BUTTON, "mt-2 self-start")} onClick={onBackToToday}>
              <RotateCcw size={16} aria-hidden="true" /> 오늘로 돌아가기
            </button>
          ) : null}
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

      <dl className="relative mt-4 grid grid-cols-4 gap-1 border-t border-line pt-3 sm:mt-6 sm:pt-4" aria-label="이번 주 창작 페이스">
        {paceStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex min-w-0 flex-col items-start gap-1 px-1 sm:px-3">
              <Icon size={18} className={stat.tone} aria-hidden="true" />
              {/* 의미 순서(이름 → 값)는 지키고, 화면에서는 값을 이름 위에 크게 보여 준다. */}
              <dt className="order-3 break-keep text-xs leading-4 text-fg-2 sm:text-sm">{stat.label}</dt>
              <dd className="order-2 font-display text-lg font-bold tabular-nums text-fg sm:text-2xl">{stat.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
