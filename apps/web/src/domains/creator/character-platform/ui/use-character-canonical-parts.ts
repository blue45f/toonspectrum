import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  inspectCharacterCanonicalPartAvailability,
} from "../assets/character-canonical-part-plan";
import {
  CharacterCanonicalPartSession,
} from "../assets/character-canonical-part-runtime";
import {
  evaluateCharacterProductionLibraryReadiness,
} from "../assets/character-production-library-readiness";

import type {
  CharacterCanonicalManifestV2,
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartSlot,
} from "../assets/character-canonical-manifest";
import type { CharacterProductionLibraryReadiness } from "../assets/character-production-library-readiness";
import type { StudioAsyncKeyValueStore } from "../../studio-local-database";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

const STORE_NAMESPACE = "studio-character-canonical-parts-v12";
const SLOT_SET = new Set<CharacterCanonicalPartSlot>([
  "eyes",
  "irises",
  "nose",
  "mouth",
  "ears",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
]);

let storageTail: Promise<unknown> = Promise.resolve();

type Selections = Readonly<Partial<Record<CharacterCanonicalPartSlot, string>>>;

export interface CharacterCanonicalPartOption {
  readonly part: CharacterCanonicalPartDescriptor;
  readonly status: "supported" | "unavailable";
  readonly reason: string | null;
  readonly selected: boolean;
}

export interface CharacterCanonicalPartsWorkbench {
  readonly options: readonly CharacterCanonicalPartOption[];
  readonly selections: Selections;
  readonly readiness: CharacterProductionLibraryReadiness | null;
  readonly busyPartId: string | null;
  readonly error: string | null;
  readonly apply: (partId: string) => Promise<boolean>;
  readonly remove: (slot: CharacterCanonicalPartSlot) => Promise<boolean>;
  readonly clear: () => Promise<void>;
}

function withStorage<T>(operation: (storage: StudioAsyncKeyValueStore) => Promise<T>): Promise<T> {
  const run = async () => {
    const { acquireStudioLocalDatabase } = await import("../../studio-local-database-runtime");
    const database = await acquireStudioLocalDatabase();
    return operation(database.asAsyncKeyValueStore(STORE_NAMESPACE));
  };
  const result = storageTail.then(run, run);
  storageTail = result.then(() => undefined, () => undefined);
  return result;
}

function selectionRecord(value: unknown): Partial<Record<CharacterCanonicalPartSlot, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<CharacterCanonicalPartSlot, string>> = {};
  for (const [rawSlot, rawPartId] of Object.entries(value)) {
    const slot = rawSlot as CharacterCanonicalPartSlot;
    if (!SLOT_SET.has(slot)) continue;
    if (typeof rawPartId !== "string" || rawPartId.length === 0 || rawPartId.length > 512) continue;
    result[slot] = rawPartId;
  }
  return result;
}

async function readSelections(modelId: string): Promise<Selections> {
  return withStorage(async (storage) => {
    const raw = await storage.get(modelId);
    if (!raw) return Object.freeze({});
    try {
      return Object.freeze(selectionRecord(JSON.parse(raw)));
    } catch {
      return Object.freeze({});
    }
  });
}

async function writeSelections(modelId: string, selections: Selections): Promise<void> {
  const serialized = JSON.stringify(selections);
  if (serialized.length > 32 * 1024) throw new Error("캐릭터 파츠 선택 데이터가 허용 크기를 넘었습니다.");
  await withStorage((storage) => storage.set(modelId, serialized));
}

function viewportProjectedHeight(h: StudioVrmPoserHost): number {
  const canvas = h.captureRef?.current?.gl?.domElement as HTMLCanvasElement | undefined;
  const height = canvas?.clientHeight || canvas?.height || 2048;
  return Number.isFinite(height) && height > 0 ? height : 2048;
}

