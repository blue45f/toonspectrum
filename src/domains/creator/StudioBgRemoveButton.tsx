import { Loader2, Scissors } from "lucide-react";
import { useState } from "react";

import { removeBackground } from "./studio-bg-remove";

// AI 배경 제거 버튼 — 선택된 이미지의 배경을 브라우저에서 제거(투명화)한다. 서버·토큰 비용 0원.
// 결과(PNG data URL)는 onResult 로 넘겨 호출부가 이미지 src 를 교체한다(undo/redo 통합).
export function StudioBgRemoveButton({
  src,
  onResult,
}: {
  src: string;
  onResult: (dataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeBackground(src);
      onResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "배경 제거에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel/50 p-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
        {busy ? "배경 제거 중…" : "AI 배경 제거"}
      </button>
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          {busy
            ? "최초 1회 모델을 내려받아요(잠시만요). 100% 브라우저에서 처리 — 무료·비공개."
            : "인물·캐릭터 사진 배경을 투명하게. 100% 브라우저 실행(서버 전송 없음·무료)."}
        </p>
      )}
    </div>
  );
}
