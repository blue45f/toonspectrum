import { useState } from "react";

import { inspectStudioShared3dCaptureReadiness } from "./studio-shared-3d-scene-bridge";

import type {
  StudioShared3dCharacterRuntimeStatus,
  StudioShared3dSceneSession,
} from "./studio-shared-3d-scene-bridge";

/** Keeps runtime-only VRM readiness separate from the canonical source-layer documents. */
export function useStudioBg3dSharedCharacterStatus(
  session: StudioShared3dSceneSession | undefined,
) {
  const [statuses, setStatuses] = useState<
    Readonly<Record<string, StudioShared3dCharacterRuntimeStatus>>
  >({});
  const characters = session?.characters ?? [];
  const captureReadiness = inspectStudioShared3dCaptureReadiness(session, statuses);
  const readyCount = characters.reduce(
    (count, character) => count + (statuses[character.runtimeKey] === "ready" ? 1 : 0),
    0,
  );
  const unavailableCount = characters.reduce(
    (count, character) => count + (statuses[character.runtimeKey] === "unavailable" ? 1 : 0),
    0,
  );
  const previewOmissionCount = characters.reduce(
    (count, character) => count + character.compatibility.previewOmissions.length,
    0,
  );

  const updateStatus = (
    runtimeKey: string,
    status: StudioShared3dCharacterRuntimeStatus,
  ) => {
    if (!characters.some((character) => character.runtimeKey === runtimeKey)) return;
    setStatuses((current) =>
      current[runtimeKey] === status ? current : { ...current, [runtimeKey]: status },
    );
  };

  return {
    captureReadiness,
    characters,
    previewOmissionCount,
    readyCount,
    unavailableCount,
    updateStatus,
  } as const;
}
