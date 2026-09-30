import { Volume2, X } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { hasSeenVoiceGuidePrompt, markVoiceGuidePromptSeen } from "./voice-guide";
import { usePageVoiceGuide } from "./usePageVoiceGuide";
import type { VoiceGuideScriptId } from "./voice-guide-texts";

export interface VoiceGuidePromptProps {
  readonly scriptId: VoiceGuideScriptId;
}

/**
 * 첫 방문자에게 음성 안내를 제안하는 카드.
 *
 * - 브라우저당 한 번만 표시 (localStorage 기록).
 * - "듣기"를 누르면 바로 안내를 재생하고, 닫으면 다시 표시하지 않는다.
 * - 우하단 고정 — fixed 안내 버튼과 겹치지 않는 위치.
 */
export function VoiceGuidePrompt({ scriptId }: VoiceGuidePromptProps) {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [dismissed, setDismissed] = useState(() => hasSeenVoiceGuidePrompt());
  const { supported, speak } = usePageVoiceGuide(scriptId);

  if (!supported || dismissed) return null;

  const dismiss = () => {
    markVoiceGuidePromptSeen();
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label={ko ? "음성 안내 제안" : "Voice guide suggestion"}
      className="fixed bottom-6 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel/95 p-4 shadow-2xl backdrop-blur-xl sm:right-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
          <Volume2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg">{ko ? "음성으로 안내 듣기" : "Listen to the voice guide"}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {ko
              ? "이 페이지의 핵심 내용을 음성으로 편하게 들어보세요."
              : "Listen to a short voice overview of this page."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismiss();
                speak();
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-transform hover:-translate-y-0.5"
            >
              <Volume2 className="size-4" aria-hidden="true" />
              {ko ? "안내 듣기" : "Listen"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium text-fg-3 transition-colors hover:text-fg"
            >
              {ko ? "닫기" : "Dismiss"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={ko ? "제안 닫기" : "Dismiss suggestion"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
