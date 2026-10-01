import { BookOpen, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  localSpatialImage,
  nextSpatialPanel,
  parseSpatialBook,
  SPATIAL_MAX_AUDIO_BYTES,
  SPATIAL_MAX_BOOK_BYTES,
  SPATIAL_MAX_PANELS,
  type SpatialBook,
  type SpatialPanel,
} from "./spatial-book";
import { spatialBookVtt } from "./spatial-book-captions";
import type { SpatialReaderRuntime } from "./spatial-reader-runtime";
import { createSampleSpatialBook, type SpatialSampleCopy } from "./spatial-sample-book";
import { SpatialReaderEditPanel } from "./SpatialReaderEditPanel";
import { SpatialReaderIntro } from "./SpatialReaderIntro";
import { SpatialReaderViewer, type SpatialView, type XrMode, type XrSupport } from "./SpatialReaderViewer";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type SpatialReaderFactory = typeof import("./spatial-reader-runtime")["createSpatialReader"];

/** 여러 장을 한 번에 열 때 이미지 데이터 총량 상한(작품 파일 상한보다 여유를 둔다). */
const MAX_TOTAL_IMAGE_CHARS = 64_000_000;
const DEFAULT_PANEL_SECONDS = 6;
const MS_PER_SECOND = 1000;
const DEFAULT_AR_SCALE = 0.65;

function savedIndex(book: SpatialBook): number {
  try {
    return nextSpatialPanel(Number(localStorage.getItem(`toonstudio-spatial-progress:${book.id}`)) || 0, 0, book.panels.length);
  } catch {
    return 0;
  }
}

