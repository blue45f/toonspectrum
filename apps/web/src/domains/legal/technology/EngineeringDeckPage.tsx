import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MonitorUp,
  PanelRight,
  Play,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import {
  DeckClock,
  DeckOverview,
  DeckPresenterPanel,
  DeckSectionStrip,
  DeckShortcutList,
  DeckTimerControls,
} from "./EngineeringDeckPresenter";
import { EngineeringSeminarPrep } from "./EngineeringSeminarPrep";
import { EngineeringSeminarResources } from "./EngineeringSeminarResources";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";
import { buildOfflineEngineeringDeck, downloadOfflineEngineeringDeck } from "./engineering-deck-export";
import {
  DECK_TRACK_META,
  buildDeckTrack,
  deckTrackSlideCount,
  deckTrackTotalSeconds,
  formatClock,
  type DeckTrackModel,
} from "./engineering-deck-model";
import { DECK_TRACKS, engineeringDeckHref } from "./engineering-deck-state";
import { ENGINEERING_SEMINAR_MODULES } from "./engineering-playbook-content";
import type { LocalizedText } from "./engineering-story-content";
import {
  deckCommandForKey,
  exitDocumentFullscreen,
  requestDocumentFullscreen,
  useDeckPosition,
  useDeckSync,
  useDeckTimer,
  useFullscreenState,
  useSlideNumberJump,
  useSwipeNavigation,
  type DeckTimer,
} from "./use-engineering-deck";
import { useEngineeringLocale } from "./use-engineering-locale";
import "./engineering-deck.css";

import { ServiceStoryJourney } from "@/shared/components/service-story-journey";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  translateBilingualValueForLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const SCOPE = "EngineeringDeckPage";
const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale(SCOPE, ko, en);

const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45";
const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/* ── 모달 계층(발표 화면) ──────────────────────────────────── */

/** 발표 화면이 열려 있는 동안 배경을 inert로 만들고, 포커스를 가두고, 닫히면 되돌린다. */
function useModalLayer(active: boolean, containerRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== container && !element.contains(container))
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of siblings) element.inert = true;
    document.body.style.overflow = "hidden";
    container?.focus();
    const trapTab = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !container) return;
      const controls = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), select, a[href], summary, [tabindex="0"]'))
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert } of siblings) element.inert = inert;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [active, containerRef]);
}

/* ── 조작 막대 ─────────────────────────────────────────────── */

function SlideNavigator({
  model,
  index,
  onGo,
  compact = false,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onGo: (index: number) => void;
  readonly compact?: boolean;
}) {
  useBilingualI18nRevision();
  const last = model.slides.length - 1;
  return (
    <div className={cx("flex min-w-0 items-center gap-2", compact ? "flex-none" : "flex-1")}>
      <button type="button" className={CONTROL_BUTTON} disabled={index <= 0} onClick={() => onGo(index - 1)}>
        <ChevronLeft size={18} aria-hidden="true" />
        <span className={compact ? "sr-only" : "max-sm:sr-only"}>{bi("이전", "Previous")}</span>
      </button>
      <label className={cx("min-w-0", compact ? "w-28" : "flex-1")}>
        <span className="sr-only">{bi("발표 슬라이드 선택", "Select presentation slide")}</span>
        <select
          aria-label={bi("발표 슬라이드 선택", "Select presentation slide")}
          value={index}
          onChange={(event) => onGo(Number(event.currentTarget.value))}
          className="min-h-11 w-full min-w-0 truncate rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {model.slides.map((slide, slideIndex) => (
            <option key={slide.id} value={slideIndex}>
              {compact ? `${slideIndex + 1} / ${model.slides.length}` : `${slideIndex + 1}. ${slide.title}`}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={CONTROL_BUTTON} disabled={index >= last} onClick={() => onGo(index + 1)}>
        <span className={compact ? "sr-only" : "max-sm:sr-only"}>{bi("다음", "Next")}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  readonly label: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" className={CONTROL_BUTTON} aria-pressed={pressed} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label}>
      {children}
      <span className="deck-hud-label">{label}</span>
      {shortcut ? <kbd className="deck-kbd max-md:hidden" aria-hidden="true">{shortcut}</kbd> : null}
    </button>
  );
}