export function useCharacterCanonicalParts(input: {
  readonly h: StudioVrmPoserHost;
  readonly manifest: CharacterCanonicalManifestV2 | null;
  readonly modelId: string;
  readonly onNotice: (message: string) => void;
}): CharacterCanonicalPartsWorkbench {
  const { h, manifest, modelId, onNotice } = input;
  const sessionRef = useRef<CharacterCanonicalPartSession | null>(null);
  const generationRef = useRef(0);
  const [selections, setSelections] = useState<Selections>(Object.freeze({}));
  const [busyPartId, setBusyPartId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generation = ++generationRef.current;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSelections(Object.freeze({}));
    setBusyPartId(null);
    setError(null);
    if (!manifest || !h.vrm) return;

    const session = new CharacterCanonicalPartSession({ targetVrm: h.vrm, manifest });
    sessionRef.current = session;
    let active = true;
    void readSelections(modelId).then(async (saved) => {
      for (const [slot, partId] of Object.entries(saved) as [CharacterCanonicalPartSlot, string][]) {
        if (!active || generation !== generationRef.current) return;
        const part = manifest.parts?.find((entry) => entry.id === partId && entry.slot === slot);
        if (!part) continue;
        const availability = inspectCharacterCanonicalPartAvailability(manifest, part);
        if (availability.status !== "supported") continue;
        try {
          await session.apply(part, viewportProjectedHeight(h));
        } catch (restoreError) {
          if (!active || generation !== generationRef.current) return;
          setError(restoreError instanceof Error ? restoreError.message : `${part.label} 파츠를 복원하지 못했습니다.`);
        }
      }
      if (!active || generation !== generationRef.current) return;
      const restored = session.selections;
      setSelections(restored);
      await writeSelections(modelId, restored);
    }).catch((restoreError: unknown) => {
      if (!active || generation !== generationRef.current) return;
      setError(restoreError instanceof Error ? restoreError.message : "캐릭터 파츠 선택을 복원하지 못했습니다.");
    });

    return () => {
      active = false;
      if (sessionRef.current === session) sessionRef.current = null;
      session.dispose();
    };
  }, [h, h.vrm, manifest, modelId]);

  const options = useMemo<readonly CharacterCanonicalPartOption[]>(() => {
    if (!manifest) return Object.freeze([]);
    return Object.freeze((manifest.parts ?? []).map((part) => {
      const availability = inspectCharacterCanonicalPartAvailability(manifest, part);
      return Object.freeze({
        part,
        status: availability.status,
        reason: availability.reason,
        selected: selections[part.slot] === part.id,
      });
    }));
  }, [manifest, selections]);

  const readiness = useMemo(() => (
    manifest ? evaluateCharacterProductionLibraryReadiness(manifest) : null
  ), [manifest]);

  const apply = useCallback(async (partId: string): Promise<boolean> => {
    if (!manifest || !sessionRef.current || busyPartId) return false;
    const part = manifest.parts?.find((entry) => entry.id === partId);
    if (!part) {
      setError("선택한 canonical 파츠를 현재 매니페스트에서 찾지 못했습니다.");
      return false;
    }
    const availability = inspectCharacterCanonicalPartAvailability(manifest, part);
    if (availability.status !== "supported") {
      setError(availability.reason);
      onNotice(availability.reason);
      return false;
    }
    const generation = generationRef.current;
    setBusyPartId(part.id);
    setError(null);
    try {
      const installed = await sessionRef.current.apply(part, viewportProjectedHeight(h));
      if (generation !== generationRef.current || !sessionRef.current) return false;
      const next = sessionRef.current.selections;
      setSelections(next);
      await writeSelections(modelId, next);
      onNotice(`${part.label} · 실제 메시 ${installed.meshCount}개를 적용했습니다.`);
      return true;
    } catch (applyError) {
      if (generation !== generationRef.current) return false;
      const message = applyError instanceof Error ? applyError.message : `${part.label} 파츠를 적용하지 못했습니다.`;
      setError(message);
      onNotice(message);
      return false;
    } finally {
      if (generation === generationRef.current) setBusyPartId(null);
    }
  }, [busyPartId, h, manifest, modelId, onNotice]);

  const remove = useCallback(async (slot: CharacterCanonicalPartSlot): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session || busyPartId) return false;
    if (!session.remove(slot)) return false;
    const next = session.selections;
    setSelections(next);
    setError(null);
    await writeSelections(modelId, next);
    onNotice(`${slot} 파츠를 원본 상태로 되돌렸습니다.`);
    return true;
  }, [busyPartId, modelId, onNotice]);

  const clear = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session || busyPartId) return;
    for (const slot of SLOT_SET) session.remove(slot);
    const next = session.selections;
    setSelections(next);
    setError(null);
    await writeSelections(modelId, next);
    onNotice("교체 파츠를 모두 해제하고 원본 모델을 복원했습니다.");
  }, [busyPartId, modelId, onNotice]);

  return Object.freeze({
    options,
    selections,
    readiness,
    busyPartId,
    error,
    apply,
    remove,
    clear,
  });
}
