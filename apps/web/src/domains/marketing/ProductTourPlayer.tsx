import { ArrowRight, Captions, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import Link from "@/compat/router-link";

import { creatorFilmChapterAt } from "./creator-film-playback";
import { PRODUCT_TOUR, PRODUCT_TOUR_COPY, type ProductTourLocale } from "./product-tour-content";

import "./product-tour-player.css";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ProductTourPlayer({ locale }: { readonly locale: ProductTourLocale }) {
  const copy = PRODUCT_TOUR_COPY[locale];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const seekTo = (seconds: number, autoplay = true) => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    setStarted(true);
    setLoading(video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    video.currentTime = seconds;
    setActiveChapter(creatorFilmChapterAt(seconds, PRODUCT_TOUR.chapters.map((chapter) => chapter.start)));
    if (autoplay) void video.play().catch(() => setLoading(false));
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    setLoading(true);
    video.load();
    video.currentTime = PRODUCT_TOUR.chapters[activeChapter]?.start ?? 0;
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
        <video
          ref={videoRef}
          src={PRODUCT_TOUR.src}
          poster={PRODUCT_TOUR.poster}
          controls
          playsInline
          preload="metadata"
          aria-label={copy.videoTitle}
          onPlay={() => { setStarted(true); setFailed(false); }}
          onPlaying={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onSeeked={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
          onTimeUpdate={(event) => setActiveChapter(creatorFilmChapterAt(event.currentTarget.currentTime, PRODUCT_TOUR.chapters.map((chapter) => chapter.start)))}
        >
          <track kind="captions" src={locale === "ko" ? PRODUCT_TOUR.captionsKo : PRODUCT_TOUR.captionsEn} srcLang={locale} label={locale === "ko" ? "한국어" : "English"} default />
        </video>
        {!started && !failed && (
          <button type="button" className="product-tour-player__play" onClick={() => seekTo(0)}>
            <span><Play size={24} fill="currentColor" aria-hidden="true" /></span>
            {copy.watch}
          </button>
        )}
        {loading && !failed && <div className="product-tour-player__status" role="status"><LoaderCircle size={22} aria-hidden="true" />{locale === "ko" ? "제품 투어를 불러오는 중" : "Loading product tour"}</div>}
        {failed && (
          <div className="product-tour-player__error" role="alert">
            <strong>{locale === "ko" ? "영상을 불러오지 못했습니다." : "The video could not be loaded."}</strong>
            <p>{locale === "ko" ? "아래 챕터와 실제 제품 화면으로 전체 내용을 계속 살펴볼 수 있습니다." : "You can still explore the complete tour through the chapters and product screens below."}</p>
            <button type="button" onClick={retry}><RotateCcw size={15} aria-hidden="true" />{locale === "ko" ? "다시 시도" : "Try again"}</button>
          </div>
        )}
      </div>

      <nav className="product-tour-player__chapters" aria-label={locale === "ko" ? "제품 투어 챕터" : "Product tour chapters"}>
        {PRODUCT_TOUR.chapters.map((chapter, index) => {
          const active = index === activeChapter;
          return (
            <div className="product-tour-player__chapter" data-active={active || undefined} key={chapter.id}>
              <button type="button" onClick={() => seekTo(chapter.start)} aria-pressed={active}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{chapter[locale]}</strong>
                <small>{formatTime(chapter.start)}</small>
              </button>
              <Link href={chapter.route} aria-label={`${chapter[locale]} — ${copy.visualOpen}`}>
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
            <li key={`${chapter.id}-transcript`}>
              <button type="button" onClick={() => seekTo(chapter.start)}>{formatTime(chapter.start)}</button>
              <div>
                <strong>{chapter[locale]}</strong>
                <span>{chapter.summary[locale]}</span>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
