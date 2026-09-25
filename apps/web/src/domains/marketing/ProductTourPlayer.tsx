import { Player, type PlayerRef } from "@remotion/player";
import { resumeBgmForContext, suspendBgmForContext } from "@toonspectrum/core/fx";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  AudioLines,
  Captions,
  LoaderCircle,
  Music2,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { SyntheticEvent } from "react";
import type { AnyZodObject } from "remotion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import Link from "@/shared/navigation/router-link";

import { creatorFilmChapterAt } from "./creator-film-playback";
import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import { PRODUCT_TOUR, PRODUCT_TOUR_COPY, type ProductTourLocale } from "./product-tour-content";
import { ProductTourMp4Player } from "./ProductTourMp4Player";
import {
  ProductTourRemotionComposition,
  type ProductTourAudioIssue,
  type ProductTourRemotionCompositionProps,
} from "./ProductTourRemotionComposition";
import { useProductTourVoiceGuide } from "./use-product-tour-voice-guide";

import "./product-tour-player.css";

const TOUR_AUDIO_CONTEXT = "product-tour-video";
const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ProductTourPlayer", ko, en);

type PlayerPhase = "idle" | "loading" | "ready" | "failed";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatMegabytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return bi("Remotion 재생 중 알 수 없는 오류가 발생했습니다.", "An unknown Remotion playback error occurred.");
}

const runtimeAudioBytes = PRODUCT_TOUR_RUNTIME_AUDIO.narration.bytes
  + PRODUCT_TOUR_RUNTIME_AUDIO.bgm.bytes;

