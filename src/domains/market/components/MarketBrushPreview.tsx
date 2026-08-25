import { Paintbrush, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BrushPreviewData } from "../models/market-preview";

import { buttonClass } from "@/components/ui/button-utils";

interface MarketBrushPreviewProps {
  readonly brush: BrushPreviewData;
  className?: string;
}

export function MarketBrushPreview({ brush, className }: MarketBrushPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(() => Math.max(2, Math.min(64, brush.size ?? 12)));
  const [brushColor, setBrushColor] = useState(() => brush.color ?? "#2563eb");
  const [strokeCount, setStrokeCount] = useState(0);

  const drawSampleStroke = useCallback(
    (context: CanvasRenderingContext2D, width: number, height: number) => {
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = brushColor;
      context.globalAlpha = brush.opacity ?? 0.85;

      const points = [
        { x: width * 0.1, y: height * 0.55, width: brushSize * 0.4 },
        { x: width * 0.25, y: height * 0.3, width: brushSize * 0.8 },
        { x: width * 0.45, y: height * 0.7, width: brushSize * 1.3 },
        { x: width * 0.65, y: height * 0.25, width: brushSize * 1.1 },
        { x: width * 0.85, y: height * 0.6, width: brushSize * 0.6 },
        { x: width * 0.92, y: height * 0.45, width: brushSize * 0.2 },
      ];

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const steps = 15;
        for (let t = 0; t <= steps; t++) {
          const ratio = t / steps;
          const x = p0.x + (p1.x - p0.x) * ratio;
          const y = p0.y + (p1.y - p0.y) * ratio + Math.sin(ratio * Math.PI) * (i % 2 === 0 ? -4 : 4);
          const currentWidth = p0.width + (p1.width - p0.width) * ratio;

          context.beginPath();
          context.arc(x, y, Math.max(1, currentWidth / 2), 0, Math.PI * 2);
          context.fillStyle = brushColor;
          context.fill();
        }
      }
      context.restore();
    },
    [brush.opacity, brushColor, brushSize]
  );

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    // Draw smooth subtle grid pattern
    context.save();
    context.strokeStyle = "rgba(128, 128, 128, 0.08)";
    context.lineWidth = 1;
    const step = 20;
    for (let x = 0; x < width; x += step) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += step) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();

    drawSampleStroke(context, width, height);
    setStrokeCount(0);
  }, [drawSampleStroke]);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = brushColor;
    context.fillStyle = brushColor;
    context.globalAlpha = brush.opacity ?? 0.9;
    context.beginPath();
    context.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = brushSize;
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Safe ignore
      }
      const context = canvas.getContext("2d");
      context?.restore();
      setStrokeCount((count) => count + 1);
    }
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 bg-panel/50">
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-accent" aria-hidden="true" />
          <span id="market-brush-heading" className="text-xs font-semibold text-fg">{brush.name}</span>
          {brush.family ? (
            <span className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] text-fg-3">
              {brush.family}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[0.68rem] text-fg-3">
            크기
            <input
              type="range"
              min={2}
              max={64}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="h-1.5 w-16 accent-accent cursor-pointer"
            />
            <span className="numeral tnum w-6 text-right text-fg-2">{brushSize}px</span>
          </label>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            aria-label="브러시 색상"
            className="h-6 w-6 cursor-pointer rounded border border-line bg-transparent p-0"
          />
          <button
            type="button"
            onClick={resetCanvas}
            className={buttonClass({ variant: "ghost", size: "sm", className: "h-7 px-2 text-[0.68rem]" })}
            title="캔버스 초기화"
          >
            <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
            초기화
          </button>
        </div>
      </div>

      <div className="relative aspect-[16/7] w-full bg-[oklch(0.96_0.005_75)] dark:bg-[oklch(0.18_0.015_260)]">
        <canvas
          ref={canvasRef}
          width={640}
          height={280}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="size-full touch-none cursor-crosshair object-contain"
        />
        {strokeCount === 0 ? (
          <span className="pointer-events-none absolute bottom-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-canvas/75 px-2.5 py-1 text-[0.65rem] text-fg-3 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
            마우스나 터치로 직접 그려보세요
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-[0.68rem] text-fg-3 bg-panel/30">
        <span>불투명도: <strong className="font-semibold text-fg-2">{Math.round((brush.opacity ?? 1) * 100)}%</strong></span>
        {brush.flow !== undefined ? <span>유량: <strong className="font-semibold text-fg-2">{Math.round(brush.flow * 100)}%</strong></span> : null}
        {brush.spacing !== undefined ? <span>간격: <strong className="font-semibold text-fg-2">{brush.spacing}</strong></span> : null}
        {brush.hardness !== undefined ? <span>경도: <strong className="font-semibold text-fg-2">{Math.round(brush.hardness * 100)}%</strong></span> : null}
        {brush.blendMode ? <span>혼합: <strong className="font-semibold text-fg-2">{brush.blendMode}</strong></span> : null}
      </div>
    </div>
  );
}
