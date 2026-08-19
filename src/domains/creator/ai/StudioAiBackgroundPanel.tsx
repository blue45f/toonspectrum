// AI 배경 생성 패널 — 텍스트 프롬프트로 배경 이미지를 생성해 캔버스에 삽입한다.
// Presentation only; generate + notice gate owned by StudioPage.
import { ImageIcon, Loader2, Sparkles } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { STUDIO_AI_IMAGE_SIZES, type StudioAiImageSize } from "./studio-ai-client";

import { cn } from "@/lib/utils";

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
        AI 배경 생성
      </div>

      {!configured && (
        <p className="rounded-lg border border-line bg-card/70 px-2 py-1.5 text-[0.63rem] leading-relaxed text-fg-3">
          이미지 생성용 API 키를 등록하면 바로 쓸 수 있어요. 위{" "}
          <span className="font-semibold text-fg-2">AI 어시스트 설정</span>을 열어 주세요.
        </p>
      )}

      <label className="grid gap-1">
        <span className="text-[0.62rem] font-semibold text-fg-2">무엇을 그릴까요?</span>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) onGenerate();
          }}
          placeholder="예: 교실, 낮, 창문으로 햇빛이 들어오는 풍경"
          rows={3}
          disabled={!configured || busy}
          className="min-h-[4.5rem] w-full resize-none rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.68rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
        />
      </label>

      <div>
        <p className="mb-1 text-[0.62rem] font-semibold text-fg-2">크기</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="생성 이미지 크기">
          {STUDIO_AI_IMAGE_SIZES.map((opt) => {
            const active = size === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!configured || busy}
                aria-pressed={active}
                title={opt.label}
                onClick={() => onSizeChange(opt.value)}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 text-[0.62rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised",
                  (!configured || busy) && "opacity-55"
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
        {busy ? "그리는 중…" : "배경 생성"}
      </button>

      {error ? (
        <p className="rounded-lg border border-bad/35 bg-bad/10 px-2 py-1.5 text-xs text-bad">{error}</p>
      ) : (
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          선택한 칸이 있으면 그 칸에, 여러 칸이면 전부에, 없으면 캔버스 배경으로 들어가요.
          <span className="mt-0.5 block text-fg-3/90">단축키: ⌘/Ctrl + Enter</span>
        </p>
      )}
    </div>
  );
}
