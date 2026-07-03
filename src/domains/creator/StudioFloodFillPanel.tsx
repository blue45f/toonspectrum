import { Loader2, PaintBucket } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { floodFillImage } from "./studio-flood-fill";

const PREVIEW_MAX_WIDTH = 220;
const DEFAULT_FILL_COLOR = "#ff6b6b";

// 페인트 통 채색 패널 — 글로벌 캔버스 툴 모드와는 독립적인 자체 미리보기 캔버스를 그려
// 그 위에서만 클릭을 받는다(스튜디오 공용 포인터/툴 시스템을 건드리지 않기 위한 의도적 격리).
// 결과(PNG data URL)는 onResult 로 넘겨 호출부가 이미지 src 를 교체한다(undo/redo 통합).
export function StudioFloodFillPanel({
  src,
  onResult,
}: {
  src: string;
  onResult: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState(src);
  const [fillColor, setFillColor] = useState(DEFAULT_FILL_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 클릭 핸들러의 비동기 연산(await floodFillImage)이 끝나기 전에 다른 레이어로 전환되면
  // 언마운트된 패널의 stale 결과가 onResult 로 새 요소를 덮어쓸 수 있어 마운트 여부를 추적한다.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 바깥에서 다른 요소가 선택돼 src prop 이 바뀌면 미리보기도 새 원본으로 초기화.
  useEffect(() => {
    setPreviewSrc(src);
    setError(null);
  }, [src]);

  // previewSrc 가 바뀔 때마다(최초 로드 + 채색 성공 후) 축소 캔버스를 다시 그린다.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      if (!naturalW || !naturalH) return;
      const scale = Math.min(1, PREVIEW_MAX_WIDTH / naturalW);
      canvas.width = Math.max(1, Math.round(naturalW * scale));
      canvas.height = Math.max(1, Math.round(naturalH * scale));
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = previewSrc;
    return () => {
      cancelled = true;
    };
  }, [previewSrc]);

  const handleClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (busy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // offsetX/Y 는 CSS 스케일(캔버스가 실제 픽셀 크기와 다르게 렌더링될 때) 오차가 나므로
    // getBoundingClientRect 로 실측 렌더 크기 대비 비율을 직접 계산한다.
    const rect = canvas.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    setBusy(true);
    setError(null);
    try {
      const result = await floodFillImage(previewSrc, xRatio, yRatio, fillColor);
      if (!mountedRef.current) return; // 언마운트 후 도착한 결과는 버린다(다른 레이어를 덮어쓰지 않게).
      setPreviewSrc(result); // 결과를 다시 미리보기에 그려 연속으로 다른 영역을 칠할 수 있게.
      onResult(result);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "채색에 실패했어요.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <PaintBucket size={14} />
        페인트 통 채색
      </div>
      <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-card">
        <canvas
          ref={canvasRef}
          onClick={(e) => void handleClick(e)}
          className="max-w-full cursor-crosshair"
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel/70">
            <Loader2 size={18} className="animate-spin text-accent" />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-2">
        채우기 색상
        <input
          type="color"
          value={fillColor}
          onChange={(e) => setFillColor(e.target.value)}
          disabled={busy}
          className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent p-0.5 disabled:opacity-60"
        />
      </label>
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          이미지를 클릭해 같은 색 영역을 한 번에 채워요 — 100% 브라우저 실행(무료). 웹툰 컷 채색에
          유용해요.
        </p>
      )}
    </div>
  );
}
