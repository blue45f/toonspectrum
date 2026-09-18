import { useCallback, useEffect, useRef } from "react";
import {
  Circle as KCircle,
  Ellipse,
  Group,
  Layer,
  Line as KLine,
  Rect,
} from "react-konva/lib/ReactKonvaCore";

import {
  planStudioBrushCursorVisual,
  type StudioBrushCursorMode,
} from "../canvas/studio-canvas-cursor";
import { planStudioBrushCursorSensorVisual } from "./studio-brush-cursor-sensor";

import type { StudioBrushCursorStyle } from "../studio-app-settings";
import type Konva from "konva";
import type { RefObject } from "react";

interface StudioBrushCursorProps {
  cursorRef: RefObject<Konva.Group | null>;
  guideRef?: RefObject<Konva.Line | null>;
  brushId: string;
  diameter: number;
  effectiveScale: number;
  mode: StudioBrushCursorMode;
  style: StudioBrushCursorStyle;
  tipAngleDeg: number;
  tipRoundness: number;
}

const CURSOR_DARK = "oklch(0.17 0.01 70 / 0.96)";
const CURSOR_LIGHT = "oklch(0.97 0.01 85 / 0.98)";
const CURSOR_SENSOR = "oklch(0.68 0.18 285 / 0.92)";

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

function isCanvasPointerTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('[data-studio-canvas-viewport="true"]'));
}

/**
 * Exact-size, non-interactive drawing cursor. The dark/light nested outline stays legible over
 * white paper, dark ink, tones, and photo backgrounds without covering the pixels being edited.
 * A secondary purple ghost visualizes live pen pressure/orientation without changing the exact
 * configured brush footprint ring or any document/render state.
 */
export function StudioBrushCursor({
  cursorRef,
  guideRef,
  brushId,
  diameter,
  effectiveScale,
  mode,
  style,
  tipAngleDeg,
  tipRoundness,
}: StudioBrushCursorProps) {
  const sensorRef = useRef<Konva.Group | null>(null);
  const sensorRafRef = useRef<number | null>(null);
  const pendingSensorEventRef = useRef<PointerEvent | null>(null);
  const visual = planStudioBrushCursorVisual({
    brushId,
    diameter,
    effectiveScale,
    mode,
    style,
    tipAngleDeg,
    tipRoundness,
  });

  // The cursor layer owns its own Konva canvas element. Tag it in the DOM so evidence tooling
  // (browser verifiers, recordings, exports) can exclude the transient cursor chrome from pixel
  // measurements — the ring and sensor ghost are UI, never document ink.
  const tagCursorCanvas = useCallback((layer: Konva.Layer | null) => {
    layer?.getCanvas()._canvas.setAttribute("data-studio-brush-cursor-canvas", "true");
  }, []);

  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor) return undefined;

    const hide = (): void => {
      pendingSensorEventRef.current = null;
      if (!sensor.visible()) return;
      sensor.visible(false);
      sensor.getLayer()?.batchDraw();
    };

    const render = (): void => {
      sensorRafRef.current = null;
      const event = pendingSensorEventRef.current;
      pendingSensorEventRef.current = null;
      if (!event || style === "none" || !isCanvasPointerTarget(event.target)) {
        hide();
        return;
      }
      const plan = planStudioBrushCursorSensorVisual(event);
      if (!plan.visible) {
        hide();
        return;
      }
      sensor.visible(true);
      // The sensor group sits inside the brush group, which already owns the configured brush-tip
      // angle. Convert the absolute hardware orientation to a relative rotation so the resulting
      // on-screen ghost follows the pen rather than double-applying the configured tip angle.
      sensor.rotation(plan.rotationDeg - visual.rotationDeg);
      sensor.scaleX(plan.scaleX);
      sensor.scaleY(plan.scaleY);
      sensor.opacity(plan.opacity);
      sensor.getLayer()?.batchDraw();
    };

    const schedule = (event: PointerEvent): void => {
      pendingSensorEventRef.current = event;
      if (sensorRafRef.current !== null) return;
      sensorRafRef.current = window.requestAnimationFrame(render);
    };
    const onPointerOut = (event: PointerEvent): void => {
      if (!isCanvasPointerTarget(event.target)) return;
      if (isCanvasPointerTarget(event.relatedTarget)) return;
      hide();
    };
    const onCancel = (): void => hide();

    window.addEventListener("pointerdown", schedule, { capture: true, passive: true });
    window.addEventListener("pointermove", schedule, { capture: true, passive: true });
    window.addEventListener("pointerrawupdate", schedule as EventListener, { capture: true, passive: true });
    window.addEventListener("pointerup", schedule, { capture: true, passive: true });
    window.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
    window.addEventListener("pointercancel", onCancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", schedule, true);
      window.removeEventListener("pointermove", schedule, true);
      window.removeEventListener("pointerrawupdate", schedule as EventListener, true);
      window.removeEventListener("pointerup", schedule, true);
      window.removeEventListener("pointerout", onPointerOut, true);
      window.removeEventListener("pointercancel", onCancel, true);
      if (sensorRafRef.current !== null) {
        window.cancelAnimationFrame(sensorRafRef.current);
        sensorRafRef.current = null;
      }
      hide();
    };
  }, [style, visual.rotationDeg]);

  return (
    <Layer ref={tagCursorCanvas} listening={false} name="studio-brush-cursor-layer">
      {guideRef ? (
        <KLine
          ref={guideRef}
          visible={false}
          points={[0, 0, 0, 0]}
          stroke="oklch(0.63 0.19 285 / 0.86)"
          strokeWidth={1}
          dash={[4, 3]}
          lineCap="round"
          listening={false}
          perfectDrawEnabled={false}
          shadowColor="oklch(0.98 0.01 85 / 0.9)"
          shadowBlur={1}
          shadowOpacity={0.8}
          name="studio-stroke-guide"
        />
      ) : null}
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
        {style !== "none" ? (
          <Group
            ref={sensorRef}
            visible={false}
            listening={false}
            name="studio-brush-cursor-sensor-ghost"
          >
            <Ellipse
              radiusX={visual.radiusX}
              radiusY={visual.radiusY}
              fillEnabled={false}
              stroke={CURSOR_SENSOR}
              strokeWidth={1.25 / effectiveScale}
              strokeScaleEnabled={false}
              dash={[3 / effectiveScale, 2 / effectiveScale]}
              listening={false}
              perfectDrawEnabled={false}
            />
            <KLine
              points={[-visual.radiusX * 0.7, 0, visual.radiusX * 0.7, 0]}
              stroke={CURSOR_SENSOR}
              strokeWidth={0.8 / effectiveScale}
              strokeScaleEnabled={false}
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
        ) : null}
      </Group>
    </Layer>
  );
}
