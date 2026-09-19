import { useEffect } from "react";

export function StudioOnDemandModuleStatus({ failed, onRetry, onCancel }: {
  failed: boolean; onRetry(): void; onCancel(): void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel]);
  return <aside className="fixed bottom-4 right-4 z-[190] rounded-xl border border-line bg-panel p-4 text-sm text-fg shadow-xl" aria-label="보조 창 불러오기">
    <p role={failed ? "alert" : "status"}>{failed ? "창을 불러오지 못했습니다. 캔버스는 유지됩니다." : "요청한 창을 불러오는 중…"}</p>
    {failed && <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={onRetry}>다시 시도</button>}
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={onCancel}>열기 취소</button>
  </aside>;
}
