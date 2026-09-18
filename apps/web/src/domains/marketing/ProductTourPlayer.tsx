import { formatI18nTemplate, translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, Captions, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Link from "@/compat/router-link";

import { creatorFilmChapterAt } from "./creator-film-playback";
import { PRODUCT_TOUR, PRODUCT_TOUR_COPY, type ProductTourLocale } from "./product-tour-content";

import "./product-tour-player.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ProductTourPlayer", ko, en);

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ProductTourPlayer({ locale }: { readonly locale: ProductTourLocale }) {
  useBilingualI18nRevision();
  const copy = bi((PRODUCT_TOUR_COPY).ko, (PRODUCT_TOUR_COPY).en);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [mounted, setMounted] = useState(false);
  const requestedStartRef = useRef(0);
  const autoplayRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = requestedStartRef.current;
    setLoading(video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    if (autoplayRef.current) void video.play().catch(() => setLoading(false));
    autoplayRef.current = false;
  }, [mounted]);

  const seekTo = (seconds: number, autoplay = true) => {
    requestedStartRef.current = seconds;
    autoplayRef.current = autoplay;
    setFailed(false);
    setActiveChapter(creatorFilmChapterAt(seconds, PRODUCT_TOUR.chapters.map((chapter) => chapter.start)));
    if (!mounted) {
      setMounted(true);
      setLoading(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setLoading(video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    video.currentTime = seconds;
    if (autoplay) void video.play().catch(() => setLoading(false));
  };

  const retry = () => {
    requestedStartRef.current = PRODUCT_TOUR.chapters[activeChapter]?.start ?? 0;
    autoplayRef.current = true;
    setFailed(false);
    setLoading(true);
    if (!mounted) { setMounted(true); return; }
    const video = videoRef.current;
    if (!video) return;
    video.load();
    video.currentTime = requestedStartRef.current;
    void video.play().catch(() => setLoading(false));
  };

  return (
    <section className="product-tour-player" id="product-tour-video" aria-labelledby="product-tour-video-title">
      <header className="product-tour-player__heading">
        <div>
          <p>{copy.videoEyebrow}</p>
          <h2 id="product-tour-video-title">{copy.videoTitle}</h2>
        </div>
        <div>
          <p>{copy.videoBody}</p>
          <span><Captions size={15} aria-hidden="true" />{copy.silentNote}</span>
        </div>
      </header>

      <div className="product-tour-player__screen" aria-busy={loading}>
        {mounted ? (
          <video
            ref={videoRef}
            src={PRODUCT_TOUR.src}
            poster={PRODUCT_TOUR.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={copy.videoTitle}
            onPlay={() => setFailed(false)}
            onPlaying={() => setLoading(false)}
            onCanPlay={() => setLoading(false)}
            onWaiting={() => setLoading(true)}
            onSeeked={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            onTimeUpdate={(event) => setActiveChapter(creatorFilmChapterAt(event.currentTarget.currentTime, PRODUCT_TOUR.chapters.map((chapter) => chapter.start)))}
          >
            <track kind="captions" src={bi(PRODUCT_TOUR.captionsKo, PRODUCT_TOUR.captionsEn)} srcLang={locale} label={bi("한국어", "English")} default />
          </video>
        ) : (
          <button type="button" className="product-tour-player__poster" onClick={() => seekTo(0)} aria-label={copy.watch}>
            <img src={PRODUCT_TOUR.poster} width={1280} height={720} alt="" decoding="async" />
            <span><Play size={24} fill="currentColor" aria-hidden="true" /></span>
            <strong>{copy.watch}</strong>
            <small>{bi("클릭할 때만 35MB 본편을 불러옵니다", "The 35 MB film loads only after you press play")}</small>
          </button>
        )}
        {loading && !failed && <div className="product-tour-player__status" role="status"><LoaderCircle size={22} aria-hidden="true" />{bi("제품 투어를 불러오는 중", "Loading product tour")}</div>}
        {failed && (
          <div className="product-tour-player__error" role="alert">
            <strong>{bi("영상을 불러오지 못했습니다.", "The video could not be loaded.")}</strong>
            <p>{bi("아래 챕터와 실제 제품 화면으로 전체 내용을 계속 살펴볼 수 있습니다.", "You can still explore the complete tour through the chapters and product screens below.")}</p>
            <button type="button" onClick={retry}><RotateCcw size={15} aria-hidden="true" />{bi("다시 시도", "Try again")}</button>
          </div>
        )}
      </div>

      <nav className="product-tour-player__chapters" aria-label={bi("제품 투어 챕터", "Product tour chapters")}>
        {PRODUCT_TOUR.chapters.map((chapter, index) => {
          const active = index === activeChapter;
          return (
            <div className="product-tour-player__chapter" data-active={active || undefined} key={chapter.id}>
              <button type="button" onClick={() => seekTo(chapter.start)} aria-pressed={active}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{bi((chapter).ko, (chapter).en)}</strong>
                <small>{formatTime(chapter.start)}</small>
              </button>
              <Link href={chapter.route} aria-label={`${bi((chapter).ko, (chapter).en)} — ${copy.visualOpen}`}>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </nav>

      <details className="product-tour-player__transcript">
        <summary>{copy.transcript}</summary>
        <ol>
          {PRODUCT_TOUR.chapters.map((chapter) => (
            <li key={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.ProductTourPlayer", "en", "{v0}-transcript"), { v0: String(chapter.id) })}>
              <button type="button" onClick={() => seekTo(chapter.start)}>{formatTime(chapter.start)}</button>
              <div>
                <strong>{bi((chapter).ko, (chapter).en)}</strong>
                <span>{bi((chapter.summary).ko, (chapter.summary).en)}</span>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
