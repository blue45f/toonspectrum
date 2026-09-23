import { resumeBgmForContext, suspendBgmForContext } from "@toonspectrum/core/fx";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, Captions, LoaderCircle, Play, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "@/compat/router-link";

import { clampCreatorFilmTime, creatorFilmChapterAt } from "./creator-film-playback";
import {
  PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES,
  PRODUCT_TOUR_STALL_TIMEOUT_MS,
  canAutomaticallyRecoverProductTour,
  isExpectedMediaPlayRejection,
  productTourRecoveryLabel,
  productTourSourceForAttempt,
} from "./product-tour-media-recovery";
import { PRODUCT_TOUR, PRODUCT_TOUR_COPY, type ProductTourLocale } from "./product-tour-content";

import "./product-tour-player.css";

const TOUR_AUDIO_CONTEXT = "product-tour-video";
const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ProductTourPlayer", ko, en);

type PlayerPhase = "idle" | "loading" | "ready" | "recovering" | "failed";
type RecoveryReason = "decode" | "network" | "stall" | "online" | "manual";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatMegabytes(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} MB`;
}

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

interface ProductTourMp4PlayerProps {
  readonly locale: ProductTourLocale;
  readonly initialTime?: number;
  readonly fallbackNotice?: string;
  readonly autoPlayOnMount?: boolean;
}

export function ProductTourMp4Player({
  locale,
  initialTime = 0,
  fallbackNotice = "",
  autoPlayOnMount = false,
}: ProductTourMp4PlayerProps) {
  useBilingualI18nRevision();
  const copy = bi((PRODUCT_TOUR_COPY).ko, (PRODUCT_TOUR_COPY).en);
  const chapterStarts = useMemo(
    () => PRODUCT_TOUR.chapters.map((chapter) => chapter.start),
    [],
  );
  const initialPosition = clampCreatorFilmTime(initialTime, PRODUCT_TOUR.duration);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stallTimerRef = useRef<number | null>(null);
  const requestedStartRef = useRef(initialPosition);
  const resumeAfterLoadRef = useRef(autoPlayOnMount);
  const recoveryCountRef = useRef(0);
  const recoveryBaselineRef = useRef(initialPosition);
  const recoveringRef = useRef(false);
  const waitingForOnlineRef = useRef(false);
  const lastPlaybackTimeRef = useRef(initialPosition);
  const mountedRef = useRef(autoPlayOnMount);
  const [activeChapter, setActiveChapter] = useState(() => creatorFilmChapterAt(initialPosition, chapterStarts));
  const [mounted, setMounted] = useState(autoPlayOnMount);
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>(autoPlayOnMount ? "loading" : "idle");
  const [recoveryDetail, setRecoveryDetail] = useState("");
  const source = useMemo(
    () => productTourSourceForAttempt(PRODUCT_TOUR.src, sourceAttempt),
    [sourceAttempt],
  );

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current === null) return;
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = null;
  }, []);

  const releaseSiteMusic = useCallback(() => {
    resumeBgmForContext(TOUR_AUDIO_CONTEXT);
  }, []);

  const failPlayback = useCallback(() => {
    clearStallTimer();
    recoveringRef.current = false;
    waitingForOnlineRef.current = false;
    resumeAfterLoadRef.current = false;
    setPhase("failed");
    releaseSiteMusic();
  }, [clearStallTimer, releaseSiteMusic]);

  const recoverPlayback = useCallback((reason: RecoveryReason) => {
    if (!mountedRef.current || recoveringRef.current) return;
    const video = videoRef.current;
    const currentTime = video
      && video.readyState >= HTMLMediaElement.HAVE_METADATA
      && Number.isFinite(video.currentTime)
      ? video.currentTime
      : requestedStartRef.current;
    requestedStartRef.current = currentTime;
    recoveryBaselineRef.current = currentTime;
    resumeAfterLoadRef.current = resumeAfterLoadRef.current
      || Boolean(video && !video.paused && !video.ended);
    clearStallTimer();

    if (!browserIsOnline()) {
      recoveringRef.current = true;
      waitingForOnlineRef.current = true;
      setRecoveryDetail(bi(
        "인터넷 연결을 기다리고 있습니다. 연결되면 현재 위치에서 자동으로 이어집니다.",
        "Waiting for the network. Playback will resume from the current position when it returns.",
      ));
      setPhase("recovering");
      return;
    }

    if (!canAutomaticallyRecoverProductTour(recoveryCountRef.current, true)) {
      failPlayback();
      return;
    }

    recoveryCountRef.current += 1;
    recoveringRef.current = true;
    waitingForOnlineRef.current = false;
    setRecoveryDetail(`${productTourRecoveryLabel(reason, locale)} ${recoveryCountRef.current}/${PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES}`);
    setPhase("recovering");
    setSourceAttempt((attempt) => attempt + 1);
  }, [clearStallTimer, failPlayback, locale]);

  const playFrom = useCallback((video: HTMLVideoElement, seconds: number, autoplay: boolean) => {
    requestedStartRef.current = seconds;
    resumeAfterLoadRef.current = autoplay;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      setPhase("loading");
      video.load();
      return;
    }

    try {
      video.currentTime = clampCreatorFilmTime(seconds, video.duration || PRODUCT_TOUR.duration);
    } catch {
      recoveringRef.current = false;
      recoverPlayback("decode");
      return;
    }

    if (!autoplay) {
      setPhase("ready");
      return;
    }

    setPhase(video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? "loading" : "ready");
    void Promise.resolve(video.play()).catch((reason: unknown) => {
      if (isExpectedMediaPlayRejection(reason)) {
        setPhase("ready");
        return;
      }
      recoveringRef.current = false;
      recoverPlayback("decode");
    });
  }, [recoverPlayback]);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    recoveringRef.current = false;
  }, [mounted, sourceAttempt]);

  useEffect(() => {
    const handleOnline = () => {
      if (!waitingForOnlineRef.current) return;
      waitingForOnlineRef.current = false;
      recoveringRef.current = false;
      recoverPlayback("online");
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [recoverPlayback]);

  useEffect(() => () => {
    mountedRef.current = false;
    clearStallTimer();
    videoRef.current?.pause();
    releaseSiteMusic();
  }, [clearStallTimer, releaseSiteMusic]);

  const armStallRecovery = useCallback((video: HTMLVideoElement) => {
    if (video.paused || video.ended || recoveringRef.current) return;
    clearStallTimer();
    setPhase("loading");
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      if (videoRef.current !== video || video.paused || video.ended) return;
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      recoverPlayback("stall");
    }, PRODUCT_TOUR_STALL_TIMEOUT_MS);
  }, [clearStallTimer, recoverPlayback]);

  const seekTo = (seconds: number, autoplay = true) => {
    requestedStartRef.current = seconds;
    resumeAfterLoadRef.current = autoplay;
    recoveryCountRef.current = 0;
    recoveryBaselineRef.current = seconds;
    waitingForOnlineRef.current = false;
    recoveringRef.current = false;
    setRecoveryDetail("");
    setActiveChapter(creatorFilmChapterAt(seconds, chapterStarts));

    if (!mounted) {
      mountedRef.current = true;
      setPhase("loading");
      setMounted(true);
      return;
    }

    if (phase === "failed") {
      recoveringRef.current = true;
      setRecoveryDetail(productTourRecoveryLabel("manual", locale));
      setPhase("recovering");
      setSourceAttempt((attempt) => attempt + 1);
      return;
    }

    const video = videoRef.current;
    if (video) playFrom(video, seconds, autoplay);
  };

  const retry = () => {
    const video = videoRef.current;
    requestedStartRef.current = video && Number.isFinite(video.currentTime)
      ? video.currentTime
      : PRODUCT_TOUR.chapters[activeChapter]?.start ?? 0;
    resumeAfterLoadRef.current = true;
    recoveryCountRef.current = 0;
    recoveryBaselineRef.current = requestedStartRef.current;
    waitingForOnlineRef.current = false;
    recoveringRef.current = true;
    setRecoveryDetail(productTourRecoveryLabel("manual", locale));
    setPhase("recovering");
    if (!mounted) {
      mountedRef.current = true;
      setMounted(true);
    } else {
      setSourceAttempt((attempt) => attempt + 1);
    }
  };

  const handleLoadedMetadata = (video: HTMLVideoElement) => {
    recoveringRef.current = false;
    clearStallTimer();
    playFrom(video, requestedStartRef.current, resumeAfterLoadRef.current);
  };

  const handleTimeUpdate = (video: HTMLVideoElement) => {
    const currentTime = video.currentTime;
    setActiveChapter(creatorFilmChapterAt(currentTime, chapterStarts));
    if (currentTime > lastPlaybackTimeRef.current + 0.05) clearStallTimer();
    lastPlaybackTimeRef.current = currentTime;
    if (
      recoveryCountRef.current > 0
      && currentTime >= recoveryBaselineRef.current + 30
    ) {
      recoveryCountRef.current = 0;
    }
  };

  const loading = phase === "loading" || phase === "recovering";
  const loadingMessage = phase === "recovering"
    ? recoveryDetail
    : bi("제품 투어와 오디오를 불러오는 중", "Loading the product tour and audio");
  const downloadSize = formatMegabytes(PRODUCT_TOUR.bytes);

  return (
    <section className="product-tour-player" id="product-tour-video" aria-labelledby="product-tour-video-title">
      <header className="product-tour-player__heading">
        <div>
          <p>{copy.videoEyebrow}</p>
          <h2 id="product-tour-video-title">{copy.videoTitle}</h2>
        </div>
        <div>
          <p>{copy.videoBody}</p>
          <span><Volume2 size={15} aria-hidden="true" />{copy.audioNote}</span>
        </div>
      </header>

      <div className="product-tour-player__screen" aria-busy={loading || undefined}>
        {fallbackNotice ? (
          <div className="product-tour-player__fallback-notice" role="status">
            <RotateCcw size={14} aria-hidden="true" />
            <span>{bi(
              "Remotion 대신 호환 MP4로 이어서 재생합니다.",
              "Continuing with compatible MP4 playback instead of Remotion.",
            )}</span>
          </div>
        ) : null}
        {mounted ? (
          <video
            key={source}
            ref={videoRef}
            src={source}
            poster={PRODUCT_TOUR.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={copy.videoTitle}
            onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
            onPlay={(event) => {
              resumeAfterLoadRef.current = true;
              suspendBgmForContext(TOUR_AUDIO_CONTEXT);
              setPhase(event.currentTarget.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? "loading" : "ready");
            }}
            onPlaying={() => {
              clearStallTimer();
              recoveringRef.current = false;
              waitingForOnlineRef.current = false;
              setRecoveryDetail("");
              setPhase("ready");
              suspendBgmForContext(TOUR_AUDIO_CONTEXT);
            }}
            onPause={() => {
              if (recoveringRef.current || waitingForOnlineRef.current) return;
              resumeAfterLoadRef.current = false;
              clearStallTimer();
              releaseSiteMusic();
              if (phase !== "failed") setPhase("ready");
            }}
            onEnded={() => {
              resumeAfterLoadRef.current = false;
              recoveryCountRef.current = 0;
              clearStallTimer();
              releaseSiteMusic();
              setPhase("ready");
            }}
            onCanPlay={() => {
              clearStallTimer();
              if (phase === "loading") setPhase("ready");
            }}
            onSeeked={() => {
              clearStallTimer();
              if (phase === "loading") setPhase("ready");
            }}
            onWaiting={(event) => armStallRecovery(event.currentTarget)}
            onStalled={(event) => armStallRecovery(event.currentTarget)}
            onError={(event) => {
              recoveringRef.current = false;
              recoverPlayback(event.currentTarget.error?.code === 2 ? "network" : "decode");
            }}
            onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
          >
            <track
              kind="captions"
              src={PRODUCT_TOUR.captionsKo}
              srcLang="ko"
              label="한국어"
              default={locale === "ko"}
            />
            <track
              kind="captions"
              src={PRODUCT_TOUR.captionsEn}
              srcLang="en"
              label="English"
              default={locale === "en"}
            />
          </video>
        ) : (
          <button type="button" className="product-tour-player__poster" onClick={() => seekTo(initialPosition)} aria-label={copy.watch}>
            <img src={PRODUCT_TOUR.poster} width={1280} height={720} alt="" decoding="async" />
            <span><Play size={24} fill="currentColor" aria-hidden="true" /></span>
            <strong>{copy.watch}</strong>
            <small>{bi(
              `재생할 때만 약 ${downloadSize}의 내레이션·BGM 포함 본편을 불러옵니다`,
              `The ${downloadSize} narrated film loads only after you press play`,
            )}</small>
          </button>
        )}
        {loading && (
          <div className="product-tour-player__status" role="status" aria-live="polite">
            <LoaderCircle size={22} aria-hidden="true" />{loadingMessage}
          </div>
        )}
        {phase === "failed" && (
          <div className="product-tour-player__error" role="alert">
            <strong>{bi("영상을 안정적으로 이어 재생하지 못했습니다.", "Playback could not be recovered reliably.")}</strong>
            <p>{bi(
              "자동 복구를 두 번 시도했습니다. 현재 챕터에서 다시 시도하거나 아래 실제 제품 화면으로 계속 살펴볼 수 있습니다.",
              "Two automatic recovery attempts were made. Try this chapter again or continue through the real product screens below.",
            )}</p>
            <button type="button" onClick={retry}><RotateCcw size={15} aria-hidden="true" />{bi("현재 위치에서 다시 시도", "Retry from here")}</button>
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
        <summary><Captions size={15} aria-hidden="true" />{copy.transcript}</summary>
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
