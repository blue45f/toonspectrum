import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Object3D, Scene } from "three";

import { CharacterGroomThreeRuntime } from "./character-groom-three-runtime";

import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

export interface CharacterGroomRuntimeState {
  readonly supported: boolean;
  readonly reason: string | null;
  readonly status: "idle" | "building" | "ready" | "error";
  readonly error: string | null;
  readonly guideCount: number;
  readonly triangleCount: number;
  readonly skippedGuideCount: number;
  readonly notices?: readonly string[];
  readonly attachedGuideIds?: readonly string[];
  readonly retry: () => void;
}

function headBone(h: StudioVrmPoserHost): Object3D | null {
  const vrm: unknown = h.vrm;
  if (typeof vrm !== "object" || vrm === null) return null;
  const humanoid: unknown = Reflect.get(vrm, "humanoid");
  if (typeof humanoid !== "object" || humanoid === null) return null;
  const getter: unknown = Reflect.get(humanoid, "getRawBoneNode");
  if (typeof getter !== "function") return null;
  const head: unknown = Reflect.apply(getter, humanoid, ["head"]);
  return head instanceof Object3D ? head : null;
}

export function useCharacterGroomRuntime({ h, document, modelKey, enabled = true }: {
  readonly h: StudioVrmPoserHost;
  readonly document: CharacterDocumentV3;
  readonly modelKey: string;
  readonly enabled?: boolean;
}): CharacterGroomRuntimeState {
  const head = h.status === "ready" ? headBone(h) : null;
  const [retryRevision, setRetryRevision] = useState(0);
  const input = useMemo(() => ({
    groom: document.groom, topologyRevision: document.topology.revision,
    color: document.look.colors.hairBase, materialOverrides: document.look.materialOverrides,
    head, modelKey, enabled, retryRevision, sceneGeneration: h.captureSceneGeneration, model: h.vrm,
  }), [document.groom, document.topology.revision, document.look.colors.hairBase, document.look.materialOverrides,
    head, modelKey, enabled, retryRevision, h.captureSceneGeneration, h.vrm]);
  type RuntimeView = Omit<CharacterGroomRuntimeState, "retry" | "supported" | "reason">;
  const [rendered, setRendered] = useState<{ readonly input: typeof input; readonly state: RuntimeView } | null>(null);
  const runtimeRef = useRef<CharacterGroomThreeRuntime | null>(null);
  const invalidateRef = h.texturePaintInvalidateRef;
  useEffect(() => {
    if (!head || !enabled) return;
    const runtime = new CharacterGroomThreeRuntime(head, () => invalidateRef?.current?.());
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [head, enabled, invalidateRef]);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !head || !enabled) return;
    const captureScene: unknown = h.captureRef?.current?.scene;
    const scene = captureScene instanceof Scene ? captureScene : null;
    const modelRoot = h.vrm?.scene;
    let current = true;
    const clear = () => {
      runtime.clear();
      setRendered({ input, state: { status: "idle", error: null, guideCount: 0, triangleCount: 0, skippedGuideCount: 0 } });
    };
    const rebuild = () => {
      if (scene && modelRoot && scene.getObjectById(modelRoot.id) !== modelRoot) {
        clear();
        return;
      }
      setRendered({ input, state: { status: "building", error: null, guideCount: 0, triangleCount: 0, skippedGuideCount: 0 } });
      void runtime.update(document.groom, document.topology.revision, document.look.colors.hairBase ?? "#32251f", {
        ...(scene ? { surface: { scene, modelKey } } : {}), materialOverrides: document.look.materialOverrides,
        onSurfaceInvalidated: (guideId, notice) => {
          queueMicrotask(() => {
            if (!current) return;
            setRendered((previous) => previous?.input !== input ? previous : {
              input, state: {
                ...previous.state, guideCount: Math.max(0, previous.state.guideCount - 1),
                skippedGuideCount: previous.state.skippedGuideCount + 1,
                attachedGuideIds: previous.state.attachedGuideIds?.filter((id) => id !== guideId),
                notices: [...new Set([...(previous.state.notices ?? []), notice])],
              },
            });
          });
        },
      }).then((result) => {
        if (current && result.status === "ready") setRendered({ input, state: { ...result, status: "ready", error: null } });
      }).catch((error: unknown) => {
        if (current) setRendered({ input, state: {
          status: "error", error: error instanceof Error ? error.message : "헤어 메시를 생성하지 못했습니다.",
          guideCount: 0, triangleCount: 0, skippedGuideCount: 0,
        } });
      });
    };
    modelRoot?.addEventListener("added", rebuild);
    modelRoot?.addEventListener("removed", clear);
    rebuild();
    return () => {
      current = false;
      modelRoot?.removeEventListener("added", rebuild);
      modelRoot?.removeEventListener("removed", clear);
    };
  }, [document.groom, document.look.colors.hairBase, document.look.materialOverrides, document.topology.revision,
    head, h.captureRef, h.captureSceneGeneration, h.vrm, invalidateRef, modelKey, retryRevision, enabled, input]);
  const retry = useCallback(() => setRetryRevision((revision) => revision + 1), []);
  return {
    ...(rendered?.input === input ? rendered.state : {
      status: enabled && head ? "building" as const : "idle" as const, error: null,
      guideCount: 0, triangleCount: 0, skippedGuideCount: 0,
    }), supported: head !== null,
    reason: head ? null : "실제 머리 본이 있는 VRM 모델에서 헤어를 편집할 수 있습니다.",
    retry,
  };
}
