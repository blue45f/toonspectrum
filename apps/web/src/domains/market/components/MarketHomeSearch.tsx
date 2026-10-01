import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS, CreatorMarketplaceResourceSearchQuerySchema } from "@/shared/lib/creator-marketplace-resource-contract";
import Link from "@/shared/navigation/router-link";

export function MarketHomeSearch({ className }: { readonly className?: string } = {}) {
  const [query, setQuery] = useState("");
  const composing = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const bt = useBilingual("MarketHomeSearch");
  const navigate = useNavigate();
  return (
    <div className={cn("max-w-xl", className ?? "mt-6")}>
      <form role="search" aria-label={bt("소재 마켓 통합 검색", "Search the material market")} className="flex items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (composing.current) return;
        const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(query);
        setInvalid(!parsed.success);
        if (parsed.success) navigate(`/market/browse${parsed.data ? `?${new URLSearchParams({ q: parsed.data })}` : ""}`);
      }}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input type="search" aria-label={bt("찾고 싶은 소재", "Find materials")} value={query} placeholder={bt("어떤 장면을 만들고 있나요?", "What scene are you creating?")}
            maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
            aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => { setQuery(event.target.value); setInvalid(false); }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
            className="h-12 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent" />
        </div>
        <button type="submit" className={buttonClass({ variant: "solid", size: "lg" })}>{bt("검색", "Search")}</button>
      </form>
      {invalid ? <p role="alert" id={errorId} className="mt-2 text-sm text-bad">{bt("검색어의 길이나 문자를 확인해 주세요.", "Please check the length and characters in your search.")}</p> : null}
      <nav aria-label={bt("소재 검색 시작점", "Material search ideas")} className="mt-2 flex flex-wrap gap-x-3">
        {["학교 배경", "펜선", "말풍선", "3D 소품"].map((term) => (
          <Link key={term} href={`/market/browse?${new URLSearchParams({ q: term })}`}
            className="inline-flex min-h-11 items-center rounded text-xs font-medium text-fg-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{term} ↗</Link>
        ))}
      </nav>
    </div>
  );
}
