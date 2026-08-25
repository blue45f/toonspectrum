import { lazy } from "react";
import { createPortal } from "react-dom";

import { StudioBg3dEditorModal } from "./StudioBg3dEditorModal";
import { useStudioBg3dEditor } from "./useStudioBg3dEditor";

import type { StudioBackground3DProps } from "./StudioBackground3DTypes";

export type {
  StudioBackground3DInsertResult,
  StudioBackground3DLtLayer,
} from "../scene-3d/studio-3d-insert-contract";

export type {
  BgPanelTab,
  CaptureState,
  LtEditorSection,
  LtUserPresetLibraryStatus,
  LtUserPresetNotice,
  ModelThumbnailGpuLease,
  StudioBackground3DProps,
  StudioBg3dBabylonSpecialistEntry,
  StudioBg3dModelThumbnailRuntime,
  StudioBg3dPhysicsSession,
  TransformModeId,
  TransformSpace,
  ViewEditorSection,
} from "./StudioBackground3DTypes";

const LazyStudioBg3dAssetLibraryPanel = lazy(() =>
  import("./StudioBg3dAssetLibraryPanel").then(({ StudioBg3dAssetLibraryPanel }) => ({
    default: StudioBg3dAssetLibraryPanel,
  }))
);

export function StudioBackground3D(props: StudioBackground3DProps) {
  const h = useStudioBg3dEditor(props);
  if (!h) return null;
  h.LazyStudioBg3dAssetLibraryPanel = LazyStudioBg3dAssetLibraryPanel;
  if (typeof document === "undefined") return null;
  const modal = <StudioBg3dEditorModal h={h} />;
  return createPortal(modal, document.body);
}
