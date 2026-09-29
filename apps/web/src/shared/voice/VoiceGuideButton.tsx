import { Captions, Square, Volume2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/utils";

import { usePageVoiceGuide } from "./usePageVoiceGuide";
import type { VoiceGuideScriptId } from "./voice-guide-texts";

export type VoiceGuideButtonVariant = "fixed" | "inline";

export interface VoiceGuideButtonProps {
  readonly scriptId: VoiceGuideScriptId;
  /** "fixed": 페이지 우상단 고정 / "inline": 히어로 옆 인라인 배치. */
  readonly variant?: VoiceGuideButtonVariant;
  readonly className?: string;
}

/**
 * 음성 안내 듣기 버튼.
 *
 * - fixed 변형은 페이지 우상단에 고정되어 눈에 잘 띈다.
 * - 재생 중에는 자막(안내 문구)을 함께 표시한다.
 * - 미지원 브라우저에서는 렌더링하지 않는다.
 */
export function VoiceGuideButton({ scriptId, variant = "inline", className }: VoiceGuideButtonProps) {
  const { supported, speaking, script, speak, stop } = usePageVoiceGuide(scriptId);
  const [showCaption, setShowCaption] = useState(false);

  if (!supported) return null;

  const label = speaking ? "음성 안내 중지" : "음성 안내 듣기";

  return (
    <div
      className={cn(
        variant === "fixed" && "fixed right-4 top-20 z-40 sm:right-6",
        variant === "inline" && "inline-flex",
        className,
      )}
    >
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (speaking) {
                stop();
              } else {
                speak();
                setShowCaption(true);
              }
            }}
            aria-label={label}
            aria-pressed={speaking}
            title={label}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 shadow-lg backdrop-blur-xl transition-all",
              speaking
                ? "border-accent/50 bg-accent text-on-accent shadow-[0_0_24px_var(--color-accent-soft)]"
                : "border-line bg-panel/90 text-fg hover:border-accent/40 hover:text-accent",
            )}
          >
            {speaking ? (
              <Square className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold">{speaking ? "듣는 중" : "안내 듣기"}</span>
            {speaking && (
              <span className="flex items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 animate-pulse rounded-full bg-current"
                    style={{ height: `${10 + (i % 2) * 6}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowCaption((prev) => !prev)}
            aria-label={showCaption ? "자막 숨기기" : "자막 보기"}
            aria-pressed={showCaption}
            title={showCaption ? "자막 숨기기" : "자막 보기"}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors",
              showCaption
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line bg-panel/90 text-fg-3 hover:text-fg",
            )}
          >
            <Captions className="size-4" aria-hidden="true" />
          </button>
        </div>
        {showCaption && (
          <p
            role="status"
            aria-live="polite"
            className="max-w-64 rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs leading-relaxed text-fg-2 shadow-lg backdrop-blur-xl"
          >
            {script}
          </p>
        )}
      </div>
    </div>
  );
}
