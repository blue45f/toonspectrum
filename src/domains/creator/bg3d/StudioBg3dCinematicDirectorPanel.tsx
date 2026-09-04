import { useCallback } from "react";

import { createStudioBg3dCameraUpForDutchRoll } from "./studio-bg3d-camera-orientation";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dCinematicDirectorPanel as StudioBg3dCinematicDirectorPanelContent } from "./StudioBg3dCinematicDirectorPanelContent";

import type { WebtoonShotBookmark } from "../scene-3d/studio-3d-camera-cinematic-director";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";
import type { StudioBg3dCinematicDirectorPanelProps } from "./StudioBg3dCinematicDirectorPanelContent";

export type { StudioBg3dCinematicDirectorPanelProps } from "./StudioBg3dCinematicDirectorPanelContent";

function cameraFromBookmark(
  baseCamera: StudioBg3dCameraSettings,
  bookmark: WebtoonShotBookmark,
): StudioBg3dCameraSettings {
  const position = [
    bookmark.position[0],
    bookmark.position[1],
    bookmark.position[2],
  ] as const;
  const target = [
    bookmark.target[0],
    bookmark.target[1],
    bookmark.target[2],
  ] as const;
  const up = createStudioBg3dCameraUpForDutchRoll(
    { position, target },
    bookmark.dutchRollDegrees,
  ) ?? [0, 1, 0] as const;

  return {
    ...baseCamera,
    position,
    target,
    fovDegrees: bookmark.fov,
    projection: "perspective",
    zoom: 1,
    lensShift: [0, 0],
    up,
  };
}

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
    onApplyShotBookmark,
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
  const runtimeApplyCameraView = runtime?.onApplyCameraView;
  const applyRuntimeBookmark = useCallback((bookmark: WebtoonShotBookmark) => {
    if (!runtimeApplyCameraView || !resolvedBaseCamera) return;
    runtimeApplyCameraView(cameraFromBookmark(resolvedBaseCamera, bookmark));
  }, [resolvedBaseCamera, runtimeApplyCameraView]);
  const resolvedBookmark = onApplyShotBookmark ?? (
    runtimeApplyCameraView && resolvedBaseCamera ? applyRuntimeBookmark : undefined
  );
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
      {...(resolvedBookmark ? { onApplyShotBookmark: resolvedBookmark } : {})}
      {...(resolvedAiReference
        ? { onUseCurrentFrameAsAiReference: resolvedAiReference }
        : {})}
    />
  );
}
