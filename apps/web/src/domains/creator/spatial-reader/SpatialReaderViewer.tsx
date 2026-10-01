import {
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  Glasses,
  Image as ImageIcon,
  LogOut,
  Pause,
  Play,
  ScanLine,
} from "lucide-react";
import type { RefObject } from "react";

import type { SpatialBook } from "./spatial-book";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type SpatialView = "2d" | "spatial";
export type XrMode = "immersive-vr" | "immersive-ar";
/** null = 아직 확인 중(또는 확인 불가). */
export interface XrSupport {
  readonly vr: boolean | null;
  readonly ar: boolean | null;
}

const SEGMENT_BUTTON = "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function ViewToggle({ view, onView }: { view: SpatialView; onView: (view: SpatialView) => void }) {
  const bt = useBilingual("StudioSpatialReader");
  const options: readonly { value: SpatialView; label: string; icon: typeof ImageIcon }[] = [
    { value: "2d", label: bt("일반 보기", "Flat view"), icon: ImageIcon },
    { value: "spatial", label: bt("공간 보기", "Spatial view"), icon: Box },
  ];
  return (
    <div role="group" aria-label={bt("보기 방식", "View mode")} className="inline-flex gap-1 rounded-2xl border border-line bg-canvas/60 p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onView(value)}
            className={cn(SEGMENT_BUTTON, active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg")}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 지원 여부를 먼저 알려 주고, 미지원이면 버튼을 비활성화해 눌러 보고 실패하는 일을 줄인다. */
function XrControls({ xr, onEnter, onExit }: { xr: XrSupport; onEnter: (mode: XrMode) => void; onExit: () => void }) {
  const bt = useBilingual("StudioSpatialReader");
  const status = (supported: boolean | null) =>
    supported === null ? bt("확인 중", "Checking") : supported ? bt("사용 가능", "Available") : bt("이 기기 미지원", "Not supported here");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onEnter("immersive-vr")}
          disabled={xr.vr === false}
          className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}
        >
          <Glasses size={15} aria-hidden />
          {bt("VR 감상 시작", "Start VR")}
        </button>
        <button
          type="button"
          onClick={() => onEnter("immersive-ar")}
          disabled={xr.ar === false}
          className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}
        >
          <ScanLine size={15} aria-hidden />
          {bt("AR로 방에 놓기", "Place in AR")}
        </button>
        <button type="button" onClick={onExit} className={buttonClass({ size: "md", variant: "quiet", className: "gap-1.5" })}>
          <LogOut size={15} aria-hidden />
          {bt("AR/VR 종료", "Exit AR/VR")}
        </button>
      </div>
      <p className="text-xs text-fg-2">
        VR · {status(xr.vr)} / AR · {status(xr.ar)}
      </p>
    </div>
  );
}