function downloadBook(book: SpatialBook): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(parseSpatialBook(book))], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "toonstudio-spatial-book.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function StudioSpatialReaderPage() {
  const bt = useBilingual("StudioSpatialReader");
  const [book, setBook] = useState<SpatialBook | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<SpatialView>("2d");
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(DEFAULT_AR_SCALE);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [xr, setXr] = useState<XrSupport>({ vr: null, ar: null });
  const [captionUrl, setCaptionUrl] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<SpatialReaderRuntime | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const viewerHeading = useRef<HTMLHeadingElement>(null);
  const loadGeneration = useRef(0);
  // 비동기 파일 읽기가 끝난 시점의 최신 작품(편집 중 다른 작품으로 바뀌었는지 확인용).
  const bookRef = useRef<SpatialBook | null>(book);
  const panel = book?.panels[index];
  const openedBookId = book?.id ?? null;

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  // 새 작품을 열면 감상 영역으로 이동하고 제목에 초점을 둔다(모바일에서 긴 안내 아래로 직접 스크롤하지 않게).
  useEffect(() => {
    const heading = viewerHeading.current;
    if (!openedBookId || !heading) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    heading.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }, [openedBookId]);

  useEffect(() => {
    if (!book?.audio) {
      setCaptionUrl("");
      return;
    }
    const url = URL.createObjectURL(new Blob([spatialBookVtt(book)], { type: "text/vtt" }));
    setCaptionUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book]);

  // 공간 보기를 켤 때 만든 시점의 컷 위치·AR 크기로 3D 장면을 준비한다.
  const createRuntime = useEffectEvent((factory: SpatialReaderFactory, element: HTMLElement, target: SpatialBook) => {
    const created = factory(element, target, index, setIndex, setStatus, (message) => {
      setError(message);
      setView("2d");
    });
    created.setScale(scale);
    return created;
  });

  useEffect(() => {
    const element = host.current;
    if (!book || view !== "spatial" || !element) return;
    let disposed = false;
    let current: SpatialReaderRuntime | null = null;
    setRuntimeReady(false);
    void import("./spatial-reader-runtime")
      .then(({ createSpatialReader }) => {
        if (disposed) return;
        current = createRuntime(createSpatialReader, element, book);
        runtime.current = current;
        setRuntimeReady(true);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(errorText(cause, bt("공간 화면을 준비하지 못했어요. 일반 보기로 전환했어요.", "Couldn't prepare the spatial view. Switched to the flat view.")));
        setView("2d");
      });
    return () => {
      disposed = true;
      current?.destroy();
      if (runtime.current === current) runtime.current = null;
    };
  }, [book, bt, view]);

  useEffect(() => {
    if (book) {
      try {
        localStorage.setItem(`toonstudio-spatial-progress:${book.id}`, String(index));
      } catch {
        /* Reading never depends on browser storage. */
      }
    }
  }, [book, index]);

  // 자동 넘김 — 컷마다 지정한 감상 시간 뒤 다음 컷으로. 탭이 숨겨지거나 마지막 컷이면 멈춘다.
  useEffect(() => {
    if (!book || !auto) return;
    const seconds = book.panels[index]?.seconds ?? DEFAULT_PANEL_SECONDS;
    const timer = setTimeout(() => {
      if (document.hidden || index >= book.panels.length - 1) {
        setAuto(false);
        audio.current?.pause();
        return;
      }
      const next = index + 1;
      runtime.current?.focus(next);
      setIndex(next);
    }, seconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [auto, book, index]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!book || event.isComposing) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? book.panels.length - 1
        : nextSpatialPanel(index, event.key === "ArrowRight" ? 1 : -1, book.panels.length);
    runtime.current?.focus(next);
    setIndex(next);
    setAuto(false);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onKeyDown(event);
    const onVisibility = () => {
      if (document.hidden) {
        setAuto(false);
        audio.current?.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // AR/VR 지원 여부는 권한 요청 없이 확인만 한다(세션 요청은 버튼을 누를 때만).
  useEffect(() => {
    let cancelled = false;
    const system = typeof navigator === "undefined" ? undefined : navigator.xr;
    if (!window.isSecureContext || !system) {
      setXr({ vr: false, ar: false });
      return;
    }
    void Promise.all([
      system.isSessionSupported("immersive-vr").catch(() => false),
      system.isSessionSupported("immersive-ar").catch(() => false),
    ]).then(([vr, ar]) => {
      if (!cancelled) setXr({ vr, ar });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 작품 열기 공통 흐름 — 늦게 끝난 이전 요청이 새 작품을 덮어쓰지 않게 세대를 비교한다. */
  async function openWith(load: () => Promise<{ book: SpatialBook; index: number; message: string } | null>, fallback: string) {
    const version = ++loadGeneration.current;
    setBusy(true);
    setError("");
    setAuto(false);
    try {
      const result = await load();
      if (!result || version !== loadGeneration.current) return;
      setBook(result.book);
      setIndex(result.index);
      setStatus(result.message);
    } catch (cause) {
      if (version === loadGeneration.current) setError(errorText(cause, fallback));
    } finally {
      if (version === loadGeneration.current) setBusy(false);
    }
  }

  function openImages(files: File[]) {
    const version = loadGeneration.current + 1;
    void openWith(async () => {
      if (!files.length || files.length > SPATIAL_MAX_PANELS) throw new Error(bt("1~32컷을 선택해 주세요.", "Choose 1–32 panels."));
      const panels: SpatialPanel[] = [];
      let total = 0;
      for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))) {
        const src = await localSpatialImage(file);
        if (version !== loadGeneration.current) return null;
        total += src.length;
        if (total > MAX_TOTAL_IMAGE_CHARS) throw new Error(bt("이미지 총량이 너무 커요. 작품을 나누어 주세요.", "The images are too large in total. Split the work."));
        panels.push({
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^.]+$/u, "").slice(0, 120),
          caption: "",
          alt: file.name.slice(0, 120),
          src,
          seconds: DEFAULT_PANEL_SECONDS,
          layers: [],
        });
      }
      const next = parseSpatialBook({ format: "toonstudio-spatial-book", version: 1, id: crypto.randomUUID(), title: bt("나의 공간 웹툰", "My spatial webtoon"), panels });
      return {
        book: next,
        index: 0,
        message: bt("파일 이름 순서로 컷을 열었어요. 내보내기를 하면 이미지·자막·깊이 레이어를 함께 보관합니다.", "Opened panels in file-name order. Export keeps images, captions and depth layers together."),
      };
    }, bt("이미지를 열지 못했어요.", "Couldn't open the images."));
  }

  function openBook(file: File) {
    void openWith(async () => {
      if (file.size > SPATIAL_MAX_BOOK_BYTES) throw new Error(bt("공간 웹툰 파일은 80MB 이하여야 해요.", "Spatial webtoon files must be 80MB or smaller."));
      const next = parseSpatialBook(JSON.parse(await file.text()));
      return { book: next, index: savedIndex(next), message: bt("저장한 공간 웹툰과 감상 위치를 불러왔어요.", "Loaded the saved spatial webtoon and your reading position.") };
    }, bt("공간 웹툰을 열지 못했어요.", "Couldn't open the spatial webtoon."));
  }

  function openSample() {
    const copy: SpatialSampleCopy = {
      bookTitle: bt("샘플 공간 웹툰 · 예시", "Sample spatial webtoon · example"),
      panels: [
        { title: bt("고백", "Confession"), caption: bt("두근거려… 오늘은 고백하는 날이야.", "My heart is pounding… today I confess."), alt: bt("노을 진 언덕 위, 하트를 사이에 두고 선 두 사람의 실루엣", "Two silhouettes on a sunset hill with a heart between them") },
        { title: bt("위기", "Danger"), caption: bt("조심해! 뒤에 뭔가 있어!", "Watch out! Something is behind you!"), alt: bt("밤거리의 속도선 사이로 달리는 인물 실루엣", "A figure running through speed lines on a night street") },
        { title: bt("축하", "Celebration"), caption: bt("정말 행복해! 우리가 해냈어!", "I'm so happy! We did it!"), alt: bt("아침 해와 무지개 아래 두 팔을 들어 올린 두 사람", "Two people raising their arms under a morning sun and rainbow") },
      ],
    };
    void openWith(async () => {
      const next = await createSampleSpatialBook(copy);
      return {
        book: next,
        index: 0,
        message: bt("샘플 작품을 열었어요. ‘공간 보기’를 누르면 컷이 3D 공간에 놓입니다.", "Opened the sample. Press ‘Spatial view’ to place the panels in 3D."),
      };
    }, bt("샘플 작품을 만들지 못했어요.", "Couldn't build the sample work."));
  }

  function focus(next: number) {
    if (!book) return;
    const clamped = nextSpatialPanel(next, 0, book.panels.length);
    runtime.current?.focus(clamped);
    setIndex(clamped);
    setAuto(false);
  }

  function updatePanel(update: Partial<SpatialPanel>) {
    setBook((current) => current ? { ...current, panels: current.panels.map((item, i) => (i === index ? { ...item, ...update } : item)) } : null);
  }

  function toggleAuto() {
    if (auto) {
      setAuto(false);
      audio.current?.pause();
      return;
    }
    setAuto(true);
    if (audio.current) void audio.current.play().catch(() => setStatus(bt("음악은 재생 버튼을 눌러 시작해 주세요.", "Press play to start the music.")));
  }

  async function enter(mode: XrMode) {
    setError("");
    setAuto(false);
    try {
      if (!runtime.current) throw new Error(bt("먼저 공간 보기를 켠 뒤 AR/VR 버튼을 눌러주세요.", "Turn on the spatial view before pressing AR/VR."));
      await runtime.current.enter(mode);
    } catch (cause) {
      setError(errorText(cause, bt("이 기기에서 공간 세션을 열지 못했어요. 일반 감상은 사용할 수 있습니다.", "Couldn't start an immersive session on this device. Flat reading still works.")));
    }
  }

  function addLayer(file: File) {
    if (!panel) return;
    const id = panel.id;
    void localSpatialImage(file)
      .then((src) => {
        const current = bookRef.current;
        if (!current || !current.panels.some((item) => item.id === id)) return;
        setBook(parseSpatialBook({
          ...current,
          panels: current.panels.map((item) => (item.id === id ? { ...item, layers: [...item.layers, { src, depth: 0.12 }] } : item)),
        }));
      })
      .catch((cause: unknown) => setError(errorText(cause, bt("레이어를 추가하지 못했어요.", "Couldn't add the layer."))));
  }

  function attachAudio(file: File) {
    if (!book) return;
    if (file.size > SPATIAL_MAX_AUDIO_BYTES) {
      setError(bt("오디오는 10MB 이하여야 해요.", "Audio must be 10MB or smaller."));
      return;
    }
    const id = book.id;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const current = bookRef.current;
        if (current?.id !== id) return;
        setBook(parseSpatialBook({ ...current, audio: reader.result }));
      } catch (cause) {
        setError(errorText(cause, bt("오디오를 넣지 못했어요.", "Couldn't embed the audio.")));
      }
    };
    reader.onerror = () => setError(bt("오디오를 읽지 못했어요.", "Couldn't read the audio."));
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6">
      <SpatialReaderIntro busy={busy} onOpenImages={openImages} onOpenBook={openBook} onOpenSample={openSample} />

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad/10 p-4">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-bad" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{bt("문제가 생겼어요", "Something went wrong")}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-2">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label={bt("안내 닫기", "Dismiss")}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}

      <p role="status" className="text-sm text-fg-2">
        {busy ? bt("작품을 읽는 중…", "Reading the work…") : status}
      </p>

      {busy && !book ? (
        <div aria-hidden className="grid gap-3">
          <span className="skeleton block h-[min(60vh,520px)] rounded-3xl" />
          <span className="skeleton block h-16 rounded-2xl" />
        </div>
      ) : null}

      {book && panel ? (
        <>
          <SpatialReaderViewer
            book={book}
            index={index}
            view={view}
            auto={auto}
            runtimeReady={runtimeReady}
            xr={xr}
            hostRef={host}
            audioRef={audio}
            headingRef={viewerHeading}
            captionUrl={captionUrl}
            onView={(next) => {
              setView(next);
              if (next === "2d") setAuto(false);
            }}
            onFocus={focus}
            onToggleAuto={toggleAuto}
            onEnter={(mode) => void enter(mode)}
            onExit={() => void runtime.current?.exit().catch((cause: unknown) => setError(errorText(cause, bt("AR/VR을 종료하지 못했어요.", "Couldn't exit AR/VR."))))}
            onExport={() => {
              try {
                downloadBook(book);
              } catch (cause) {
                setError(errorText(cause, bt("작품 파일을 만들지 못했어요.", "Couldn't create the work file.")));
              }
            }}
          />
          <SpatialReaderEditPanel
            book={book}
            panel={panel}
            index={index}
            scale={scale}
            onBookTitle={(title) => setBook({ ...book, title })}
            onPanel={updatePanel}
            onScale={(next) => {
              setScale(next);
              runtime.current?.setScale(next);
            }}
            onAddLayer={addLayer}
            onRemoveLayer={(layerIndex) => updatePanel({ layers: panel.layers.filter((_, j) => j !== layerIndex) })}
            onAudio={attachAudio}
          />
        </>
      ) : !busy ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line bg-panel/30 px-6 py-12 text-center">
          <BookOpen size={28} aria-hidden className="text-accent" />
          <p className="text-sm font-semibold text-fg">{bt("작품을 열면 이곳에서 감상합니다", "Your work will appear here")}</p>
          <p className="max-w-md text-xs leading-relaxed text-fg-2">
            {bt("위에서 컷 이미지나 작품 파일을 고르거나, 샘플로 먼저 체험해 보세요.", "Choose panel images or a work file above, or try the sample first.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
