import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type * as THREE from "three";

import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import { captureStudioVrmRgba, encodeStudioVrmCapturePngBlob } from "../../vrm/studio-vrm-raster-capture";

interface CharacterRuntimeThumbnailRecord {
  readonly modelId: string;
  readonly signature: string;
  readonly source: symbol | null;
  readonly entryIds: ReadonlySet<string>;
  readonly url: string;
  readonly createdAt: number;
}

interface CharacterRuntimeThumbnailState {
  readonly activeModelId: string | null;
  readonly activeSignature: string | null;
  readonly activeSource: symbol | null;
  readonly owner: object | null;
  readonly records: ReadonlyMap<string, CharacterRuntimeThumbnailRecord>;
  readonly revision: number;
}

const listeners = new Set<() => void>();
// Cached PNGs must not keep disposed VRMs, their geometry, or their CPU textures alive.
const sourceIdentities = new WeakMap<object, symbol>();
let state: CharacterRuntimeThumbnailState = Object.freeze({ activeModelId: null, activeSignature: null, activeSource: null, owner: null, records: new Map(), revision: 0 });

function sourceIdentity(source: unknown): symbol | null {
  if (source === null || typeof source !== "object") return null;
  let identity = sourceIdentities.get(source);
  if (!identity) {
    identity = Symbol("character-thumbnail-source");
    sourceIdentities.set(source, identity);
  }
  return identity;
}

