import { GitCompareArrows, X } from "lucide-react";

import { MARKET_COMPARE_MAX_ITEMS, useMarketCompare } from "../hooks/use-market-compare";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";

export function MarketCompareShelf() {
  const bt = useBilingual("MarketCompareShelf");
  const { compareItems, compareCount, removeCompare, clearCompare } = useMarketCompare();
  if (compareCount === 0) return null;
  return (
    <section aria-label={bt("선택한 비교 후보", "Selected comparison candidates")} className="market-compare-shelf z-20 mt-6 rounded-2xl border border-accent/40 bg-panel p-3 shadow-xl sm:sticky sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-fg" aria-live="polite">
          <GitCompareArrows className="size-4 text-accent" aria-hidden="true" />
          {bt("비교 후보", "Comparison candidates")} {compareCount}/{MARKET_COMPARE_MAX_ITEMS}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={clearCompare} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>{bt("비교 비우기", "Clear comparison")}</button>
          <Link href="/market/compare" className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11" })}>{bt("선택한 소재 비교하기", "Compare selected materials")}</Link>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {compareItems.map((item) => <button key={item.id} type="button" onClick={() => removeCompare(item.id)}
          aria-label={bt(`비교 후보 ${item.name} 제외`, `Remove ${item.name} from comparison`)} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="max-w-48 truncate">{item.name}</span><X className="size-3.5 shrink-0" aria-hidden="true" />
        </button>)}
      </div>
      <p className="mt-2 text-xs leading-5 text-fg-3">{bt("버전·사용권·제작 조건을 함께 비교하세요. 비교 후보에 담아도 소장하거나 설치되지 않습니다.", "Compare versions, licenses and production requirements. Selecting candidates does not acquire or install them.")}</p>
    </section>
  );
}
