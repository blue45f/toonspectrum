/**
 * 모션 웹툰 숏폼형 플레이어.
 *
 * 컷 이미지 + 카메라 연출(CSS 애니메이션) + BGM + 대사 음성 + 자막을
 * 함께 재생한다. 네이버 '컷츠'식 숏폼 감상 경험을 목표로 한다.
 *
 * - idle: 시네마틱 스플래시 + 핵심 액션 1개(▶ 재생)
 * - playing: 카메라 연출·전환·자막 하이라이트 + 비네팅·레터박스
 * - ended: 다시 보기
 */

import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { stripEmotionMarkup } from "@/shared/voice/voice-emotion-markup";

import "./motion-webtoon.css";
import { PlayerSplashIllustration } from "./motion-webtoon-illustrations";
import {
  CAMERA_MOVE_LABELS,
  CUT_TRANSITION_LABELS,
  MOTION_SCENE_MOOD_LABELS,
  MOTION_WEBTOON_UI_LABELS,
} from "./motion-webtoon-labels";
import { clampCutDuration, episodeDurationSeconds, type MotionEpisode } from "./motion-webtoon-model";
import { useMotionWebtoonCountUp } from "./useMotionWebtoonCountUp";
import { useMotionWebtoonPlayer } from "./useMotionWebtoonPlayer";

export interface MotionWebtoonPlayerProps {
  readonly episode: MotionEpisode;
  readonly bgmEnabled?: boolean;
  readonly voiceEnabled?: boolean;
  readonly onBgmEnabledChange?: (enabled: boolean) => void;
  readonly onVoiceEnabledChange?: (enabled: boolean) => void;
}

function labelText(t: (ko: string, en: string) => string, key: string, table: Record<string, { titleKo: string; titleEn: string }>): string {
  const entry = table[key];
  if (!entry) return key;
  return t(entry.titleKo, entry.titleEn);
}

const L = MOTION_WEBTOON_UI_LABELS;

