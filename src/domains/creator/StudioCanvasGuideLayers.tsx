import { Suspense, type Dispatch, type SetStateAction } from "react";
import {
  Circle as KCircle,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Text as KText,
} from "react-konva/lib/ReactKonvaCore";

import { mirrorAxisAngle, wedgeBoundaryAngle } from "./studio-kaleidoscope";
import {
  StudioIsometricGridOverlay,
  StudioPerspectiveOverlay,
} from "./studio-page-lazy-ui";

import type { IsometricGridConfig } from "./studio-isometric-grid";
import type { VanishingPoint } from "./studio-perspective-guide";
import type { SmartGuideOverlay } from "./studio-smart-guides";

type StudioWebtoonGuideRuntime = Pick<
  typeof import("./studio-webtoon-guides"),
  "safeAreaMargin" | "webtoonWidthGuides"
>;

export interface StudioCanvasGuideUnderlayProps {
  canvasWidth: number;
  canvasHeight: number;
  effScale: number;
  gridSize: number;
  showGrid: boolean;
  showWebtoonGuides: boolean;
  webtoonGuides: StudioWebtoonGuideRuntime | null;
}

/** Non-interactive guides that must stay below every authored canvas element. */
export function StudioCanvasGuideUnderlay({
  canvasWidth,
  canvasHeight,
  effScale,
  gridSize,
  showGrid,
  showWebtoonGuides,
  webtoonGuides,
}: StudioCanvasGuideUnderlayProps) {
  const safeArea = showWebtoonGuides && webtoonGuides
    ? webtoonGuides.safeAreaMargin(canvasWidth)
    : null;

  return (
    <>
      {showGrid && (
        <Group listening={false}>
          {Array.from({ length: Math.ceil(canvasWidth / gridSize) }).map((_, index) => (
            <Line
              key={`grid-v-${index}`}
              points={[index * gridSize, 0, index * gridSize, canvasHeight]}
              stroke="rgba(124, 92, 252, 0.12)"
              strokeWidth={1 / effScale}
            />
          ))}
          {Array.from({ length: Math.ceil(canvasHeight / gridSize) }).map((_, index) => (
            <Line
              key={`grid-h-${index}`}
              points={[0, index * gridSize, canvasWidth, index * gridSize]}
              stroke="rgba(124, 92, 252, 0.12)"
              strokeWidth={1 / effScale}
            />
          ))}
        </Group>
      )}
      {safeArea && webtoonGuides ? (
        <Group listening={false}>
          {/* Mobile viewers can crop or cover these outside margins. */}
          <Rect
            x={0}
            y={0}
            width={safeArea.left}
            height={canvasHeight}
            fill="rgba(255, 90, 90, 0.06)"
          />
          <Rect
            x={canvasWidth - safeArea.right}
            y={0}
            width={safeArea.right}
            height={canvasHeight}
            fill="rgba(255, 90, 90, 0.06)"
          />
          {webtoonGuides.webtoonWidthGuides(canvasWidth).map((guide) => (
            <Line
              key={`wg-${guide.pos}-${guide.label}`}
              points={[guide.pos, 0, guide.pos, canvasHeight]}
              stroke="rgba(70, 150, 255, 0.55)"
              strokeWidth={1 / effScale}
              dash={[6 / effScale, 6 / effScale]}
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

export interface StudioUserGuide {
  id: string;
  type: "v" | "h";
  pos: number;
}

export type StudioCanvasSymmetryType =
  | "none"
  | "vertical"
  | "horizontal"
  | "radial"
  | "kaleidoscope";

export interface StudioCanvasGuideOverlayLayersProps {
  isExporting: boolean;
  drawingMode: boolean;
  canvasWidth: number;
  canvasHeight: number;
  effScale: number;
  guides: { x: number[]; y: number[] };
  smartGuides: SmartGuideOverlay;
  userGuides: StudioUserGuide[];
  setUserGuides: Dispatch<SetStateAction<StudioUserGuide[]>>;
  symmetryType: StudioCanvasSymmetryType;
  symmetryCenterX: number;
  symmetryCenterY: number;
  symmetryRadialCount: number;
  setSymmetryCenterX: Dispatch<SetStateAction<number>>;
  setSymmetryCenterY: Dispatch<SetStateAction<number>>;
  perspectiveRulerActive: boolean;
  vanishingPoints: VanishingPoint[];
  onPreviewVanishingPoint: (id: string, x: number, y: number) => void;
  onCommitVanishingPoint: (id: string, x: number, y: number) => void;
  isometricGridActive: boolean;
  isometricConfig: IsometricGridConfig;
  onPreviewIsometricOrigin: (x: number, y: number) => void;
  onCommitIsometricOrigin: (x: number, y: number) => void;
  drawingAssistDisabled: boolean;
  onCancelDrawingAssistPreview: () => void;
}

/** Interactive and transient guides that must remain above every authored and tool overlay. */
export function StudioCanvasGuideOverlayLayers({
  isExporting,
  drawingMode,
  canvasWidth,
  canvasHeight,
  effScale,
  guides,
  smartGuides,
  userGuides,
  setUserGuides,
  symmetryType,
  symmetryCenterX,
  symmetryCenterY,
  symmetryRadialCount,
  setSymmetryCenterX,
  setSymmetryCenterY,
  perspectiveRulerActive,
  vanishingPoints,
  onPreviewVanishingPoint,
  onCommitVanishingPoint,
  isometricGridActive,
  isometricConfig,
  onPreviewIsometricOrigin,
  onCommitIsometricOrigin,
  drawingAssistDisabled,
  onCancelDrawingAssistPreview,
}: StudioCanvasGuideOverlayLayersProps) {
  if (isExporting) return null;

  return (
    <>
      {(guides.x.length > 0 || guides.y.length > 0) && (
        <Layer listening={false}>
          {guides.x.map((guideX) => (
            <Line
              key={`gx-${guideX}`}
              points={[guideX, 0, guideX, canvasHeight]}
              stroke="#f43f5e"
              strokeWidth={1 / effScale}
              dash={[5 / effScale, 4 / effScale]}
            />
          ))}
          {guides.y.map((guideY) => (
            <Line
              key={`gy-${guideY}`}
              points={[0, guideY, canvasWidth, guideY]}
              stroke="#f43f5e"
              strokeWidth={1 / effScale}
              dash={[5 / effScale, 4 / effScale]}
            />
          ))}
        </Layer>
      )}

      {(smartGuides.segments.length > 0 || smartGuides.spacings.length > 0) && (
        <Layer listening={false}>
          {smartGuides.segments.map((segment, index) => (
            <Line
              key={`sgseg-${index}`}
              points={segment.axis === "v"
                ? [segment.pos, segment.from, segment.pos, segment.to]
                : [segment.from, segment.pos, segment.to, segment.pos]}
              stroke="#f43f5e"
              strokeWidth={1 / effScale}
              dash={segment.kind === "center" ? [7 / effScale, 3 / effScale] : undefined}
            />
          ))}
          {smartGuides.spacings.map((spacing, index) => (
            <Group key={`sgsp-${index}`}>
              {spacing.spans.map((span, spanIndex) => (
                <Group key={`sgsp-${index}-${spanIndex}`}>
                  <Line
                    points={spacing.axis === "x"
                      ? [span.from, spacing.at, span.to, spacing.at]
                      : [spacing.at, span.from, spacing.at, span.to]}
                    stroke="#8b5cf6"
                    strokeWidth={1.5 / effScale}
                  />
                  <Line
                    points={spacing.axis === "x"
                      ? [span.from, spacing.at - 5 / effScale, span.from, spacing.at + 5 / effScale]
                      : [spacing.at - 5 / effScale, span.from, spacing.at + 5 / effScale, span.from]}
                    stroke="#8b5cf6"
                    strokeWidth={1.5 / effScale}
                  />
                  <Line
                    points={spacing.axis === "x"
                      ? [span.to, spacing.at - 5 / effScale, span.to, spacing.at + 5 / effScale]
                      : [spacing.at - 5 / effScale, span.to, spacing.at + 5 / effScale, span.to]}
                    stroke="#8b5cf6"
                    strokeWidth={1.5 / effScale}
                  />
                  <KText
                    x={spacing.axis === "x"
                      ? (span.from + span.to) / 2 - 24 / effScale
                      : spacing.at + 6 / effScale}
                    y={spacing.axis === "x"
                      ? spacing.at + 6 / effScale
                      : (span.from + span.to) / 2 - 6 / effScale}
                    width={48 / effScale}
                    align={spacing.axis === "x" ? "center" : "left"}
                    text={`${Math.round(spacing.gap)}`}
                    fontSize={12 / effScale}
                    fontStyle="bold"
                    fill="#8b5cf6"
                  />
                </Group>
              ))}
            </Group>
          ))}
        </Layer>
      )}

      {userGuides.length > 0 && (
        <Layer>
          {userGuides.map((guide) => (
            <Group key={`user-guide-${guide.id}`}>
              <Line
                points={guide.type === "v"
                  ? [guide.pos, 0, guide.pos, canvasHeight]
                  : [0, guide.pos, canvasWidth, guide.pos]}
                stroke="#0ea5e9"
                strokeWidth={1.5 / effScale}
                dash={[8 / effScale, 5 / effScale]}
                listening={false}
              />
              <Line
                points={guide.type === "v"
                  ? [guide.pos, 0, guide.pos, canvasHeight]
                  : [0, guide.pos, canvasWidth, guide.pos]}
                stroke="transparent"
                strokeWidth={12 / effScale}
                draggable
                name="guide-line-handle"
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) {
                    stage.container().style.cursor = guide.type === "v" ? "ew-resize" : "ns-resize";
                  }
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "default";
                }}
                onDragMove={(event) => {
                  const node = event.target;
                  if (guide.type === "v") {
                    node.y(0);
                    const offset = node.x();
                    const updatedPos = Math.max(0, Math.min(canvasWidth, guide.pos + offset));
                    setUserGuides((previous) => previous.map((item) => (
                      item.id === guide.id ? { ...item, pos: updatedPos } : item
                    )));
                    node.x(0);
                  } else {
                    node.x(0);
                    const offset = node.y();
                    const updatedPos = Math.max(0, Math.min(canvasHeight, guide.pos + offset));
                    setUserGuides((previous) => previous.map((item) => (
                      item.id === guide.id ? { ...item, pos: updatedPos } : item
                    )));
                    node.y(0);
                  }
                }}
              />
            </Group>
          ))}
        </Layer>
      )}

      {drawingMode && symmetryType !== "none" && (
        <Layer>
          {symmetryType === "vertical" && (
            <>
              <Line
                points={[symmetryCenterX, 0, symmetryCenterX, canvasHeight]}
                stroke="#0ea5e9"
                strokeWidth={1.5 / effScale}
                dash={[6 / effScale, 4 / effScale]}
                listening={false}
              />
              <KCircle
                x={symmetryCenterX}
                y={symmetryCenterY}
                radius={7 / effScale}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={2 / effScale}
                draggable
                name="symmetry-handle"
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "ew-resize";
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "default";
                }}
                onDragMove={(event) => {
                  const node = event.target;
                  node.y(symmetryCenterY);
                  setSymmetryCenterX(Math.max(0, Math.min(canvasWidth, node.x())));
                }}
              />
            </>
          )}
          {symmetryType === "horizontal" && (
            <>
              <Line
                points={[0, symmetryCenterY, canvasWidth, symmetryCenterY]}
                stroke="#0ea5e9"
                strokeWidth={1.5 / effScale}
                dash={[6 / effScale, 4 / effScale]}
                listening={false}
              />
              <KCircle
                x={symmetryCenterX}
                y={symmetryCenterY}
                radius={7 / effScale}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={2 / effScale}
                draggable
                name="symmetry-handle"
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "ns-resize";
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "default";
                }}
                onDragMove={(event) => {
                  const node = event.target;
                  node.x(symmetryCenterX);
                  setSymmetryCenterY(Math.max(0, Math.min(canvasHeight, node.y())));
                }}
              />
            </>
          )}
          {symmetryType === "radial" && (
            <>
              <Ellipse
                x={symmetryCenterX}
                y={symmetryCenterY}
                radiusX={6 / effScale}
                radiusY={6 / effScale}
                stroke="#0ea5e9"
                strokeWidth={1.5 / effScale}
                listening={false}
              />
              {Array.from({ length: symmetryRadialCount }).map((_, index) => {
                const angle = (index * 2 * Math.PI) / symmetryRadialCount;
                const length = Math.max(canvasWidth, canvasHeight) * 1.5;
                return (
                  <Line
                    key={`radial-${index}`}
                    points={[
                      symmetryCenterX,
                      symmetryCenterY,
                      symmetryCenterX + length * Math.cos(angle),
                      symmetryCenterY + length * Math.sin(angle),
                    ]}
                    stroke="#0ea5e9"
                    strokeWidth={1 / effScale}
                    dash={[4 / effScale, 4 / effScale]}
                    opacity={0.7}
                    listening={false}
                  />
                );
              })}
              <KCircle
                x={symmetryCenterX}
                y={symmetryCenterY}
                radius={8 / effScale}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={2 / effScale}
                draggable
                name="symmetry-handle"
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "move";
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "default";
                }}
                onDragMove={(event) => {
                  const node = event.target;
                  setSymmetryCenterX(Math.max(0, Math.min(canvasWidth, node.x())));
                  setSymmetryCenterY(Math.max(0, Math.min(canvasHeight, node.y())));
                }}
              />
            </>
          )}
          {symmetryType === "kaleidoscope" && (
            <>
              {Array.from({ length: symmetryRadialCount }).map((_, index) => {
                const angle = wedgeBoundaryAngle(index, symmetryRadialCount);
                const length = Math.max(canvasWidth, canvasHeight) * 1.5;
                return (
                  <Line
                    key={`kaleido-wedge-${index}`}
                    points={[
                      symmetryCenterX,
                      symmetryCenterY,
                      symmetryCenterX + length * Math.cos(angle),
                      symmetryCenterY + length * Math.sin(angle),
                    ]}
                    stroke="#0ea5e9"
                    strokeWidth={1 / effScale}
                    dash={[4 / effScale, 4 / effScale]}
                    opacity={0.7}
                    listening={false}
                  />
                );
              })}
              {Array.from({ length: symmetryRadialCount }).map((_, index) => {
                const angle = mirrorAxisAngle(index, symmetryRadialCount);
                const length = Math.max(canvasWidth, canvasHeight) * 0.75;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                return (
                  <Line
                    key={`kaleido-mirror-${index}`}
                    points={[
                      symmetryCenterX - length * cos,
                      symmetryCenterY - length * sin,
                      symmetryCenterX + length * cos,
                      symmetryCenterY + length * sin,
                    ]}
                    stroke="#a855f7"
                    strokeWidth={1 / effScale}
                    opacity={0.55}
                    listening={false}
                  />
                );
              })}
              <Ellipse
                x={symmetryCenterX}
                y={symmetryCenterY}
                radiusX={6 / effScale}
                radiusY={6 / effScale}
                stroke="#0ea5e9"
                strokeWidth={1.5 / effScale}
                listening={false}
              />
              <KCircle
                x={symmetryCenterX}
                y={symmetryCenterY}
                radius={8 / effScale}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={2 / effScale}
                draggable
                name="symmetry-handle"
                onMouseEnter={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "move";
                }}
                onMouseLeave={(event) => {
                  const stage = event.target.getStage();
                  if (stage) stage.container().style.cursor = "default";
                }}
                onDragMove={(event) => {
                  const node = event.target;
                  setSymmetryCenterX(Math.max(0, Math.min(canvasWidth, node.x())));
                  setSymmetryCenterY(Math.max(0, Math.min(canvasHeight, node.y())));
                }}
              />
            </>
          )}
        </Layer>
      )}

      {drawingMode && perspectiveRulerActive && vanishingPoints.length > 0 && (
        <Layer>
          <Suspense fallback={null}>
            <StudioPerspectiveOverlay
              points={vanishingPoints}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              effScale={effScale}
              disabled={drawingAssistDisabled}
              onPreviewPoint={onPreviewVanishingPoint}
              onCommitPoint={onCommitVanishingPoint}
              onCancelPoint={onCancelDrawingAssistPreview}
            />
          </Suspense>
        </Layer>
      )}
      {drawingMode && isometricGridActive && (
        <Layer>
          <Suspense fallback={null}>
            <StudioIsometricGridOverlay
              config={isometricConfig}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              effScale={effScale}
              disabled={drawingAssistDisabled}
              onPreviewOrigin={onPreviewIsometricOrigin}
              onCommitOrigin={onCommitIsometricOrigin}
              onCancelOrigin={onCancelDrawingAssistPreview}
            />
          </Suspense>
        </Layer>
      )}
    </>
  );
}
