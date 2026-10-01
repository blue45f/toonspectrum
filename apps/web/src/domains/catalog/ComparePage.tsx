import { Swords } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { CompareView } from "@/shared/components/compare-view";
import { Container } from "@/shared/components/section";
import {
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const SCOPE = "domains.catalog.ComparePage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

export function ComparePage() {
  useBilingualI18nRevision();
  const [searchParams] = useSearchParams();

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Swords}
        eyebrow={`${txEn("COMPARE")} · ${tx("작품 비교")}`}
        title={tx("두 작품, 맞대보기")}
        description={tx("고민되는 두 작품을 나란히 두고 별점·조회·관심·완독률·장르까지 한눈에 비교하세요.")}
      />
      <CompareView initialA={searchParams.get("a") ?? undefined} initialB={searchParams.get("b") ?? undefined} />
    </Container>
  );
}
