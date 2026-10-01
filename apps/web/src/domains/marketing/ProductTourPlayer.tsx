import { Player, type PlayerRef } from "@remotion/player";
import { resumeBgmForContext, suspendBgmForContext } from "@toonstudio/core/fx";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize,
  Music2,
  Play,
  RotateCcw,
  VolumeX,
} from "lucide-react";
import type { KeyboardEvent, Ref, SyntheticEvent } from "react";
import type { AnyZodObject } from "remotion";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { parseProductTourLocation, productTourFrameForSeconds, updateProductTourLocation } from "./product-tour-location";
import { creatorFilmChapterAt } from "./creator-film-playback";
import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import { PRODUCT_TOUR, PRODUCT_TOUR_COPY, formatProductTourTime, type ProductTourLocale } from "./product-tour-content";
import {
  ProductTourChapterRail,
  ProductTourKeyboardHint,
  ProductTourNowPanel,
  ProductTourPlayerHeading,
  ProductTourTranscript,
} from "./ProductTourChapters";
import {
  clampProductTourChapter,
  productTourChapterProgress,
  productTourShortcut,
  type ProductTourPlaybackController,
} from "./product-tour-playback";
import { ProductTourMp4Player } from "./ProductTourMp4Player";
import {
  ProductTourRemotionComposition,
  type ProductTourAudioIssue,
  type ProductTourRemotionCompositionProps,
} from "./ProductTourRemotionComposition";
import { useProductTourVoiceGuide } from "./use-product-tour-voice-guide";

import "./marketing-page.css";
import "./product-tour-player.css";

const TOUR_AUDIO_CONTEXT = "product-tour-video";
const CHAPTER_STARTS: readonly number[] = PRODUCT_TOUR.chapters.map((chapter) => chapter.start);
const DEFAULT_BGM_VOLUME = 0.48;

type PlayerPhase = "idle" | "loading" | "ready" | "failed";

function formatMegabytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} MB`;
}

const runtimeAudioBytes = PRODUCT_TOUR_RUNTIME_AUDIO.narration.bytes
  + PRODUCT_TOUR_RUNTIME_AUDIO.bgm.bytes;

export function ProductTourPlayer({ locale, controllerRef }: {
  readonly locale: ProductTourLocale;
  /** 페이지의 '이 장면부터 보기'가 사용자 입력 안에서 재생을 시작할 수 있게 제어기를 노출한다. */
  readonly controllerRef?: Ref<ProductTourPlaybackController>;
}) {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourPlayer");
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  const [initialRequest] = useState(() => parseProductTourLocation(typeof window === "undefined" ? "" : window.location.search));
  const playerRef = useRef<PlayerRef>(null);
  const fallbackControllerRef = useRef<ProductTourPlaybackController>(null);
  const mountFrameRef = useRef(productTourFrameForSeconds(initialRequest.seconds));
  const pendingSeekRef = useRef<number | null>(null);
  const fallingBackRef = useRef(false);
  const fallbackAutoplayRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const fallbackReasonRef = useRef("");
  const firstAudibleStartRef = useRef(true);
  const requestedStartRef = useRef(initialRequest.seconds);
  const [activeChapter, setActiveChapter] = useState(() => creatorFilmChapterAt(initialRequest.seconds, CHAPTER_STARTS));
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [started, setStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [narrationVolume, setNarrationVolume] = useState(1);
  const [bgmVolume, setBgmVolume] = useState(DEFAULT_BGM_VOLUME);
  const [fallbackStart, setFallbackStart] = useState(initialRequest.seconds);
  const [useFallback, setUseFallback] = useState(initialRequest.mode === "mp4");
  const {
    supported: voiceGuideSupported,
    speaking: voiceGuideSpeaking,
    error: voiceGuideError,
    toggle: toggleVoiceGuide,
    stop: stopVoiceGuide,
  } = useProductTourVoiceGuide(locale, activeChapter);

  const releaseSiteMusic = useCallback(() => {
    resumeBgmForContext(TOUR_AUDIO_CONTEXT);
  }, []);

  /** 현재 챕터 진행률은 렌더 없이 CSS 변수로만 갱신한다(초당 여러 번 들어오는 timeupdate 대비). */
  const paintProgress = useCallback((seconds: number, chapterIndex: number) => {
    sectionRef.current?.style.setProperty("--pt-chapter-progress", productTourChapterProgress(seconds, chapterIndex).toFixed(3));
  }, []);

  const switchToFallback = useCallback((reason: string) => {
    if (fallingBackRef.current) return;
    fallingBackRef.current = true;
    const player = playerRef.current;
    const frame = player?.getCurrentFrame();
    const currentTime = pendingSeekRef.current !== null || frame === undefined
      || (frame === 0 && requestedStartRef.current > 0)
      ? requestedStartRef.current
      : frame / PRODUCT_TOUR.fps;
    fallbackAutoplayRef.current = player?.isPlaying() ?? false;
    fallbackReasonRef.current = reason;
    setFallbackStart(currentTime);
    player?.pause();
    releaseSiteMusic();
    setUseFallback(true);
  }, [releaseSiteMusic]);

  const handleAudioIssue = useCallback((issue: ProductTourAudioIssue) => {
    switchToFallback(`${issue.channel} runtime audio failed: ${issue.message}`);
  }, [switchToFallback]);

  const compositionProps = useMemo<ProductTourRemotionCompositionProps>(() => ({
    locale,
    captionsEnabled,
    narrationEnabled,
    bgmEnabled,
    narrationVolume,
    bgmVolume,
    onAudioIssue: handleAudioIssue,
  }), [bgmEnabled, bgmVolume, captionsEnabled, handleAudioIssue, locale, narrationEnabled, narrationVolume]);

  useLayoutEffect(() => {
    const player = playerRef.current;
    if (!player || !started || useFallback) return;

    const handlePlay = () => {
      stopVoiceGuide();
      setStarted(true);
      setPhase("ready");
      suspendBgmForContext(TOUR_AUDIO_CONTEXT);
    };
    const handlePause = () => {
      setPhase((current) => current === "failed" ? current : "ready");
      releaseSiteMusic();
    };
    const handleEnded = () => {
      setPhase("ready");
      releaseSiteMusic();
    };
    const handleWaiting = () => setPhase("loading");
    const handleResume = () => setPhase("ready");
    const handleTimeUpdate = (event: { readonly detail: { readonly frame: number } }) => {
      if (pendingSeekRef.current !== null) {
        if (Math.abs(event.detail.frame - pendingSeekRef.current) > PRODUCT_TOUR.fps) return;
        pendingSeekRef.current = null;
      }
      sectionRef.current?.setAttribute("data-current-frame", String(event.detail.frame));
      requestedStartRef.current = event.detail.frame / PRODUCT_TOUR.fps;
      const next = creatorFilmChapterAt(requestedStartRef.current, CHAPTER_STARTS);
      paintProgress(requestedStartRef.current, next);
      setActiveChapter((current) => current === next ? current : next);
    };
    const handleMuteChange = (event: { readonly detail: { readonly isMuted: boolean } }) => {
      setIsMuted(event.detail.isMuted);
    };
    const handleVolumeChange = (event: { readonly detail: { readonly volume: number } }) => {
      setMasterVolume(event.detail.volume);
    };
    const handleError = (event: { readonly detail: { readonly error: Error } }) => {
      setPhase("failed");
      switchToFallback(event.detail.error.message || bi("Remotion 재생 중 알 수 없는 오류가 발생했습니다.", "An unknown Remotion playback error occurred."));
    };

    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("ended", handleEnded);
    player.addEventListener("waiting", handleWaiting);
    player.addEventListener("resume", handleResume);
    player.addEventListener("timeupdate", handleTimeUpdate);
    player.addEventListener("mutechange", handleMuteChange);
    player.addEventListener("volumechange", handleVolumeChange);
    player.addEventListener("error", handleError);

    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("ended", handleEnded);
      player.removeEventListener("waiting", handleWaiting);
      player.removeEventListener("resume", handleResume);
      player.removeEventListener("timeupdate", handleTimeUpdate);
      player.removeEventListener("mutechange", handleMuteChange);
      player.removeEventListener("volumechange", handleVolumeChange);
      player.removeEventListener("error", handleError);
    };
  }, [bi, paintProgress, releaseSiteMusic, started, stopVoiceGuide, switchToFallback, useFallback]);

  useEffect(() => () => {
    playerRef.current?.pause();
    releaseSiteMusic();
  }, [releaseSiteMusic]);

  const enableSound = useCallback((event?: SyntheticEvent) => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(1);
    player.unmute();
    setMasterVolume(1);
    setIsMuted(false);
    if (!player.isPlaying()) player.play(event);
  }, []);

  const playFrom = useCallback((seconds: number, event?: SyntheticEvent) => {
    const frame = productTourFrameForSeconds(seconds);
    const target = frame / PRODUCT_TOUR.fps;
    const chapter = creatorFilmChapterAt(seconds, CHAPTER_STARTS);
    requestedStartRef.current = target;
    pendingSeekRef.current = frame;
    updateProductTourLocation(target);
    paintProgress(target, chapter);
    if (!started) {
      mountFrameRef.current = frame;
      flushSync(() => {
        setStarted(true);
        setPhase("loading");
        setActiveChapter(chapter);
      });
    } else {
      setPhase("loading");
      setActiveChapter(chapter);
    }

    const player = playerRef.current;
    if (!player) {
      switchToFallback("Remotion player did not mount");
      return;
    }

    // 탐색 상태를 먼저 커밋하고 재생은 원래 사용자 입력 안에서 실행한다.
    // seekTo와 play를 같은 배치로 실행하면 이전 프레임에서 다시 시작할 수 있다.
    flushSync(() => {
      player.pause();
      player.seekTo(frame);
    });
    if (firstAudibleStartRef.current) {
      player.setVolume(1);
      player.unmute();
      setMasterVolume(1);
      setIsMuted(false);
      firstAudibleStartRef.current = false;
    }
    suspendBgmForContext(TOUR_AUDIO_CONTEXT);
    player.play(event);
  }, [paintProgress, started, switchToFallback]);

  const seek = useCallback((seconds: number, event?: SyntheticEvent) => {
    if (useFallback) fallbackControllerRef.current?.playFrom(seconds, event);
    else playFrom(seconds, event);
  }, [playFrom, useFallback]);

  useImperativeHandle(controllerRef, () => ({ playFrom: seek }), [seek]);

  const toggleFullscreen = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isFullscreen()) player.exitFullscreen();
    else player.requestFullscreen();
  }, []);

  if (useFallback) {
    return (
      <ProductTourMp4Player
        locale={locale}
        initialTime={fallbackStart}
        fallbackNotice={fallbackReasonRef.current}
        autoPlayOnMount={fallbackAutoplayRef.current}
        controllerRef={fallbackControllerRef}
      />
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const shortcut = productTourShortcut(event);
    if (!shortcut) return;
    if (shortcut === "previous" || shortcut === "next") {
      const index = clampProductTourChapter(activeChapter + (shortcut === "next" ? 1 : -1));
      const chapter = PRODUCT_TOUR.chapters[index];
      if (!chapter || index === activeChapter) return;
      playFrom(chapter.start, event);
    } else if (shortcut === "fullscreen") {
      if (!started) return;
      toggleFullscreen();
    } else {
      setCaptionsEnabled((current) => !current);
    }
    event.preventDefault();
  };

  const loading = phase === "loading";
  const soundExpected = narrationEnabled || bgmEnabled;
  const soundOff = started && soundExpected && (isMuted || masterVolume <= 0.01);
  const audioDownloadSize = formatMegabytes(runtimeAudioBytes);
  const previousChapter = PRODUCT_TOUR.chapters[activeChapter - 1];
  const nextChapter = PRODUCT_TOUR.chapters[activeChapter + 1];

  return (
    <section
      ref={sectionRef}
      className="product-tour-player mk-shell"
      id="product-tour-video"
      aria-labelledby="product-tour-video-title"
      data-player-engine="remotion"
      data-player-phase={phase}
      data-player-started={started ? "true" : "false"}
      data-player-muted={isMuted ? "true" : "false"}
      data-player-volume={masterVolume.toFixed(2)}
      data-audio-revision={PRODUCT_TOUR_RUNTIME_AUDIO.revision}
      data-current-frame={productTourFrameForSeconds(requestedStartRef.current)}
    >
      <div className="mk-key-scope" role="presentation" onKeyDown={handleKeyDown}>
        <ProductTourPlayerHeading />

        <div className="product-tour-player__layout">
          <div className="product-tour-player__main">
            <div className="product-tour-player__screen" aria-busy={loading || undefined}>
              {started ? (
                <Player<AnyZodObject, ProductTourRemotionCompositionProps>
                  ref={playerRef}
                  initialFrame={mountFrameRef.current}
                  component={ProductTourRemotionComposition}
                  inputProps={compositionProps}
                  durationInFrames={PRODUCT_TOUR.duration * PRODUCT_TOUR.fps}
                  compositionWidth={1280}
                  compositionHeight={720}
                  fps={PRODUCT_TOUR.fps}
                  className="product-tour-player__remotion"
                  style={{ width: "100%", height: "100%" }}
                  controls
                  showVolumeControls
                  showPlaybackRateControl={[0.75, 1, 1.25]}
                  initiallyMuted={false}
                  initialVolume={1}
                  clickToPlay
                  doubleClickToFullscreen
                  spaceKeyToPlayOrPause
                  allowFullscreen
                  moveToBeginningWhenEnded={false}
                  numberOfSharedAudioTags={2}
                  bufferStateDelayInMilliseconds={250}
                  audioLatencyHint="playback"
                  sampleRate={48_000}
                  acknowledgeRemotionLicense
                />
              ) : (
                <button
                  type="button"
                  className="product-tour-player__poster"
                  onClickCapture={(event) => playFrom(initialRequest.seconds, event)}
                  aria-label={bi("소리와 함께 제품 투어 재생", "Play the product tour with sound")}
                >
                  <img src={PRODUCT_TOUR.poster} width={1280} height={720} alt="" decoding="async" />
                  <span className="product-tour-player__poster-disc"><Play size={26} fill="currentColor" aria-hidden="true" /></span>
                  <strong>{initialRequest.seconds > 0 ? bi(`${formatProductTourTime(initialRequest.seconds)}부터 제품 투어 재생`, `Play the tour from ${formatProductTourTime(initialRequest.seconds)}`) : bi("소리와 함께 8분 제품 투어 재생", "Play the 8-minute tour with sound")}</strong>
                  <small>{bi(
                    `재생을 누를 때만 약 ${audioDownloadSize}의 내레이션·BGM을 불러옵니다`,
                    `About ${audioDownloadSize} of narration and music loads only after you press play`,
                  )}</small>
                </button>
              )}
              {loading && started ? (
                <div className="product-tour-player__status" role="status" aria-live="polite">
                  <LoaderCircle size={22} aria-hidden="true" />
                  {bi("중간 탐색을 위해 오디오를 준비하고 있습니다 · 처음 재생할 때만 파일을 준비합니다", "Preparing seekable audio · Files are prepared only on first playback")}
                </div>
              ) : null}
              {soundOff ? (
                <button type="button" className="product-tour-player__sound-recovery" onClickCapture={enableSound}>
                  <VolumeX size={16} aria-hidden="true" />
                  {bi("소리가 꺼져 있습니다 · 클릭해서 켜기", "Sound is off · Click to enable")}
                </button>
              ) : null}
            </div>

            <div className="product-tour-player__mix" aria-label={bi("제품 투어 재생·오디오·자막 조절", "Product tour playback, audio and captions")} role="group">
              <div className="product-tour-player__step">
                <button
                  type="button"
                  className="product-tour-player__icon-button"
                  disabled={!previousChapter}
                  aria-label={bi("이전 챕터", "Previous chapter")}
                  onClickCapture={(event) => { if (previousChapter) playFrom(previousChapter.start, event); }}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="product-tour-player__icon-button"
                  disabled={!nextChapter}
                  aria-label={bi("다음 챕터", "Next chapter")}
                  onClickCapture={(event) => { if (nextChapter) playFrom(nextChapter.start, event); }}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="product-tour-player__mix-track">
                <button type="button" aria-pressed={narrationEnabled} onClick={() => setNarrationEnabled((current) => !current)}>
                  <AudioLines size={15} aria-hidden="true" />
                  {bi("내레이션", "Narration")}
                </button>
                <label>
                  <span className="sr-only">{bi("내레이션 음량", "Narration volume")}</span>
                  <input type="range" min="0" max="1" step="0.05" value={narrationVolume} disabled={!narrationEnabled} onChange={(event) => setNarrationVolume(Number(event.currentTarget.value))} />
                </label>
              </div>
              <div className="product-tour-player__mix-track">
                <button type="button" aria-pressed={bgmEnabled} onClick={() => setBgmEnabled((current) => !current)}>
                  <Music2 size={15} aria-hidden="true" />
                  BGM
                </button>
                <label>
                  <span className="sr-only">{bi("BGM 음량", "Background music volume")}</span>
                  <input type="range" min="0" max="1" step="0.05" value={bgmVolume} disabled={!bgmEnabled} onChange={(event) => setBgmVolume(Number(event.currentTarget.value))} />
                </label>
              </div>
              <button type="button" className="product-tour-player__mix-button" aria-pressed={captionsEnabled} onClick={() => setCaptionsEnabled((current) => !current)}>
                <Captions size={15} aria-hidden="true" />
                {bi("자막", "Captions")}
              </button>
              <button
                type="button"
                className="product-tour-player__mix-button"
                aria-pressed={voiceGuideSpeaking}
                disabled={!voiceGuideSupported}
                onClick={() => {
                  playerRef.current?.pause();
                  toggleVoiceGuide();
                }}
              >
                <AudioLines size={15} aria-hidden="true" />
                {voiceGuideSpeaking ? bi("챕터 안내 정지", "Stop chapter guide") : bi("현재 챕터 음성 안내", "Read current chapter")}
              </button>
              <button type="button" className="product-tour-player__mix-button" disabled={!started} onClick={toggleFullscreen}>
                <Maximize size={15} aria-hidden="true" />
                {bi("전체화면", "Fullscreen")}
              </button>
              <button
                type="button"
                className="product-tour-player__mix-button product-tour-player__mix-button--quiet"
                onClick={() => switchToFallback(bi("사용자가 호환 MP4 재생으로 전환했습니다.", "The user switched to compatible MP4 playback."))}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {bi("호환 재생", "Compatibility playback")}
              </button>
            </div>
            {voiceGuideError ? <p className="product-tour-player__voice-guide-status" role="alert">{voiceGuideError}</p> : null}
            <ProductTourKeyboardHint />
            <ProductTourNowPanel activeChapter={activeChapter} onSeek={playFrom} />
          </div>

          <ProductTourChapterRail activeChapter={activeChapter} onSeek={playFrom} />
        </div>

        <ProductTourTranscript onSeek={playFrom} />
        <p className="sr-only" aria-live="polite">{copy.nowPlaying}: {bi(PRODUCT_TOUR.chapters[activeChapter]?.ko ?? "", PRODUCT_TOUR.chapters[activeChapter]?.en ?? "")}</p>
      </div>
    </section>
  );
}
