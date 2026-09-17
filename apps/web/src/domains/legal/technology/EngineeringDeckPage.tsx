import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Maximize2,
  MonitorPlay,
  Presentation,
  Printer,
  RotateCcw,
  StickyNote,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import { ENGINEERING_CHAPTERS, type EngineeringLocale } from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";

const AUDIENCES = [
  { id: "investor", ko: "투자자 10장", en: "Investor · 10 slides" },
  { id: "seminar", ko: "기술 세미나", en: "Engineering seminar" },
  { id: "study", ko: "스터디 심화", en: "Study deep dive" },
] as const;

type Audience = (typeof AUDIENCES)[number]["id"];

function readInitialDeckState(): { readonly audience: Audience; readonly index: number } {
  if (typeof window === "undefined") return { audience: "investor", index: 0 };
  const match = /^#deck=(investor|seminar|study):(\d+)$/u.exec(window.location.hash);
  if (!match) return { audience: "investor", index: 0 };
  return {
    audience: match[1] as Audience,
    index: Math.max(0, Number.parseInt(match[2] ?? "1", 10) - 1),
  };
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function isPresentationControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(
    'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"]',
  ) !== null;
}

interface DeckSlide {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
  readonly note: string;
  readonly chapterId?: string;
}

const chapterById = new Map<string, (typeof ENGINEERING_CHAPTERS)[number]>(
  ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

function chapterSlide(chapterId: string, locale: EngineeringLocale): DeckSlide {
  const chapter = chapterById.get(chapterId);
  if (!chapter) throw new Error(`Unknown engineering chapter: ${chapterId}`);
  return {
    id: chapter.id,
    eyebrow: chapter.eyebrow,
    title: chapter.title[locale],
    body: chapter.thesis[locale],
    points: [
      chapter.problem[locale],
      chapter.decision[locale],
      chapter.userValue[locale],
    ],
    note: chapter.tradeoff[locale],
    chapterId: chapter.id,
  };
}

function buildSlides(audience: Audience, locale: EngineeringLocale): readonly DeckSlide[] {
  const ko = locale === "ko";
  const opening: DeckSlide = {
    id: "opening",
    eyebrow: "TOONSTUDIO ENGINEERING STORY",
    title: ko ? "브라우저에서 웹툰 제작 스튜디오를 만들기까지" : "Building a webtoon production studio in the browser",
    body: ko
      ? "기획, 드로잉, 3D, 저장, 협업, AI와 연재 운영을 하나의 제작 맥락으로 연결한 기술 이야기입니다."
      : "An engineering story connecting planning, drawing, 3D, storage, collaboration, AI and serialization into one production context.",
    points: ko
      ? ["제품 문제부터 시작", "실제 상태와 설계 상태 구분", "코드·테스트·워크플로 근거 연결"]
      : ["Start with the product problem", "Separate live and designed scope", "Connect code, tests and workflow evidence"],
    note: ko
      ? "기술 목록을 읽는 발표가 아니라 왜 이 경계를 선택했는지 설명하는 발표입니다."
      : "This presentation explains why boundaries were chosen instead of reading a technology list.",
  };

  if (audience === "investor") {
    return [
      opening,
      chapterSlide("product-intent", locale),
      chapterSlide("architecture", locale),
      chapterSlide("storage", locale),
      chapterSlide("brush-engine", locale),
      chapterSlide("ai-routing", locale),
      chapterSlide("quality", locale),
      chapterSlide("infrastructure", locale),
      chapterSlide("licenses", locale),
      {
        id: "investor-close",
        eyebrow: "DEFENSIBILITY · SCALE · TRUST",
        title: ko ? "기술은 기능 수가 아니라 연결된 제작 맥락을 지킵니다." : "The defensible asset is connected production context, not a feature count.",
        body: ko
          ? "도메인 계약, 로컬 우선 데이터, 전문 엔진 경계와 검증 증거를 유지하면 기능을 추가해도 프로젝트의 맥락이 분해되지 않습니다."
          : "Domain contracts, local-first data, specialist engine boundaries and verification evidence keep project context intact as capability grows.",
        points: ko
          ? ["단계적 전문 기능 확장", "무료 우선에서 승인된 유료 승격", "권리와 provenance를 기능과 함께 관리"]
          : ["Incremental specialist capability", "Approved promotion from free-first infrastructure", "Rights and provenance managed with features"],
        note: ko
          ? "과장된 완성도 주장보다 검증 가능한 현재 상태와 확장 경로를 강조합니다."
          : "Emphasize verifiable present state and expansion path instead of exaggerated completeness claims.",
      },
    ];
  }

  if (audience === "seminar") {
    return [
      opening,
      chapterSlide("product-intent", locale),
      chapterSlide("architecture", locale),
      chapterSlide("open-source", locale),
      chapterSlide("authentication", locale),
      chapterSlide("storage", locale),
      chapterSlide("brush-engine", locale),
      chapterSlide("performance", locale),
      chapterSlide("quality", locale),
      chapterSlide("infrastructure", locale),
      chapterSlide("ai-routing", locale),
      chapterSlide("delivery", locale),
    ];
  }

  return [
    opening,
    ...ENGINEERING_CHAPTERS.map((chapter) => chapterSlide(chapter.id, locale)),
    {
      id: "study-close",
      eyebrow: "STUDY QUESTIONS",
      title: ko ? "우리 프로젝트에서 먼저 검증할 경계는 무엇인가" : "Which boundary should our project verify first?",
      body: ko
        ? "패키지 선택보다 데이터 권위, 실패 범위, 대체 경로와 완료 기준을 먼저 토론해 보세요."
        : "Discuss data authority, failure scope, fallback and completion criteria before package selection.",
      points: ko
        ? ["무엇이 최종 결과를 소유하는가", "어떤 실패를 사용자에게 숨기지 않을 것인가", "측정 가능한 품질 예산은 무엇인가"]
        : ["What owns the final result?", "Which failure will remain visible to the user?", "What quality budget is measurable?"],
      note: ko
        ? "마지막 10분은 참가자의 시스템에 적용할 한 가지 경계를 정하는 토론으로 사용합니다."
        : "Use the final ten minutes to choose one boundary to apply in participants' systems.",
    },
  ];
}

function SlideCanvas({
  slide,
  index,
  total,
  locale,
  compact = false,
}: {
  readonly slide: DeckSlide;
  readonly index: number;
  readonly total: number;
  readonly locale: EngineeringLocale;
  readonly compact?: boolean;
}) {
  const chapter = slide.chapterId ? chapterById.get(slide.chapterId) : undefined;

  return (
    <article
      data-deck-slide="true"
      className={cx(
        "relative isolate flex aspect-video w-full flex-col overflow-hidden rounded-[2rem] border border-line/70 bg-[#f2f4e9] p-6 text-[#203729] shadow-2xl sm:p-10 lg:p-14",
        compact && "rounded-none border-0 shadow-none",
      )}
    >
      <div
        className="pointer-events-none absolute -right-[10%] top-[12%] -z-10 size-[56%] rounded-full bg-[#dfe9ca]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage: "radial-gradient(#46614b22 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
        aria-hidden="true"
      />

      <header className="flex items-start justify-between gap-5">
        <div>
          <p className="font-display text-[0.62rem] font-black uppercase tracking-[0.2em] text-[#627b63] sm:text-xs">
            {slide.eyebrow}
          </p>
          {chapter ? (
            <EngineeringStatusBadge status={chapter.status} locale={locale} className="mt-3 border-[#78916d55] bg-white/55 text-[#36513a]" />
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-display text-sm font-black">ToonStudio<span className="text-[#789e56]">✳</span></p>
          <p className="mt-1 text-[0.58rem] tracking-[0.16em] text-[#627b63] sm:text-[0.66rem]">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </p>
        </div>
      </header>

      <div className="my-auto grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <h2 className="max-w-4xl text-balance text-2xl font-black leading-[1.14] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
            {slide.title}
          </h2>
          <p className="mt-5 max-w-3xl text-xs leading-6 text-[#4e6753] sm:text-base sm:leading-8">
            {slide.body}
          </p>
        </div>
        <ol className="space-y-2.5">
          {slide.points.map((point, pointIndex) => (
            <li key={point} className="flex items-start gap-3 rounded-2xl border border-[#98aa9250] bg-white/65 p-3 text-xs leading-6 text-[#38503e] sm:p-4 sm:text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#31533b] text-[0.62rem] font-black text-white">
                {pointIndex + 1}
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ol>
      </div>

      <footer className="flex items-end justify-between gap-5 text-[0.58rem] text-[#627b63] sm:text-[0.68rem]">
        <span>{locale === "ko" ? "제품 경계 · 검증 근거 · 재사용 가이드" : "Product boundary · Evidence · Reuse guide"}</span>
        <span>toonstudio.cloud</span>
      </footer>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#d5dfc2]" aria-hidden="true">
        <div className="h-full bg-[#739552]" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </article>
  );
}

export function EngineeringDeckPage() {
  const locale = useEngineeringLocale();
  const ko = locale === "ko";
  const initialDeckState = useRef(readInitialDeckState()).current;
  const [audience, setAudience] = useState<Audience>(initialDeckState.audience);
  const [index, setIndex] = useState(initialDeckState.index);
  const [showNotes, setShowNotes] = useState(true);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [shareNotice, setShareNotice] = useState("");
  const deckRef = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => buildSlides(audience, locale), [audience, locale]);
  const current = slides[index] ?? slides[0]!;

  useDocumentTitle(
    ko
      ? "ToonStudio 기술 발표 모드 · 투자·세미나·스터디"
      : "ToonStudio engineering presentation · Investor, seminar and study",
  );

  useEffect(() => {
    setIndex((value) => Math.min(Math.max(0, value), slides.length - 1));
  }, [slides.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = `deck=${audience}:${index + 1}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [audience, index]);

  useEffect(() => {
    if (timerStartedAt === null) return;
    const update = (): void => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [timerStartedAt]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isPresentationControlTarget(event.target)) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Home") setIndex(0);
      if (event.key === "End") setIndex(slides.length - 1);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slides.length]);

  const copyCurrentSlideLink = async (): Promise<void> => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setShareNotice(ko ? "현재 슬라이드 링크를 복사했어요." : "Current slide link copied.");
    } catch {
      setShareNotice(ko ? `복사할 링크: ${href}` : `Copy this link: ${href}`);
    }
  };

  const toggleTimer = (): void => {
    if (timerStartedAt === null) {
      setTimerStartedAt(Date.now() - elapsedSeconds * 1000);
      return;
    }
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000)));
    setTimerStartedAt(null);
  };

  const resetTimer = (): void => {
    setTimerStartedAt(null);
    setElapsedSeconds(0);
  };

  const openFullscreen = async (): Promise<void> => {
    if (!deckRef.current || document.fullscreenElement) return;
    await deckRef.current.requestFullscreen().catch(() => undefined);
  };

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <style>{`
        @media print {
          body { background: #fff !important; }
          [data-engineering-deck-shell] { display: none !important; }
          [data-engineering-print-deck] { display: block !important; }
          [data-engineering-print-deck] [data-deck-slide] { break-after: page; page-break-after: always; width: 100%; }
        }
      `}</style>
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="WEB PRESENTATION"
        title={
          ko
            ? "같은 기술 사실을 투자자·세미나·스터디 깊이로 발표합니다."
            : "Present the same engineering facts at investor, seminar or study depth."
        }
        description={
          ko
            ? "키보드, 전체 화면, 발표자 노트와 인쇄를 지원합니다. 슬라이드 내용은 기술 스토리 데이터에서 파생되어 웹 설명과 서로 다른 상태를 주장하지 않습니다."
            : "Use keyboard navigation, fullscreen, speaker notes and print. Slides derive from the engineering-story data so the deck cannot claim a different status from the website."
        }
        aside={
          <div className="rounded-3xl border border-line/70 bg-card/70 p-5">
            <p className="flex items-center gap-2 text-xs font-black text-fg">
              <MonitorPlay size={16} className="text-accent" aria-hidden="true" />
              {ko ? "발표 조작" : "Presentation controls"}
            </p>
            <p className="mt-3 text-xs leading-6 text-fg-3">
              {ko ? "← → · Page Up/Down · Space · Home · End" : "← → · Page Up/Down · Space · Home · End"}
            </p>
          </div>
        }
      />

      <section data-engineering-deck-shell="true" aria-labelledby="deck-preview-title">
        <h2 id="deck-preview-title" className="sr-only">
          {ko ? "발표 미리보기" : "Presentation preview"}
        </h2>

        <div data-deck-controls="true" className="mb-4 flex flex-col gap-3 rounded-3xl border border-line/70 bg-panel/65 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label={ko ? "발표 대상" : "Presentation audience"}>
            {AUDIENCES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={audience === item.id}
                onClick={() => {
                  setAudience(item.id);
                  setIndex(0);
                }}
                className={cx(
                  "min-h-10 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors",
                  audience === item.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                )}
              >
                {item[locale]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line bg-card p-1" aria-label={ko ? "발표 타이머" : "Presentation timer"}>
              <button
                type="button"
                aria-pressed={timerStartedAt !== null}
                onClick={toggleTimer}
                className="inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-black text-fg-2 hover:bg-raised hover:text-accent"
              >
                <Clock3 size={14} aria-hidden="true" />
                {formatElapsed(elapsedSeconds)}
                <span className="sr-only">{timerStartedAt === null ? (ko ? "타이머 시작" : "Start timer") : (ko ? "타이머 일시정지" : "Pause timer")}</span>
              </button>
              <button
                type="button"
                onClick={resetTimer}
                aria-label={ko ? "발표 타이머 초기화" : "Reset presentation timer"}
                className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent"
              >
                <RotateCcw size={13} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyCurrentSlideLink()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <Copy size={15} aria-hidden="true" />
              {ko ? "슬라이드 링크" : "Slide link"}
            </button>
            <button
              type="button"
              aria-pressed={showNotes}
              onClick={() => setShowNotes((value) => !value)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <StickyNote size={15} aria-hidden="true" />
              {ko ? "발표자 노트" : "Speaker notes"}
            </button>
            <button
              type="button"
              onClick={() => void openFullscreen()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <Maximize2 size={15} aria-hidden="true" />
              {ko ? "전체 화면" : "Fullscreen"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <Printer size={15} aria-hidden="true" />
              {ko ? "인쇄·PDF" : "Print · PDF"}
            </button>
          </div>
        </div>
        {shareNotice ? (
          <p className="mb-4 rounded-2xl border border-accent/25 bg-accent-soft/25 px-4 py-3 text-xs leading-6 text-fg-2" role="status">
            {shareNotice}
          </p>
        ) : null}

        <div ref={deckRef} className="rounded-[2rem] bg-page p-2 sm:p-4" aria-live="polite">
          <SlideCanvas slide={current} index={index} total={slides.length} locale={locale} />

          <div className="mt-4 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-stretch">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 text-sm font-bold text-fg-2 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} aria-hidden="true" />
              {ko ? "이전" : "Previous"}
            </button>

            <div className="flex min-h-12 items-center justify-center rounded-2xl border border-line/70 bg-panel px-4">
              <div className="w-full max-w-xl">
                <div className="flex items-center justify-between gap-4 text-[0.68rem] font-bold text-fg-3">
                  <span>{current.eyebrow}</span>
                  <span>{index + 1} / {slides.length}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={index === slides.length - 1}
              onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 text-sm font-bold text-fg-2 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ko ? "다음" : "Next"}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {showNotes ? (
          <aside className="mt-4 rounded-3xl border border-line/70 bg-card/65 p-5" aria-label={ko ? "현재 슬라이드 발표자 노트" : "Current slide speaker notes"}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <StickyNote size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">
                  {ko ? "발표자 노트" : "Speaker note"}
                </p>
                <p className="mt-2 text-sm leading-7 text-fg-2">{current.note}</p>
              </div>
            </div>
          </aside>
        ) : null}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label={ko ? "발표 대상별 사용법" : "Audience guidance"}>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <Presentation size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{ko ? "투자자" : "Investor"}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {ko ? "문제, 기술 방어력, 확장·비용·권리 통제를 10장으로 요약합니다." : "Summarizes problem, defensibility, scale, cost and rights control in ten slides."}
          </p>
        </article>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <UsersRound size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{ko ? "기술 세미나" : "Engineering seminar"}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {ko ? "주요 시스템 경계와 실패·검증 설계를 30~45분 분량으로 설명합니다." : "Covers key system boundaries, failure and verification design for a 30–45 minute session."}
          </p>
        </article>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <StickyNote size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{ko ? "스터디" : "Study"}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {ko ? "15개 챕터를 모두 사용하고 각 시스템에 적용할 경계를 토론합니다." : "Uses all 15 chapters and turns each boundary into a discussion for participants' systems."}
          </p>
        </article>
      </section>

      <div data-engineering-print-deck="true" className="hidden">
        {slides.map((slide, slideIndex) => (
          <SlideCanvas
            key={slide.id}
            slide={slide}
            index={slideIndex}
            total={slides.length}
            locale={locale}
            compact
          />
        ))}
      </div>
    </Container>
  );
}
