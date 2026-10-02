/**
 * 컷츠 플레이어 — 9:16 세로형 클립을 브라우저에서 실시간 렌더링한다.
 *
 * MP4 파일을 재생하는 대신 클립 재생 명세(CutsClip)를 따라
 * 샷별 켄 번즈 카메라(Web Animations API) + 자막 + 내레이션(Web Speech)을
 * 동기화한다. 피드에서는 화면에 들어온(active) 클립만 재생한다.
 */

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useCutsNarration } from "./use-cuts-narration";
import { shotIndexAt } from "./cuts-clip-builder";
import type { CutsClip, CutsShot, KenBurnsMove } from "./cuts-types";

import "./cuts.css";

interface CutsPlayerProps {
  readonly clip: CutsClip;
  /** 피드에서 화면에 들어와 재생해야 하는 상태. */
  readonly active: boolean;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
}

function kenBurnsKeyframes(move: KenBurnsMove): Keyframe[] {
  const from = `scale(${move.from.scale}) translate(${move.from.x}%, ${move.from.y}%)`;
  const to = `scale(${move.to.scale}) translate(${move.to.x}%, ${move.to.y}%)`;
  return [{ transform: from }, { transform: to }];
}

function ShotView({
  shot,
  visible,
}: Readonly<{ shot: CutsShot; visible: boolean }>) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !visible) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const animation = image.animate(kenBurnsKeyframes(shot.kenBurns), {
      duration: shot.durationMs,
      easing: "linear",
      fill: "forwards",
    });
    return () => animation.cancel();
  }, [shot, visible]);

  return (
    <div className="cuts-shot" aria-hidden={!visible}>
      <img
        ref={imageRef}
        src={shot.imageUrl}
        alt={visible ? shot.alt : ""}
        className="cuts-shot__image"
        draggable={false}
      />
      {visible ? <p className="cuts-shot__caption">{shot.caption}</p> : null}
    </div>
  );
}

export function CutsPlayer({ clip, active, muted, onToggleMute }: CutsPlayerProps) {
  const t = useBilingual("cuts");
  const narration = useCutsNarration();
  const [positionMs, setPositionMs] = useState(0);
  const positionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const loopCountRef = useRef(0);

  const shotIndex = shotIndexAt(clip, positionMs);
  const shot = clip.shots[shotIndex];

  // 재생 루프 — active일 때만 position을 전진시키고, 클립 끝에 도달하면 반복한다.
  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      positionRef.current += delta;
      if (positionRef.current >= clip.durationMs) {
        positionRef.current = 0;
        loopCountRef.current += 1;
      }
      setPositionMs(positionRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, clip.durationMs]);

  // 샷이 바뀌면 내레이션 — 음소거면 말하지 않는다.
  const loopCount = loopCountRef.current;
  useEffect(() => {
    if (!active || muted || !shot) {
      if (!active) narration.stop();
      return;
    }
    narration.speakShot(shot);
  }, [active, muted, shot, loopCount, narration]);

  // 비활성화되면 내레이션 중지.
  useEffect(() => {
    if (!active) narration.stop();
  }, [active, narration]);

  const progress = clip.durationMs > 0 ? Math.min(1, positionMs / clip.durationMs) : 0;

  return (
    <div className="cuts-player" role="region" aria-label={`${clip.title} ${clip.episodeNumber}화 컷츠`}>
      <div className="cuts-player__stage">
        {clip.shots.map((candidate, index) => (
          <ShotView key={candidate.id} shot={candidate} visible={index === shotIndex && active} />
        ))}
        {!active ? (
          <img src={clip.thumbnailUrl} alt="" className="cuts-shot__image" draggable={false} />
        ) : null}
      </div>
      <div
        className="cuts-player__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={t("재생 진행률", "Playback progress")}
      >
        <div className="cuts-player__progress-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <button
        type="button"
        className="cuts-player__mute"
        onClick={onToggleMute}
        aria-pressed={!muted}
        aria-label={muted ? t("소리 켜기", "Unmute") : t("음소거", "Mute")}
      >
        {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
