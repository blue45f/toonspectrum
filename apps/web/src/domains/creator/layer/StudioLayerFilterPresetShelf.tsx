import { BookmarkPlus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { ChangeEvent, FormEvent } from "react";

import {
  STUDIO_LAYER_FILTER_PRESET_LIMIT,
  STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY,
  cloneStudioLayerNavigatorFilters,
  parseStudioLayerFilterPresets,
  removeStudioLayerFilterPreset,
  saveStudioLayerFilterPreset,
  serializeStudioLayerFilterPresets,
  type StudioLayerFilterPreset,
} from "./studio-layer-filter-presets";
import {
  countActiveStudioLayerFilters,
  type StudioLayerNavigatorFilters,
} from "./studio-layer-navigator";
import {
  STUDIO_LAYER_NAVIGATOR_COARSE_TARGET as coarseTarget,
  STUDIO_LAYER_NAVIGATOR_FOCUS_RING as focusRing,
} from "./studio-layer-navigator-row-ui";

import { cn } from "@/shared/lib/utils";

export interface StudioLayerFilterPresetShelfProps {
  filters: StudioLayerNavigatorFilters;
  setFilters: (
    updater: (current: StudioLayerNavigatorFilters) => StudioLayerNavigatorFilters
  ) => void;
}

function readPresets(): readonly StudioLayerFilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStudioLayerFilterPresets(window.localStorage.getItem(STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function StudioLayerFilterPresetShelf({
  filters,
  setFilters,
}: StudioLayerFilterPresetShelfProps) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<readonly StudioLayerFilterPreset[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeFilterCount = countActiveStudioLayerFilters(filters);
  const normalizedName = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const matchingPreset = presets.find(
    (preset) => preset.name.toLocaleLowerCase("ko-KR") === normalizedName.toLocaleLowerCase("ko-KR")
  );
  const canSave =
    activeFilterCount > 0 &&
    normalizedName.length > 0 &&
    (presets.length < STUDIO_LAYER_FILTER_PRESET_LIMIT || matchingPreset !== undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPresets(readPresets());
    setStorageReady(true);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY) return;
      setPresets(parseStudioLayerFilterPresets(event.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !storageReady) return;
    try {
      const serialized = serializeStudioLayerFilterPresets(presets);
      if (window.localStorage.getItem(STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY) === serialized) return;
      window.localStorage.setItem(STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY, serialized);
    } catch {
      // 사생활 보호 모드·스토리지 할당량 오류에서도 현재 세션의 프리셋은 유지한다.
    }
  }, [presets, storageReady]);

  function savePreset() {
    if (!canSave) return;
    setPresets((current) =>
      saveStudioLayerFilterPreset(current, {
        name: normalizedName,
        filters,
      })
    );
    setAnnouncement(`${normalizedName} 조건 프리셋을 저장했습니다.`);
    setName("");
  }

  function applyPreset(preset: StudioLayerFilterPreset) {
    setFilters(() => cloneStudioLayerNavigatorFilters(preset.filters));
    setAnnouncement(`${preset.name} 조건 프리셋을 적용했습니다.`);
  }

  function deletePreset(preset: StudioLayerFilterPreset) {
    setPresets((current) => removeStudioLayerFilterPreset(current, preset.id));
    setAnnouncement(`${preset.name} 조건 프리셋을 삭제했습니다.`);
  }

  return (
    <section
      className="mt-3 rounded-lg border border-line bg-card/60 p-2.5"
      aria-labelledby={`${inputId}-title`}
      data-studio-layer-filter-presets="true"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 id={`${inputId}-title`} className="text-[0.65rem] font-bold text-fg-2">조건 프리셋</h4>
          <p className="text-[0.58rem] text-fg-3">현재 구조 필터와 스마트 보기를 브라우저에 저장합니다.</p>
        </div>
        <span className="shrink-0 rounded-full bg-raised px-1.5 py-0.5 text-[0.55rem] tabular-nums text-fg-3">
          {presets.length}/{STUDIO_LAYER_FILTER_PRESET_LIMIT}
        </span>
      </div>

      <form
        className="mt-2 flex gap-1.5"
        data-studio-layer-filter-preset-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          savePreset();
        }}
      >
        <label htmlFor={inputId} className="sr-only">새 레이어 조건 프리셋 이름</label>
        <input
          id={inputId}
          value={name}
          maxLength={40}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          placeholder={activeFilterCount > 0 ? "예: 선화 검수" : "먼저 필터를 선택하세요"}
          className={cn(
            "min-h-9 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-xs text-fg placeholder:text-fg-3 max-lg:min-h-11 pointer-coarse:min-h-11",
            focusRing
          )}
        />
        <button
          type="submit"
          disabled={!canSave}
          className={cn(
            "inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-line bg-panel px-2 text-[0.62rem] font-semibold text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
            coarseTarget,
            focusRing
          )}
          aria-label={matchingPreset ? `${matchingPreset.name} 조건 프리셋 덮어쓰기` : "현재 레이어 필터 조건 저장"}
        >
          <BookmarkPlus size={12} />
          {matchingPreset ? "갱신" : "저장"}
        </button>
      </form>

      {presets.length > 0 ? (
        <ul className="mt-2 grid gap-1" aria-label="저장된 레이어 조건 프리셋">
          {presets.map((preset) => (
            <li key={preset.id} className="flex min-w-0 items-center gap-1 rounded-md border border-line/70 bg-panel/70 p-1">
              <button
                type="button"
                data-studio-layer-filter-preset={preset.id}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "min-h-8 min-w-0 flex-1 truncate rounded px-2 text-left text-[0.62rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                  coarseTarget,
                  focusRing
                )}
                title={`${preset.name} 적용`}
              >
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => deletePreset(preset)}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded text-fg-3 hover:bg-bad/10 hover:text-bad",
                  coarseTarget,
                  focusRing
                )}
                aria-label={`${preset.name} 조건 프리셋 삭제`}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-md border border-dashed border-line px-2 py-1.5 text-[0.58rem] text-fg-3">
          반복 작업용 조건을 최대 {STUDIO_LAYER_FILTER_PRESET_LIMIT}개 저장할 수 있습니다. 검색 문구는 저장하지 않습니다.
        </p>
      )}

      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </section>
  );
}
