import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

export interface StudioBg3dCanonicalDocumentSnapshot {
  readonly revision: number;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

export interface StudioBg3dCanonicalDocumentMutation {
  readonly primitives?: readonly BgPrimitive[];
  readonly customModels?: readonly BgCustomModelInstance[];
  readonly document?: StudioBg3dSceneDocument;
}

function resolveAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === "function"
    ? (action as (value: T) => T)(current)
    : action;
}

export function useStudioBg3dCanonicalDocumentState(input: {
  readonly initialScene?: StudioBg3dSceneDocument;
}) {
  const initialDocument = normalizeStudioBg3dSceneDocument(
    input.initialScene ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  );
  const [primitives, setPrimitivesState] = useState<BgPrimitive[]>([]);
  const [customModels, setCustomModelsState] = useState<BgCustomModelInstance[]>([]);
  const [sceneBaseDocument, setSceneBaseDocumentState] = useState(initialDocument);
  const [canonicalRevision, setCanonicalRevision] = useState(0);
  const liveSceneRef = useRef<{
    primitives: BgPrimitive[];
    customModels: BgCustomModelInstance[];
    document: StudioBg3dSceneDocument;
    revision: number;
  }>({ primitives: [], customModels: [], document: initialDocument, revision: 0 });

  const replaceCanonicalDocumentState = useCallback((mutation: StudioBg3dCanonicalDocumentMutation) => {
    const current = liveSceneRef.current;
    const nextPrimitives = mutation.primitives
      ? [...mutation.primitives]
      : current.primitives;
    const nextModels = mutation.customModels
      ? [...mutation.customModels]
      : current.customModels;
    const nextDocument = mutation.document
      ? normalizeStudioBg3dSceneDocument(mutation.document)
      : current.document;
    if (
      nextPrimitives === current.primitives
      && nextModels === current.customModels
      && nextDocument === current.document
    ) return current;
    const next = {
      primitives: nextPrimitives,
      customModels: nextModels,
      document: nextDocument,
      revision: current.revision + 1,
    };
    liveSceneRef.current = next;
    if (nextPrimitives !== current.primitives) setPrimitivesState(nextPrimitives);
    if (nextModels !== current.customModels) setCustomModelsState(nextModels);
    if (nextDocument !== current.document) setSceneBaseDocumentState(nextDocument);
    setCanonicalRevision(next.revision);
    return next;
  }, []);

  const setPrimitives = useCallback<Dispatch<SetStateAction<BgPrimitive[]>>>((action) => {
    const next = resolveAction(action, liveSceneRef.current.primitives);
    replaceCanonicalDocumentState({ primitives: next });
  }, [replaceCanonicalDocumentState]);
  const setCustomModels = useCallback<Dispatch<SetStateAction<BgCustomModelInstance[]>>>((action) => {
    const next = resolveAction(action, liveSceneRef.current.customModels);
    replaceCanonicalDocumentState({ customModels: next });
  }, [replaceCanonicalDocumentState]);
  const setSceneBaseDocument = useCallback<Dispatch<SetStateAction<StudioBg3dSceneDocument>>>((action) => {
    const next = resolveAction(action, liveSceneRef.current.document);
    replaceCanonicalDocumentState({ document: next });
  }, [replaceCanonicalDocumentState]);
