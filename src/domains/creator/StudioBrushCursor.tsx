import {
  Circle as KCircle,
  Ellipse,
  Group,
  Layer,
  Rect,
} from "react-konva/lib/ReactKonvaCore";

import {
  planStudioBrushCursorVisual,
  type StudioBrushCursorMode,
} from "./studio-canvas-cursor";

import type { StudioBrushCursorStyle } from "./studio-app-settings";
import type Konva from "konva";
import type { RefObject } from "react";

interface StudioBrushCursorProps {
  cursorRef: RefObject<Konva.Group | null>;
  brushId: string;
  diameter: number;
  effectiveScale: number;
  mode: StudioBrushCursorMode;
  style: Exclude<StudioBrushCursorStyle, "none">;
  tipAngleDeg: number;
  tipRoundness: number;
}

const CURSOR_DARK = "oklch(0.17 0.01 70 / 0.96)";
const CURSOR_LIGHT = "oklch(0.97 0.01 85 / 0.98)";

interface StudioBrushCursorOutlineProps {
  dash?: readonly number[];
  radiusX: number;
  radiusY: number;
  shape: "round" | "ellipse" | "square";
  stroke: string;
  strokeWidth: number;
}

function StudioBrushCursorOutline({
  dash,
  radiusX,
  radiusY,
  shape,
  stroke,
  strokeWidth,
}: StudioBrushCursorOutlineProps) {
  const shared = {
    dash: dash ? [...dash] : undefined,
    fillEnabled: false,
    listening: false,
    perfectDrawEnabled: false,
    stroke,
    strokeWidth,
  } as const;
  if (shape === "square") {
    return (
      <Rect
        {...shared}
        x={-radiusX}
        y={-radiusY}
        width={radiusX * 2}
        height={radiusY * 2}
      />
    );
  }
  return <Ellipse {...shared} radiusX={radiusX} radiusY={radiusY} />;
}

/**
 * Exact-size, non-interactive drawing cursor. The dark/light nested outline stays legible over
 * white paper, dark ink, tones, and photo backgrounds without covering the pixels being edited.
 */
export function StudioBrushCursor({
  cursorRef,
  brushId,
  diameter,
  effectiveScale,
  mode,
  style,
  tipAngleDeg,
  tipRoundness,
}: StudioBrushCursorProps) {
  const visual = planStudioBrushCursorVisual({
    brushId,
    diameter,
    effectiveScale,
    mode,
    style,
    tipAngleDeg,
    tipRoundness,
  });

  return (
    <Layer listening={false} name="studio-brush-cursor-layer">
      <Group
        ref={cursorRef}
        visible={false}
        listening={false}
        name={`studio-brush-cursor studio-brush-cursor-${mode}`}
        rotation={visual.rotationDeg}
      >
        {visual.showOutline ? (
          <>
            <StudioBrushCursorOutline
              radiusX={visual.radiusX}
              radiusY={visual.radiusY}
              shape={visual.shape}
              stroke={CURSOR_DARK}
              strokeWidth={visual.outerStrokeWidth}
            />
            <StudioBrushCursorOutline
              radiusX={visual.radiusX}
              radiusY={visual.radiusY}
              shape={visual.shape}
              stroke={CURSOR_LIGHT}
              strokeWidth={visual.innerStrokeWidth}
              dash={visual.dash}
            />
            {visual.innerBoundaryScale !== null ? (
              <>
                <StudioBrushCursorOutline
                  radiusX={visual.radiusX * visual.innerBoundaryScale}
                  radiusY={visual.radiusY * visual.innerBoundaryScale}
                  shape={visual.shape}
                  stroke={CURSOR_DARK}
                  strokeWidth={visual.innerStrokeWidth * 1.75}
                  dash={visual.dash}
                />
                <StudioBrushCursorOutline
                  radiusX={visual.radiusX * visual.innerBoundaryScale}
                  radiusY={visual.radiusY * visual.innerBoundaryScale}
                  shape={visual.shape}
                  stroke={CURSOR_LIGHT}
                  strokeWidth={visual.centerStrokeWidth}
                  dash={visual.dash}
                />
              </>
            ) : null}
          </>
        ) : null}
        {visual.centerRadius !== null ? (
          <KCircle
            radius={visual.centerRadius}
            fill={CURSOR_DARK}
            stroke={CURSOR_LIGHT}
            strokeWidth={visual.centerStrokeWidth}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : null}
      </Group>
    </Layer>
  );
}
