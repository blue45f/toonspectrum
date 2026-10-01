import { ChevronRight, ExternalLink, Pause, Play, RotateCcw, TimerReset } from "lucide-react";

import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import {
  formatClock,
  paceDeltaSeconds,
  type DeckSectionPlan,
  type DeckSlide,
  type DeckTrackModel,
} from "./engineering-deck-model";
import { elapsedDeckSeconds, useNow, type DeckTimer } from "./use-engineering-deck";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckPresenter", ko, en);

/* ── 타이머·페이스 ─────────────────────────────────────────── */

/** 초마다 다시 그려지는 부분만 분리해 페이지 전체가 매초 렌더되지 않게 한다. */
export function DeckClock({
  timer,
  slide,
  section,
  totalSeconds,
  compact = false,
}: {
  readonly timer: DeckTimer;
  readonly slide: DeckSlide;
  readonly section: DeckSectionPlan | undefined;
  readonly totalSeconds: number;
  readonly compact?: boolean;
}) {
  useBilingualI18nRevision();
  const now = useNow(timer.running);
  const elapsed = elapsedDeckSeconds(timer, now);
  const pace = paceDeltaSeconds(elapsed, slide);
  const sectionEnd = section ? section.startSeconds + section.seconds : totalSeconds;
  const sectionRemaining = sectionEnd - elapsed;
  const paceLabel = pace > 0
    ? formatI18nTemplate(String(bi("예정보다 {value0} 늦음", "{value0} behind plan")), { value0: formatClock(pace) })
    : pace < 0
      ? formatI18nTemplate(String(bi("예정보다 {value0} 빠름", "{value0} ahead of plan")), { value0: formatClock(pace) })
      : bi("예정 시간 안", "On plan");

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 font-display text-sm font-bold tabular-nums" data-pace={pace > 0 ? "behind" : "ok"}>
        <span>{formatClock(elapsed)}</span>
        <span className="text-fg-3">/ {formatClock(totalSeconds)}</span>
      </span>
    );
  }

  return (
    <div className="grid gap-2" role="timer" aria-live="off" aria-label={bi("발표 경과 시간", "Talk elapsed time")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-4xl font-black tabular-nums tracking-tight text-fg">{formatClock(elapsed)}</p>
        <p className="font-display text-sm font-bold tabular-nums text-fg-3">/ {formatClock(totalSeconds)}</p>
      </div>
      <p
        className={cx(
          "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold",
          pace > 0 ? "text-warn" : "text-good",
        )}
      >
        <span aria-hidden="true">{pace > 0 ? "▲" : "●"}</span>
        <span>{paceLabel}</span>
        {section ? (
          <span className="text-fg-2">
            {sectionRemaining >= 0
              ? formatI18nTemplate(String(bi("이 구간 남은 시간 {value0}", "{value0} left in section")), { value0: formatClock(sectionRemaining) })
              : formatI18nTemplate(String(bi("이 구간 {value0} 초과", "Section over by {value0}")), { value0: formatClock(sectionRemaining) })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function DeckTimerControls({ timer }: { readonly timer: DeckTimer }) {
  useBilingualI18nRevision();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={timer.toggle}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {timer.running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {timer.running ? bi("타이머 일시정지", "Pause timer") : bi("타이머 시작", "Start timer")}
        <kbd className="deck-kbd" aria-hidden="true">T</kbd>
      </button>
      <button
        type="button"
        onClick={timer.reset}
        aria-label={bi("발표 타이머 초기화", "Reset presentation timer")}
        className="grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <RotateCcw size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── 구간 진행 띠 ──────────────────────────────────────────── */

export function DeckSectionStrip({
  model,
  index,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
}) {
  useBilingualI18nRevision();
  const currentSection = model.slides[index]?.sectionId;
  const current = model.sections.find((section) => section.id === currentSection);
  if (model.sections.length < 2 || !current) return null;
  return (
    <>
      <ol className="deck-sections" aria-hidden="true">
        {model.sections.map((section) => (
          <li
            key={section.id}
            data-state={section.order < current.order ? "done" : section.order === current.order ? "current" : "upcoming"}
            style={{ flexGrow: Math.max(1, section.seconds) }}
            title={`${section.title} · ${formatClock(section.seconds)}`}
          />
        ))}
      </ol>
      <p className="sr-only">
        {formatI18nTemplate(String(bi("전체 {value0}개 구간 중 {value1}번째 구간", "Section {value1} of {value0}")), { value0: model.sections.length, value1: current.order })}
      </p>
    </>
  );
}

/* ── 발표자 패널 ───────────────────────────────────────────── */

export function DeckPresenterPanel({
  model,
  index,
  timer,
  onJump,
  headingId,
  className,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onJump: (slideIndex: number) => void;
  readonly headingId: string;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const slide = model.slides[index];
  const next = model.slides[index + 1];
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  if (!slide) return null;

  return (
    <section aria-labelledby={headingId} className={cx("grid content-start gap-4", className)}>
      <h2 id={headingId} className="sr-only">{bi("발표자 도구", "Presenter tools")}</h2>

      <div className="grid gap-3 rounded-2xl border border-line bg-card/80 p-4">
        <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} />
        <DeckTimerControls timer={timer} />
      </div>

      {section && model.sections.length > 1 ? (
        <div className="grid gap-2 rounded-2xl border border-line bg-card/80 p-4">
          <p className="flex items-center justify-between gap-3 text-xs font-bold text-fg-3">
            <span>
              {formatI18nTemplate(String(bi("구간 {value0}/{value1}", "Section {value0}/{value1}")), { value0: section.order, value1: model.sections.length })}
            </span>
            <span className="font-display tabular-nums">
              {formatI18nTemplate(String(bi("예산 {value0}", "Budget {value0}")), { value0: formatClock(section.seconds) })}
            </span>
          </p>
          <p className="text-sm font-black text-fg">{section.title}</p>
          <DeckSectionStrip model={model} index={index} />
        </div>
      ) : null}

      <div className="rounded-2xl border border-accent/30 bg-accent-soft/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">{bi("발표자 노트", "Speaker notes")}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-fg">{slide.notes}</p>
        {slide.question ? (
          <p className="mt-3 rounded-xl border border-line bg-card/80 p-3 text-sm font-bold leading-6 text-fg">
            <span className="mr-1 text-accent-2">Q.</span>{slide.question}
          </p>
        ) : null}
      </div>

      {slide.demoSteps?.length ? (
        <div className="rounded-2xl border border-line bg-card/80 p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">{bi("데모와 대체 경로", "Demo and fallback")}</p>
          <ol className="mt-3 grid gap-3">
            {slide.demoSteps.map((step, stepIndex) => (
              <li key={`${step.href}-${step.action}`} className="grid gap-1 text-sm leading-6">
                <a href={step.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-accent hover:underline">
                  <span className="font-display text-xs text-fg-3">{stepIndex + 1}</span>
                  {step.action}
                  <ExternalLink size={13} aria-hidden="true" />
                  <span className="sr-only">{bi("(새 탭)", "(new tab)")}</span>
                </a>
                <span className="text-fg-2">{bi("관찰: ", "Observe: ")}{step.expected}</span>
                <span className="text-fg-3">{bi("실패 시: ", "If it fails: ")}{step.fallback}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-card/80 p-4">
        <p className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.12em] text-fg-3">
          {bi("다음 슬라이드", "Next slide")}
          {next ? <span className="font-display tabular-nums">{index + 2} / {model.slides.length}</span> : null}
        </p>
        {next ? (
          <button
            type="button"
            onClick={() => onJump(index + 1)}
            className="mt-3 grid w-full gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={formatI18nTemplate(String(bi("다음 슬라이드로 이동: {value0}", "Go to next slide: {value0}")), { value0: next.title })}
          >
            <EngineeringDeckSlide slide={next} index={index + 1} total={model.slides.length} sections={model.sections} fixed decorative />
            <span className="flex items-start gap-1 text-sm font-bold leading-6 text-fg-2">
              <ChevronRight size={16} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
              {next.title}
            </span>
          </button>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-2">
            <TimerReset size={15} className="text-accent" aria-hidden="true" />
            {bi("마지막 슬라이드입니다. 질의응답을 진행하세요.", "This is the last slide. Move to Q&A.")}
          </p>
        )}
      </div>

      {slide.chapterId || slide.evidence?.length ? (
        <details className="rounded-2xl border border-line bg-card/80 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-xl text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bi("코드·설정 근거", "Code and configuration evidence")}</summary>
          <div className="mt-2 grid gap-2">
            {slide.chapterId ? (
              <Link href={`/about/technology/story#${slide.chapterId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:underline">
                {bi("기술 스토리에서 상태와 근거 보기", "See status and evidence in the engineering story")}
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
            {slide.evidence?.length ? (
              <ul className="grid gap-1.5">
                {slide.evidence.map((path) => (
                  <li key={path}><code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-raised px-2.5 py-1.5 font-mono text-[0.7rem] text-fg-2">{path}</code></li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/* ── 개요 그리드 ───────────────────────────────────────────── */

export function DeckOverview({
  model,
  index,
  onSelect,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onSelect: (slideIndex: number) => void;
}) {
  useBilingualI18nRevision();
  return (
    <div className="grid gap-2">
      {model.sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          {model.sections.length > 1 ? (
            <h3 className="deck-section-title">
              <span className="font-display text-accent">{String(section.order).padStart(2, "0")}</span>
              {section.title}
              <small>{formatClock(section.seconds)}</small>
            </h3>
          ) : null}
          <ol className="deck-overview">
            {model.slides.slice(section.firstSlideIndex, section.firstSlideIndex + section.slideCount).map((slide, offset) => {
              const slideIndex = section.firstSlideIndex + offset;
              return (
                <li key={slide.id}>
                  <button
                    type="button"
                    className="deck-overview__item"
                    aria-current={slideIndex === index ? "true" : undefined}
                    onClick={() => onSelect(slideIndex)}
                  >
                    <EngineeringDeckSlide slide={slide} index={slideIndex} total={model.slides.length} sections={model.sections} fixed decorative />
                    <span className="deck-overview__caption">
                      <span>{String(slideIndex + 1).padStart(2, "0")}</span>
                      <span>{slide.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ── 단축키 안내 ───────────────────────────────────────────── */

const DECK_SHORTCUTS = [
  { keys: ["←", "→"], ko: "이전·다음 슬라이드", en: "Previous / next slide" },
  { keys: ["Space", "PgDn"], ko: "다음 (Shift+Space는 이전)", en: "Next (Shift+Space for previous)" },
  { keys: ["Home", "End"], ko: "처음·마지막", en: "First / last" },
  { keys: ["F"], ko: "발표 시작·전체 화면", en: "Present / fullscreen" },
  { keys: ["N", "S"], ko: "발표자 노트", en: "Speaker notes" },
  { keys: ["O"], ko: "슬라이드 개요", en: "Slide overview" },
  { keys: ["B", "."], ko: "블랙아웃", en: "Blackout" },
  { keys: ["T"], ko: "타이머 시작·정지", en: "Start / pause timer" },
  { keys: ["7", "Enter"], ko: "번호로 이동", en: "Jump to number" },
  { keys: ["?"], ko: "단축키 도움말", en: "Shortcut help" },
  { keys: ["Esc"], ko: "닫기·발표 종료", en: "Close / exit" },
] as const;

export function DeckShortcutList({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  return (
    <dl className={cx("grid gap-x-4 gap-y-2 sm:grid-cols-2", className)}>
      {DECK_SHORTCUTS.map((shortcut) => (
        <div key={shortcut.ko} className="flex min-h-9 items-center justify-between gap-3 border-b border-line/60 pb-2 text-sm">
          <dt className="text-fg-2">{bi(shortcut.ko, shortcut.en)}</dt>
          <dd className="m-0 flex shrink-0 gap-1">
            {shortcut.keys.map((key) => <kbd key={key} className="deck-kbd">{key}</kbd>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
