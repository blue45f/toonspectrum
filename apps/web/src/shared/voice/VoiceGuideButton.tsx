import { Captions, Square, Volume2 } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { usePageVoiceGuide } from "./usePageVoiceGuide";
import { useVoiceSegmentProgress } from "./useVoiceSegmentProgress";
import type { VoiceGuideScriptId } from "./voice-guide-texts";

export type VoiceGuideButtonVariant = "fixed" | "inline";

export interface VoiceGuideButtonProps {
  readonly scriptId: VoiceGuideScriptId;
  /** "fixed": 페이지 우상단 고정(휴대폰은 하단 플로팅 열) / "inline": 히어로 옆 인라인 배치. */
  readonly variant?: VoiceGuideButtonVariant;
  readonly className?: string;
}

/**
 * fixed 변형 위치.
 * - 넓은 화면: 머리글 아래 우상단.
 * - 휴대폰: 본문 제목을 가리지 않도록 하단 탭 위 오른쪽 열(⚙ 위 칸)로 내려 아이콘만 남긴다.
 *   자막은 버튼 위로 펼친다. 칸 계산은 app/styles/sitewide-visual-ux.css 의 플로팅 계층 계약을 따른다.
 */
const FIXED_PLACEMENT_CLASS =
  "fixed right-4 top-20 z-40 sm:right-6 max-md:top-auto max-md:right-4 max-md:bottom-[var(--site-float-voice-bottom)]";

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
  const bt = useBilingual("VoiceGuideButton");
  // 발화 중에는 현재 읽고 있는 세그먼트를 자막으로 표시한다 (하이라이트 동기화).
  const segment = useVoiceSegmentProgress();

  if (!supported) return null;

  const fixed = variant === "fixed";
  const label = speaking ? bt("음성 안내 중지", "Stop voice guide") : bt("음성 안내 듣기", "Listen to voice guide");
  const captionLabel = showCaption ? bt("자막 숨기기", "Hide captions") : bt("자막 보기", "Show captions");
  const captionText = speaking && segment ? segment.text : script;

  return (
    <div
      data-voice-guide-placement={variant}
      data-voice-guide-speaking={speaking || undefined}
      className={cn(
        fixed && FIXED_PLACEMENT_CLASS,
        variant === "inline" && "inline-flex",
        className,
      )}
    >
      <div className={cn("flex flex-col items-end gap-2", fixed && "max-md:flex-col-reverse")}>
        <div className={cn("flex items-center gap-1.5", fixed && "max-md:flex-col-reverse")}>
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
              fixed && "max-md:px-0",
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
            <span className={cn("text-sm font-semibold", fixed && "max-md:hidden")}>
              {speaking ? bt("듣는 중", "Listening") : bt("안내 듣기", "Listen")}
            </span>
            {speaking && (
              <span className={cn("flex items-center gap-0.5", fixed && "max-md:hidden")} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-current motion-safe:animate-pulse"
                    style={{ height: `${10 + (i % 2) * 6}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowCaption((prev) => !prev)}
            aria-label={captionLabel}
            aria-pressed={showCaption}
            title={captionLabel}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors",
              // 휴대폰 열에서는 자막 토글을 숨기고 재생할 때 자막을 자동으로 보여 준다.
              fixed && "max-md:hidden",
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
            className={cn(
              "max-w-64 break-keep rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs leading-relaxed text-fg-2 shadow-lg backdrop-blur-xl max-md:max-w-[min(16rem,calc(100vw-5rem))]",
              // 휴대폰 열에는 자막 토글이 없으므로 읽는 동안에만 자막을 띄운다.
              fixed && !speaking && "max-md:hidden",
            )}
          >
            {captionText}
          </p>
        )}
      </div>
    </div>
  );
}
