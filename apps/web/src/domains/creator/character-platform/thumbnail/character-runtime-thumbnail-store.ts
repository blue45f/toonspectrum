import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import { captureStudioVrmRgba, encodeStudioVrmCapturePngBlob } from "../../vrm/studio-vrm-raster-capture";

interface CharacterRuntimeThumbnailRecord {
  readonly modelId: string;
  readonly signature: string;
  readonly entryIds: ReadonlySet<string>;
  readonly url: string;
  readonly createdAt: number;
}

interface CharacterRuntimeThumbnailState {
  readonly activeModelId: string | null;
  readonly records: ReadonlyMap<string, CharacterRuntimeThumbnailRecord>;
  readonly revision: number;
}

const listeners = new Set<() => void>();
let state: CharacterRuntimeThumbnailState = Object.freeze({ activeModelId: null, records: new Map(), revision: 0 });

function publish(next: CharacterRuntimeThumbnailState): void {
  state = Object.freeze(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setActiveModel(modelId: string | null): void {
  if (state.activeModelId === modelId) return;
  publish({ ...state, activeModelId: modelId, revision: state.revision + 1 });
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
  return record?.entryIds.has(entryId) ? record.url : null;
}

export function useCharacterRuntimeThumbnail(entryId: string): string | null {
  return useSyncExternalStore(subscribe, () => thumbnailFor(entryId), () => null);
}

export function clearCharacterRuntimeThumbnails(): void {
  for (const record of state.records.values()) revoke(record.url);
  publish({ activeModelId: null, records: new Map(), revision: state.revision + 1 });
}

export function CharacterRuntimeThumbnailRecorder({ h, binding }: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
}) {
  const aliveRef = useRef(true);
  const capturedSignatureRef = useRef<string | null>(null);
  const modelId = typeof h.activeModelId === "string" ? h.activeModelId : null;
  const ids = useMemo(() => selectedEntryIds(binding.recipe), [binding.recipe]);
  const signature = useMemo(
    () => `${modelId ?? "none"}|${JSON.stringify(binding.recipe)}|${Boolean(h.transparentBackground)}`,
    [modelId, binding.recipe, h.transparentBackground],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  useEffect(() => { setActiveModel(modelId); }, [modelId]);

  useEffect(() => {
    if (!modelId || h.status !== "ready" || ids.length === 0 || capturedSignatureRef.current === signature) return;
    const capture = h.captureRef?.current;
    if (!capture?.gl || !capture.scene || !capture.camera) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let release: (() => void) | null = null;
        try {
          release = typeof h.acquireVrmCaptureHelperLease === "function"
            ? h.acquireVrmCaptureHelperLease({ subjectOnly: true })
            : null;
          const size = { width: 256, height: 320 };
          const rgba = captureStudioVrmRgba(capture.gl, capture.scene, capture.camera, size, { alpha: 0 });
          const blob = await encodeStudioVrmCapturePngBlob(rgba, size);
          if (cancelled || !aliveRef.current || typeof URL.createObjectURL !== "function") return;
          const url = URL.createObjectURL(blob);
          recordThumbnail(Object.freeze({
            modelId,
            signature,
            entryIds: new Set(ids),
            url,
            createdAt: Date.now(),
          }));
          capturedSignatureRef.current = signature;
        } catch {
          // Runtime thumbnail is an enhancement; the deterministic SVG remains the safe fallback.
        } finally {
          release?.();
        }
      })();
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [h, ids, modelId, signature]);

  return null;
}