function publish(next: CharacterRuntimeThumbnailState): void {
  state = Object.freeze(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setActiveAppearance(owner: object, modelId: string | null, signature: string | null, source: symbol | null): void {
  if (state.owner === owner && state.activeModelId === modelId
    && state.activeSignature === signature && state.activeSource === source) return;
  publish({ ...state, owner, activeModelId: modelId, activeSignature: signature, activeSource: source, revision: state.revision + 1 });
}

function appearanceSignature(h: StudioVrmPoserHost, binding: CharacterShaperBinding): string {
  // Catalog IDs alone omit custom fit, pose, face and hair values within the same selected card.
  return JSON.stringify({
    recipe: binding.recipe,
    snapshot: binding.snapshot,
    fullState: typeof h.captureFullState === "function" ? h.captureFullState() : h.avatarForgeState,
    transparent: Boolean(h.transparentBackground),
    mannequin: Boolean(h.mannequinMode),
    rigJointProfile: h.rigJointProfile,
    fullBodyIkEnabled: h.fullBodyIkEnabled,
    footPlantEnabled: h.footPlantEnabled,
    rigFloorHeight: h.rigFloorHeight,
    paintRevision: h.texturePaintRuntimeRef?.current?.getContentRevision(),
  });
}

function captureAllowed(h: StudioVrmPoserHost, binding: CharacterShaperBinding): boolean {
  return h.status === "ready" && !binding.previewEntryId && !binding.compareActive && !binding.busyReason
    && !h.isCapturing && !h.isThumbnailCapturing && !h.isSharingPose && !h.texturePaintStrokeActive
    && !h.persistentIkReconciling && !h.jointHandleInteracting && !h.isViewportHandIkDragging;
}

function captureSize(capture: { readonly gl: Pick<THREE.WebGLRenderer, "domElement">; readonly camera: THREE.Camera }): { width: number; height: number } {
  const perspective = capture.camera as THREE.PerspectiveCamera;
  const aspect = perspective.isPerspectiveCamera ? perspective.aspect
    : capture.gl.domElement?.width / capture.gl.domElement?.height;
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: 256, height: 320 };
  return aspect >= 1
    ? { width: 320, height: Math.max(1, Math.round(320 / aspect)) }
    : { width: Math.max(1, Math.round(320 * aspect)), height: 320 };
}

function revoke(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

function recordThumbnail(record: CharacterRuntimeThumbnailRecord): void {
  const records = new Map(state.records);
  const previous = records.get(record.modelId);
  if (previous && previous.url !== record.url) revoke(previous.url);
  records.set(record.modelId, record);
  const ordered = [...records.values()].sort((left, right) => right.createdAt - left.createdAt);
  for (const stale of ordered.slice(8)) {
    records.delete(stale.modelId);
    revoke(stale.url);
  }
  publish({ ...state, records, revision: state.revision + 1 });
}

function selectedEntryIds(recipe: CharacterShaperBinding["recipe"]): readonly string[] {
  const ids = new Set<string>();
  for (const value of Object.values(recipe.slots)) {
    if (typeof value === "string" && value.length > 0) ids.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string" && item.length > 0) ids.add(item);
    }
  }
  return Object.freeze([...ids].sort(compareCodeUnitStrings));
}

function thumbnailFor(entryId: string): string | null {
  const modelId = state.activeModelId;
  if (!modelId) return null;
  const record = state.records.get(modelId);
  return record?.signature === state.activeSignature && record?.source === state.activeSource
    && record?.entryIds.has(entryId) ? record.url : null;
}

export function useCharacterRuntimeThumbnail(entryId: string): string | null {
  return useSyncExternalStore(subscribe, () => thumbnailFor(entryId), () => null);
}

export function clearCharacterRuntimeThumbnails(): void {
  for (const record of state.records.values()) revoke(record.url);
  publish({ activeModelId: null, activeSignature: null, activeSource: null, owner: null, records: new Map(), revision: state.revision + 1 });
}

export function CharacterRuntimeThumbnailRecorder({ h, binding }: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
}) {
  const ownerRef = useRef({});
  const liveRef = useRef({ h, binding });
  const modelId = typeof h.activeModelId === "string" ? h.activeModelId : null;
  const capture = h.captureRef?.current;
  const source = sourceIdentity(h.vrm ?? capture?.scene);
  const signature = appearanceSignature(h, binding);
  const allowed = captureAllowed(h, binding);
  const owner = ownerRef.current;

  useLayoutEffect(() => {
    liveRef.current = { h, binding };
    setActiveAppearance(owner, modelId, allowed ? signature : null, source);
  });
  useLayoutEffect(() => () => {
    if (state.owner === owner) {
      publish({ ...state, owner: null, activeModelId: null, activeSignature: null, activeSource: null, revision: state.revision + 1 });
    }
  }, [owner]);

  useEffect(() => {
    const ids = selectedEntryIds(binding.recipe);
    const previous = modelId ? state.records.get(modelId) : null;
    if (!modelId || !allowed || ids.length === 0 ||
      (previous?.signature === signature && previous.source === source)) return;
    if (!capture?.gl || !capture.scene || !capture.camera) return;
    // captureRef.current is mutable; retain the identities that produced these pixels.
    const { gl, scene, camera } = capture;
    const controller = new AbortController();
    const isCurrent = () => {
      const live = liveRef.current;
      const currentCapture = live.h.captureRef?.current;
      return !controller.signal.aborted && state.owner === owner && captureAllowed(live.h, live.binding)
        && live.h.activeModelId === modelId && sourceIdentity(live.h.vrm ?? currentCapture?.scene) === source
        && currentCapture?.gl === gl && currentCapture?.scene === scene
        && currentCapture?.camera === camera && appearanceSignature(live.h, live.binding) === signature;
    };
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (!isCurrent()) return;
          const host = liveRef.current.h;
          // Capture shares the same synchronous render authority as exports and library thumbnails.
          // Release all scene mutations before the Worker encode yields to other editor actions.
          if (typeof host.acquireVrmCaptureOperation !== "function"
            || typeof host.releaseVrmCaptureOperation !== "function"
            || !host.acquireVrmCaptureOperation("thumbnail")) return;
          let releaseHelpers: (() => void) | undefined;
          const size = captureSize({ gl, camera });
          const visualIdentity = host.captureVisualAuthorityRef?.current?.identity;
          let rgba: Uint8ClampedArray;
          try {
            releaseHelpers = host.acquireVrmCaptureHelperLease?.({ subjectOnly: true });
            rgba = captureStudioVrmRgba(gl, scene, camera, size, { alpha: 0 });
          } finally {
            try { releaseHelpers?.(); } finally { host.releaseVrmCaptureOperation("thumbnail"); }
          }
          const blob = await encodeStudioVrmCapturePngBlob(rgba, size, { signal: controller.signal });
          if (!isCurrent() || liveRef.current.h.captureVisualAuthorityRef?.current?.identity !== visualIdentity
            || typeof URL.createObjectURL !== "function") return;
          const url = URL.createObjectURL(blob);
          recordThumbnail(Object.freeze({ modelId, signature, source, entryIds: new Set(ids), url, createdAt: Date.now() }));
        } catch {
          // Failed or superseded captures retain the clearly labelled diagram fallback.
        }
      })();
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [allowed, binding.recipe, capture, modelId, owner, signature, source]);

  return null;
}
