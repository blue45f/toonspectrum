import { Loader2, PencilLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// 사진에서 선 추출 패널 — 참조 사진·포즈 자료를 밑그림용 흑백 선화로
// 바꾼다. TEED(엣지 검출, MIT)를 기기에서 실행한다(100% 브라우저, 무료).
// 민감도는 로컬 상태로만 조정하고 버튼을 누를 때 한 번만 실행하는
// one-shot 패턴(StudioLineCleanupPanel과 동일). 모델·런타임은 실행
// 시점에 동적 import로 지연 로딩된다.
export function StudioOnnxLineExtractPanel({
  src,
  onResult,
}: {
  src: string;
  onResult: (dataUrl: string) => void;
}) {
  const [sensitivity, setSensitivity] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPreviewSrc(null);
    setError(null);
  }, [src]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const service = await import("./studio-onnx-line-extract");
      const result = await service.extractLineArtOnDevice(src, { sensitivity });
      if (!mountedRef.current) return;
      setPreviewSrc(result.dataUrl);
      onResult(result.dataUrl);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error ? cause.message : "선 추출에 실패했어요.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-onnx-line-extract-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <PencilLine size={14} className="text-accent" aria-hidden />
        사진에서 선 추출
      </div>

      {previewSrc && (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <img
            src={previewSrc}
            alt="추출된 선화 미리보기"
            className="max-h-32 w-full object-contain"
          />
        </div>
      )}

      <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
        선 민감도
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            disabled={busy}
            className="w-24 cursor-pointer accent-accent"
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-fg-3">
            {sensitivity.toFixed(2)}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? <Loader2 size={14} className="animate-spin" aria-hidden />
          : <PencilLine size={14} aria-hidden />}
        {busy ? "선을 추출하는 중…" : "선 추출"}
      </button>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          참조 사진의 윤곽만 남겨 밑그림으로 바꿔요 — TEED 모델을 기기에서
          실행합니다(100% 브라우저, 무료). 민감도를 올리면 옅은 선도
          잡아냅니다. 결과로 현재 이미지가 교체되며 실행 취소로 되돌릴 수
          있어요.
        </p>
      )}
    </div>
  );
}