export function MotionWebtoonPlayer(props: MotionWebtoonPlayerProps): JSX.Element {
  const {
    episode,
    bgmEnabled = true,
    voiceEnabled = true,
    onBgmEnabledChange,
    onVoiceEnabledChange,
  } = props;
  const t = useBilingual("motion-webtoon");
  const player = useMotionWebtoonPlayer({ episode, bgmEnabled, voiceEnabled });
  const { state, cutIndex, cut, cutCount, activeDialogue, reducedMotion } = player;

  const totalSeconds = episodeDurationSeconds(episode);
  const animatedTotal = useMotionWebtoonCountUp(totalSeconds);
  const progress = cutCount === 0 ? 0 : ((cutIndex + (state === "ended" ? 1 : 0)) / cutCount) * 100;

  // 컷 전환 효과 오버레이 — 컷이 바뀔 때마다 한 번 재생.
  const [transitionNonce, setTransitionNonce] = useState(0);
  const prevCutIndexRef = useRef(cutIndex);
  useEffect(() => {
    if (prevCutIndexRef.current !== cutIndex) {
      prevCutIndexRef.current = cutIndex;
      setTransitionNonce((n) => n + 1);
    }
  }, [cutIndex]);

  const [shareNotice, setShareNotice] = useState(false);
  const shareTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    };
  }, []);

  if (cutCount === 0) {
    return (
      <section className="mw-player mw-player-empty" aria-label={t(L.playerTitle.titleKo, L.playerTitle.titleEn)}>
        <PlayerSplashIllustration className="mw-splash-illus" />
        <p>{t(L.emptyEpisode.titleKo, L.emptyEpisode.titleEn)}</p>
      </section>
    );
  }

  const isPlaying = state === "playing";
  const isIdle = state === "idle";
  const isEnded = state === "ended";
  const cameraClass = cut && !reducedMotion ? `mw-cam-${cut.direction.cameraMove}` : "mw-cam-static";
  const transitionClass = cut ? `mw-tr-${cut.transitionIn}` : "mw-tr-cut";
  const cutDuration = cut ? clampCutDuration(cut.direction.durationSeconds) : 6;
  const splashMeta = t(L.splashMeta.titleKo, L.splashMeta.titleEn)
    .replace("{cuts}", String(cutCount))
    .replace("{seconds}", String(Math.round(animatedTotal)));

  const copyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#motion-episode=${episode.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setShareNotice(true);
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => setShareNotice(false), 2600);
  };

  const characterName = (characterId: string): string => {
    const character = episode.characters.find((c) => c.id === characterId);
    if (!character) return characterId;
    return t(character.nameKo, character.nameEn);
  };

  return (
    <section className="mw-player" aria-label={t(L.playerTitle.titleKo, L.playerTitle.titleEn)}>
      <div className={`mw-stage${isIdle || isEnded ? " mw-letterbox-hidden" : ""}`}>
        {cut && (
          <div key={cut.id} className={`mw-cutwrap ${cameraClass}`} style={{ ["--mw-cut-duration" as string]: `${cutDuration}s` }}>
            {cut.imageUrl ? (
              <img
                className="mw-cutimg"
                src={cut.imageUrl}
                alt={t(cut.altKo, cut.altEn) || t(`컷 ${cutIndex + 1}`, `Cut ${cutIndex + 1}`)}
                draggable={false}
              />
            ) : (
              <div className="mw-cutimg mw-cutimg-empty" role="img" aria-label={t(`컷 ${cutIndex + 1}`, `Cut ${cutIndex + 1}`)} />
            )}
          </div>
        )}
        {transitionNonce > 0 && !reducedMotion && (
          <div key={transitionNonce} className={`mw-transition ${transitionClass}`} aria-hidden="true" />
        )}

        {/* 시네마틱 비네팅 + 레터박스 */}
        {!isIdle && !isEnded && (
          <>
            <div className="mw-vignette" aria-hidden="true" />
            <div className="mw-letterbox-top" aria-hidden="true" />
            <div className="mw-letterbox-bottom" aria-hidden="true" />
          </>
        )}

        {/* 스플래시 — 핵심 액션 1개 */}
        {isIdle && (
          <div className="mw-splash">
            <PlayerSplashIllustration className="mw-splash-illus" />
            <p className="mw-splash-title">{t(episode.titleKo, episode.titleEn)}</p>
            <p className="mw-splash-meta">{splashMeta}</p>
            <button type="button" className="mw-play-big" onClick={player.play} aria-label={t(L.play.titleKo, L.play.titleEn)}>
              <span className="mw-play-ring" aria-hidden="true" />
              <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <span className="mw-splash-cta-label">{t(L.splashPlay.titleKo, L.splashPlay.titleEn)}</span>
          </div>
        )}

        {/* 종료 화면 */}
        {isEnded && (
          <div className="mw-ended" role="status">
            <p className="mw-splash-title">{t(L.endedMessage.titleKo, L.endedMessage.titleEn)}</p>
            <p className="mw-splash-meta">{splashMeta}</p>
            <button type="button" className="mw-play-big" onClick={player.play} aria-label={t(L.replay.titleKo, L.replay.titleEn)}>
              <span className="mw-play-ring" aria-hidden="true" />
              <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" />
              </svg>
            </button>
            <span className="mw-splash-cta-label">{t(L.replay.titleKo, L.replay.titleEn)}</span>
          </div>
        )}

        {/* 컷 정보 뱃지 */}
        {!isIdle && !isEnded && cut && (
          <div className="mw-cutbadge" aria-hidden="true">
            {t(L.cutLabel.titleKo, L.cutLabel.titleEn)} {cutIndex + 1}/{cutCount}
            {" · "}
            {labelText(t, cut.bgm.sceneMood, MOTION_SCENE_MOOD_LABELS)}
          </div>
        )}
      </div>

      {/* 자막 바 — 현재 발화 중인 대사를 하이라이트. */}
      <div className="mw-subtitles" aria-live="polite">
        {cut?.dialogues.map((dialogue) => {
          const isActive = activeDialogue?.id === dialogue.id;
          return (
            <p key={dialogue.id} className={`mw-subtitle${isActive ? " mw-subtitle-active" : ""}`}>
              <span className="mw-subtitle-speaker">{characterName(dialogue.characterId)}</span>
              <span className="mw-subtitle-text">{stripEmotionMarkup(dialogue.text)}</span>
            </p>
          );
        })}
      </div>

      {/* 진행률 */}
      <div className="mw-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div className="mw-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* 컨트롤 — 재생이 핵심, 나머지는 격하 */}
      <div className="mw-controls">
        <button
          type="button"
          className="mw-btn"
          onClick={player.prevCut}
          disabled={cutIndex === 0}
          aria-label={t(L.prevCut.titleKo, L.prevCut.titleEn)}
        >
          {"⏮"}
        </button>
        {isPlaying ? (
          <button type="button" className="mw-btn mw-btn-primary" onClick={player.pause} aria-label={t(L.pause.titleKo, L.pause.titleEn)}>
            {"⏸"}
          </button>
        ) : (
          <button type="button" className="mw-btn mw-btn-primary" onClick={player.play} aria-label={isEnded ? t(L.replay.titleKo, L.replay.titleEn) : t(L.play.titleKo, L.play.titleEn)}>
            {"▶"}
          </button>
        )}
        <button type="button" className="mw-btn" onClick={player.stop} aria-label={t(L.stop.titleKo, L.stop.titleEn)}>
          {"⏹"}
        </button>
        <button
          type="button"
          className="mw-btn"
          onClick={player.nextCut}
          disabled={cutIndex >= cutCount - 1}
          aria-label={t(L.nextCut.titleKo, L.nextCut.titleEn)}
        >
          {"⏭"}
        </button>
        <div className="mw-cutdots" role="tablist" aria-label={t(L.cutLabel.titleKo, L.cutLabel.titleEn)}>
          {episode.cuts.map((c, index) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={index === cutIndex}
              className={`mw-cutdot${index === cutIndex ? " mw-cutdot-active" : ""}`}
              onClick={() => player.seekCut(index)}
              aria-label={t(`컷 ${index + 1}`, `Cut ${index + 1}`)}
            />
          ))}
        </div>
      </div>

      <div className="mw-meta">
        <span className="mw-meta-item" title={t(L.bgmLabel.titleKo, L.bgmLabel.titleEn)}>
          {"🎵 "}
          {cut ? labelText(t, cut.bgm.sceneMood, MOTION_SCENE_MOOD_LABELS) : ""}
        </span>
        <span className="mw-meta-item" title={t(L.directionLabel.titleKo, L.directionLabel.titleEn)}>
          {"🎬 "}
          {cut ? labelText(t, cut.direction.cameraMove, CAMERA_MOVE_LABELS) : ""}
          {" · "}
          {cut ? labelText(t, cut.transitionIn, CUT_TRANSITION_LABELS) : ""}
        </span>
        <span className="mw-meta-item">
          {t(`컷 ${cutIndex + 1} / ${cutCount}`, `Cut ${cutIndex + 1} / ${cutCount}`)}
        </span>
      </div>

      {/* 2차 액션 — 토글·공유 */}
      <div className="mw-toggles">
        <button
          type="button"
          className={`mw-toggle${bgmEnabled ? " mw-toggle-on" : ""}`}
          aria-pressed={bgmEnabled}
          onClick={() => onBgmEnabledChange?.(!bgmEnabled)}
        >
          {bgmEnabled
            ? t(L.bgmOff.titleKo, L.bgmOff.titleEn)
            : t(L.bgmOn.titleKo, L.bgmOn.titleEn)}
        </button>
        <button
          type="button"
          className={`mw-toggle${voiceEnabled ? " mw-toggle-on" : ""}`}
          aria-pressed={voiceEnabled}
          onClick={() => onVoiceEnabledChange?.(!voiceEnabled)}
        >
          {voiceEnabled
            ? t(L.voiceOff.titleKo, L.voiceOff.titleEn)
            : t(L.voiceOn.titleKo, L.voiceOn.titleEn)}
        </button>
        <button type="button" className="mw-toggle" onClick={copyShareLink}>
          {t(L.shareLabel.titleKo, L.shareLabel.titleEn)}
        </button>
        {shareNotice && (
          <span className="mw-share-notice" role="status">
            {t(L.shareCopied.titleKo, L.shareCopied.titleEn)} {t(L.shareNote.titleKo, L.shareNote.titleEn)}
          </span>
        )}
      </div>
    </section>
  );
}
