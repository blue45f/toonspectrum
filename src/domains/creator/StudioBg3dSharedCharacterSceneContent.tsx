import { lazy, Suspense } from "react";

import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";

import type {
  StudioShared3dCharacterRuntimeStatus,
  StudioShared3dCharacterSource,
} from "./studio-shared-3d-scene-bridge";

const LazyStudioBg3dSharedVrmCharacter = lazy(
  () => import("./StudioBg3dSharedVrmCharacter"),
);

export function StudioBg3dSharedCharacterSceneContent({
  characters,
  onStatus,
}: {
  characters: readonly StudioShared3dCharacterSource[];
  onStatus: (runtimeKey: string, status: StudioShared3dCharacterRuntimeStatus) => void;
}) {
  return characters.map((source) => (
    <Suspense key={source.runtimeKey} fallback={null}>
      <group
        ref={source.compatibility.previewOmissions.length > 0
          ? registerStudioBg3dCaptureExcludedObject
          : undefined}
      >
        <LazyStudioBg3dSharedVrmCharacter source={source} onStatus={onStatus} />
      </group>
    </Suspense>
  ));
}
