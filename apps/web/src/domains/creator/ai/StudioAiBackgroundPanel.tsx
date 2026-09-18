import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// AI 배경 생성 패널 — 텍스트 프롬프트로 배경 이미지를 생성해 캔버스에 삽입한다.
// Presentation only; generate + notice gate owned by StudioPage.
import { ImageIcon, Loader2, Sparkles } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { STUDIO_AI_IMAGE_SIZES, type StudioAiImageSize } from "./studio-ai-client";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { cn } from "@/shared/lib/utils";

const BACKGROUND_PROMPT_MAX = 4_000;

export function StudioAiBackgroundPanel({
  configured,
  prompt,
  onPromptChange,
  size,
  onSizeChange,
  busy,
  error,
  onGenerate,
}: {
  configured: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  size: StudioAiImageSize;
  onSizeChange: (value: StudioAiImageSize) => void;
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const canGenerate = configured && !busy && prompt.trim().length > 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-ai-bg-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <ImageIcon size={14} className="text-accent" aria-hidden />
        {translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "AI 배경 생성")}</div>

      {!configured ? (
        <AiRecoveryNotice
          code="not_configured"
          message={translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "프롬프트와 크기는 먼저 준비할 수 있어요. 이미지 생성은 통합 AI 설정에서 개인 이미지 API 키와 모델을 연결한 뒤 실행됩니다.")}
          compact
        />
      ) : null}

      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2 text-[0.62rem] font-semibold text-fg-2">
          <span>{translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "무엇을 그릴까요?")}</span>
          <span className="font-mono font-normal tabular-nums text-fg-3">
            {prompt.length}/{BACKGROUND_PROMPT_MAX}
          </span>
        </div>
        <textarea
          aria-label={translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "무엇을 그릴까요?")}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value.slice(0, BACKGROUND_PROMPT_MAX))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) onGenerate();
          }}
          placeholder={translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "예: 교실, 낮, 창문으로 햇빛이 들어오는 풍경")}
          rows={3}
          disabled={busy}
          className="min-h-[4.5rem] w-full resize-none rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.68rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
        />
      </div>

      <div>
        <p className="mb-1 text-[0.62rem] font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "크기")}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "생성 이미지 크기")}>
          {STUDIO_AI_IMAGE_SIZES.map((opt) => {
            const active = size === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                aria-pressed={active}
                title={opt.label}
                onClick={() => onSizeChange(opt.value)}
                className={cn(
                  "min-h-11 rounded-full border px-2.5 text-[0.62rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised",
                  busy && "opacity-55"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          "hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
        )}
      >
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
        {busy ? translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "그리는 중…") : translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "배경 생성")}
      </button>

      {error ? (
        <AiRecoveryNotice
          message={error}
          onRetry={canGenerate ? onGenerate : undefined}
          compact
        />
      ) : (
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          {translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "선택한 칸이 있으면 그 칸에, 여러 칸이면 전부에, 없으면 캔버스 배경으로 들어가요.")}<span className="mt-0.5 block text-fg-3/90">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiBackgroundPanel", "ko", "단축키: ⌘/Ctrl + Enter")}</span>
        </p>
      )}
    </div>
  );
}