/* ── 발표자 창(두 번째 화면) ───────────────────────────────── */

function PresenterWindow({
  model,
  index,
  timer,
  onGo,
  syncAvailable,
  jumpBuffer,
  overviewOpen,
  onToggleOverview,
  helpOpen,
  onToggleHelp,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onGo: (index: number) => void;
  readonly syncAvailable: boolean;
  readonly jumpBuffer: string;
  readonly overviewOpen: boolean;
  readonly onToggleOverview: () => void;
  readonly helpOpen: boolean;
  readonly onToggleHelp: () => void;
}) {
  useBilingualI18nRevision();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelHeadingId = useId();
  useModalLayer(true, containerRef);
  const slide = model.slides[index];
  if (!slide) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={bi("발표자 화면", "Presenter view")}
      className="deck-present"
      data-notes="true"
    >
      <div className="deck-present__stage">
        <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} fixed />
        {overviewOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { onGo(slideIndex); onToggleOverview(); }} />
          </div>
        ) : null}
        {helpOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
            <DeckShortcutList className="mx-auto max-w-3xl" />
          </div>
        ) : null}
      </div>
      <aside className="deck-present__notes p-4" aria-labelledby={panelHeadingId}>
        <DeckPresenterPanel model={model} index={index} timer={timer} onJump={onGo} headingId={panelHeadingId} />
      </aside>
      <div className="deck-present__hud">
        <SlideNavigator model={model} index={index} onGo={onGo} compact />
        <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={onToggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("도움말", "Help")} shortcut="?" pressed={helpOpen} onClick={onToggleHelp}><Keyboard size={16} aria-hidden="true" /></ToolbarButton>
        <span className="text-xs font-bold text-fg-3" role="status">
          {syncAvailable ? bi("청중 화면과 같은 슬라이드로 맞춰집니다", "Synced with the audience screen") : bi("이 브라우저는 창 간 동기화를 지원하지 않습니다", "This browser cannot sync windows")}
          {jumpBuffer ? ` · ${formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jumpBuffer })}` : ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}

/* ── 청중 발표 화면 ────────────────────────────────────────── */

function PresentationLayer({
  model,
  index,
  timer,
  onGo,
  notesOpen,
  onToggleNotes,
  overviewOpen,
  onToggleOverview,
  blackout,
  onToggleBlackout,
  helpOpen,
  fullscreen,
  onToggleFullscreen,
  onExit,
  notice,
  jumpBuffer,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly timer: DeckTimer;
  readonly onGo: (index: number) => void;
  readonly notesOpen: boolean;
  readonly onToggleNotes: () => void;
  readonly overviewOpen: boolean;
  readonly onToggleOverview: () => void;
  readonly blackout: boolean;
  readonly onToggleBlackout: () => void;
  readonly helpOpen: boolean;
  readonly fullscreen: boolean;
  readonly onToggleFullscreen: () => void;
  readonly onExit: () => void;
  readonly notice: string;
  readonly jumpBuffer: string;
}) {
  useBilingualI18nRevision();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelHeadingId = useId();
  useModalLayer(true, containerRef);
  const swipe = useSwipeNavigation(() => onGo(index + 1), () => onGo(index - 1));
  const slide = model.slides[index];
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  if (!slide) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={bi("기술 발표 화면", "Engineering presentation")}
      data-deck-stage="true"
      data-notes={notesOpen ? "true" : undefined}
      className="deck-present"
    >
      <div className="deck-present__stage" {...swipe}>
        <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} />
        {blackout ? (
          <button type="button" className="deck-present__blackout" onClick={onToggleBlackout} aria-label={bi("블랙아웃 해제", "End blackout")}>
            <span aria-hidden="true">B</span>
          </button>
        ) : null}
        {overviewOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { onGo(slideIndex); onToggleOverview(); }} />
          </div>
        ) : null}
        {helpOpen ? (
          <div className="deck-present__overlay" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
            <div className="mx-auto grid max-w-3xl gap-4">
              <p className="text-lg font-black text-fg">{bi("발표 단축키", "Presentation shortcuts")}</p>
              <DeckShortcutList />
            </div>
          </div>
        ) : null}
      </div>
      {notesOpen ? (
        <aside className="deck-present__notes p-4" aria-labelledby={panelHeadingId}>
          <DeckPresenterPanel model={model} index={index} timer={timer} onJump={onGo} headingId={panelHeadingId} />
        </aside>
      ) : null}
      <div className="deck-present__hud">
        <SlideNavigator model={model} index={index} onGo={onGo} compact />
        <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} compact />
        <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={onToggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("발표자 노트", "Speaker notes")} shortcut="N" pressed={notesOpen} onClick={onToggleNotes}><PanelRight size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={bi("블랙아웃", "Blackout")} shortcut="B" pressed={blackout} onClick={onToggleBlackout}><EyeOff size={16} aria-hidden="true" /></ToolbarButton>
        <ToolbarButton label={fullscreen ? bi("전체 화면 끄기", "Exit fullscreen") : bi("전체 화면", "Fullscreen")} shortcut="F" pressed={fullscreen} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        </ToolbarButton>
        <button type="button" className={CONTROL_BUTTON} onClick={onExit}>
          <X size={16} aria-hidden="true" />
          <span className="deck-hud-label">{bi("발표 종료", "Exit presentation")}</span>
          <kbd className="deck-kbd max-md:hidden" aria-hidden="true">Esc</kbd>
        </button>
        <p className="sr-only" role="status" aria-live="polite">{index + 1} / {model.slides.length} · {slide.title}</p>
        {notice || jumpBuffer ? (
          <p className="basis-full text-center text-xs font-bold text-fg-2" role="status">
            {jumpBuffer ? formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jumpBuffer }) : notice}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ── 워크숍 확장 모듈 ──────────────────────────────────────── */

