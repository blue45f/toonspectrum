// AI 자동 채색 패널 — 선택된 이미지(선화 등)를 텍스트 지시와 함께 채색 요청한다.
// StudioBgRemoveButton/StudioLineCleanupPanel과 동일한 "선택 이미지 → one-shot 변환 → src 교체"
// 관례를 따르되, 실제 colorizeLineArt() 호출·AI 고지 게이팅은 부모(StudioPage.tsx)가 수행한다
// (busy/error/prompt를 부모가 소유 — StudioAiBackgroundPanel과 동일 이유, §3 참고). "selected.type
// === 'image'" 섹션에 마운트되므로 항상 선택된 이미지가 있다는 전제로 렌더된다.
import { Loader2, Wand2 } from "lucide-react";

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
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel/50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <Wand2 size={14} />
        AI 자동 채색
      </div>

      {!configured && (
        <p className="text-[0.63rem] leading-relaxed text-fg-3">
          AI 어시스트 설정(툴바 &quot;AI 어시스트&quot;)에서 API 키를 등록하면 이 기능을 쓸 수 있어요.
        </p>
      )}

      <input
        type="text"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value.slice(0, 300))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canRun) onColorize();
        }}
        placeholder="예: 파스텔톤 웹툰 셀 채색, 부드러운 그림자"
        disabled={!configured || busy}
        className="w-full rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent disabled:opacity-60"
      />

      <button
        type="button"
        onClick={onColorize}
        disabled={!canRun}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        {busy ? "채색하는 중…" : "AI 채색"}
      </button>

      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
