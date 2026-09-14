import { useEffect, useRef } from "react";

import { renderBrushStudioV6MaterialMarks } from "../brush-lab/brush-studio-v6-material-engine";

import type { StudioSavedBrush } from "./studio-brush-library";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

/** A bounded sample of the saved material itself, shared by the library and quick shelf. */
export function StudioMaterialBrushThumbnail({ brush, className }: {
  brush: StudioSavedBrush;
  className: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 168, 56);
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, 84, 56);
    context.fillStyle = "#242936";
    context.fillRect(84, 0, 84, 56);
    const points: number[] = [];
    const pressures: number[] = [];
    for (let index = 0; index < 32; index += 1) {
      const progress = index / 31;
      points.push(14 + progress * 140, 28 - Math.sin(progress * Math.PI * 2) * 9);
      pressures.push(0.25 + Math.sin(progress * Math.PI) * 0.65);
    }
    const marks = planStudioMaterialBrush({
      points,
      pressures,
      stroke: brush.color,
      strokeWidth: Math.min(15, Math.max(5, brush.strokeWidth)),
      opacity: brush.brushOpacity,
      brushEnginePrograms: brush.enginePrograms ?? undefined,
    });
    renderBrushStudioV6MaterialMarks(context, marks);
  }, [brush]);
  return <canvas ref={canvasRef} width={168} height={56} aria-hidden="true"
    data-studio-saved-brush-preview="material" className={className} />;
}
