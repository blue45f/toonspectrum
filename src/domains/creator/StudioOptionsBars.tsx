import { memo, Suspense } from "react";

import { DRAW_COLOR_SWATCHES } from "./studio-draw-color-swatches";
import {
  StudioDrawOptionsBar,
  StudioSelectOptionsBar,
} from "./studio-page-lazy-ui";

import type { StudioBrushStampTuning } from "./studio-brush-library";
import type { StudioBrushSlot } from "./studio-brush-slots";
import type { DrawShapeKind } from "./studio-editor-tool-model";
import type {
  StudioDrawModeUi,
  StudioPressureCurveUi,
  StudioStabilizerModeUi,
  StudioSymmetryUi,
} from "./StudioDrawOptionsBar";

export interface StudioOptionsBarsDrawModel {
  visible: boolean;
  brushId: string;
  brushCatalogOpen: boolean;
  brushOpacity: number;
  brushSlots: readonly (StudioBrushSlot | null)[];
  canvasFlipH: boolean;
  color: string;
  dockInsets: Readonly<{
    left: number;
    right: number;
  }>;
  drawMode: StudioDrawModeUi;
  drawShape: DrawShapeKind;
  favoriteBrushIds: readonly string[];
  opacityLocked: boolean;
  postCorrection: number;
  pressureCurveId: StudioPressureCurveUi;
  quickShapeActive: boolean;
  recentBrushIds: readonly string[];
  secondaryColor: string;
  shapeFill: boolean;
  sizeLocked: boolean;
  stabilizer: number;
  stabilizerMode: StudioStabilizerModeUi;
  stampTuning: StudioBrushStampTuning | null;
  strokeWidth: number;
  symmetryType: StudioSymmetryUi;
}

export interface StudioOptionsBarsSelectionModel {
  visible: boolean;
  count: number;
  label: string | null;
  locked: boolean;
  canToggleLock: boolean;
}

export interface StudioOptionsBarsHandlers {
  assignBrushSlot: (index: number) => void;
  cycleStabilizer: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  openBrushStudio: () => void;
  recallBrushSlot: (index: number) => void;
  reorderSelection: (direction: "front" | "back") => void;
  selectBrushId: (brushId: string) => void;
  setBrushOpacity: (value: number) => void;
  setColor: (hex: string) => void;
  setDrawMode: (mode: StudioDrawModeUi) => void;
  setDrawShape: (kind: DrawShapeKind) => void;
  setPostCorrection: (value: number) => void;
  setPressureCurvePreset: (id: StudioPressureCurveUi) => void;
  setSecondaryColor: (hex: string) => void;
  setShapeFill: (filled: boolean) => void;
  setStabilizer: (value: number) => void;
  setStabilizerMode: (mode: StudioStabilizerModeUi) => void;
  setStampTuning: (tuning: StudioBrushStampTuning) => void;
  setStrokeWidth: (value: number) => void;
  setSymmetryType: (type: StudioSymmetryUi) => void;
  swapColors: () => void;
  toggleBrushCatalog: (trigger: HTMLButtonElement) => void;
  toggleCanvasFlip: () => void;
  toggleFavoriteBrush: (brushId: string) => void;
  toggleOpacityLock: () => void;
  toggleQuickShape: () => void;
  toggleSelectedLock: () => void;
  toggleSizeLock: () => void;
}

export interface StudioOptionsBarsProps {
  draw: StudioOptionsBarsDrawModel;
  selection: StudioOptionsBarsSelectionModel;
  stableHandlers: StudioOptionsBarsHandlers;
}

export const StudioOptionsBars = memo(function StudioOptionsBars({
  draw,
  selection,
  stableHandlers,
}: StudioOptionsBarsProps) {
  return (
    <>
      {draw.visible ? (
        // The dock is fixed and consumes no document flow. A non-null fallback shifts the canvas
        // when the lazy chunk resolves, which can make a just-finished stroke appear to jump.
        <Suspense fallback={null}>
          <StudioDrawOptionsBar
            docked
            brushCatalogOpen={draw.brushCatalogOpen}
            onToggleBrushCatalog={stableHandlers.toggleBrushCatalog}
            dockInsets={draw.dockInsets}
            drawMode={draw.drawMode}
            brushId={draw.brushId}
            strokeWidth={draw.strokeWidth}
            brushOpacity={draw.brushOpacity}
            stabilizer={draw.stabilizer}
            stabilizerMode={draw.stabilizerMode}
            onStabilizerModeChange={stableHandlers.setStabilizerMode}
            color={draw.color}
            recentSwatches={DRAW_COLOR_SWATCHES}
            brushSlots={draw.brushSlots}
            symmetryType={draw.symmetryType}
            quickShapeActive={draw.quickShapeActive}
            onSelectBrush={(item) => stableHandlers.selectBrushId(item.id)}
            onStrokeWidthChange={stableHandlers.setStrokeWidth}
            onOpacityChange={stableHandlers.setBrushOpacity}
            onStabilizerChange={stableHandlers.setStabilizer}
            postCorrection={draw.postCorrection}
            onPostCorrectionChange={stableHandlers.setPostCorrection}
            pressureCurveId={draw.pressureCurveId}
            onPressureCurveChange={stableHandlers.setPressureCurvePreset}
            stampTuning={draw.stampTuning}
            onStampTuningChange={stableHandlers.setStampTuning}
            onColorChange={stableHandlers.setColor}
            secondaryColor={draw.secondaryColor}
            onSecondaryColorChange={stableHandlers.setSecondaryColor}
            onSwapColors={stableHandlers.swapColors}
            canvasFlipH={draw.canvasFlipH}
            onToggleCanvasFlipH={stableHandlers.toggleCanvasFlip}
            onOpenBrushStudio={stableHandlers.openBrushStudio}
            onToggleQuickShape={stableHandlers.toggleQuickShape}
            onSetDrawMode={stableHandlers.setDrawMode}
            shapeKind={draw.drawShape}
            onShapeKindChange={(kind) =>
              stableHandlers.setDrawShape(kind as DrawShapeKind)
            }
            shapeFill={draw.shapeFill}
            onShapeFillChange={stableHandlers.setShapeFill}
            onRecallBrushSlot={stableHandlers.recallBrushSlot}
            onAssignBrushSlot={stableHandlers.assignBrushSlot}
            onSymmetryTypeChange={stableHandlers.setSymmetryType}
            sizeLocked={draw.sizeLocked}
            opacityLocked={draw.opacityLocked}
            onToggleSizeLock={stableHandlers.toggleSizeLock}
            onToggleOpacityLock={stableHandlers.toggleOpacityLock}
            recentBrushIds={draw.recentBrushIds}
            favoriteBrushIds={draw.favoriteBrushIds}
            onToggleFavoriteBrush={stableHandlers.toggleFavoriteBrush}
            onCycleStabilizer={stableHandlers.cycleStabilizer}
          />
        </Suspense>
      ) : null}

      {selection.visible ? (
        <Suspense fallback={null}>
          <StudioSelectOptionsBar
            selectionCount={selection.count}
            selectionLabel={selection.label}
            locked={selection.locked}
            onDuplicate={stableHandlers.duplicateSelection}
            onDelete={stableHandlers.deleteSelection}
            onBringFront={() => stableHandlers.reorderSelection("front")}
            onSendBack={() => stableHandlers.reorderSelection("back")}
            onToggleLock={
              selection.canToggleLock
                ? stableHandlers.toggleSelectedLock
                : undefined
            }
          />
        </Suspense>
      ) : null}
    </>
  );
});
