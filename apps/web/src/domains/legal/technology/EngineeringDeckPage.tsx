import { translateBilingualValueForActiveLocale, useBilingualI18nRevision, formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  X,
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
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import { AboutSectionNav } from "../AboutSectionNav";
import { ENGINEERING_FIELD_NOTES } from "./engineering-field-notes-content";
import {
  type EngineeringLocale,
  type EngineeringStatus,
} from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS as ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";
import { seminarLessonsForDuration, type SeminarLesson, type SeminarDuration } from "./engineering-seminar-curriculum";
import { parseEngineeringDeckState, clampDeckIndex, isDeckAudience } from "./engineering-deck-state";
import { buildOfflineEngineeringDeck, downloadOfflineEngineeringDeck } from "./engineering-deck-export";
import { EngineeringSeminarPrep } from "./EngineeringSeminarPrep";
import { EngineeringSeminarResources } from "./EngineeringSeminarResources";
import "./engineering-deck.css";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { ServiceStoryJourney } from "@/shared/components/service-story-journey";
import { cx } from "@/shared/lib/cx";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckPage", ko, en);

const AUDIENCES = [
  { id: "investor", ko: "핵심 요약", en: "Executive summary" },
  { id: "seminar", ko: "기술 발표", en: "Engineering talk" },
  { id: "study", ko: "심화 연구", en: "Deep study" },
] as const;

type Audience = (typeof AUDIENCES)[number]["id"];

function readInitialDeckState() {
  return typeof window === "undefined"
    ? parseEngineeringDeckState("", "")
    : parseEngineeringDeckState(window.location.search, window.location.hash);
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function isPresentationControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(
    'a, button, input, select, textarea, summary, [contenteditable], [role="button"], [role="link"]',
  ) !== null;
}

interface DeckSlide {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
  readonly note: string;
  readonly status?: EngineeringStatus;
  readonly flow?: readonly string[];
  readonly technologies?: readonly string[];
  readonly question?: string;
  readonly chapterId?: string;
  readonly demo?: SeminarLesson["demo"];
}

const chapterById = new Map<string, (typeof ENGINEERING_CHAPTERS)[number]>(
  ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

function chapterSlide(chapterId: string, _locale: string): DeckSlide {
  const chapter = chapterById.get(chapterId);
  if (!chapter) throw new Error(`Unknown engineering chapter: ${chapterId}`);
  return {
    id: chapter.id,
    eyebrow: chapter.eyebrow,
    title: bi((chapter.title).ko, (chapter.title).en),
    body: bi((chapter.thesis).ko, (chapter.thesis).en),
    points: [
      bi((chapter.problem).ko, (chapter.problem).en),
      bi((chapter.decision).ko, (chapter.decision).en),
      bi((chapter.userValue).ko, (chapter.userValue).en),
    ],
    note: bi((chapter.tradeoff).ko, (chapter.tradeoff).en),
    status: chapter.status,
    technologies: chapter.technologies,
    chapterId: chapter.id,
  };
}

const fieldNoteById = new Map<string, (typeof ENGINEERING_FIELD_NOTES)[number]>(
  ENGINEERING_FIELD_NOTES.map((note) => [note.id, note]),
);

function fieldNoteSlide(noteId: string, _locale: string): DeckSlide {
  const note = fieldNoteById.get(noteId);
  if (!note) throw new Error(`Unknown engineering field note: ${noteId}`);
  return {
    id: `field-${note.id}`,
    eyebrow: note.eyebrow,
    title: bi((note.title).ko, (note.title).en),
    body: bi((note.summary).ko, (note.summary).en),
    points: [bi((note.problem).ko, (note.problem).en), bi((note.pattern).ko, (note.pattern).en), bi((note.boundary).ko, (note.boundary).en)],
    note: bi((note.reuseSteps[0]).ko, (note.reuseSteps[0]).en) ?? bi((note.boundary).ko, (note.boundary).en),
    status: note.status,
  };
}

function buildSlides(audience: Audience, locale: EngineeringLocale, duration: SeminarDuration): readonly DeckSlide[] {

  const opening: DeckSlide = {
    id: "opening",
    eyebrow: "TOONSTUDIO ENGINEERING STORY",
    title: bi("브라우저에서 웹툰 제작 스튜디오를 만들기까지", "Building a webtoon production studio in the browser"),
    body: bi("기획, 드로잉, 3D, 저장, 협업, AI와 연재 운영을 하나의 제작 맥락으로 연결한 기술 이야기입니다.", "An engineering story connecting planning, drawing, 3D, storage, collaboration, AI and serialization into one production context."),
    points: bi(["제품 문제부터 시작", "실제 상태와 설계 상태 구분", "코드·테스트·워크플로 근거 연결"], ["Start with the product problem", "Separate live and designed scope", "Connect code, tests and workflow evidence"]),
    note: bi("기술 목록을 읽는 발표가 아니라 왜 이 경계를 선택했는지 설명하는 발표입니다.", "This presentation explains why boundaries were chosen instead of reading a technology list."),
  };

  if (audience === "investor") {
    return [
      opening,
      chapterSlide("product-intent", locale),
      chapterSlide("architecture", locale),
      chapterSlide("pwa-continuity", locale),
      chapterSlide("webrtc-media-authority", locale),
      chapterSlide("web-3d-engine", locale),
      chapterSlide("free-ai-routing", locale),
      chapterSlide("cost-engineering", locale),
      chapterSlide("quality", locale),
      chapterSlide("licenses", locale),
      {
        id: "investor-close",
        eyebrow: "DEFENSIBILITY · SCALE · TRUST",
        title: bi("기술은 기능 수가 아니라 연결된 제작 맥락을 지킵니다.", "The defensible asset is connected production context, not a feature count."),
        body: bi("도메인 계약, 로컬 우선 데이터, 전문 엔진 경계와 검증 증거를 유지하면 기능을 추가해도 프로젝트의 맥락이 분해되지 않습니다.", "Domain contracts, local-first data, specialist engine boundaries and verification evidence keep project context intact as capability grows."),
        points: bi(["단계적 전문 기능 확장", "무료 우선에서 승인된 유료 승격", "권리와 provenance를 기능과 함께 관리"], ["Incremental specialist capability", "Approved promotion from free-first infrastructure", "Rights and provenance managed with features"]),
        note: bi("과장된 완성도 주장보다 검증 가능한 현재 상태와 확장 경로를 강조합니다.", "Emphasize verifiable present state and expansion path instead of exaggerated completeness claims."),
      },
    ];
  }

  if (audience === "seminar") {
    return seminarLessonsForDuration(duration).map((lesson) => ({
      id: lesson.id,
      eyebrow: bi(lesson.section.ko, lesson.section.en),
      title: bi(lesson.title.ko, lesson.title.en),
      body: bi(lesson.takeaway.ko, lesson.takeaway.en),
      points: lesson.points.map((point) => bi(point.ko, point.en)),
      flow: lesson.flow.map((step) => bi(step.ko, step.en)),
      note: bi(lesson.script.ko, lesson.script.en),
      question: bi(lesson.question.ko, lesson.question.en),
      technologies: lesson.technologies,
      status: chapterById.get(lesson.chapterId)?.status,
      chapterId: lesson.chapterId,
      demo: lesson.demo,
    }));
  }

  return [
    opening,
    ...ENGINEERING_CHAPTERS.map((chapter) => chapterSlide(chapter.id, locale)),
    ...ENGINEERING_FIELD_NOTES.map((note) => fieldNoteSlide(note.id, locale)),
    {
      id: "study-close",
      eyebrow: "STUDY QUESTIONS",
      title: bi("우리 프로젝트에서 먼저 검증할 경계는 무엇인가", "Which boundary should our project verify first?"),
      body: bi("패키지 선택보다 데이터 권위, 실패 범위, 대체 경로와 완료 기준을 먼저 토론해 보세요.", "Discuss data authority, failure scope, fallback and completion criteria before package selection."),
      points: bi(["무엇이 최종 결과를 소유하는가", "어떤 실패를 사용자에게 숨기지 않을 것인가", "측정 가능한 품질 예산은 무엇인가"], ["What owns the final result?", "Which failure will remain visible to the user?", "What quality budget is measurable?"]),
      note: bi("마지막 10분은 참가자의 시스템에 적용할 한 가지 경계를 정하는 토론으로 사용합니다.", "Use the final ten minutes to choose one boundary to apply in participants' systems."),
    },
  ];
}

function SlideCanvas({ slide, index, total, locale, compact = false }: {
  readonly slide: DeckSlide;
  readonly index: number;
  readonly total: number;
  readonly locale: EngineeringLocale;
  readonly compact?: boolean;
}) {
  useBilingualI18nRevision();
  return (
    <article data-deck-slide="true" data-slide-id={slide.id} className={cx("engineering-slide", compact && "engineering-slide--print")}>
      <header className="engineering-slide__header">
        <div><p>{slide.eyebrow}</p>{slide.status ? <EngineeringStatusBadge status={slide.status} locale={locale} /> : null}</div>
        <div className="engineering-slide__brand">ToonStudio<span>✳</span><small>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</small></div>
      </header>
      <div className="engineering-slide__content">
        <div><h2>{slide.title}</h2><p className="engineering-slide__takeaway">{slide.body}</p></div>
        <ol className="engineering-slide__points">{slide.points.map((point, pointIndex) => <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>)}</ol>
      </div>
      {slide.flow ? <ol className="engineering-slide__flow" aria-label={bi("동작 흐름", "Execution flow")}>{slide.flow.map((step) => <li key={step}>{step}</li>)}</ol> : null}
      <footer className="engineering-slide__footer"><p>{slide.technologies?.join(" · ") ?? bi("제품 문제 · 구현 · 검증", "Problem · Implementation · Evidence")}</p><span>toonstudio.cloud</span></footer>
      <div className="engineering-slide__progress" aria-hidden="true"><span style={{ "--deck-progress": `${((index + 1) / total) * 100}%` } as CSSProperties} /></div>
    </article>
  );
}

export function EngineeringDeckPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();

  const initialDeckState = useRef(readInitialDeckState()).current;
  const [audience, setAudience] = useState<Audience>(initialDeckState.audience);
  const [index, setIndex] = useState(initialDeckState.index);
  const [duration, setDuration] = useState<SeminarDuration>(initialDeckState.duration);
  const [focusMode, setFocusMode] = useState(false);
  const [resumeHash, setResumeHash] = useState("");
  const [showNotes, setShowNotes] = useState(true);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [shareNotice, setShareNotice] = useState("");
  const deckRef = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => buildSlides(audience, locale, duration), [audience, locale, duration]);
  const safeIndex = clampDeckIndex(index, slides.length);
  const current = slides[safeIndex];
  const currentEvidence = current?.chapterId ? chapterById.get(current.chapterId)?.evidence ?? [] : [];

  useDocumentTitle(
    bi("ToonStudio 기술 발표 모드 · 투자·세미나·스터디", "ToonStudio engineering presentation · Investor, seminar and study"),
  );

  useEffect(() => {
    setIndex((value) => Math.min(Math.max(0, value), slides.length - 1));
  }, [slides.length]);

  useEffect(() => {
    try { setResumeHash(sessionStorage.getItem("toonstudio-engineering-deck") ?? ""); } catch { setResumeHash(""); }
    const restoreLocation = () => {
      const state = readInitialDeckState();
      setAudience(state.audience);
      setDuration(state.duration);
      setIndex(state.index);
    };
    window.addEventListener("hashchange", restoreLocation);
    window.addEventListener("popstate", restoreLocation);
    return () => {
      window.removeEventListener("hashchange", restoreLocation);
      window.removeEventListener("popstate", restoreLocation);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("audience", audience);
    nextUrl.searchParams.set("duration", String(duration));
    nextUrl.hash = `deck=${audience}:${safeIndex + 1}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    try {
      sessionStorage.setItem("toonstudio-engineering-deck", `${nextUrl.search}${nextUrl.hash}`);
    } catch {
      // 저장소 접근을 거부해도 현재 발표 조작은 유지한다.
    }
  }, [audience, duration, safeIndex]);

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
      if (event.key === "Escape") { setFocusMode(false); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || isPresentationControlTarget(event.target)) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Home") { event.preventDefault(); setIndex(0); }
      if (event.key === "End") { event.preventDefault(); setIndex(slides.length - 1); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slides.length]);

  const copyCurrentSlideLink = async (): Promise<void> => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setShareNotice(bi("현재 슬라이드 링크를 복사했어요.", "Current slide link copied."));
    } catch {
      setShareNotice(formatI18nTemplate(String(bi("복사할 링크: {value0}", "Copy this link: {value0}")), { value0: href }));
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
    setFocusMode(true);
  };

  useEffect(() => {
    if (!focusMode) return;
    const previous = document.activeElement;
    const before = document.body.style.overflow;
    const stage = deckRef.current;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== stage && !element.contains(stage))
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of siblings) element.inert = true;
    document.body.style.overflow = "hidden";
    stage?.focus();
    const trapTab = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !stage) return;
      const controls = Array.from(stage.querySelectorAll<HTMLElement>('button:not(:disabled), select, a[href], [tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === stage)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      document.body.style.overflow = before;
      for (const { element, inert } of siblings) element.inert = inert;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [focusMode]);

  const requestNativeFullscreen = async (): Promise<void> => {
    if (!deckRef.current?.requestFullscreen) {
      setShareNotice(bi("이 브라우저는 전체 화면 API를 지원하지 않아 집중 화면을 유지합니다.", "Fullscreen is unavailable; the focused presentation remains open."));
      return;
    }
    try { await deckRef.current.requestFullscreen(); }
    catch { setShareNotice(bi("전체 화면 요청이 허용되지 않아 집중 화면을 유지합니다.", "Fullscreen was denied; the focused presentation remains open.")); }
  };

  const leavePresentation = async (): Promise<void> => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { setShareNotice(bi("브라우저의 Esc 키로 전체 화면을 종료하세요.", "Press Escape to exit browser fullscreen.")); }
    }
    setFocusMode(false);
  };

  if (!current) return null;

  const stage = (
    <div ref={deckRef} data-deck-stage="true" tabIndex={-1} className={cx("engineering-deck-stage", focusMode && "engineering-deck-stage--focus")} role={focusMode ? "dialog" : undefined} aria-modal={focusMode || undefined} aria-label={bi("기술 발표 화면", "Engineering presentation")}>
      {focusMode ? <div className="engineering-deck-stage__bar">
        <span>{bi("청중 화면 · 발표자 노트는 숨김", "Audience view · Speaker notes hidden")}</span>
        <span>{formatElapsed(elapsedSeconds)} / {duration}:00</span>
        <button type="button" onClick={() => void requestNativeFullscreen()}><Maximize2 size={16} aria-hidden="true" />{bi("브라우저 전체 화면", "Browser fullscreen")}</button>
        <button type="button" onClick={() => void leavePresentation()}><X size={16} aria-hidden="true" />{bi("발표 종료", "Exit presentation")}</button>
      </div> : null}
      <SlideCanvas slide={current} index={safeIndex} total={slides.length} locale={locale} />
      <div className="engineering-deck-stage__navigation">
        <button type="button" disabled={safeIndex === 0} onClick={() => setIndex(Math.max(0, safeIndex - 1))}><ChevronLeft size={18} aria-hidden="true" />{bi("이전", "Previous")}</button>
        <label>{bi("슬라이드 이동", "Jump to slide")}<select aria-label={bi("발표 슬라이드 선택", "Select presentation slide")} value={safeIndex} onChange={(event) => setIndex(Number(event.currentTarget.value))}>
          {slides.map((slide, slideIndex) => <option key={slide.id} value={slideIndex}>{slideIndex + 1}. {slide.title}</option>)}
        </select></label>
        <button type="button" disabled={safeIndex === slides.length - 1} onClick={() => setIndex(Math.min(slides.length - 1, safeIndex + 1))}>{bi("다음", "Next")}<ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <p className="sr-only" role="status">{safeIndex + 1} / {slides.length} · {current.title}</p>
      {focusMode && shareNotice ? <p role="status" className="engineering-deck-stage__notice">{shareNotice}</p> : null}
    </div>
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">

      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="WEB PRESENTATION"
        title={
          bi("한 컷을 따라 이해하는, 브라우저 제작실의 기술", "Follow one panel through the engineering of a browser studio")
        }
        description={
          bi("창작자의 문제에서 시작해 드로잉, Worker·오프라인 저장, 3D, AI와 검증까지 연결합니다. 청중 화면에는 핵심만, 발표자 노트에는 설명 대본·예상 질문·데모와 실패 시 대안을 제공합니다. 시간 선택은 권장 분량이며 자동 진행하지 않습니다.", "Start from a creator’s problem and connect drawing, workers, offline persistence, 3D, AI and verification. Keep the audience view focused; use speaker scripts, questions, demos and fallbacks for depth. Time presets suggest scope and do not advance automatically.")
        }
        aside={
          <div className="rounded-3xl border border-line/70 bg-card/70 p-5">
            <p className="flex items-center gap-2 text-xs font-black text-fg">
              <MonitorPlay size={16} className="text-accent" aria-hidden="true" />
              {bi("발표 조작", "Presentation controls")}
            </p>
            <p className="mt-3 text-xs leading-6 text-fg-3">
              {bi("← → · Page Up/Down · Space · Home · End", "← → · Page Up/Down · Space · Home · End")}
            </p>
          </div>
        }
      />

      <ServiceStoryJourney current="deck" className="mb-5" />

      {audience === "seminar" ? <EngineeringSeminarPrep /> : null}

      <section data-engineering-deck-shell="true" aria-labelledby="deck-preview-title">
        <h2 id="deck-preview-title" className="sr-only">
          {bi("발표 미리보기", "Presentation preview")}
        </h2>

        <div className="engineering-deck-planner">
          <label>{bi("발표 분량", "Talk length")}<select aria-label={bi("발표 시간 선택", "Select talk duration")} value={duration} onChange={(event) => {
            const minutes = Number(event.currentTarget.value);
            setDuration(minutes === 15 || minutes === 45 ? minutes : 30);
            setIndex(0);
          }}><option value="15">{bi("15분 · 핵심 흐름", "15 minutes · Core narrative")}</option><option value="30">{bi("30분 · 기술 세미나", "30 minutes · Engineering seminar")}</option><option value="45">{bi("45분 · 심화와 토론", "45 minutes · Deep dive and discussion")}</option></select></label>
          <p>{slides.length}{bi("장 · 영상과 질문 시간은 발표자가 조절합니다.", " slides · Adjust video and discussion time during rehearsal.")}</p>
          <button type="button" onClick={() => {
            downloadOfflineEngineeringDeck(buildOfflineEngineeringDeck(slides, locale), `toonstudio-seminar-${duration}min.html`);
            setShareNotice(bi("오프라인 발표본을 만들었습니다. 영상·외부 링크·서비스 기능은 포함하지 않습니다.", "Offline deck created. Videos, external links and service capabilities are not included."));
          }}><Download size={16} aria-hidden="true" />{bi("오프라인 발표본", "Offline deck")}</button>
          {resumeHash ? <button type="button" onClick={() => {
            const hashAt = resumeHash.indexOf("#");
            const state = parseEngineeringDeckState(hashAt < 0 ? resumeHash : resumeHash.slice(0, hashAt), hashAt < 0 ? "" : resumeHash.slice(hashAt));
            if (isDeckAudience(state.audience)) { setAudience(state.audience); setDuration(state.duration); setIndex(state.index); }
          }}>{bi("이전 발표 위치 복원", "Restore previous position")}</button> : null}
        </div>

        <div data-deck-controls="true" className="mb-4 flex flex-col gap-3 rounded-3xl border border-line/70 bg-panel/65 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label={bi("발표 대상", "Presentation audience")}>
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
                {bi((item).ko, (item).en)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line bg-card p-1" aria-label={bi("발표 타이머", "Presentation timer")}>
              <button
                type="button"
                aria-pressed={timerStartedAt !== null}
                onClick={toggleTimer}
                className="inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-black text-fg-2 hover:bg-raised hover:text-accent"
              >
                <Clock3 size={14} aria-hidden="true" />
                {formatElapsed(elapsedSeconds)}
                <span className="sr-only">{timerStartedAt === null ? (bi("타이머 시작", "Start timer")) : (bi("타이머 일시정지", "Pause timer"))}</span>
              </button>
              <button
                type="button"
                onClick={resetTimer}
                aria-label={bi("발표 타이머 초기화", "Reset presentation timer")}
                className="grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent"
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
              {bi("슬라이드 링크", "Slide link")}
            </button>
            <button
              type="button"
              aria-pressed={showNotes}
              onClick={() => setShowNotes((value) => !value)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <StickyNote size={15} aria-hidden="true" />
              {bi("발표자 노트", "Speaker notes")}
            </button>
            <button
              type="button"
              onClick={() => { void openFullscreen(); if (timerStartedAt === null) setTimerStartedAt(Date.now() - elapsedSeconds * 1000); }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <Maximize2 size={15} aria-hidden="true" />
              {bi("발표 시작 · 집중 화면", "Present · Focus view")}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:text-accent"
            >
              <Printer size={15} aria-hidden="true" />
              {bi("인쇄·PDF", "Print · PDF")}
            </button>
          </div>
        </div>
        {shareNotice ? (
          <p className="mb-4 rounded-2xl border border-accent/25 bg-accent-soft/25 px-4 py-3 text-xs leading-6 text-fg-2" role="status">
            {shareNotice}
          </p>
        ) : null}

        {focusMode ? createPortal(stage, document.body) : stage}

        {showNotes ? (
          <aside className="mt-4 rounded-3xl border border-line/70 bg-card/65 p-5" aria-label={bi("현재 슬라이드 발표자 노트", "Current slide speaker notes")}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <StickyNote size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">
                  {bi("발표자 노트", "Speaker note")}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-fg-2">{current.note}</p>
                {current.question ? <p className="mt-4 rounded-2xl border border-accent/25 bg-accent-soft/25 p-4 text-sm font-bold text-fg">{current.question}</p> : null}
                {current.demo ? <div className="mt-4 rounded-2xl border border-line p-4 text-sm leading-7">
                  <a href={current.demo.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-accent">{bi(current.demo.action.ko, current.demo.action.en)}<ExternalLink size={15} aria-hidden="true" /></a>
                  <p>{bi("관찰할 결과: ", "Expected result: ")}{bi(current.demo.expected.ko, current.demo.expected.en)}</p>
                  <p>{bi("실패 시 대안: ", "Fallback: ")}{bi(current.demo.fallback.ko, current.demo.fallback.en)}</p>
                </div> : null}
                {current.chapterId ? <a href={`/about/technology/story#${current.chapterId}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent">{bi("이 기술의 상세 설명과 상태 보기", "Read the implementation and status")}<ExternalLink size={14} aria-hidden="true" /></a> : null}
                {currentEvidence.length ? <details className="mt-3"><summary className="cursor-pointer py-2 text-sm font-bold text-fg">{bi("코드·테스트 근거", "Code and test evidence")}</summary><ul className="space-y-2">{currentEvidence.map((evidence) => <li key={`${evidence.kind}:${evidence.path}`}><a className="break-all text-xs text-accent underline" target="_blank" rel="noopener noreferrer" href={`https://github.com/blue45f/toonstudio/blob/main/${evidence.path}`}>{evidence.kind} · {bi(evidence.label.ko, evidence.label.en)} — {evidence.path}</a></li>)}</ul></details> : null}
              </div>
            </div>
          </aside>
        ) : null}
      </section>

      <EngineeringSeminarResources />

      <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label={bi("발표 대상별 사용법", "Audience guidance")}>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <Presentation size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{bi("핵심 요약", "Executive summary")}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {bi("제품 문제, 기술 방어력, 실시간 협업, 비용과 권리 통제를 빠르게 공유합니다.", "Shares the product problem, defensibility, realtime collaboration, cost and rights controls quickly.")}
          </p>
        </article>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <UsersRound size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{bi("기술 발표", "Engineering talk")}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {bi("주요 시스템 경계와 실패·복구·검증 설계를 데모와 함께 자연스럽게 설명합니다.", "Explains key system boundaries, failure, recovery and verification naturally alongside demos.")}
          </p>
        </article>
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <StickyNote size={20} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-fg">{bi("심화 연구", "Deep study")}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-3">
            {formatI18nTemplate(String(bi("{value0}개 챕터를 모두 사용하고 각 시스템에 적용할 경계를 토론합니다.", "Uses all {value0} chapters and turns each boundary into a discussion for participants' systems.")), { value0: ENGINEERING_CHAPTERS.length })}
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
