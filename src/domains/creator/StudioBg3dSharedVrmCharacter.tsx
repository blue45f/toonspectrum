import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";

import {
  applyStudioBg3dLinkedCharacterState,
  loadStudioBg3dLinkedVrm,
} from "./studio-bg3d-shared-vrm-runtime";
import { disposeStudioVrmAsset } from "./studio-vrm-asset-runtime";

import type {
  StudioShared3dCharacterRuntimeStatus,
  StudioShared3dCharacterSource,
} from "./studio-shared-3d-scene-bridge";
import type { VRM } from "@pixiv/three-vrm";

export interface StudioBg3dSharedVrmCharacterProps {
  readonly source: StudioShared3dCharacterSource;
  readonly onStatus: (
    runtimeKey: string,
    status: StudioShared3dCharacterRuntimeStatus,
  ) => void;
}

/**
 * Read-only runtime projection of one canonical VRM source into the BG3D R3F scene. The component
 * owns only its loaded runtime clone; it never mutates or writes a converted character document.
 */
export default function StudioBg3dSharedVrmCharacter({
  source,
  onStatus,
}: StudioBg3dSharedVrmCharacterProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const reportStatus = useEffectEvent(onStatus);

  useEffect(() => {
    let cancelled = false;
    let ownedVrm: VRM | null = null;
    setVrm(null);
    reportStatus(source.runtimeKey, "loading");

    void loadStudioBg3dLinkedVrm(source.scene).then((loaded) => {
      ownedVrm = loaded;
      if (cancelled) {
        disposeStudioVrmAsset(loaded);
        ownedVrm = null;
        return;
      }
      if (!applyStudioBg3dLinkedCharacterState(loaded, source)) {
        disposeStudioVrmAsset(loaded);
        ownedVrm = null;
        reportStatus(source.runtimeKey, "unavailable");
        return;
      }
      setVrm(loaded);
    }).catch(() => {
      if (!cancelled) reportStatus(source.runtimeKey, "unavailable");
    });

    return () => {
      cancelled = true;
      setVrm(null);
      if (ownedVrm) {
        disposeStudioVrmAsset(ownedVrm);
        ownedVrm = null;
      }
    };
  }, [source]);

  // Announce readiness only after the primitive has committed into the R3F scene. This prevents
  // the insert button from enabling in the small setState→scene-mount gap.
  useLayoutEffect(() => {
    if (vrm) reportStatus(source.runtimeKey, "ready");
  }, [source.runtimeKey, vrm]);

  return vrm ? <primitive object={vrm.scene} dispose={null} /> : null;
}
