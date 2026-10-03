import { Loader2, Scaling, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// AI 업스케일 패널 — Real-ESRGAN anime(일러스트 전용, BSD-3)를 기기에서
// 돌려 선택 이미지를 4배로 확대한다. 100% 브라우저 실행, 무료.
// 모델·런타임은 실행 버튼을 눌렀을 때만 동적 import로 지연 로딩되고,
// 큰 이미지는 256px 겹침 타일로 나눠 진행률을 보여준다.
export function StudioOnnxUpscalePanel({
  src,
  onResult,
}: {
  src: string;
  onResult: (dataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<{ width: number; height: number } | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setPreviewSrc(null);
    setResultSize(null);
    setError(null);
    setProgress(null);
  }, [src]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const service = await import("./studio-onnx-upscale");
      const result = await service.upscaleImageOnDevice(src, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (mountedRef.current) setProgress({ done, total });
        },
      });
      if (!mountedRef.current) return;
      setPreviewSrc(result.dataUrl);
      setResultSize({ width: result.width, height: result.height });
      onResult(result.dataUrl);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error && cause.name === "AbortError"
          ? "업스케일을 취소했어요."
          : cause instanceof Error
            ? cause.message
            : "업스케일에 실패했어요.",
      );
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setProgress(null);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-onnx-upscale-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <Scaling size={14} className="text-accent" aria-hidden />
        AI 업스케일 (기기)
      </div>

      {previewSrc && (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <img
            src={previewSrc}
            alt="업스케일 결과 미리보기"
            className="max-h-32 w-full object-contain"
          />
        </div>
      )}
      {resultSize && (
        <p className="text-[0.66rem] text-fg-3">
          {resultSize.width.toLocaleString("ko-KR")}×
          {resultSize.height.toLocaleString("ko-KR")}px로 확대했어요.
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Scaling size={14} aria-hidden />}
          {busy
            ? progress
              ? `확대하는 중… (${progress.done}/${progress.total} 타일)`
              : "확대하는 중…"
            : "4배로 확대"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2 transition-colors hover:text-fg"
          >
            <X size={14} aria-hidden />
            취소
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          일러스트 전용 확대 모델(Real-ESRGAN anime)로 선과 색면을 살리며
          키웁니다 — 100% 브라우저 실행(무료). 큰 이미지는 타일로 나눠
          처리하는데, 기기에 따라 타일 하나에 수 초에서 2분까지 걸릴 수
          있어요(WebGPU 지원 기기에서 훨씬 빠릅니다). 처음 한 번은
          모델(약 18MB)을 내려받아요. 한 변 2048px·약 420만 화소까지
          지원합니다.
        </p>
      )}
    </div>
  );
}
