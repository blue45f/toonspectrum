import { ArrowLeft } from "lucide-react";
import { useParams } from "react-router-dom";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketProductionFitWorkbench } from "../components/MarketProductionFitWorkbench";
import { MarketResourceDetailArticle } from "../components/MarketResourceDetailArticle";
import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketResourceJsonLd } from "../models/market-jsonld";

import { Container } from "@/shared/components/section";
import { FriendlyQuickGuide } from "@/shared/components/purpose-experience-stage";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

export function MarketResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { record, loading, notFound, error, staleSavedAt, reload } = useMarketResourceDetail(id);
  const metaTitle = record?.name ?? (notFound ? "에셋을 찾을 수 없어요" : "에셋 마켓");
  const metaDescription = record?.description?.trim()
    || (record
      ? `${record.name} 에셋의 구성, 사용권, 호환성과 Studio 적용 방법을 확인하세요.`
      : "ToonStudio 에셋 마켓의 구성, 사용권, 호환성과 Studio 적용 방법을 확인하세요.");

  useDocumentTitle(metaTitle);
  useMetaDescription(metaDescription);
  usePageSocialMeta({
    canonicalPath: record ? `/market/resource/${encodeURIComponent(record.id)}` : "/market",
    title: `${metaTitle} · 툰스튜디오`,
    description: metaDescription,
    type: record ? "article" : "website",
  });
  useJsonLd(record ? marketResourceJsonLd(record) : null);

  const related = useMarketResources(
    record ? { kind: record.kind, limit: 5, sort: "newest" } : null
  );
  const relatedItems = related.items.filter((item) => item.id !== record?.id).slice(0, 4);

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <MarketNavHeader />
      <Link
        href="/market/browse"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        탐색 결과로 돌아가기
      </Link>

      {loading ? (
        <div className="mt-6">
          <p role="status" className="sr-only">
            마켓 에셋 상세 정보를 불러오는 중입니다.
          </p>
          <div
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
            aria-hidden="true"
          >
            <div className="space-y-3">
              <div className="skeleton aspect-[16/9] w-full rounded-xl" />
              <div className="skeleton h-5 w-3/5" />
              <div className="skeleton h-4 w-2/5" />
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-card p-5">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="skeleton h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : notFound ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-panel p-12 text-center">
          <p className="text-sm font-medium text-fg">에셋을 찾을 수 없어요</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">
            배포자가 비공개로 전환했거나 주소가 잘못되었을 수 있어요. 마켓에서 비슷한 에셋을 찾아보세요.
          </p>
          <Link href="/market/browse" className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
            다른 에셋 찾아보기
          </Link>
        </div>
      ) : error || !record ? (
        <div role="status" className="mt-8 rounded-xl border border-warn/40 bg-warn/10 p-10 text-center">
          <p className="text-sm font-medium text-fg">지금은 에셋 정보를 불러올 수 없어요</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">
            현재 작업이나 내 에셋에는 영향을 주지 않습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={reload}
            className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <FriendlyQuickGuide
            title="이 에셋을 쓰기 전에 3가지만 확인하세요"
            description="좋아 보이는 에셋이라도 프로젝트 조건과 사용권이 맞아야 안전하게 사용할 수 있습니다."
            steps={[
              "제작 적합성에서 현재 프로젝트와 Studio 버전이 맞는지 확인합니다.",
              "미리보기와 구성 파일을 보고 원하는 결과가 실제로 들어 있는지 확인합니다.",
              "사용권을 확인한 뒤 내 에셋에 추가하고 Studio에서 설치·시험합니다.",
            ]}
          />
          <MarketProductionFitWorkbench record={record} />
          <MarketResourceDetailArticle
            record={record}
            relatedItems={relatedItems}
            staleSavedAt={staleSavedAt}
            onRetry={reload}
          />
        </div>
      )}
    </Container>
  );
}