function WorkshopModules() {
  useBilingualI18nRevision();
  const totalMinutes = ENGINEERING_SEMINAR_MODULES.reduce((sum, module) => sum + module.minutes, 0);
  return (
    <details data-eng-disclosure="" className="group mt-4 rounded-3xl border border-line/70 bg-panel/60">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.12em] text-accent">{bi("워크숍으로 확장", "Extend into a workshop")}</span>
          <span className="mt-1 block text-base font-black text-fg">
            {formatI18nTemplate(String(bi("모듈형 실습 {value0}개 · 권장 {value1}분", "{value0} modular sessions · about {value1} minutes")), { value0: ENGINEERING_SEMINAR_MODULES.length, value1: totalMinutes })}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-accent transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-line/70 p-5">
        <p className="max-w-3xl text-sm leading-7 text-fg-2">
          {bi(
            "세미나 뒤 스터디나 사내 워크숍으로 이어갈 때 쓰는 모듈입니다. 표시 시간은 토론과 데모를 포함한 권장 범위이며, 필요한 모듈만 골라도 흐름이 이어집니다.",
            "Use these modules to continue into a study group or internal workshop. Times are recommendations including discussion and demos; any subset keeps the flow coherent.",
          )}
        </p>
        <ol className="mt-5 grid gap-3 lg:grid-cols-2">
          {ENGINEERING_SEMINAR_MODULES.map((module, moduleIndex) => (
            <li key={module.id} className="grid gap-3 rounded-2xl border border-line bg-card/70 p-4">
              <p className="flex items-center justify-between gap-3">
                <span className="text-base font-black text-fg">
                  <span className="mr-2 font-display text-accent">{String(moduleIndex + 1).padStart(2, "0")}</span>
                  {bi(module.title.ko, module.title.en)}
                </span>
                <span className="shrink-0 font-display text-xs font-bold text-fg-3">{formatI18nTemplate(String(bi("{value0}분", "{value0} min")), { value0: module.minutes })}</span>
              </p>
              <ul className="grid gap-1.5 text-sm leading-6 text-fg-2">
                {module.learning.map((item) => <li key={item.ko} className="flex gap-2"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{bi(item.ko, item.en)}</li>)}
              </ul>
              <p className="text-xs leading-6 text-fg-3"><strong className="text-fg-2">{bi("데모: ", "Demo: ")}</strong>{bi(module.demo.ko, module.demo.en)}</p>
              <p className="rounded-xl bg-raised/70 p-3 text-xs font-bold leading-6 text-fg-2">{bi(module.discussion.ko, module.discussion.en)}</p>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

/* ── 페이지 ────────────────────────────────────────────────── */

export function EngineeringDeckPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const localize = useCallback(
    (text: LocalizedText) => translateBilingualValueForLocale(locale, SCOPE, text.ko, text.en),
    [locale],
  );

  const position = useDeckPosition(deckTrackSlideCount);
  const model = useMemo(() => buildDeckTrack(position.track, localize), [position.track, localize]);
  const sync = useDeckSync({ track: position.track, index: position.index }, position.applyRemote);
  const timer = useDeckTimer();
  const fullscreen = useFullscreenState();
  const panelHeadingId = useId();

  const [presenting, setPresenting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const keepPresentingOnFullscreenExit = useRef(false);
  const overviewRef = useRef<HTMLDivElement>(null);
  const isPresenterView = position.view === "presenter";

  const index = position.index;
  const slide = model.slides[index];
  const section = model.sections.find((item) => item.id === slide?.sectionId);
  const trackMeta = DECK_TRACK_META[position.track];

  useDocumentTitle(
    bi("ToonStudio 기술 발표 모드 · 30분 세미나", "ToonStudio engineering presentation · 30-minute seminar"),
  );

  const goTo = position.goTo;
  const jump = useSlideNumberJump(useCallback((slidePosition: number) => goTo(slidePosition - 1), [goTo]));

  const startTimer = timer.start;
  const enterPresentation = useCallback(() => {
    setPresenting(true);
    setOverviewOpen(false);
    setHelpOpen(false);
    startTimer();
    void requestDocumentFullscreen().then((entered) => {
      if (!entered) setNotice(bi("이 브라우저에서는 전체 화면을 쓸 수 없어 화면 안에서 발표합니다.", "Fullscreen is unavailable, so the talk continues in this window."));
    });
  }, [startTimer]);

  const exitPresentation = useCallback(() => {
    setPresenting(false);
    setBlackout(false);
    setOverviewOpen(false);
    setHelpOpen(false);
    setNotice("");
    if (document.fullscreenElement) void exitDocumentFullscreen();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      keepPresentingOnFullscreenExit.current = true;
      void exitDocumentFullscreen();
      return;
    }
    void requestDocumentFullscreen().then((entered) => {
      if (!entered) setNotice(bi("전체 화면 요청이 거부되었습니다.", "The fullscreen request was denied."));
    });
  }, []);

  // 브라우저 Esc로 전체 화면을 빠져나오면 발표 화면도 함께 닫는다(F로 끈 경우는 유지).
  const onFullscreenChange = useEffectEvent((isFullscreen: boolean) => {
    if (isFullscreen) return;
    if (keepPresentingOnFullscreenExit.current) {
      keepPresentingOnFullscreenExit.current = false;
      return;
    }
    if (presenting) exitPresentation();
  });
  const wasFullscreen = useRef(false);
  useEffect(() => {
    if (wasFullscreen.current !== fullscreen) onFullscreenChange(fullscreen);
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);

  const openPresenterWindow = (): void => {
    const href = engineeringDeckHref({ track: position.track, index, view: "presenter" });
    const opened = window.open(href, "toonstudio-deck-presenter", "popup=yes,width=1280,height=800");
    setNotice(opened
      ? bi("발표자 창을 열었습니다. 이 창은 프로젝터에서 발표 시작(F)을 누르세요.", "Presenter window opened. Press Present (F) in this window on the projector.")
      : bi("팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도하세요.", "The popup was blocked. Allow popups and try again."));
  };

  const copyCurrentSlideLink = async (): Promise<void> => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setNotice(bi("현재 슬라이드 링크를 복사했어요.", "Current slide link copied."));
    } catch {
      setNotice(formatI18nTemplate(String(bi("복사할 링크: {value0}", "Copy this link: {value0}")), { value0: href }));
    }
  };

  const downloadOfflineDeck = (): void => {
    downloadOfflineEngineeringDeck(buildOfflineEngineeringDeck(model.slides, locale), `toonstudio-${position.track}-deck.html`);
    setNotice(bi("오프라인 발표본을 만들었습니다. 영상·외부 링크·서비스 기능은 포함하지 않습니다.", "Offline deck created. Videos, external links and service capabilities are not included."));
  };

  const toggleOverview = useCallback(() => {
    setOverviewOpen((open) => !open);
    setHelpOpen(false);
  }, []);
  const toggleHelp = useCallback(() => {
    setHelpOpen((open) => !open);
    setOverviewOpen(false);
  }, []);

  // 인라인 개요를 열면 키보드 사용자가 바로 고를 수 있게 개요로 이동한다.
  useEffect(() => {
    if (!overviewOpen || presenting || isPresenterView) return;
    const region = overviewRef.current;
    region?.scrollIntoView({ block: "start", behavior: "auto" });
    region?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, [overviewOpen, presenting, isPresenterView]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const active = presenting || isPresenterView;
    if (jump.handleKey(event)) {
      event.preventDefault();
      return;
    }
    const command = deckCommandForKey(event, active);
    if (!command) return;
    if (blackout && command !== "blackout" && command !== "present") {
      event.preventDefault();
      setBlackout(false);
      return;
    }
    switch (command) {
      case "next":
        event.preventDefault();
        goTo(index + 1);
        break;
      case "previous":
        event.preventDefault();
        goTo(index - 1);
        break;
      case "first":
        event.preventDefault();
        goTo(0);
        break;
      case "last":
        event.preventDefault();
        goTo(model.slides.length - 1);
        break;
      case "present":
        event.preventDefault();
        if (presenting || isPresenterView) toggleFullscreen();
        else enterPresentation();
        break;
      case "notes":
        event.preventDefault();
        if (presenting) setNotesOpen((open) => !open);
        else if (!isPresenterView) setSidePanelOpen((open) => !open);
        break;
      case "overview":
        event.preventDefault();
        toggleOverview();
        break;
      case "blackout":
        if (!presenting) return;
        event.preventDefault();
        setBlackout((value) => !value);
        break;
      case "timer":
        event.preventDefault();
        timer.toggle();
        break;
      case "help":
        event.preventDefault();
        toggleHelp();
        break;
      case "escape":
        if (helpOpen) setHelpOpen(false);
        else if (overviewOpen) setOverviewOpen(false);
        else if (blackout) setBlackout(false);
        else if (presenting) exitPresentation();
        else return;
        event.preventDefault();
        break;
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  if (!slide) return null;

  if (isPresenterView) {
    return (
      <PresenterWindow
        model={model}
        index={index}
        timer={timer}
        onGo={goTo}
        syncAvailable={sync.available}
        jumpBuffer={jump.buffer}
        overviewOpen={overviewOpen}
        onToggleOverview={toggleOverview}
        helpOpen={helpOpen}
        onToggleHelp={toggleHelp}
      />
    );
  }

  return (
    <EngineeringPageFrame pageId="deck">
      <EngineeringPageIntro
        pageId="deck"
        eyebrow="PRESENTATION MODE"
        title={bi("기술 발표 모드", "Engineering presentation mode")}
        description={bi(
          "30분 세미나 슬라이드와 발표자 도구입니다. 슬라이드는 화면 크기에 맞춰 16:9로 맞춰지고, 키보드로 전체 화면(F)·발표자 노트(N)·개요(O)·블랙아웃(B)을 조작합니다.",
          "Slides and presenter tools for a 30-minute seminar. Slides scale to fit at 16:9, and the keyboard controls fullscreen (F), speaker notes (N), overview (O) and blackout (B).",
        )}
        aside={
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" className={PRIMARY_BUTTON} onClick={enterPresentation}>
              <Play size={17} aria-hidden="true" />
              {bi("발표 시작", "Start presenting")}
              <kbd className="deck-kbd" aria-hidden="true">F</kbd>
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={openPresenterWindow}>
              <MonitorUp size={16} aria-hidden="true" />
              {bi("발표자 창 열기", "Open presenter window")}
            </button>
          </div>
        }
      />

      <section data-engineering-deck-shell="true" aria-labelledby="deck-preview-title" className="grid gap-4">
        <h2 id="deck-preview-title" className="sr-only">{bi("발표 미리보기와 조작", "Presentation preview and controls")}</h2>

        <div className="grid gap-3 rounded-3xl border border-line/70 bg-panel/65 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div role="group" aria-label={bi("발표 트랙", "Presentation track")} className="grid grid-cols-3 gap-2">
            {DECK_TRACKS.map((track) => {
              const meta = DECK_TRACK_META[track];
              const selected = track === position.track;
              const minutes = Math.round(deckTrackTotalSeconds(track) / 60);
              return (
                <button
                  key={track}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    position.setTrack(track);
                    setNotice("");
                  }}
                  className={cx(
                    "flex min-h-14 min-w-0 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  <span className="text-sm font-black">{bi(meta.label.ko, meta.label.en)}</span>
                  {/* 좁은 화면에서도 "19장"이 쪼개지지 않도록 시간과 장수를 따로 줄바꿈한다. */}
                  <span className={cx("flex flex-wrap gap-x-1 text-xs font-bold", selected ? "text-on-accent/80" : "text-fg-3")}>
                    <span className="whitespace-nowrap">
                      {formatI18nTemplate(String(bi("약 {value0}분 ·", "~{value0} min ·")), { value0: minutes })}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatI18nTemplate(String(bi("{value0}장", "{value0} slides")), { value0: deckTrackSlideCount(track) })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CONTROL_BUTTON} onClick={() => void copyCurrentSlideLink()}>
              <Copy size={15} aria-hidden="true" />
              {bi("슬라이드 링크", "Slide link")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={() => window.print()}>
              <Printer size={15} aria-hidden="true" />
              {bi("인쇄·PDF", "Print · PDF")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={downloadOfflineDeck}>
              <Download size={15} aria-hidden="true" />
              {bi("오프라인 발표본", "Offline deck")}
            </button>
          </div>
        </div>
        <p className="px-1 text-xs leading-6 text-fg-3">{bi(trackMeta.description.ko, trackMeta.description.en)}</p>

        {position.resumeIndex !== null && position.resumeIndex !== index ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/25 px-4 py-3 text-sm text-fg-2" role="status">
            <RotateCcw size={16} className="text-accent" aria-hidden="true" />
            <span className="flex-1">
              {formatI18nTemplate(String(bi("이 탭에서 {value0}번 슬라이드까지 보셨어요.", "You were on slide {value0} in this tab.")), { value0: position.resumeIndex + 1 })}
            </span>
            <button type="button" className={CONTROL_BUTTON} onClick={() => goTo(position.resumeIndex ?? 0)}>
              {bi("이어서 보기", "Resume")}
            </button>
            <button type="button" className={CONTROL_BUTTON} onClick={position.dismissResume} aria-label={bi("이어보기 안내 닫기", "Dismiss resume prompt")}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {notice && !presenting ? (
          <p className="rounded-2xl border border-accent/25 bg-accent-soft/25 px-4 py-3 text-sm leading-6 text-fg-2" role="status">{notice}</p>
        ) : null}

        <div className={cx("grid gap-4", sidePanelOpen && "xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start")}>
          <div data-deck-stage="true" className="grid min-w-0 gap-3">
            {presenting ? (
              <div className="grid aspect-video place-items-center rounded-3xl border border-dashed border-line-strong bg-card/50 p-6 text-center">
                <p className="text-sm font-bold text-fg-2">{bi("발표 화면이 열려 있습니다. Esc로 돌아옵니다.", "The presentation is open. Press Esc to return.")}</p>
              </div>
            ) : (
              <EngineeringDeckSlide slide={slide} index={index} total={model.slides.length} sections={model.sections} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <SlideNavigator model={model} index={index} onGo={goTo} />
              <div className="flex flex-wrap gap-2">
                <ToolbarButton label={bi("개요", "Overview")} shortcut="O" pressed={overviewOpen} onClick={toggleOverview}><LayoutGrid size={16} aria-hidden="true" /></ToolbarButton>
                <ToolbarButton label={bi("발표자 노트", "Speaker notes")} shortcut="N" pressed={sidePanelOpen} onClick={() => setSidePanelOpen((open) => !open)}>
                  {sidePanelOpen ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                </ToolbarButton>
                <ToolbarButton label={bi("단축키", "Shortcuts")} shortcut="?" pressed={helpOpen} onClick={toggleHelp}><Keyboard size={16} aria-hidden="true" /></ToolbarButton>
              </div>
            </div>
            <div className="grid gap-2 rounded-2xl border border-line/70 bg-card/50 px-4 py-3">
              <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-fg-3">
                <span>
                  {section ? `${String(section.order).padStart(2, "0")} · ${section.title}` : bi(trackMeta.label.ko, trackMeta.label.en)}
                  {section ? ` · ${formatClock(section.seconds)}` : ""}
                </span>
                <span className="font-display tabular-nums">{index + 1} / {model.slides.length}</span>
              </p>
              <DeckSectionStrip model={model} index={index} />
            </div>
            {jump.buffer ? (
              <p className="text-xs font-bold text-accent" role="status">
                {formatI18nTemplate(String(bi("{value0}번으로 이동: Enter", "Go to {value0}: Enter")), { value0: jump.buffer })}
              </p>
            ) : null}
            {helpOpen ? (
              <div className="rounded-3xl border border-line/70 bg-card/65 p-5" role="region" aria-label={bi("단축키 도움말", "Shortcut help")}>
                <p className="mb-3 text-sm font-black text-fg">{bi("발표 단축키 (입력 칸 밖에서 동작)", "Presentation shortcuts (outside text fields)")}</p>
                <DeckShortcutList />
              </div>
            ) : null}
          </div>

          {sidePanelOpen ? (
            <aside className="rounded-3xl border border-line/70 bg-panel/60 p-3" aria-labelledby={panelHeadingId}>
              <DeckPresenterPanel model={model} index={index} timer={timer} onJump={goTo} headingId={panelHeadingId} />
            </aside>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/70 bg-card/50 p-3">
              <DeckClock timer={timer} slide={slide} section={section} totalSeconds={model.totalSeconds} compact />
              <DeckTimerControls timer={timer} />
            </div>
          )}
        </div>

        {overviewOpen && !presenting ? (
          <div ref={overviewRef} className="scroll-mt-28 rounded-3xl border border-line/70 bg-panel/60 p-4" role="region" aria-label={bi("슬라이드 개요", "Slide overview")}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-fg">{bi("슬라이드 개요 · 누르면 이동", "Slide overview · select to jump")}</p>
              <button type="button" className={CONTROL_BUTTON} onClick={() => setOverviewOpen(false)}>
                <X size={15} aria-hidden="true" />
                {bi("닫기", "Close")}
              </button>
            </div>
            <DeckOverview model={model} index={index} onSelect={(slideIndex) => { goTo(slideIndex); setOverviewOpen(false); }} />
          </div>
        ) : null}
      </section>

      <ServiceStoryJourney current="deck" className="mt-8" />

      {position.track === "talk" ? <EngineeringSeminarPrep model={model} onJump={goTo} /> : null}
      <WorkshopModules />
      <EngineeringSeminarResources />

      <div data-engineering-print-deck="true" aria-hidden="true">
        {model.slides.map((printSlide, slideIndex) => (
          <EngineeringDeckSlide
            key={printSlide.id}
            slide={printSlide}
            index={slideIndex}
            total={model.slides.length}
            sections={model.sections}
            fixed
            decorative
          />
        ))}
      </div>

      {presenting ? (
        <PresentationLayer
          model={model}
          index={index}
          timer={timer}
          onGo={goTo}
          notesOpen={notesOpen}
          onToggleNotes={() => setNotesOpen((open) => !open)}
          overviewOpen={overviewOpen}
          onToggleOverview={toggleOverview}
          blackout={blackout}
          onToggleBlackout={() => setBlackout((value) => !value)}
          helpOpen={helpOpen}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onExit={exitPresentation}
          notice={notice}
          jumpBuffer={jump.buffer}
        />
      ) : null}
    </EngineeringPageFrame>
  );
}
