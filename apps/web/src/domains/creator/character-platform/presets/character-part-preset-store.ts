import {
  isCharacterPartPresetV1,
  parseCharacterPartPresetV1,
} from "./character-part-preset";

import type { CharacterPartPresetV1, CharacterPresetScope } from "./character-part-preset";

export const CHARACTER_PART_PRESET_STORAGE_KEY = "toonstudio.character-part-presets.v1";
const MAX_PRESETS = 500;
const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

export interface CharacterPresetStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CharacterPartPresetStoreSnapshot {
  readonly presets: readonly CharacterPartPresetV1[];
  readonly status: "idle" | "ready" | "error";
  readonly message: string | null;
  readonly revision: number;
}

export interface CharacterPartPresetQuery {
  readonly slot?: string;
  readonly kind?: CharacterPartPresetV1["kind"];
  readonly scope?: CharacterPresetScope;
  readonly text?: string;
}

export interface CharacterPartPresetStore {
  getSnapshot(): CharacterPartPresetStoreSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): void;
  list(query?: CharacterPartPresetQuery): readonly CharacterPartPresetV1[];
  save(preset: CharacterPartPresetV1): CharacterPartPresetStoreSnapshot;
  remove(presetId: string): CharacterPartPresetStoreSnapshot;
  clear(): CharacterPartPresetStoreSnapshot;
}

const EMPTY_SNAPSHOT: CharacterPartPresetStoreSnapshot = Object.freeze({
  presets: Object.freeze([]),
  status: "idle",
  message: null,
  revision: 0,
});

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function sortPresets(values: readonly CharacterPartPresetV1[]): readonly CharacterPartPresetV1[] {
  return Object.freeze([...values].sort((left, right) => {
    const date = right.updatedAt.localeCompare(left.updatedAt);
    return date !== 0 ? date : left.presetId.localeCompare(right.presetId);
  }));
}

function parseStored(raw: string | null): readonly CharacterPartPresetV1[] {
  if (raw === null || raw.length === 0) return Object.freeze([]);
  if (new TextEncoder().encode(raw).byteLength > MAX_SERIALIZED_BYTES) {
    throw new Error("저장된 캐릭터 프리셋 데이터가 허용 크기를 넘었습니다.");
  }
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > MAX_PRESETS) {
    throw new Error("저장된 캐릭터 프리셋 목록이 올바르지 않습니다.");
  }
  if (!value.every(isCharacterPartPresetV1)) {
    throw new Error("일부 캐릭터 프리셋 형식이 올바르지 않습니다.");
  }
  return sortPresets(value.map(parseCharacterPartPresetV1));
}

function queryPresets(
  presets: readonly CharacterPartPresetV1[],
  query: CharacterPartPresetQuery,
): readonly CharacterPartPresetV1[] {
  const text = normalizeText(query.text ?? "");
  return Object.freeze(presets.filter((preset) => {
    if (query.kind && preset.kind !== query.kind) return false;
    if (query.scope && preset.scope !== query.scope) return false;
    if (query.slot && preset.payload.slot !== query.slot) return false;
    if (!text) return true;
    const searchable = normalizeText([
      preset.name,
      preset.description,
      preset.tags.join(" "),
      preset.payload.slot ?? "",
    ].join(" "));
    return searchable.includes(text);
  }));
}

export function createCharacterPartPresetStore(
  storageFactory: () => CharacterPresetStorageLike | null,
): CharacterPartPresetStore {
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_SNAPSHOT;

  const publish = (next: CharacterPartPresetStoreSnapshot): CharacterPartPresetStoreSnapshot => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
    return snapshot;
  };

  const persist = (presets: readonly CharacterPartPresetV1[]): CharacterPartPresetStoreSnapshot => {
    try {
      const storage = storageFactory();
      if (!storage) throw new Error("이 환경에서는 프리셋을 저장할 수 없습니다.");
      const serialized = JSON.stringify(presets);
      if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) {
        throw new Error("프리셋 저장 공간이 가득 찼습니다. 사용하지 않는 프리셋을 삭제해 주세요.");
      }
      storage.setItem(CHARACTER_PART_PRESET_STORAGE_KEY, serialized);
      return publish({
        presets: sortPresets(presets),
        status: "ready",
        message: null,
        revision: snapshot.revision + 1,
      });
    } catch (error) {
      return publish({
        ...snapshot,
        status: "error",
        message: error instanceof Error ? error.message : "프리셋을 저장하지 못했습니다.",
        revision: snapshot.revision + 1,
      });
    }
  };

  const refresh = (): void => {
    try {
      const storage = storageFactory();
      const presets = storage ? parseStored(storage.getItem(CHARACTER_PART_PRESET_STORAGE_KEY)) : Object.freeze([]);
      publish({ presets, status: "ready", message: null, revision: snapshot.revision + 1 });
    } catch (error) {
      publish({
        presets: Object.freeze([]),
        status: "error",
        message: error instanceof Error ? error.message : "프리셋을 읽지 못했습니다.",
        revision: snapshot.revision + 1,
      });
    }
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    list(query: CharacterPartPresetQuery = {}) {
      return queryPresets(snapshot.presets, query);
    },
    save(presetInput: CharacterPartPresetV1) {
      const preset = parseCharacterPartPresetV1(presetInput);
      const existing = snapshot.presets.find((item) => item.presetId === preset.presetId);
      const nextPreset: CharacterPartPresetV1 = existing
        ? Object.freeze({
            ...preset,
            version: existing.version + 1,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
          })
        : preset;
      const next = [nextPreset, ...snapshot.presets.filter((item) => item.presetId !== preset.presetId)].slice(0, MAX_PRESETS);
      return persist(next);
    },
    remove(presetId: string) {
      return persist(snapshot.presets.filter((item) => item.presetId !== presetId));
    },
    clear() {
      try {
        storageFactory()?.removeItem?.(CHARACTER_PART_PRESET_STORAGE_KEY);
      } catch {
        return publish({ ...snapshot, status: "error", message: "프리셋을 지우지 못했습니다.", revision: snapshot.revision + 1 });
      }
      return publish({ presets: Object.freeze([]), status: "ready", message: null, revision: snapshot.revision + 1 });
    },
  });
}
