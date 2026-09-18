import { useSearchParams } from "react-router-dom";

import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { RecommendView } from "@/shared/components/recommend-view";
import { Container } from "@/shared/components/section";
import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";

export function RecommendPage() {
  const [searchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  const initialGenres = state.tasteGenres.length
    ? [...state.tasteGenres]
    : [...state.filters.genres];

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <p className="eyebrow text-accent">RECOMMENDATIONS · 추천</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          오늘 뭐 볼까
        </h1>
        <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          취향을 고르면 그 자리에서 추천이 만들어집니다. 평가를 남길수록,
          추천은 점점 더 당신을 닮아갑니다.
        </p>
      </header>

      <DiscoveryWorkspaceNav current="recommend" className="mb-8" />
      <RecommendView initialGenres={initialGenres} />
    </Container>
  );
}
