import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dCinematicDirectorPanel as StudioBg3dCinematicDirectorPanelContent } from "./StudioBg3dCinematicDirectorPanelContent";

import type { StudioBg3dCinematicDirectorPanelProps } from "./StudioBg3dCinematicDirectorPanelContent";

export type { StudioBg3dCinematicDirectorPanelProps } from "./StudioBg3dCinematicDirectorPanelContent";

/**
 * Resolves production scene commands from the nearest 3D editor shell while preserving direct prop
 * injection for tests and standalone rehearsals. Explicit props always win over context values.
 */
export function StudioBg3dCinematicDirectorPanel(
  props: StudioBg3dCinematicDirectorPanelProps,
) {
  const runtime = useStudioBg3dProSuiteRuntime();
  const {
    disabled,
    baseCamera,
    productionShots,
    onCaptureCurrentShot,
    onApplyProductionShot,
    onMoveProductionShot,
    onRemoveProductionShot,
    onUseCurrentFrameAsAiReference,
    aiReferenceBusy,
    ...rest
  } = props;
  const resolvedBaseCamera = baseCamera ?? runtime?.baseCamera;
  const resolvedShots = productionShots ?? runtime?.productionShots;
  const resolvedCapture = onCaptureCurrentShot ?? runtime?.onCaptureCurrentShot;
  const resolvedApply = onApplyProductionShot ?? runtime?.onApplyProductionShot;
  const resolvedMove = onMoveProductionShot ?? runtime?.onMoveProductionShot;
  const resolvedRemove = onRemoveProductionShot ?? runtime?.onRemoveProductionShot;
  const aiReferenceBlocked = runtime?.aiReferenceDisabled ?? false;
  const resolvedAiReference = aiReferenceBlocked
    ? undefined
    : onUseCurrentFrameAsAiReference ?? runtime?.onUseCurrentFrameAsAiReference;

  return (
    <StudioBg3dCinematicDirectorPanelContent
      {...rest}
      disabled={disabled ?? runtime?.disabled ?? false}
      aiReferenceBusy={aiReferenceBusy ?? runtime?.aiReferenceBusy ?? false}
      {...(resolvedBaseCamera ? { baseCamera: resolvedBaseCamera } : {})}
      {...(resolvedShots ? { productionShots: resolvedShots } : {})}
      {...(resolvedCapture ? { onCaptureCurrentShot: resolvedCapture } : {})}
      {...(resolvedApply ? { onApplyProductionShot: resolvedApply } : {})}
      {...(resolvedMove ? { onMoveProductionShot: resolvedMove } : {})}
      {...(resolvedRemove ? { onRemoveProductionShot: resolvedRemove } : {})}
      {...(resolvedAiReference
        ? { onUseCurrentFrameAsAiReference: resolvedAiReference }
        : {})}
    />
  );
}
