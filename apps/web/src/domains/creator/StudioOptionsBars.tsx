import { memo, Suspense } from "react";

import { StudioDrawingWorkbenchControls } from "./StudioDrawingWorkbenchControls";

import {
  StudioDrawOptionsBar,
  StudioSelectOptionsBar,
} from "./studio-page-lazy-ui";

import type { StudioBrushStampTuning } from "./brush/studio-brush-library";
import type { StudioBrushSlot } from "./brush/studio-brush-slots";
import type {
  StudioDrawModeUi,
  StudioPressureCurveUi,
  StudioStabilizerModeUi,
  StudioSymmetryUi,
} from "./brush/StudioDrawOptionsBar";
import type { StudioBrushTrayItem } from "./studio-creative-ux";
import type { DrawShapeKind } from "./studio-editor-tool-model";
import type { StudioLivingInkMaterialControls } from "./studio-living-ink-gpu-protocol";
import type {
  StudioLivingInkStrokeMode,
  StudioLivingInkStudioState,
} from "./studio-living-ink-studio-coordinator";

import { useIsMobile } from "@/shared/hooks/use-media-query";

export interface StudioOptionsBarsDrawModel {
  visible: boolean;
  /** Canonical renderer brush id. */
  brushId: string;
  /** Optional user-facing catalogue identity for procedural brushes. */
  activeCatalogBrushId?: string;
  activeCatalogBrushName?: string;
  brushCatalogItems?: readonly StudioBrushTrayItem[];
  brushCatalogOpen: boolean;
  workbenchVisible?: boolean;
  workspaceOwnerScope?: string;
  libraryDockOpen?: boolean;
  layoutRestoreAvailable?: boolean;
  brushDefaultRestore: Readonly<{
    sourceName: string;
    modifiedCount: number;
    loading: boolean;
    available: boolean;
    undoAvailable: boolean;
  }> | null;
  brushOpacity: number;
  materialBrush?: boolean;
  brushSlots: readonly (StudioBrushSlot | null)[];
  canvasFlipH: boolean;
  color: string;
  dockInsets: Readonly<{
    left: number;
    right: number;
  }>;
  drawMode: StudioDrawModeUi;
  drawShape: DrawShapeKind;
  /** CSP vector eraser mode: click freehand to erase between intersections. */
  eraseToIntersection?: boolean;
  eyedropperActive?: boolean;
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
  livingInk: Readonly<{
    supported: boolean;
    physicalModeEnabled: boolean;
    state: StudioLivingInkStudioState;
    mode: StudioLivingInkStrokeMode;
    scope: "all" | "selection";
    selectionAvailable: boolean;
    busy: boolean;
    fixAvailable: boolean;
    fixUnavailableReason?: string;
    material: StudioLivingInkMaterialControls;
    materialLocked: boolean;
    materialLockedReason?: string;
  }>;
}

export interface StudioOptionsBarsSelectionModel {
  visible: boolean;
  count: number;
  label: string | null;
  locked: boolean;
  canToggleLock: boolean;
  textEditLabel: "대사 편집" | "글자 편집" | null;
  canFitBubble: boolean;
}

export interface StudioOptionsBarsHandlers {
  openQuickAccess?: (point?: { x: number; y: number }) => void;
  toggleBrushDock?: () => void;
  restoreDrawingLayout?: () => void;
  undoDrawingLayoutRestore?: () => void;
  transformSelection?: () => void;
  assignBrushSlot: (index: number) => void;
  cycleStabilizer: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  editSelectionText: () => void;
  fitSelectionBubble: () => void;
  openBrushStudio: () => void;
  recallBrushSlot: (index: number) => void;
  reorderSelection: (direction: "front" | "back") => void;
  restoreBrushDefaults: () => void;
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
  toggleEraseToIntersection?: () => void;
  toggleEyedropper?: () => void;
  toggleOpacityLock: () => void;
  toggleQuickShape: () => void;
  toggleSelectedLock: () => void;
  toggleSizeLock: () => void;
  setLivingInkMode: (mode: StudioLivingInkStrokeMode) => void;
  setLivingInkPhysicalModeEnabled: (enabled: boolean) => void;
  setLivingInkScope: (scope: "all" | "selection") => void;
  applyLivingInkFix: () => void;
  applyLivingInkClear: () => void;
  patchLivingInkMaterial: (
    patch: Partial<StudioLivingInkMaterialControls>
  ) => void;
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
  const isMobile = useIsMobile();
  const selectionVisible = selection.visible && selection.count > 0;
  const drawVisible = draw.visible && !selectionVisible;
  // Handheld sessions already have their own thumb dock.
  if (isMobile || (!drawVisible && !selectionVisible && !draw.workbenchVisible)) return null;

