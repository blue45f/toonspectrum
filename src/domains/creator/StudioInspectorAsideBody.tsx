import { Suspense, useId } from "react";

import {
  resolveStudioFigmaSelectionLayoutMetrics,
  selectStudioFigmaDesignTargets,
} from "./studio-figma-selection-ux";
import { StudioPathBooleanPanel } from "./studio-page-lazy-ui";
import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
import { StudioFigmaDesignPanel } from "./StudioFigmaDesignPanel";
import { StudioInspectorAsideShell } from "./StudioInspectorAsideShell";
import { StudioInspectorContextRouteSync } from "./StudioInspectorContextRouteSync";
import { StudioInspectorDrawingSection } from "./StudioInspectorDrawingSection";
import { StudioInspectorEmptyCoachSection } from "./StudioInspectorEmptyCoachSection";
import { StudioInspectorSelectionSection } from "./StudioInspectorSelectionSection";
import { StudioInspectorUnselectedImageTools } from "./StudioInspectorUnselectedImageTools";
import { useStudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

import type { StudioInspectorAsideProps } from "./StudioInspectorAsideTypes";

import { buttonClass } from "@/components/ui/button-utils";

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
    changeInspectorLayout,
    startEditText,
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
      <StudioInspectorContextRouteSync
        contentMode={inspectorContentMode}
        layout={inspectorLayout}
        selectedType={selected?.type ?? null}
        onChange={changeInspectorLayout}
      />
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
          {inspectorContentMode === "selection"
            && !hasMultiSelection
            && selected
            && (selected.type === "text"
              || selected.type === "bubble"
              || selected.type === "sticker") ? (
            <button
              type="button"
              disabled={inspectorInteractionPolicy.selection.disabled}
              title={inspectorInteractionPolicy.selection.reason}
              aria-label={selected.type === "bubble" ? "대사 편집" : "글자 편집"}
              data-studio-inspector-primary-text-edit="true"
              data-inspector-priority="essential"
              data-inspector-control-id="element.edit-text"
              onClick={() => startEditText(selected.id)}
              className={buttonClass({
                size: "md",
                variant: "solid",
                className: "min-h-11 w-full justify-between px-3 text-left",
              })}
            >
              <span>{selected.type === "bubble" ? "대사 편집" : "글자 편집"}</span>
              <span className="text-[0.6875rem] font-semibold opacity-80">내용 수정</span>
            </button>
          ) : null}
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
