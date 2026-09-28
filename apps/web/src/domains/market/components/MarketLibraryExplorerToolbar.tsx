import { ArrowUpCircle, Boxes, CircleCheck, RotateCcw, Search, ShieldAlert, X } from "lucide-react";
import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { MARKET_KINDS } from "../models/market-kind";
import { DEFAULT_LIBRARY_FILTERS, hasLibraryFilters, MARKET_LIBRARY_STATUSES, matchesLibraryStatus } from "../models/market-library-explorer";

import { MarketViewToggle } from "./MarketViewToggle";

import type { MarketLibraryFilters } from "../models/market-library-explorer";
import type { MarketLayout } from "./MarketViewToggle";
import type { CreatorMarketplaceCloudLibraryItem } from "@/shared/lib/creator-marketplace-cloud-library-contract";

const SMART_VIEWS = [
  { value: "all", label: "불러온 에셋", english: "Loaded assets", icon: Boxes },
  { value: "available", label: "공개 중인 소재", english: "Listed materials", icon: CircleCheck },
  { value: "updates", label: "계정 이력상 업데이트", english: "Updates in account history", icon: ArrowUpCircle },
  { value: "unavailable", label: "확인이 필요한 소재", english: "Check listing status", icon: ShieldAlert },
] as const;

export function MarketLibraryExplorerToolbar({ items, resultCount, hasMore, filters, onChange, layout, onLayoutChange }: {
  readonly items: readonly CreatorMarketplaceCloudLibraryItem[];
  readonly resultCount: number;
  readonly hasMore: boolean;
  readonly filters: MarketLibraryFilters;
  readonly onChange: (filters: MarketLibraryFilters) => void;
  readonly layout: MarketLayout;
  readonly onLayoutChange: (layout: MarketLayout) => void;
}) {
  const scopeId = useId();
  const bt = useBilingual("MarketLibraryExplorer");
  const patch = (value: Partial<MarketLibraryFilters>) => onChange({ ...filters, ...value });
  return (
    <section className="market-library-explorer" aria-label={bt("내 에셋 검색과 정리", "Search and organize my assets")}>
      <div className="market-library-stats" role="group" aria-label={bt("불러온 에셋 빠른 필터", "Quick filters for loaded assets")}>
        {SMART_VIEWS.map(({ value, label, english, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={filters.status === value}
            onClick={() => patch({ status: value === filters.status ? "all" : value })}>
            <span><Icon className="size-4" aria-hidden="true" />{bt(label, english)}</span>
            <strong>{items.filter((item) => matchesLibraryStatus(item, value)).length}</strong>
          </button>
        ))}
      </div>
      <div className="market-library-toolbar">
        <div className="market-library-search">
          <Search className="size-4" aria-hidden="true" />
          <input type="search" aria-label={bt("내 에셋 검색", "Search my assets")} value={filters.search} maxLength={160} aria-describedby={scopeId}
            placeholder={bt("이름, 종류, 패키지 또는 버전 검색", "Search name, type, package or version")}
            onChange={(event) => patch({ search: event.target.value })} />
          {filters.search ? <button type="button" aria-label={bt("내 에셋 검색어 지우기", "Clear asset search")} onClick={() => patch({ search: "" })}>
            <X className="size-4" aria-hidden="true" />
          </button> : null}
        </div>
        <MarketViewToggle value={layout} onChange={onLayoutChange} />
      </div>
      <div className="market-library-filters">
        <label>{bt("종류", "Type")}<select aria-label={bt("에셋 종류", "Asset type")} value={filters.kind} onChange={(event) => {
          const kind = MARKET_KINDS.find((candidate) => candidate.kind === event.target.value)?.kind ?? "all";
          patch({ kind });
        }}><option value="all">{bt("전체 종류", "All types")}</option>{MARKET_KINDS.map(({ kind, label, english }) => (
          <option key={kind} value={kind}>{bt(label, english)} · {items.filter((item) => item.kind === kind).length}</option>
        ))}</select></label>
        <label>{bt("상태", "Status")}<select aria-label={bt("에셋 상태", "Asset status")} value={filters.status} onChange={(event) => {
          const status = MARKET_LIBRARY_STATUSES.find((candidate) => candidate.value === event.target.value)?.value ?? "all";
          patch({ status });
        }}>{MARKET_LIBRARY_STATUSES.map(({ value, label, english }) => <option key={value} value={value}>{bt(label, english)}</option>)}</select></label>
        <label>{bt("정렬", "Sort")}<select aria-label={bt("에셋 정렬", "Asset order")} value={filters.sort} onChange={(event) => {
          const sort = event.target.value;
          if (sort === "recent" || sort === "oldest" || sort === "name") patch({ sort });
        }}><option value="recent">{bt("최근 추가순", "Recently added")}</option><option value="oldest">{bt("오래된 추가순", "Oldest added")}</option><option value="name">{bt("이름순", "Name")}</option></select></label>
        {hasLibraryFilters(filters) ? <button type="button" className="market-library-reset" onClick={() => onChange(DEFAULT_LIBRARY_FILTERS)}>
          <RotateCcw className="size-3.5" aria-hidden="true" />{bt("필터 초기화", "Reset filters")}
        </button> : null}
      </div>
      <p id={scopeId} className="market-library-scope" aria-live="polite">
        {bt(`불러온 ${items.length}개 중 ${resultCount}개 표시`, `Showing ${resultCount} of ${items.length} loaded assets`)}{hasMore ? bt(" · 아직 불러오지 않은 에셋이 있습니다. 아래 ‘더 보기’로 검색 범위를 넓히세요.", " · More assets remain. Load more below to expand this search.") : ""}
      </p>
      <p className="market-library-scope">{bt("업데이트 필터는 계정의 설치 이력 기준입니다. 현재 기기 설치 상태는 각 에셋에서 확인하세요.", "Update filters use account install history. Check each asset for installation on this device.")}</p>
    </section>
  );
}