export function SpatialReaderViewer({
  book,
  index,
  view,
  auto,
  runtimeReady,
  xr,
  hostRef,
  audioRef,
  headingRef,
  captionUrl,
  onView,
  onFocus,
  onToggleAuto,
  onEnter,
  onExit,
  onExport,
}: {
  book: SpatialBook;
  index: number;
  view: SpatialView;
  auto: boolean;
  runtimeReady: boolean;
  xr: XrSupport;
  hostRef: RefObject<HTMLDivElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  /** 작품을 연 직후 이 제목으로 초점을 옮겨 감상 영역의 시작을 알린다. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  captionUrl: string;
  onView: (view: SpatialView) => void;
  onFocus: (index: number) => void;
  onToggleAuto: () => void;
  onEnter: (mode: XrMode) => void;
  onExit: () => void;
  onExport: () => void;
}) {
  const bt = useBilingual("StudioSpatialReader");
  const panel = book.panels[index];
  if (!panel) return null;
  const total = book.panels.length;
  const position = formatI18nTemplate(bt("{current} / {total}컷", "Panel {current} / {total}"), { current: index + 1, total });

  return (
    <section aria-labelledby="spatial-reader-book-title" className="flex flex-col gap-4 rounded-3xl border border-line bg-card/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-accent">NOW READING</p>
          <h2
            ref={headingRef}
            id="spatial-reader-book-title"
            tabIndex={-1}
            className="mt-1 scroll-mt-24 truncate text-xl font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {book.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onView={onView} />
          <button type="button" onClick={onExport} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <Download size={15} aria-hidden />
            {bt("작품 파일 내보내기", "Export work file")}
          </button>
        </div>
      </div>

      {view === "spatial" ? (
        <div className="relative">
          <div
            ref={hostRef}
            className="h-[min(70vh,650px)] min-h-80 overflow-hidden rounded-2xl border border-line bg-canvas"
            aria-label={formatI18nTemplate(bt("{n}번째 컷의 공간 감상 화면", "Spatial view of panel {n}"), { n: index + 1 })}
          />
          {!runtimeReady ? (
            <div role="status" className="absolute inset-0 grid place-items-center rounded-2xl bg-canvas/80">
              <div className="flex flex-col items-center gap-3 text-center">
                <span aria-hidden className="skeleton block size-16 rounded-2xl" />
                <p className="text-sm font-semibold text-fg">{bt("3D 공간을 준비하고 있어요", "Preparing the 3D space")}</p>
                <p className="max-w-xs text-xs text-fg-2">
                  {bt("그래픽 기능을 불러오는 중입니다. 문제가 생기면 일반 보기로 자동 전환해요.", "Loading graphics. If anything fails, we switch back to the flat view automatically.")}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-line bg-canvas p-4 sm:p-6">
          <img src={panel.src} alt={panel.alt || panel.title} className="max-h-[72vh] max-w-full object-contain" />
        </div>
      )}

      <div className="rounded-2xl border border-line bg-panel/60 px-4 py-3" aria-live="polite">
        <p className="text-sm font-semibold text-fg">
          <span className="numeral text-accent">{position}</span> · {panel.title}
        </p>
        {panel.caption ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{panel.caption}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onFocus(index - 1)}
          className={buttonClass({ size: "md", variant: "outline", className: "gap-1" })}
        >
          <ChevronLeft size={16} aria-hidden />
          {bt("이전 컷", "Previous")}
        </button>
        <button
          type="button"
          aria-pressed={auto}
          onClick={onToggleAuto}
          className={buttonClass({ size: "md", variant: auto ? "solid" : "outline", className: "gap-1.5" })}
        >
          {auto ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {auto ? bt("자동 넘김 멈춤", "Stop auto-advance") : bt("자동 넘김 시작", "Start auto-advance")}
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onFocus(index + 1)}
          className={buttonClass({ size: "md", variant: "outline", className: "gap-1" })}
        >
          {bt("다음 컷", "Next")}
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={bt("전체 컷 탐색", "All panels")}>
        {book.panels.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-current={i === index ? "true" : undefined}
            aria-label={formatI18nTemplate(bt("{n}번째 컷 {title}", "Panel {n} {title}"), { n: i + 1, title: item.title })}
            onClick={() => onFocus(i)}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-xl border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              i === index ? "border-accent" : "border-line hover:border-line-strong",
            )}
          >
            <img loading="lazy" src={item.src} alt="" className="size-20 object-cover" />
            <span className="numeral absolute bottom-1 left-1 rounded-md bg-canvas/85 px-1.5 text-[0.72rem] font-semibold text-fg">{i + 1}</span>
          </button>
        ))}
      </div>

      {view === "spatial" ? <XrControls xr={xr} onEnter={onEnter} onExit={onExit} /> : null}

      {book.audio ? (
        <audio ref={audioRef} controls src={book.audio} aria-label={bt("작품 음악 또는 내레이션", "Work music or narration")} className="w-full">
          <track kind="captions" src={captionUrl || undefined} srcLang="ko" label={bt("작가가 입력한 컷 대사", "Author's panel dialogue")} default />
        </audio>
      ) : null}

      <div className="rounded-2xl border border-line bg-panel/40 p-4">
        <p className="text-xs font-semibold text-fg">{bt("조작 안내", "Controls")}</p>
        <ul className="mt-2 grid gap-2 text-xs text-fg-2 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex items-center gap-2">
            <kbd className="rounded-md border border-line-strong bg-raised px-1.5 py-0.5 font-sans text-[0.72rem] text-fg">← →</kbd>
            {bt("이전·다음 컷", "Previous / next panel")}
          </li>
          <li className="flex items-center gap-2">
            <kbd className="rounded-md border border-line-strong bg-raised px-1.5 py-0.5 font-sans text-[0.72rem] text-fg">Home End</kbd>
            {bt("처음·마지막 컷", "First / last panel")}
          </li>
          <li>{bt("썸네일을 누르면 그 컷으로 바로 이동해요.", "Tap a thumbnail to jump to that panel.")}</li>
          <li>{bt("공간 보기에서는 컷이나 ‘이전·다음’ 판을 누르거나, VR 컨트롤러로 선택해요.", "In spatial view, tap a panel or the prev/next plates, or select with a VR controller.")}</li>
        </ul>
      </div>
    </section>
  );
}
