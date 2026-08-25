import { Suspense } from "react";

import { DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS } from "./studio-advanced-fill-settings";
import { StudioFloodFillPanel } from "./studio-page-lazy-ui";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import {
  StudioRasterToolRecoveryPanel,
  StudioInspectorFilterLauncher,
  StudioInspectorPixelSelectionLauncher,
} from "./StudioRasterToolRecoveryPanel";

import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";


export function StudioInspectorUnselectedImageTools({
  model,
}: {
  model: StudioInspectorAsideModel;
}) {
  const {
    activatePixelSelectionToolFromInspector,
    activeImageInspectorTab,
    activeInspectorPixelSelectionTool,
    advancedFillActive,
    advancedFillBusy,
    advancedFillPreview,
    advancedFillReferenceLayerCount,
    advancedFillSettings,
    advancedFillStatus,
    advancedFillUnsupportedReason,
    advancedFillVisibleRasterCount,
    color,
    cropBusy,
    dodgeBurnBusy,
    filterMaskBusy,
    handleRasterRecovery,
    healCloneBusy,
    imageInspectorRouteWithoutImageSelection,
    inspectorInteractionPolicy,
    inspectorLayout,
    layerMaskBusy,
    liquifyBusy,
    openStudioFilter,
    pixelBusy,
    puppetWarpBusy,
    rasterAvailability,
    setColor,
    shouldMountImageInspectorTab,
    smudgeBusy,
    studioFilterPreparationBusy,
    toggleAdvancedFill,
    updateAdvancedFillSettings,
    wetMixBusy,
  } = model;
  return (
    <>
          {imageInspectorRouteWithoutImageSelection ? (
            <div
              role="tabpanel"
              aria-label="전문 픽셀 도구"
              hidden={inspectorLayout.primary !== "properties"}
              className="space-y-3 rounded-xl border border-line bg-panel/40 p-3"
            >
              {shouldMountImageInspectorTab("quick") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "quick"}>
                  <StudioInspectorFilterLauncher
                    availability={rasterAvailability("filter", studioFilterPreparationBusy)}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                    onSelect={openStudioFilter}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("fill") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "fill"}>
                  <Suspense fallback={<StudioPanelLoading label="채우기·선화 도구를 여는 중..." />}>
                    <StudioFloodFillPanel
                      active={advancedFillActive}
                      busy={advancedFillBusy}
                      fillColor={color}
                      settings={advancedFillSettings}
                      referenceLayerCount={advancedFillReferenceLayerCount}
                      visibleRasterCount={advancedFillVisibleRasterCount}
                      selectedIsReference={false}
                      canToggleSelectedReference={false}
                      targetUnsupportedReason={
                        inspectorInteractionPolicy.page.reason ??
                        advancedFillUnsupportedReason ??
                        (!rasterAvailability("paint-bucket", advancedFillBusy).entry.enabled
                          ? rasterAvailability("paint-bucket", advancedFillBusy).entry.reason
                          : null)
                      }
                      statusMessage={advancedFillStatus}
                      diagnostics={advancedFillPreview?.diagnostics}
                      onToggleActive={toggleAdvancedFill}
                      onFillColorChange={setColor}
                      onSettingsChange={updateAdvancedFillSettings}
                      onToggleSelectedReference={() => undefined}
                      onResetSettings={() =>
                        updateAdvancedFillSettings({ ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS })
                      }
                    />
                    {rasterAvailability("paint-bucket", advancedFillBusy).entry.mode !==
                    "direct-raster" ? (
                      <StudioRasterToolRecoveryPanel
                        entries={[rasterAvailability("paint-bucket", advancedFillBusy)]}
                        onRecover={handleRasterRecovery}
                      />
                    ) : null}
                  </Suspense>
                </div>
              ) : null}
              {shouldMountImageInspectorTab("retouch") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "retouch"}>
                  <StudioInspectorPixelSelectionLauncher
                    availability={rasterAvailability("pixel-marquee")}
                    activeTool={activeInspectorPixelSelectionTool}
                    busy={pixelBusy}
                    onPickTool={activatePixelSelectionToolFromInspector}
                    onRecover={handleRasterRecovery}
                  />
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("smudge", smudgeBusy),
                      rasterAvailability("dodge-burn", dodgeBurnBusy),
                      rasterAvailability("wet-mix", wetMixBusy),
                      rasterAvailability("liquify", liquifyBusy),
                      rasterAvailability("heal", healCloneBusy),
                    ]}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("mask") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "mask"}>
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("layer-mask", layerMaskBusy || filterMaskBusy),
                    ]}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("transform") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "transform"}>
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("crop", cropBusy),
                      rasterAvailability("pixel-transform", pixelBusy),
                      rasterAvailability("puppet-warp", puppetWarpBusy),
                    ]}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
    </>
  );
}
