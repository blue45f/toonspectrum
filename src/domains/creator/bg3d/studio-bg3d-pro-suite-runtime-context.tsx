import { createContext, useContext } from "react";

import type {
  StudioBg3dCameraSettings,
  StudioBg3dShot,
} from "./studio-bg3d-scene-document";

/**
 * Runtime-only bridge between the production 3D editor shell and deeply nested Pro Suite tools.
 *
 * The canonical scene document remains owned by the editor. This context only carries the exact
 * read model and commands already exposed by StudioBg3dViewPanel, so specialist panels do not
 * create a second store or bypass undo/redo, capture locks, or AI consent gates.
 */
export interface StudioBg3dProSuiteRuntimeValue {
  readonly disabled: boolean;
  readonly baseCamera: StudioBg3dCameraSettings;
  readonly productionShots: readonly StudioBg3dShot[];
  readonly onCaptureCurrentShot: () => void;
  readonly onApplyProductionShot: (shotId: string) => void;
  readonly onMoveProductionShot: (shotId: string, targetIndex: number) => void;
  readonly onRemoveProductionShot: (shotId: string) => void;
  readonly onUseCurrentFrameAsAiReference: (() => void) | undefined;
  readonly aiReferenceBusy: boolean;
  readonly aiReferenceDisabled: boolean;
}

export const StudioBg3dProSuiteRuntimeContext =
  createContext<StudioBg3dProSuiteRuntimeValue | null>(null);

export function useStudioBg3dProSuiteRuntime(): StudioBg3dProSuiteRuntimeValue | null {
  return useContext(StudioBg3dProSuiteRuntimeContext);
}
