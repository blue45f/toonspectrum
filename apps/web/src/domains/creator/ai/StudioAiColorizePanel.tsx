import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// AI 자동 채색 패널 — 선택 선화 이미지를 텍스트 지시로 채색.
// Presentation only; colorize + notice gate owned by parent.
import { Loader2, Wand2 } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { STUDIO_AI_COLORIZE_PRESETS } from "./studio-ai-assist-ux";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { cn } from "@/shared/lib/utils";

export function StudioAiColorizePanel({
  configured,
  prompt,
  onPromptChange,
  busy,
  error,
  onColorize,
}: {
  configured: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onColorize: () => void;
}) {
  const canRun = configured && !busy && prompt.trim().length > 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-ai-colorize-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Wand2 size={14} className="text-accent" aria-hidden />
        {translateCurrentStaticSourceText("domains.creator.ai.StudioAiColorizePanel", "ko", "AI 자동 채색")}</div>

      {!configured ? (
        <AiRecoveryNotice
          code="not_configured"
          message={translateCurrentStaticSourceText("domains.creator.ai.StudioAiColorizePanel", "ko", "채색 지시를 먼저 준비할 수 있어요. 실행하려면 통합 AI 설정에서 개인 이미지 API 키와 편집 모델을 연결하세요.")}
          compact
        />
      ) : null}

      <div className="flex flex-wrap gap-1">
        {STUDIO_AI_COLORIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.prompt}
            disabled={!configured || busy}
            onClick={() => onPromptChange(preset.prompt)}
            className={cn(
              "rounded-full border border-line bg-card px-2 py-0.5 text-[0.6rem] font-semibold text-fg-3",
              STUDIO_FOCUS_RING,
              "hover:border-accent/40 hover:text-fg disabled:opacity-50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value.slice(0, 300))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canRun) onColorize();
        }}
        placeholder={translateCurrentStaticSourceText("domains.creator.ai.StudioAiColorizePanel", "ko", "예: 파스텔톤 웹툰 셀 채색, 부드러운 그림자")}
        disabled={!configured || busy}
        className="w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.68rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent disabled:opacity-60"
      />

      <button
        type="button"
        onClick={onColorize}
        disabled={!canRun}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent",
          STUDIO_EASE,
          "hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
        {busy ? translateCurrentStaticSourceText("domains.creator.ai.StudioAiColorizePanel", "ko", "채색하는 중…") : translateCurrentStaticSourceText("domains.creator.ai.StudioAiColorizePanel", "ko", "선택 이미지 채색")}
      </button>

      {error ? (
        <AiRecoveryNotice
          message={error}
          onRetry={canRun ? onColorize : undefined}
          compact
        />
      ) : null}
    </div>
  );
}
