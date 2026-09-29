import { Music, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/utils";

import { BGM_MAX_VOLUME, BGM_MIN_VOLUME } from "./bgm-engine";
import { usePageBgm } from "./usePageBgm";

export interface BgmControllerProps {
  readonly className?: string;
}

/**
 * BGM 플로팅 컨트롤 (우하단 고정).
 *
 * - 시작 전: "🎵 배경음악 켜기" 버튼 — 클릭이 곧 AudioContext 생성 제스처다 (자동재생 정책).
 * - 재생 중: 무드 표시 + 일시정지/재생 + 볼륨 슬라이더 + 닫기.
 * - 미지원 브라우저에서는 렌더링하지 않는다.
 */
export function BgmController({ className }: BgmControllerProps) {
  const {
    supported,
    playing,
    mood,
    volume,
    enabled,
    reducedMotion,
    labels,
    start,
    stop,
    setVolume,
    setEnabled,
  } = usePageBgm();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!supported) return null;
  // 사용자가 껐고 재생 중이 아니면 조용히 숨긴다.
  if (!enabled && !playing && dismissed) return null;

  // 시작 전: 눈에 잘 띄는 시작 버튼
  if (!playing) {
    return (
      <div className={cn("fixed bottom-5 right-4 z-40 sm:right-6", className)}>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (start()) setExpanded(true);
            }}
            aria-label={labels.enable}
            title={labels.enableHint}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/40 bg-panel/90 py-2 pl-3 pr-4 shadow-lg backdrop-blur-xl transition-all hover:border-accent/70 hover:shadow-[0_0_24px_var(--color-accent-soft)]"
          >
            <span
              className="inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent transition-transform group-hover:scale-110"
              aria-hidden="true"
            >
              <Music className="size-4" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-bold text-fg">{labels.enable}</span>
              <span className="block text-xs text-fg-3">{labels.enableHint}</span>
            </span>
          </button>
          {reducedMotion && (
            <p className="max-w-56 rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs leading-relaxed text-fg-3 shadow-lg backdrop-blur-xl">
              {labels.reducedMotionHint}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setEnabled(false);
              setDismissed(true);
            }}
            aria-label={labels.close}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-line bg-panel/80 text-fg-3 backdrop-blur-xl transition-colors hover:text-fg"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // 재생 중: 컴팩트 컨트롤
  return (
    <div className={cn("fixed bottom-5 right-4 z-40 sm:right-6", className)}>
      <div className="flex flex-col items-end gap-2">
        {expanded && (
          <div
            role="group"
            aria-label={labels.nowPlaying}
            className="w-64 rounded-2xl border border-line bg-panel/95 p-4 shadow-xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-fg-3">{labels.nowPlaying}</p>
                <p className="truncate text-sm font-bold text-fg">
                  {labels.moodName(mood)}
                  <span className="ml-1.5 font-normal text-fg-3">{labels.moodDescription(mood)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label={labels.close}
                className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors hover:text-fg"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (volume <= BGM_MIN_VOLUME) setVolume(0.6);
                  else setVolume(BGM_MIN_VOLUME);
                }}
                aria-label={labels.volume}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-line text-fg-2 transition-colors hover:text-fg"
              >
                {volume <= BGM_MIN_VOLUME ? (
                  <VolumeX className="size-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="size-4" aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                min={BGM_MIN_VOLUME}
                max={BGM_MAX_VOLUME}
                step={0.05}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label={labels.volume}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
              />
            </div>
            {/* 재생 파형 인디케이터 (장식) */}
            <div className="mt-3 flex h-6 items-end justify-center gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                <span
                  key={i}
                  className="w-1 animate-pulse rounded-full bg-accent/60"
                  style={{
                    height: `${6 + ((i * 7) % 14)}px`,
                    animationDelay: `${(i % 4) * 0.2}s`,
                    animationDuration: "1.2s",
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={labels.nowPlaying}
            aria-expanded={expanded}
            title={`${labels.moodName(mood)} · ${labels.moodDescription(mood)}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-accent/50 bg-accent px-3 text-on-accent shadow-[0_0_24px_var(--color-accent-soft)] backdrop-blur-xl transition-all hover:brightness-110"
          >
            <Music className="size-4" aria-hidden="true" />
            <span className="text-sm font-semibold">{labels.moodName(mood)}</span>
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-0.5 animate-pulse rounded-full bg-current"
                  style={{ height: `${10 + (i % 2) * 6}px`, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              stop();
              setExpanded(false);
            }}
            aria-label={labels.disable}
            aria-pressed={false}
            title={labels.disable}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-panel/90 text-fg-3 shadow-lg backdrop-blur-xl transition-colors hover:text-fg"
          >
            <Pause className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 일시정지 상태에서 다시 시작하는 작은 인라인 버튼이 필요할 때 사용. */
export function BgmResumeButton({ className }: { readonly className?: string }) {
  const { supported, playing, labels, start } = usePageBgm();
  if (!supported || playing) return null;
  return (
    <button
      type="button"
      onClick={() => start()}
      aria-label={labels.enable}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-fg transition-colors hover:border-accent/40 hover:text-accent",
        className,
      )}
    >
      <Play className="size-4" aria-hidden="true" />
      {labels.enable}
    </button>
  );
}