  return (
    <div className="relative z-[40] flex min-h-16 min-w-0 shrink-0 border-b border-line bg-panel" data-studio-workbench-options="true">
      <StudioDrawingWorkbenchControls libraryOpen={draw.libraryDockOpen === true}
        undoAvailable={draw.layoutRestoreAvailable === true} handlers={stableHandlers} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
      {drawVisible ? (
        // One persistent context surface at a time. Selection replaces drawing instead of stacking
        // a second strip over the canvas.
        <Suspense fallback={null}>
          <StudioDrawOptionsBar
            key={draw.drawMode}
            docked={false}
            brushCatalogOpen={draw.brushCatalogOpen}
            onToggleBrushCatalog={stableHandlers.toggleBrushCatalog}
            dockInsets={draw.dockInsets}
            drawMode={draw.drawMode}
            brushId={draw.brushId}
            activeCatalogBrushId={draw.activeCatalogBrushId}
            activeCatalogBrushName={draw.activeCatalogBrushName}
            brushCatalogItems={draw.brushCatalogItems}
            brushDefaultRestore={draw.brushDefaultRestore}
            strokeWidth={draw.strokeWidth}
            brushOpacity={draw.brushOpacity}
            materialBrush={draw.materialBrush}
            stabilizer={draw.stabilizer}
            stabilizerMode={draw.stabilizerMode}
            onStabilizerModeChange={stableHandlers.setStabilizerMode}
            color={draw.color}
            brushSlots={draw.brushSlots}
            symmetryType={draw.symmetryType}
            quickShapeActive={draw.quickShapeActive}
            onSelectBrush={(item) => stableHandlers.selectBrushId(item.id)}
            onRestoreBrushDefaults={stableHandlers.restoreBrushDefaults}
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
            eyedropperActive={draw.eyedropperActive}
            onToggleEyedropper={stableHandlers.toggleEyedropper}
            eraseToIntersection={draw.eraseToIntersection}
            onToggleEraseToIntersection={stableHandlers.toggleEraseToIntersection}
            canvasFlipH={draw.canvasFlipH}
            onToggleCanvasFlipH={stableHandlers.toggleCanvasFlip}
            onOpenBrushStudio={stableHandlers.openBrushStudio}
            onToggleQuickShape={stableHandlers.toggleQuickShape}
            onSetDrawMode={stableHandlers.setDrawMode}
            shapeKind={draw.drawShape}
            onShapeKindChange={(kind) => stableHandlers.setDrawShape(kind as DrawShapeKind)}
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
            livingInk={
              isMobile
                ? undefined
                : {
                    ...draw.livingInk,
                    onPhysicalModeEnabledChange: stableHandlers.setLivingInkPhysicalModeEnabled,
                    onModeChange: stableHandlers.setLivingInkMode,
                    onScopeChange: stableHandlers.setLivingInkScope,
                    onFix: stableHandlers.applyLivingInkFix,
                    onClear: stableHandlers.applyLivingInkClear,
                    onMaterialChange: stableHandlers.patchLivingInkMaterial,
                  }
            }
          />
        </Suspense>
      ) : null}

      {selectionVisible ? (
        <Suspense fallback={null}>
          <StudioSelectOptionsBar
            docked={false}
            dockInsets={draw.dockInsets}
            selectionCount={selection.count}
            selectionLabel={selection.label}
            locked={selection.locked}
            onTransform={stableHandlers.transformSelection}
            onDuplicate={stableHandlers.duplicateSelection}
            onDelete={stableHandlers.deleteSelection}
            onBringFront={() => stableHandlers.reorderSelection("front")}
            onSendBack={() => stableHandlers.reorderSelection("back")}
            textEditLabel={selection.textEditLabel}
            onEditText={selection.textEditLabel ? stableHandlers.editSelectionText : undefined}
            onFitBubble={selection.canFitBubble ? stableHandlers.fitSelectionBubble : undefined}
            onToggleLock={selection.canToggleLock ? stableHandlers.toggleSelectedLock : undefined}
          />
        </Suspense>
      ) : null}
      </div>
    </div>
  );
});
