import { useSearchParams } from "react-router-dom";

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
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow text-accent">{txEn("COMPARE")} · {tx("작품 비교")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{tx("두 작품, 맞대보기")}</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          {tx("고민되는 두 작품을 나란히 두고 별점·조회·관심·완독률·장르까지 한눈에 비교하세요.")}
        </p>
      </header>
      <CompareView initialA={searchParams.get("a") ?? undefined} initialB={searchParams.get("b") ?? undefined} />
    </Container>
  );
}
