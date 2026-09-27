import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Object3D } from "three";

import { CharacterMaterialOverrideRuntime } from "./character-material-override-runtime";
import { CharacterGeometryStrokeThreeRuntime } from "./character-geometry-stroke-three-runtime";

import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

export interface CharacterRenderExtrasState {
  readonly supported: boolean;
  readonly status: "idle" | "building" | "ready" | "error";
  readonly error: string | null;
  readonly warnings: readonly string[];
  readonly materialCount: number;
  readonly strokeCount: number;
  readonly retry: () => void;
}

function modelRoot(h: StudioVrmPoserHost): Object3D | null {
  const vrm: unknown = h.vrm;
  if (typeof vrm !== "object" || vrm === null) return null;
  const scene: unknown = Reflect.get(vrm, "scene");
  return scene instanceof Object3D ? scene : null;
}

export function useCharacterRenderExtras({ h, document, enabled = true }: {
  readonly h: StudioVrmPoserHost; readonly document: CharacterDocumentV3; readonly enabled?: boolean;
}): CharacterRenderExtrasState {
  const root = enabled && h.status === "ready" ? modelRoot(h) : null;
  const inputKey = useMemo(() => JSON.stringify([root?.uuid, document.model.assetId,
    document.geometryStrokes, document.look.materialOverrides, document.look.colors, document.groom.groups.map((group) => group.materialId)]),
  [root, document.model.assetId, document.geometryStrokes, document.look.materialOverrides, document.look.colors, document.groom]);
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<Omit<CharacterRenderExtrasState, "retry" | "supported"> & { readonly inputKey: string | null }>({
    inputKey: null, status: "idle", error: null, warnings: [], materialCount: 0, strokeCount: 0,
  });
  const runtimeRef = useRef<{ materials: CharacterMaterialOverrideRuntime; geometry: CharacterGeometryStrokeThreeRuntime } | null>(null);
  const invalidateRef = h.texturePaintInvalidateRef;
  const captureOperationRef = h.captureOperationRef;
  useEffect(() => {
    if (!root) return;
    const runtime = { materials: new CharacterMaterialOverrideRuntime(root, () => captureOperationRef?.current != null),
      geometry: new CharacterGeometryStrokeThreeRuntime(root, () => invalidateRef?.current?.()) };
    runtimeRef.current = runtime;
    return () => {
      runtime.materials.dispose();
      runtime.geometry.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [root, invalidateRef, captureOperationRef]);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !root) return;
    let current = true;
    setState((previous) => ({ ...previous, inputKey, status: "building", error: null }));
    void runtime.geometry.update(document.geometryStrokes).then((result) => {
      if (!current || result.status !== "ready") return;
      const materialResult = runtime.materials.update(document.look.materialOverrides, document.groom.groups.map((group) => group.materialId));
      invalidateRef?.current?.();
      setState({ inputKey, status: "ready", error: null, warnings: [...result.warnings, ...materialResult.warnings],
        materialCount: materialResult.materialCount, strokeCount: result.strokeCount });
    }).catch((error: unknown) => {
      if (current) setState((previous) => ({ ...previous, status: "error",
        error: error instanceof Error ? error.message : "재질·입체선 표시를 복원하지 못했습니다." }));
    });
    return () => { current = false; };
  }, [root, inputKey, document.geometryStrokes, document.look.materialOverrides, document.look.colors, document.groom, invalidateRef, captureOperationRef, retryRevision]);
  const retry = useCallback(() => setRetryRevision((revision) => revision + 1), []);
  const current = state.inputKey === inputKey;
  return { status: !root ? "idle" : current ? state.status : "building", error: root && current ? state.error : null,
    warnings: current ? state.warnings : [], materialCount: current ? state.materialCount : 0,
    strokeCount: current ? state.strokeCount : 0, supported: root !== null, retry };
}
