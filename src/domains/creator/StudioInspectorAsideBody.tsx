import { Suspense, useId } from "react";

import {
  resolveStudioFigmaSelectionLayoutMetrics,
  selectStudioFigmaDesignTargets,
} from "./studio-figma-selection-ux";
import { StudioPathBooleanPanel } from "./studio-page-lazy-ui";
import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
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
  const tabA11y = createStudioInspectorTabA11y(useId());
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
  const hasMultiSelection =
    inspectorContentMode === "selection" && marqueeIds.length > 1;

  return (
    <StudioInspectorAsideShell model={model} tabA11y={tabA11y}>
      <div
        id={tabA11y.primary.properties.panelId}
        role="tabpanel"
        aria-labelledby={tabA11y.primary.properties.tabId}
        hidden={inspectorLayout.primary !== "properties"}
        className={
          inspectorContentMode === "drawing"
            ? "min-h-0 lg:flex lg:flex-1 lg:flex-col"
            : "space-y-2"
        }
      >
          {inspectorContentMode === "selection" && (
            <div>
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
          {!hasMultiSelection ? (
            <StudioInspectorSelectionSection model={model} tabA11y={tabA11y} />
          ) : null}
          {inspectorContentMode === "selection" && marqueeIds.length === 2 && (
            <div
              aria-label="도형 결합"
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
          <StudioInspectorUnselectedImageTools model={model} tabA11y={tabA11y} />
      </div>
    </StudioInspectorAsideShell>
  );
}
