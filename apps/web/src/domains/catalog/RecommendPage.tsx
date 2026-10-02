import { Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor } from "@/domains/legal/public/site-page-header-art";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { RecommendView } from "@/shared/components/recommend-view";
import { Container } from "@/shared/components/section";
import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import {
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEngagement } from "@/domains/engagement/engagement-store";

const SCOPE = "domains.catalog.RecommendPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

export function RecommendPage() {
  useBilingualI18nRevision();
  const [searchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  const savedTaste = useEngagement((engagement) => engagement.tastePreferences);
  const initialGenres = state.tasteGenres.length
    ? [...state.tasteGenres]
    : state.filters.genres.length
      ? [...state.filters.genres]
      : [...(savedTaste?.genres ?? [])];

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Sparkles}
        eyebrow={`${txEn("RECOMMENDATIONS")} · ${tx("추천")}`}
        title={tx("오늘 뭐 볼까")}
        description={tx("취향을 고르면 그 자리에서 추천이 만들어집니다. 평가를 남길수록, 추천은 점점 더 당신을 닮아갑니다.")}
        art={sitePageHeaderArtFor("/recommend")}
      />

      <DiscoveryWorkspaceNav current="recommend" className="mb-8" />
      <RecommendView initialGenres={initialGenres} />
    </Container>
  );
}
