import { useEffect, useRef, type PointerEvent } from "react";

export interface StudioCanvasRulerBarsProps {
  visible: boolean;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  canvasWidth: number;
  canvasHeight: number;
  guides?: { horizontal: number[]; vertical: number[] };
  onAddGuide?: (axis: "h" | "v", position: number) => void;
  onRemoveGuide?: (axis: "h" | "v", index: number) => void;
  onToggleRulers?: () => void;
}

const RULER_THICKNESS = 22; // px

export function StudioCanvasRulerBars({
  visible,
  scale,
  scrollLeft,
  scrollTop,
  canvasWidth,
  canvasHeight,
  onAddGuide,
}: StudioCanvasRulerBarsProps) {
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);

  // 상단 눈금자 렌더링
  useEffect(() => {
    if (!visible || !topCanvasRef.current) return;
    const canvas = topCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = RULER_THICKNESS;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgba(18, 18, 26, 0.92)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "9px sans-serif";

    // 픽셀 간격 계산
    let step = 50;
    if (scale > 2) step = 10;
    else if (scale > 1) step = 20;
    else if (scale < 0.5) step = 100;
    else if (scale < 0.25) step = 200;

    const startX = Math.floor(scrollLeft / scale / step) * step;
    const endX = startX + width / scale + step * 2;

    ctx.beginPath();
    for (let px = startX; px <= endX; px += step / 5) {
      const screenX = (px * scale) - scrollLeft;
      if (screenX < 0 || screenX > width) continue;

      const isMajor = Math.abs(px % step) < 0.001;
      const markHeight = isMajor ? 12 : 5;
      ctx.moveTo(screenX, height);
      ctx.lineTo(screenX, height - markHeight);

      if (isMajor && screenX + 30 <= width) {
        ctx.fillText(`${Math.round(px)}`, screenX + 3, 11);
      }
    }
    ctx.stroke();
  }, [visible, scale, scrollLeft, canvasWidth]);

  // 좌측 눈금자 렌더링
  useEffect(() => {
    if (!visible || !leftCanvasRef.current) return;
    const canvas = leftCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = RULER_THICKNESS;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgba(18, 18, 26, 0.92)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "9px sans-serif";

    let step = 50;
    if (scale > 2) step = 10;
    else if (scale > 1) step = 20;
    else if (scale < 0.5) step = 100;
    else if (scale < 0.25) step = 200;

    const startY = Math.floor(scrollTop / scale / step) * step;
    const endY = startY + height / scale + step * 2;

    ctx.beginPath();
    for (let py = startY; py <= endY; py += step / 5) {
      const screenY = (py * scale) - scrollTop;
      if (screenY < 0 || screenY > height) continue;

      const isMajor = Math.abs(py % step) < 0.001;
      const markWidth = isMajor ? 12 : 5;
      ctx.moveTo(width, screenY);
      ctx.lineTo(width - markWidth, screenY);

      if (isMajor && screenY + 10 <= height) {
        ctx.save();
        ctx.translate(11, screenY + 12);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${Math.round(py)}`, 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();
  }, [visible, scale, scrollTop, canvasHeight]);

  if (!visible) return null;

  function handleTopPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const docX = (e.clientX - rect.left + scrollLeft) / scale;
    onAddGuide?.("v", docX);
  }

  function handleLeftPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const docY = (e.clientY - rect.top + scrollTop) / scale;
    onAddGuide?.("h", docY);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden">
      {/* 교차 코너 픽셀 사각형 */}
      <div className="pointer-events-auto absolute left-0 top-0 flex size-[22px] items-center justify-center border-b border-r border-white/20 bg-neutral-900/90 text-[9px] text-white/50">
        px
      </div>

      {/* 상단 가로 눈금자 */}
      <canvas
        ref={topCanvasRef}
        onPointerDown={handleTopPointerDown}
        className="pointer-events-auto absolute left-[22px] top-0 h-[22px] w-[calc(100%-22px)] cursor-ns-resize border-b border-white/10"
        title="드래그하여 세로 가이드선 생성 (Alt/Cmd+R: 눈금자 토글)"
      />

      {/* 좌측 세로 눈금자 */}
      <canvas
        ref={leftCanvasRef}
        onPointerDown={handleLeftPointerDown}
        className="pointer-events-auto absolute left-0 top-[22px] h-[calc(100%-22px)] w-[22px] cursor-ew-resize border-r border-white/10"
        title="드래그하여 가로 가이드선 생성 (Alt/Cmd+R: 눈금자 토글)"
      />
    </div>
  );
}
