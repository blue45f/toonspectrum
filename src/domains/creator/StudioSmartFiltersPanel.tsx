/**
 * Photopea-style reorderable smart filter stack for image elements.
 * Pure stack ops live in studio-adjustment-stack; this is presentation only.
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

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-2">
      <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
        스마트 필터 스택
      </p>
      <p className="text-[0.65rem] leading-relaxed text-fg-3">
        비파괴 보정 순서를 쌓습니다. 블러·밝기/대비·레벨 등은 캔버스에 즉시 반영됩니다.
      </p>

      <div className="flex flex-wrap gap-1.5">
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2">
          <Plus className="size-3.5" aria-hidden />
          <span className="sr-only">엔진 추가</span>
          <select
            className="max-w-[10rem] bg-transparent text-[0.65rem] font-semibold text-fg outline-none"
            defaultValue=""
            onChange={(event) => {
              const engine = event.target.value as StudioAdjustmentEngineId;
              event.target.value = "";
              if (!STUDIO_ADJUSTMENT_ENGINE_IDS.includes(engine)) return;
              const defaults: Record<string, number | boolean> =
                engine === "blur"
                  ? { radius: 2 }
                  : engine === "brightness-contrast"
                    ? { brightness: 0, contrast: 0 }
                    : engine === "hue-saturation"
                      ? { hue: 0, saturation: 0 }
                      : engine === "levels"
                        ? { black: 0, white: 255, gamma: 1 }
                        : engine === "sharpen"
                          ? { amount: 0.3 }
                          : engine === "noise"
                            ? { amount: 0.1 }
                            : {};
              patch(appendStudioAdjustmentEntry(current, { engine, params: defaults }));
            }}
          >
            <option value="" disabled>
              필터 추가…
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
          스택이 비어 있어요. 필터를 추가하면 이미지에 순서대로 적용됩니다.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="스마트 필터 목록">
          {current.entries.map((entry, index) => (
            <li
              key={entry.id}
              className={cn(
                "flex items-center gap-1.5 bg-card/50 px-2 py-1.5",
                !entry.enabled && "opacity-55"
              )}
            >
              <span className="w-5 shrink-0 text-right font-display text-[0.62rem] tabular-nums text-fg-3">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.72rem] font-semibold text-fg">
                  {studioAdjustmentEngineLabel(entry.engine)}
                </p>
                <p className="truncate text-[0.6rem] text-fg-3">{entry.engine}</p>
              </div>
              <button
                type="button"
                aria-label={entry.enabled ? "비활성" : "활성"}
                aria-pressed={entry.enabled}
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
                disabled={index === 0}
                className={buttonClass({ size: "sm", variant: "quiet" })}
                onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index - 1))}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="아래로"
                disabled={index >= current.entries.length - 1}
                className={buttonClass({ size: "sm", variant: "quiet" })}
                onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index + 1))}
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="삭제"
                className={buttonClass({ size: "sm", variant: "quiet" })}
                onClick={() => patch(removeStudioAdjustmentEntry(current, entry.id))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
