/**
 * Magma/Photopea-style reorderable smart filter stack for image elements.
 * Catalog with rich descriptions + stack management (enable, reorder, delete, params).
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import {
  STUDIO_ADJUSTMENT_ENGINE_IDS,
  appendStudioAdjustmentEntry,
  normalizeStudioAdjustmentStack,
  removeStudioAdjustmentEntry,
  reorderStudioAdjustmentEntry,
  setStudioAdjustmentEntryEnabled,
  studioAdjustmentEngineLabel,
  type StudioAdjustmentEngineId,
  type StudioAdjustmentStack,
} from "./studio-adjustment-stack";
import {
  STUDIO_FILTER_CATALOG,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
  type StudioFilterCatalogEntry,
} from "./studio-tool-hints";
import { StudioToolHintTarget } from "./StudioToolHint";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

function defaultParamsForEngine(engine: StudioAdjustmentEngineId): Record<string, number | boolean> {
  switch (engine) {
    case "blur":
      return { radius: 2 };
    case "gaussian-blur":
      return { radius: 8, strength: 70 };
    case "motion-blur":
      return { radius: 18, strength: 85, angle: 0 };
    case "brightness-contrast":
      return { brightness: 0, contrast: 0 };
    case "hue-saturation":
      return { hue: 0, saturation: 0 };
    case "levels":
      return { black: 0, white: 255, gamma: 1 };
    case "sharpen":
      return { amount: 0.3 };
    case "noise":
      return { amount: 0.1 };
    default:
      return {};
  }
}

function catalogForEngine(engine: StudioAdjustmentEngineId): StudioFilterCatalogEntry | null {
  return studioFilterCatalogEntry(engine);
}

export function StudioSmartFiltersPanel({
  stack,
  onChange,
}: {
  stack: StudioAdjustmentStack | undefined;
  onChange: (next: StudioAdjustmentStack) => void;
}): React.ReactElement {
  const current = normalizeStudioAdjustmentStack(stack);

  function patch(next: StudioAdjustmentStack) {
    onChange(normalizeStudioAdjustmentStack(next));
  }

  function addEngine(engine: StudioAdjustmentEngineId) {
    if (!STUDIO_ADJUSTMENT_ENGINE_IDS.includes(engine)) return;
    patch(appendStudioAdjustmentEntry(current, { engine, params: defaultParamsForEngine(engine) }));
  }

  const groups: StudioFilterCatalogEntry["group"][] = ["blur", "tone", "color", "detail"];

  return (
    <div className="space-y-2.5" data-studio-filter-manager="true">
      <div>
        <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">필터 관리</p>
        <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
          Magma·Photopea 스타일로 비파괴 필터를 쌓습니다. 가우시안/모션 블러·곡선·레벨 등을 순서대로
          적용하고 눈 아이콘으로 미리 끌 수 있어요.
        </p>
      </div>

      {/* Magma Filter menu style — grouped catalog chips with hover detail */}
      <div className="space-y-2 rounded-xl border border-line/70 bg-card/40 p-2">
        {groups.map((group) => {
          const items = STUDIO_FILTER_CATALOG.filter(
            (entry) =>
              entry.group === group &&
              STUDIO_ADJUSTMENT_ENGINE_IDS.includes(entry.engine as StudioAdjustmentEngineId)
          );
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-1 text-[0.58rem] font-bold uppercase tracking-wider text-fg-3">
                {studioFilterGroupLabel(group)}
              </p>
              <div className="flex flex-wrap gap-1">
                {items.map((entry) => (
                  <StudioToolHintTarget
                    key={entry.engine}
                    hint={{
                      id: entry.engine,
                      title: entry.title,
                      description: entry.description,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => addEngine(entry.engine as StudioAdjustmentEngineId)}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 rounded-lg border border-line/70 bg-canvas/50 px-2 text-[0.62rem] font-bold text-fg-2",
                        "hover:border-accent/45 hover:bg-accent-soft/40 hover:text-fg",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      )}
                    >
                      <Plus className="size-3" aria-hidden />
                      {entry.title}
                    </button>
                  </StudioToolHintTarget>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2">
          <Plus className="size-3.5" aria-hidden />
          <span className="sr-only">엔진 추가</span>
          <select
            className="max-w-[11rem] bg-transparent text-[0.65rem] font-semibold text-fg outline-none"
            defaultValue=""
            aria-label="필터 추가"
            onChange={(event) => {
              const engine = event.target.value as StudioAdjustmentEngineId;
              event.target.value = "";
              addEngine(engine);
            }}
          >
            <option value="" disabled>
              전체 필터 목록…
            </option>
            {STUDIO_ADJUSTMENT_ENGINE_IDS.map((engine) => (
              <option key={engine} value={engine}>
                {studioAdjustmentEngineLabel(engine)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current.entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-card/40 px-3 py-3 text-center text-[0.68rem] text-fg-3">
          스택이 비어 있어요. 위 카탈로그에서 가우시안·모션 블러나 곡선을 추가해 보세요.
        </p>
      ) : (
        <ul
          className="divide-y divide-line overflow-hidden rounded-xl border border-line"
          aria-label="스마트 필터 목록"
        >
          {current.entries.map((entry, index) => {
            const catalog = catalogForEngine(entry.engine);
            return (
              <li
                key={entry.id}
                className={cn(
                  "flex flex-col gap-1.5 bg-card/50 px-2 py-2",
                  !entry.enabled && "opacity-55"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right font-display text-[0.62rem] tabular-nums text-fg-3">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.72rem] font-semibold text-fg">
                      {studioAdjustmentEngineLabel(entry.engine)}
                    </p>
                    {catalog ? (
                      <p className="truncate text-[0.58rem] text-fg-3" title={catalog.description}>
                        {catalog.description}
                      </p>
                    ) : (
                      <p className="truncate text-[0.6rem] text-fg-3">{entry.engine}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={entry.enabled ? "비활성" : "활성"}
                    aria-pressed={entry.enabled}
                    title={entry.enabled ? "미리보기 끄기" : "미리보기 켜기"}
                    className={buttonClass({ size: "sm", variant: "quiet" })}
                    onClick={() =>
                      patch(setStudioAdjustmentEntryEnabled(current, entry.id, !entry.enabled))
                    }
                  >
                    {entry.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="위로"
                    title="스택에서 위로"
                    disabled={index === 0}
                    className={buttonClass({ size: "sm", variant: "quiet" })}
                    onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index - 1))}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="아래로"
                    title="스택에서 아래로"
                    disabled={index >= current.entries.length - 1}
                    className={buttonClass({ size: "sm", variant: "quiet" })}
                    onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index + 1))}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="삭제"
                    title="필터 제거"
                    className={buttonClass({ size: "sm", variant: "quiet" })}
                    onClick={() => patch(removeStudioAdjustmentEntry(current, entry.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {/* Magma-style blur param strip when relevant */}
                {entry.enabled &&
                (entry.engine === "gaussian-blur" ||
                  entry.engine === "motion-blur" ||
                  entry.engine === "blur") ? (
                  <div className="ml-6 flex flex-wrap items-center gap-2 text-[0.62rem] text-fg-3">
                    <label className="inline-flex items-center gap-1">
                      <span>{entry.engine === "motion-blur" ? "거리" : "반경"}</span>
                      <input
                        type="range"
                        min={1}
                        max={40}
                        value={Number(entry.params.radius ?? 8)}
                        onChange={(e) => {
                          const radius = Number(e.target.value);
                          const entries = current.entries.map((item) =>
                            item.id === entry.id
                              ? { ...item, params: { ...item.params, radius } }
                              : item
                          );
                          patch({ ...current, entries });
                        }}
                        className="w-20 accent-accent"
                        aria-label="블러 반경"
                      />
                      <span className="w-5 tabular-nums">{Number(entry.params.radius ?? 8)}</span>
                    </label>
                    {entry.engine !== "blur" ? (
                      <label className="inline-flex items-center gap-1">
                        <span>세기</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Number(entry.params.strength ?? 70)}
                          onChange={(e) => {
                            const strength = Number(e.target.value);
                            const entries = current.entries.map((item) =>
                              item.id === entry.id
                                ? { ...item, params: { ...item.params, strength } }
                                : item
                            );
                            patch({ ...current, entries });
                          }}
                          className="w-20 accent-accent"
                          aria-label="블러 세기"
                        />
                        <span className="w-6 tabular-nums">{Number(entry.params.strength ?? 70)}</span>
                      </label>
                    ) : null}
                    {entry.engine === "motion-blur" ? (
                      <label className="inline-flex items-center gap-1">
                        <span>각도</span>
                        <input
                          type="range"
                          min={0}
                          max={360}
                          value={Number(entry.params.angle ?? 0)}
                          onChange={(e) => {
                            const angle = Number(e.target.value);
                            const entries = current.entries.map((item) =>
                              item.id === entry.id
                                ? { ...item, params: { ...item.params, angle } }
                                : item
                            );
                            patch({ ...current, entries });
                          }}
                          className="w-20 accent-accent"
                          aria-label="모션 블러 각도"
                        />
                        <span className="w-7 tabular-nums">{Number(entry.params.angle ?? 0)}°</span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
