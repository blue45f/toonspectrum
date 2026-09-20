import { useState } from "react";
import { downloadBlob } from "../export/studio-export";
import { decodeStudioBrushOriginalSource, type StudioBrushOriginalSource } from "./studio-brush-original-source";

/** Original bytes, not a re-encoded approximation of today's drawable settings. */
export function StudioBrushOriginalSourceActions({ source, name, onError }: {
  readonly source: StudioBrushOriginalSource;
  readonly name: string;
  readonly onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function exportOriginal() {
    if (busy) return;
    setBusy(true);
    try {
      const { hydrateStudioBrushOriginal } = await import("./studio-brush-original-source-store");
      const original = await hydrateStudioBrushOriginal(source);
      downloadBlob(new Blob([decodeStudioBrushOriginalSource(original)], {
        type: "application/octet-stream",
      }), original.fileName);
    } catch (error) {
      onError(error instanceof Error ? error.message : "원본 파일을 내보내지 못했습니다.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-1 border-t border-line/50 px-2 pt-2">
    <p className="text-xs text-fg-3">가져온 원본 보존 · {source.format.toUpperCase()} · {source.byteLength.toLocaleString()} bytes</p>
    <p className="text-xs text-fg-3">원본 파일에는 이후 Studio 편집이 반영되지 않습니다. 내보내기·공유 JSON에는 현재 설정과 원본을 함께 보관합니다. 원본 보존은 원본 엔진의 동일한 그리기 결과를 보장하지 않습니다.</p>
    <button type="button" disabled={busy} onClick={() => void exportOriginal()}
      aria-label={`${name} 원본 파일 내보내기`}
      className="min-h-11 rounded-lg border border-line px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      {busy ? "원본 확인 중…" : "원본 파일 내보내기"}
    </button>
  </div>;
}
