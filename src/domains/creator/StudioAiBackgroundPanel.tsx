// AI 배경 생성 패널 — 텍스트 프롬프트로 배경 이미지를 생성해 캔버스에 삽입한다.
// 프레젠테이션 전용(무상태 값은 전부 prop) — prompt/size/busy/error/onGenerate 전부 부모
// (StudioPage.tsx)가 소유한다. 실제 generateBackgroundImage() 호출·AI 생성형 콘텐츠 최초 사용
// 고지 게이팅·캔버스 삽입(addEl/patchEl)은 전부 부모 책임이다(이 패널은 입력 UI + 로딩/에러
// 표시만) — docs/studio-ai-assist-integration.md §3 참고.
import { ImageIcon, Loader2, Sparkles } from "lucide-react";

import { STUDIO_AI_IMAGE_SIZES, type StudioAiImageSize } from "./studio-ai-client";

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
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <ImageIcon size={14} />
        AI 배경 생성
      </div>

      {!configured && (
        <p className="rounded-md border border-line bg-card/70 px-2 py-1.5 text-[0.63rem] leading-relaxed text-fg-3">
          위 <span className="font-semibold text-fg-2">AI 어시스트 설정</span>에서 API 키를 등록하면 이
          기능을 쓸 수 있어요.
        </p>
      )}

      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value.slice(0, 500))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) onGenerate();
        }}
        placeholder="예: 교실, 낮, 창문으로 햇빛이 들어오는 풍경"
        rows={2}
        disabled={!configured || busy}
        className="h-14 w-full resize-none rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent disabled:opacity-60"
      />

      <div className="flex items-center gap-1.5">
        <select
          value={size}
          onChange={(e) => onSizeChange(e.target.value as StudioAiImageSize)}
          disabled={!configured || busy}
          className="flex-1 rounded-md border border-line bg-panel px-1.5 py-1 text-[0.6rem] text-fg-2 outline-none focus:border-accent disabled:opacity-60"
        >
          {STUDIO_AI_IMAGE_SIZES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? "생성하는 중…" : "생성"}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        <p className="text-[0.63rem] leading-relaxed text-fg-3">
          선택한 칸(패널)이 있으면 그 칸에, 여러 칸이 있으면 전부에, 없으면 캔버스 배경으로 삽입돼요.
        </p>
      )}
    </div>
  );
}
