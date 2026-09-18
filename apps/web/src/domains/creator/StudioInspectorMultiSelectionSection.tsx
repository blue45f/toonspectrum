import { useMemo } from "react";

import { collectStudioDocumentColors } from "./studio-document-colors";
import {
  applyStudioMultiSelectionStrokeColor,
  resolveStudioMultiSelectionStrokeColor,
} from "./studio-multi-selection-color";
import { StudioColorField } from "./StudioColorField";
import { StudioInspectorBatchRenameSection } from "./StudioInspectorBatchRenameSection";
import { StudioInspectorSelectionActions } from "./StudioInspectorOrderAlignSection";
import { StudioInspectorMutationLockNotice } from "./StudioInspectorUtilityPanels";

import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

/**
 * Multi-selection Inspector body.
 *
 * Representative-only appearance/text controls stay hidden, but selection-wide commands no longer
 * disappear with them. The same handlers used by the canvas and single-selection Inspector are
 * surfaced here under one mutation gate, so lock/session policy and undo semantics remain shared.
 */
export function StudioInspectorMultiSelectionSection({
  model,
}: {
  model: StudioInspectorAsideModel;
}) {
  const {
    alignSelected,
    announceDrawingShortcut,
    commit,
    commitCoalesced,
    elements,
    ensureRecentColorsLoaded,
    finishPatchElCoalescing,
    groups,
    disarmAllPixelTools,
    duplicateSelected,
    inspectorInteractionPolicy,
    inspectorTransientOwners,
    marqueeIds,
    recentColors,
    rememberColor,
    removeSelected,
    reorder,
    requestInspectorColorSample,
  } = model;
  const documentColors = useMemo(
    () => collectStudioDocumentColors(elements),
    [elements],
  );
  const strokeColorState = useMemo(
    () => resolveStudioMultiSelectionStrokeColor(elements, marqueeIds),
    [elements, marqueeIds],
  );
  const strokeColorHistoryKey = `color:multi:${[...marqueeIds].sort().join(",")}:stroke`;
  const applyStrokeColor = (color: string | null, preview: boolean): void => {
    const next = applyStudioMultiSelectionStrokeColor(elements, marqueeIds, color);
    if (next.every((element, index) => element === elements[index])) return;
    if (preview && commitCoalesced) {
      commitCoalesced(next, strokeColorHistoryKey);
      return;
    }
    commit(next);
  };

  if (marqueeIds.length < 2) return null;

  return (
    <section
      data-testid="studio-inspector-context-multi-selection"
      data-studio-multi-selection-count={marqueeIds.length}
      aria-label={`${marqueeIds.length}개 선택 묶음 작업`}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-tight text-fg">선택 묶음 작업</p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-fg-3">
            공통 선 색상과 배치·순서·이름 작업을 선택 전체에 한 번에 적용합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-accent">
          {marqueeIds.length}개
        </span>
      </div>

      <StudioInspectorMutationLockNotice
        gate={inspectorInteractionPolicy.selection}
        hasActiveSession={inspectorTransientOwners.length > 0}
        onExit={disarmAllPixelTools}
      />

      <fieldset
        disabled={inspectorInteractionPolicy.selection.disabled}
        title={inspectorInteractionPolicy.selection.reason}
        className="m-0 min-w-0 border-0 p-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-50"
      >
        <legend className="sr-only">다중 선택 공통 스타일과 빠른 작업</legend>
        {strokeColorState.targets.length > 0 ? (
          <div
            className="mb-3 space-y-1.5 rounded-xl border border-line/55 bg-card/55 p-2.5"
            data-testid="studio-multi-selection-stroke-color"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
                공통 선 스타일
              </p>
              <span className="text-[0.6rem] tabular-nums text-fg-3">
                {strokeColorState.targets.length}개 요소
              </span>
            </div>
            <StudioColorField
              label="선 색상"
              value={strokeColorState.value}
              purpose="stroke"
              recentColors={recentColors}
              documentColors={documentColors}
              allowNone
              noneLabel="선 없음"
              mixed={strokeColorState.mixed}
              onChange={(color) => applyStrokeColor(color, false)}
              onPreview={(color) => applyStrokeColor(color, true)}
              onUseColor={rememberColor}
              onLoadRecentColors={ensureRecentColorsLoaded}
              onInteractionEnd={finishPatchElCoalescing}
              onRequestCanvasEyedropper={
                requestInspectorColorSample
                  ? () =>
                      requestInspectorColorSample((color) => {
                        applyStrokeColor(color, false);
                        rememberColor(color);
                      })
                  : undefined
              }
            />
            <p className="text-[0.6rem] leading-snug text-fg-3">
              {strokeColorState.mixed
                ? "서로 다른 선 상태입니다. 새 색을 고르면 선택한 요소에 동일하게 적용됩니다."
                : strokeColorState.includesNone
                  ? "선이 없는 요소들입니다. 색을 고르면 선 두께 3px로 시작합니다."
                  : "선 색상을 선택 묶음 전체에서 함께 변경합니다."}
            </p>
          </div>
        ) : null}
        <StudioInspectorSelectionActions
          selectionCount={marqueeIds.length}
          reorder={reorder}
          alignSelected={alignSelected}
          duplicateSelected={duplicateSelected}
          removeSelected={removeSelected}
        />
        <StudioInspectorBatchRenameSection
          elements={elements}
          selectedIds={marqueeIds}
          groups={groups}
          commit={(next) => !inspectorInteractionPolicy.selection.disabled && commit(next)}
          announce={announceDrawingShortcut}
        />
      </fieldset>
    </section>
  );
}
