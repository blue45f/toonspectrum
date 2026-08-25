import { Suspense } from "react";

import {
  resolveStudioFigmaSelectionLayoutMetrics,
  selectStudioFigmaDesignTargets,
} from "./studio-figma-selection-ux";
import { StudioPathBooleanPanel } from "./studio-page-lazy-ui";
import { StudioFigmaDesignPanel } from "./StudioFigmaDesignPanel";
import { StudioInspectorAsideShell } from "./StudioInspectorAsideShell";
import { StudioInspectorDrawingSection } from "./StudioInspectorDrawingSection";
import { StudioInspectorEmptyCoachSection } from "./StudioInspectorEmptyCoachSection";
import { StudioInspectorSelectionSection } from "./StudioInspectorSelectionSection";
import { StudioInspectorUnselectedImageTools } from "./StudioInspectorUnselectedImageTools";
import { useStudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

import type { StudioInspectorAsideProps } from "./StudioInspectorAsideTypes";

export function StudioInspectorAsideBody(props: StudioInspectorAsideProps) {
  const model = useStudioInspectorAsideModel(props);
  const {
    inspectorContentMode,
    inspectorLayout,
    selected,
    elements,
    marqueeIds,
    inspectorInteractionPolicy,
    applyFigmaSelectionLayoutPatch,
    zoomToSelection,
    flipSelected,
    pathBooleanBusy,
    pathBooleanInspectorUnavailableReason,
    applyPathBooleanCombine,
  } = model;

  return (
    <StudioInspectorAsideShell model={model}>
          {inspectorContentMode === "selection" && (
            <div hidden={inspectorLayout.primary !== "properties"}>
              <StudioFigmaDesignPanel
                metrics={resolveStudioFigmaSelectionLayoutMetrics(
                  selectStudioFigmaDesignTargets(elements, marqueeIds, selected),
                )}
                disabled={inspectorInteractionPolicy.selection.disabled}
                onChange={applyFigmaSelectionLayoutPatch}
                onZoomToSelection={zoomToSelection}
                onFlipHorizontal={() => flipSelected("horizontal")}
                onFlipVertical={() => flipSelected("vertical")}
              />
            </div>
          )}
          <StudioInspectorSelectionSection model={model} />
          {inspectorContentMode === "selection" && marqueeIds.length === 2 && (
            <div
              role="tabpanel"
              aria-label="도형 결합"
              hidden={inspectorLayout.primary !== "properties"}
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <Suspense fallback={null}>
                <StudioPathBooleanPanel
                  busy={pathBooleanBusy}
                  unavailableReason={pathBooleanInspectorUnavailableReason}
                  onApply={(op) => applyPathBooleanCombine(op)}
                />
              </Suspense>
            </div>
          )}
          <StudioInspectorEmptyCoachSection model={model} />
          <StudioInspectorDrawingSection model={model} />
          <StudioInspectorUnselectedImageTools model={model} />
    </StudioInspectorAsideShell>
  );
}
