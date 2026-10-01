import { ArrowDown, ArrowUpRight, Captions, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";

import Link from "@/shared/navigation/router-link";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { useSeekableMediaAsset } from "./use-seekable-media-asset";
import { TOUR_VIDEO_MAX_BYTES } from "./seekable-media-asset";
import { CREATOR_FILM_DOWNLOADS, CREATOR_FILM_UI, createCreatorFilmPlayback, creatorFilmChapterAt, type CreatorBrandFilmController } from "./creator-film-playback";
import { CREATOR_FILM, CREATOR_FILM_CHAPTER_LINKS, type CreatorHomeCopy } from "./creator-home-content";
import { productTourShortcut } from "./product-tour-playback";

import "./marketing-page.css";
import "./creator-brand-film.css";

type FilmMode = "poster" | "playing" | "error";

function formatFilmTime(seconds: number): string {
  return `00:${String(seconds).padStart(2, "0")}`;
}

/**
 * 24초 브랜드 필름 재생기. 재생 전에는 포스터 이미지만 불러오고,
 * 챕터·자막·'이 기능 열기'·다운로드를 영상 가까이에 둔다.
 */
export function CreatorBrandFilm({ copy, locale, hideHeading = false, controllerRef }: {
  readonly copy: CreatorHomeCopy;
  readonly locale: "ko" | "en";
  /** 페이지 히어로가 이미 같은 제목을 보여 줄 때 시각적 제목만 숨긴다(스크린 리더에는 유지). */
  readonly hideHeading?: boolean;
  /** 페이지의 재생 버튼이 포스터를 한 번 더 누르지 않고 바로 재생하도록 제어기를 노출한다. */
  readonly controllerRef?: Ref<CreatorBrandFilmController>;
}) {
  const bi = useBilingualLocalizer("domains.marketing.CreatorBrandFilm");
  const [mode, setMode] = useState<FilmMode>("poster");
  const [loading, setLoading] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  // 좁은 화면에서는 세로형(9:16) 에디션을 서빙한다. 재생 시작 시점에 고정해
  // 재생 중 뷰포트 변경으로 영상이 다시 준비되는 일을 막는다.
  const filmPortrait = useMediaQuery("(max-width: 720px)");
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const preparedMedia = useSeekableMediaAsset(playbackSrc, TOUR_VIDEO_MAX_BYTES, "video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const posterRef = useRef<HTMLButtonElement>(null);
  const playbackRef = useRef<ReturnType<typeof createCreatorFilmPlayback> | null>(null);
  const requestedStart = useRef(0);
  const focusPlayer = useRef(false);
  const restorePosterFocus = useRef(false);
  const ui = bi(CREATOR_FILM_UI.ko, CREATOR_FILM_UI.en);

  const failPlayback = useCallback(() => {
    // 사라지는 컨트롤이 포커스를 가진 경우에만 포스터로 되돌린다.
    restorePosterFocus.current = focusPlayer.current || document.activeElement === videoRef.current;
    focusPlayer.current = false;
    setLoading(false);
    setPlaybackSrc(null);
    setMode("error");
  }, []);

  useEffect(() => {
    if (preparedMedia.error) failPlayback();
  }, [preparedMedia.error, failPlayback]);

  useEffect(() => {
    if (mode !== "playing") {
      if (restorePosterFocus.current) {
        posterRef.current?.focus({ preventScroll: true });
        restorePosterFocus.current = false;
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const controller = createCreatorFilmPlayback(video, { duration: CREATOR_FILM.duration, onFailure: failPlayback });
    playbackRef.current = controller;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") controller.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") controller.seekAndPlay(requestedStart.current);
    if (focusPlayer.current) {
      video.focus({ preventScroll: true });
      focusPlayer.current = false;
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.dispose();
      if (playbackRef.current === controller) playbackRef.current = null;
    };
  }, [mode, failPlayback]);

  // 자막 표시 여부는 <track>의 default가 아니라 textTracks 모드로 즉시 반영한다.
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    for (const track of Array.from(tracks)) track.mode = captionsOn ? "showing" : "hidden";
  }, [captionsOn, mode, preparedMedia.url]);

  const syncChapter = (seconds: number) => {
    const chapter = creatorFilmChapterAt(seconds, CREATOR_FILM.chapters);
    setActiveChapter(chapter);
    const start = CREATOR_FILM.chapters[chapter] ?? 0;
    const end = CREATOR_FILM.chapters[chapter + 1] ?? CREATOR_FILM.duration;
    const progress = end > start ? Math.min(1, Math.max(0, (seconds - start) / (end - start))) : 0;
    sectionRef.current?.style.setProperty("--film-chapter-progress", progress.toFixed(3));
  };

  const playAt = (seconds: number, moveFocus = false) => {
    requestedStart.current = seconds;
    focusPlayer.current = moveFocus;
    syncChapter(seconds);
    setLoading(!videoRef.current || videoRef.current.readyState < 3);
    if (mode === "playing") {
      playbackRef.current?.seekAndPlay(seconds);
      if (moveFocus) {
        videoRef.current?.focus({ preventScroll: true });
        focusPlayer.current = false;
      }
    } else {
      setPlaybackSrc(filmPortrait ? CREATOR_FILM.srcPortrait : CREATOR_FILM.src);
      setMode("playing");
    }
  };

  useImperativeHandle(controllerRef, () => ({ playFrom: (seconds: number) => playAt(seconds, true) }));

  const closeFilm = () => {
    playbackRef.current?.pause();
    restorePosterFocus.current = true;
    setLoading(false);
    setPlaybackSrc(null);
    setMode("poster");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const shortcut = productTourShortcut(event);
    if (!shortcut) return;
    if (shortcut === "previous" || shortcut === "next") {
      const index = Math.min(CREATOR_FILM.chapters.length - 1, Math.max(0, activeChapter + (shortcut === "next" ? 1 : -1)));
      if (index === activeChapter) return;
      playAt(CREATOR_FILM.chapters[index] ?? 0);
    } else if (shortcut === "captions") {
      setCaptionsOn((current) => !current);
    } else {
      const video = videoRef.current;
      if (!video) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void video.requestFullscreen().catch(() => undefined);
    }
    event.preventDefault();
  };

  const playing = mode === "playing";
  const featureOpen = bi("이 기능 열기", "Open this feature");

  return (
    <section ref={sectionRef} className="mk-film" id="creator-film" aria-labelledby="creator-film-title">
      <div className="mk-key-scope" role="presentation" onKeyDown={handleKeyDown}>
        <div className={hideHeading ? "sr-only" : "mk-film__heading"}>
          <p className="mk-eyebrow">{copy.filmEyebrow}</p>
          <h2 id="creator-film-title" className="mk-h2" tabIndex={-1}>{copy.filmTitle}</h2>
          <p className="mk-body">{copy.filmBody}</p>
        </div>

        <div className="mk-film__frame" data-film-orientation={filmPortrait ? "portrait" : "landscape"} aria-busy={playing && (loading || preparedMedia.loading)}>
          {playing ? (
            <video
              id="creator-brand-video"
              ref={videoRef}
              src={preparedMedia.url ?? undefined}
              controls
              muted
              playsInline
              tabIndex={0}
              preload="metadata"
              poster={CREATOR_FILM.poster}
              aria-label={copy.filmLabel}
              onCanPlay={() => setLoading(false)}
              onPlaying={() => setLoading(false)}
              onSeeked={(event) => { setLoading(false); syncChapter(event.currentTarget.currentTime); }}
              onWaiting={() => setLoading(true)}
              onError={failPlayback}
              onTimeUpdate={(event) => syncChapter(event.currentTarget.currentTime)}
            >
              <track kind="captions" src={locale === "ko" ? CREATOR_FILM.captions : CREATOR_FILM.captionsEn} srcLang={locale} label={locale === "ko" ? "한국어" : "English"} default />
            </video>
          ) : (
            <button ref={posterRef} type="button" className="mk-film__poster" onClick={() => playAt(0, true)} aria-label={copy.filmPlay} data-testid="creator-film-play">
              <img src={CREATOR_FILM.poster} width={1280} height={720} loading="lazy" alt="" />
              <span className="mk-film__play" aria-hidden="true"><Play size={28} fill="currentColor" /></span>
              <span className="mk-film__caption">
                {bi("브랜드 필름 재생 · 00:24", "Play the brand film · 00:24")}
                <small className="mk-film__era">{bi("제작 당시 아트 디렉션 · 현재 브랜드 색과 다릅니다", "Original art direction · differs from the current brand colors")}</small>
              </span>
            </button>
          )}
        </div>

        {playing && loading ? <p className="mk-film__status" role="status">{ui.loading}</p> : null}
        {mode === "error" ? (
          <p className="mk-film__error" role="alert">
            {copy.filmError}
            <button type="button" onClick={() => playAt(0, true)}><RotateCcw size={14} aria-hidden="true" />{copy.retry}</button>
          </p>
        ) : null}

        <div className="mk-film__toolbar">
          <button type="button" className="mk-film__tool" aria-pressed={captionsOn} onClick={() => setCaptionsOn((current) => !current)}>
            <Captions size={15} aria-hidden="true" />{bi("자막", "Captions")}
          </button>
          {playing ? <button type="button" className="mk-film__tool" onClick={closeFilm}>{copy.filmReset}</button> : null}
          <p className="mk-film__hint">{bi("← → 장면 이동 · F 전체화면 · C 자막", "← → scenes · F fullscreen · C captions")}</p>
        </div>

        <ol className="mk-film__chapters" aria-label={copy.filmLabel}>
          {CREATOR_FILM.chapters.map((seconds, index) => {
            const active = playing && activeChapter === index;
            const link = CREATOR_FILM_CHAPTER_LINKS[index];
            const label = copy.chapterLabels[index];
            return (
              <li key={seconds} data-active={active || undefined}>
                <button type="button" onClick={() => playAt(seconds)} aria-controls={playing ? "creator-brand-video" : undefined} aria-current={active ? "step" : undefined}>
                  <span>{formatFilmTime(seconds)}</span>{label}
                  <i className="mk-film__progress" aria-hidden="true" />
                </button>
                {link ? (
                  <Link href={link.href} className="mk-film__feature" aria-label={`${label} — ${featureOpen}: ${bi(link.ko, link.en)}`}>
                    {bi(link.ko, link.en)}<ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mk-film__details">
          <details>
            <summary>{copy.transcript}</summary>
            <p>{copy.transcriptBody}</p>
          </details>
          <details className="mk-film__downloads">
            <summary>{ui.downloads}</summary>
            <div className="mk-film__download-grid">
              {CREATOR_FILM_DOWNLOADS.map((film) => (
                <a key={film.id} href={film.src} download={film.src.split("/").pop()}>
                  <span>{ui[film.id]} <ArrowDown size={16} aria-hidden="true" /></span>
                  <small>{film.ratio} · {film.size}</small>
                </a>
              ))}
            </div>
            <p>{ui.downloadNote}</p>
          </details>
        </div>
      </div>
    </section>
  );
}
