import { LayoutGrid, List } from "lucide-react";

import "./market-library-experience.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type MarketLayout = "grid" | "list";

export function MarketViewToggle({ value, onChange }: {
  readonly value: MarketLayout;
  readonly onChange: (value: MarketLayout) => void;
}) {
  const bt = useBilingual("MarketViewToggle");
  return (
    <div role="group" aria-label={bt("에셋 표시 방식", "Asset view")} className="market-view-toggle">
      {(["grid", "list"] as const).map((layout) => {
        const Icon = layout === "grid" ? LayoutGrid : List;
        const label = layout === "grid" ? bt("카드 보기", "Grid view") : bt("목록 보기", "List view");
        return <button key={layout} type="button" aria-label={label} title={label}
          aria-pressed={value === layout} onClick={() => onChange(layout)}
          className={cn("market-view-toggle__button", value === layout && "is-active")}>
          <Icon className="size-4" aria-hidden="true" />
        </button>;
      })}
    </div>
  );
}
