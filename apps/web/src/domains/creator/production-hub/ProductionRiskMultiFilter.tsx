import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";

export interface ProductionRiskFilterOption {
  readonly value: string;
  readonly label: string;
}

export function ProductionRiskMultiFilter({
  label,
  options,
  selected,
  onChange,
  className,
  emptyLabel = "전체",
}: {
  readonly label: string;
  readonly options: readonly ProductionRiskFilterOption[];
  readonly selected: readonly string[];
  readonly onChange: (values: readonly string[]) => void;
  readonly className?: string;
  readonly emptyLabel?: string;
}) {
  const selectedValues = new Set(selected);
  const toggle = (value: string) => {
    const next = new Set(selectedValues);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(options.map((option) => option.value).filter((optionValue) => next.has(optionValue)));
  };

  return (
    <details className={cn("group relative", className)}>
      <summary aria-label={`${label} 필터`} className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-fg outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          {label}
          <span className="ml-1 font-medium text-fg-3">
            {selected.length > 0 ? `${selected.length}개 선택` : emptyLabel}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute z-30 mt-2 max-h-72 w-full min-w-56 overflow-y-auto rounded-xl border border-line bg-card p-2 shadow-lg">
        <div className="mb-1 flex items-center justify-between gap-2 px-1 py-1">
          <span className="text-[0.6875rem] font-black text-fg">{label}</span>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            className="inline-flex min-h-7 items-center gap-1 rounded-lg px-2 text-[0.6875rem] font-bold text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-40"
          >
            <X className="size-3" aria-hidden="true" /> 전체 해제
          </button>
        </div>
        <div className="space-y-1" role="group" aria-label={`${label} 다중 선택`}>
          {options.map((option) => {
            const checked = selectedValues.has(option.value);
            return (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  checked ? "border-accent/40 bg-accent-soft text-fg" : "border-transparent text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <input
                  type="checkbox"
                  value={option.value}
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggle(option.value)}
                />
                <span className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  checked ? "border-accent bg-accent text-on-accent" : "border-line bg-panel",
                )}>
                  {checked ? <Check className="size-3" aria-hidden="true" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
