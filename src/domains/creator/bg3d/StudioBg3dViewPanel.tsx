import {
  StudioBg3dProSuiteRuntimeContext,
  type StudioBg3dProSuiteRuntimeValue,
} from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dViewPanel as StudioBg3dViewPanelContent } from "./StudioBg3dViewPanelContent";

import type { StudioBg3dViewPanelProps } from "./StudioBg3dViewPanelContent";

export {
  StudioBg3dAiReferenceAction,
  StudioBg3dBabylonDiagnostic,
} from "./StudioBg3dViewPanelContent";
export type {
  StudioBg3dAiReferenceActionProps,
  StudioBg3dBabylonDiagnosticBackend,
  StudioBg3dBabylonDiagnosticProps,
  StudioBg3dBabylonDiagnosticState,
  StudioBg3dViewPanelProps,
} from "./StudioBg3dViewPanelContent";

/**
 * Production bridge for the view-panel layout.
 *
 * The dense camera/environment presentation stays isolated in the content component while this
 * thin shell publishes its existing SceneDocument commands to nested 3D specialist tools. This
 * avoids duplicating shot state and keeps every director action on the editor's undoable command
 * path.
 */
export function StudioBg3dViewPanel(props: StudioBg3dViewPanelProps) {
  const { context } = props;
  const disabled =
    context.isCapturing ||
    context.isBatchRenderingShots ||
    context.isRestoringScene ||
    context.physicsInteractionLocked;
  const runtime: StudioBg3dProSuiteRuntimeValue = {
    disabled,
    baseCamera: context.sceneBaseDocument.camera,
    productionShots: context.savedShots,
    onApplyCameraView: (camera) => context.updateCameraLens(() => camera),
    onCaptureCurrentShot: context.captureCurrentShot,
    onApplyProductionShot: context.applySavedShot,
    onMoveProductionShot: context.moveSavedShot,
    onRemoveProductionShot: context.removeSavedShot,
    onUseCurrentFrameAsAiReference: props.onUseCurrentFrameAsAiReference,
    aiReferenceBusy: props.aiReferenceBusy ?? false,
    aiReferenceDisabled: (props.aiReferenceDisabled ?? false) || disabled,
  };

  return (
    <StudioBg3dProSuiteRuntimeContext.Provider value={runtime}>
      <StudioBg3dViewPanelContent {...props} />
    </StudioBg3dProSuiteRuntimeContext.Provider>
  );
}