export function ProductTourPlayer({ locale }: { readonly locale: ProductTourLocale }) {
  useBilingualI18nRevision();
  const copy = bi((PRODUCT_TOUR_COPY).ko, (PRODUCT_TOUR_COPY).en);
  const chapterStarts = useMemo(
    () => PRODUCT_TOUR.chapters.map((chapter) => chapter.start),
    [],
  );
  const playerRef = useRef<PlayerRef>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const fallbackReasonRef = useRef("");
  const firstAudibleStartRef = useRef(true);
  const requestedStartRef = useRef(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [started, setStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [narrationVolume, setNarrationVolume] = useState(1);
  const [bgmVolume, setBgmVolume] = useState(0.48);
  const [fallbackStart, setFallbackStart] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
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

  const switchToFallback = useCallback((reason: string) => {
    const player = playerRef.current;
    const frame = player?.getCurrentFrame();
    const currentTime = frame === undefined
      || (frame === 0 && requestedStartRef.current > 0)
      ? requestedStartRef.current
      : frame / PRODUCT_TOUR.fps;
    fallbackReasonRef.current = reason;
    setFallbackStart(currentTime);
    player?.pause();
    releaseSiteMusic();
    setUseFallback(true);
  }, [releaseSiteMusic]);

  const handleAudioIssue = useCallback((issue: ProductTourAudioIssue) => {
    const channel = issue.channel === "narration"
      ? bi("내레이션", "narration")
      : "BGM";
    switchToFallback(`${channel} runtime audio failed: ${issue.message}`);
  }, [switchToFallback]);

  const compositionProps = useMemo<ProductTourRemotionCompositionProps>(() => ({
    locale,
    captionsEnabled,
    narrationEnabled,
    bgmEnabled,
    narrationVolume,
    bgmVolume,
    onAudioIssue: handleAudioIssue,
  }), [
    bgmEnabled,
    bgmVolume,
    captionsEnabled,
    handleAudioIssue,
    locale,
    narrationEnabled,
    narrationVolume,
  ]);

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
    const handleResume = () => {
        setPhase("ready");
    };
    const handleTimeUpdate = (event: { readonly detail: { readonly frame: number } }) => {
      sectionRef.current?.setAttribute("data-current-frame", String(event.detail.frame));
      requestedStartRef.current = event.detail.frame / PRODUCT_TOUR.fps;
      const next = creatorFilmChapterAt(requestedStartRef.current, chapterStarts);
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
      switchToFallback(errorMessage(event.detail.error));
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
  }, [
    chapterStarts,
    releaseSiteMusic,
    started,
    stopVoiceGuide,
    switchToFallback,
    useFallback,
  ]);

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
    requestedStartRef.current = seconds;
    const firstStart = !started;
    const frame = Math.round(seconds * PRODUCT_TOUR.fps);
    if (firstStart) {
      flushSync(() => {
        setStarted(true);
        setPhase("loading");
            setActiveChapter(creatorFilmChapterAt(seconds, chapterStarts));
      });
    } else {
      setPhase("loading");
        setActiveChapter(creatorFilmChapterAt(seconds, chapterStarts));
    }

    const player = playerRef.current;
    if (!player) {
      switchToFallback(errorMessage(new Error("Remotion player did not mount")));
      return;
    }

    player.seekTo(frame);
    if (firstAudibleStartRef.current) {
      player.setVolume(1);
      player.unmute();
      setMasterVolume(1);
      setIsMuted(false);
      firstAudibleStartRef.current = false;
    }
    suspendBgmForContext(TOUR_AUDIO_CONTEXT);
    player.play(event);
  }, [chapterStarts, started, switchToFallback]);

  if (useFallback) {
    return (
      <ProductTourMp4Player
        locale={locale}
        initialTime={fallbackStart}
        fallbackNotice={fallbackReasonRef.current}
        autoPlayOnMount
      />
    );
  }

  const loading = phase === "loading";
  const soundExpected = narrationEnabled || bgmEnabled;
  const soundOff = started && soundExpected && (isMuted || masterVolume <= 0.01);
  const audioDownloadSize = formatMegabytes(runtimeAudioBytes);

  return (
    <section
      ref={sectionRef}
      className="product-tour-player"
      id="product-tour-video"
      aria-labelledby="product-tour-video-title"
      data-player-engine="remotion"
      data-player-phase={phase}
      data-player-started={started ? "true" : "false"}
      data-player-muted={isMuted ? "true" : "false"}
      data-player-volume={masterVolume.toFixed(2)}
      data-audio-revision={PRODUCT_TOUR_RUNTIME_AUDIO.revision}
      data-current-frame="0"
    >
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
        {started ? (
          <Player<AnyZodObject, ProductTourRemotionCompositionProps>
            ref={playerRef}
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
        ) : null}
        {!started ? (
          <button
            type="button"
            className="product-tour-player__poster"
            onClickCapture={(event) => playFrom(0, event)}
            aria-label={bi("소리와 함께 제품 투어 재생", "Play the product tour with sound")}
          >
            <img src={PRODUCT_TOUR.poster} width={1280} height={720} alt="" decoding="async" />
            <span><Play size={24} fill="currentColor" aria-hidden="true" /></span>
            <strong>{bi("소리와 함께 8분 제품 투어 재생", "Play the 8-minute tour with sound")}</strong>
            <small>{bi(
              `Remotion 장면과 약 ${audioDownloadSize}의 내레이션·BGM을 직접 동기화합니다`,
              `Remotion synchronizes the scene with about ${audioDownloadSize} of narration and music`,
            )}</small>
          </button>
        ) : null}
        {loading && started ? (
          <div className="product-tour-player__status" role="status" aria-live="polite">
            <LoaderCircle size={22} aria-hidden="true" />
            {bi("Remotion 장면과 오디오를 동기화하는 중", "Synchronizing the Remotion scene and audio")}
          </div>
        ) : null}
        {soundOff ? (
          <button
            type="button"
            className="product-tour-player__sound-recovery"
            onClickCapture={enableSound}
          >
            <VolumeX size={16} aria-hidden="true" />
            {bi("소리가 꺼져 있습니다 · 클릭해서 켜기", "Sound is off · Click to enable")}
          </button>
        ) : null}
      </div>

      <div className="product-tour-player__mix" aria-label={bi("제품 투어 오디오와 자막", "Product tour audio and captions")}>
        <div className="product-tour-player__mix-track">
          <button
            type="button"
            aria-pressed={narrationEnabled}
            onClick={() => setNarrationEnabled((current) => !current)}
          >
            <AudioLines size={15} aria-hidden="true" />
            {bi("내레이션", "Narration")}
          </button>
          <label>
            <span className="sr-only">{bi("내레이션 음량", "Narration volume")}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={narrationVolume}
              disabled={!narrationEnabled}
              onChange={(event) => setNarrationVolume(Number(event.currentTarget.value))}
            />
          </label>
        </div>
        <div className="product-tour-player__mix-track">
          <button
            type="button"
            aria-pressed={bgmEnabled}
            onClick={() => setBgmEnabled((current) => !current)}
          >
            <Music2 size={15} aria-hidden="true" />
            BGM
          </button>
          <label>
            <span className="sr-only">{bi("BGM 음량", "Background music volume")}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgmVolume}
              disabled={!bgmEnabled}
              onChange={(event) => setBgmVolume(Number(event.currentTarget.value))}
            />
          </label>
        </div>

        <button
          type="button"
          className="product-tour-player__mix-button"
          aria-pressed={captionsEnabled}
          onClick={() => setCaptionsEnabled((current) => !current)}
        >
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
          {voiceGuideSpeaking
            ? bi("챕터 안내 정지", "Stop chapter guide")
            : bi("현재 챕터 음성 안내", "Read current chapter")}
        </button>

        <button
          type="button"
          className="product-tour-player__mix-button"
          onClick={() => switchToFallback(bi(
            "사용자가 호환 MP4 재생으로 전환했습니다.",
            "The user switched to compatible MP4 playback.",
          ))}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {bi("호환 재생", "Compatibility playback")}
        </button>
      </div>
      {voiceGuideError ? (
        <p className="product-tour-player__voice-guide-status" role="alert">
          {voiceGuideError}
        </p>
      ) : null}

      <nav className="product-tour-player__chapters" aria-label={bi("제품 투어 챕터", "Product tour chapters")}>
        {PRODUCT_TOUR.chapters.map((chapter, index) => {
          const active = index === activeChapter;
          return (
            <div className="product-tour-player__chapter" data-active={active || undefined} key={chapter.id}>
              <button
                type="button"
                onClickCapture={(event) => playFrom(chapter.start, event)}
                aria-pressed={active}
              >
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
            <li
              key={formatI18nTemplate(
                translateCurrentStaticSourceText(
                  "domains.marketing.ProductTourPlayer",
                  "en",
                  "{v0}-transcript",
                ),
                { v0: String(chapter.id) },
              )}
            >
              <button
                type="button"
                onClickCapture={(event) => playFrom(chapter.start, event)}
              >
                {formatTime(chapter.start)}
              </button>
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
