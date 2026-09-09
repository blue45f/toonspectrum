import {
  AlertTriangle,
  ArrowRight,
  Cuboid,
  PackageSearch,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  Upload,
} from "lucide-react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { MarketResourceFamilyExplorer } from "../components/MarketResourceFamilyExplorer";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketHomeJsonLd } from "../models/market-jsonld";
import { MARKET_LICENSES } from "../models/market-kind";
import { MARKET_CURATED_THEMES } from "../models/market-theme";

import { Container } from "@/shared/components/section";
import {
  FriendlyQuickGuide,
  PurposeExperienceStage,
} from "@/shared/components/purpose-experience-stage";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

const MARKET_HOME_DESCRIPTION =
  "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 찾고 미리 본 뒤 ToonStudio 프로젝트에 바로 연결하세요.";

export function MarketHomePage() {
  const latest = useMarketResources({ limit: 12, sort: "newest" });
  const hasLatestItems = latest.items.length > 0;
  const hasFatalLatestError = Boolean(latest.error) && !hasLatestItems;

  useDocumentTitle("리소스 마켓");
  useMetaDescription(MARKET_HOME_DESCRIPTION);
  usePageSocialMeta({
    canonicalPath: "/market",
    title: "리소스 마켓 · 툰스튜디오",
    description: MARKET_HOME_DESCRIPTION,
  });
  useJsonLd(marketHomeJsonLd(latest.items));

  const tagCounts = new Map<string, number>();
  for (const record of latest.items) {
    for (const tag of record.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const popularTags = [...tagCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([tag]) => tag);

  const materials3D = latest.items.filter(
    (item) => item.kind === "3d-asset" || item.kind === "3d-preset",
  );

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <MarketNavHeader />
          <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] xl:items-center">
            <div>
              <p className="eyebrow text-accent">Creator Resource Market</p>
              <h1 className="mt-2 text-pretty font-display text-[clamp(2.2rem,6vw,4.6rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">
                리소스 마켓
              </h1>
              <p className="mt-3 max-w-xl text-pretty font-serif text-base italic leading-relaxed text-fg-2 sm:text-lg">
                장면을 만드는 모든 재료가 Studio와 바로 이어지는 곳.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-3">
                템플릿으로 장면을 시작하고, 2D·3D 에셋을 배치하고, 브러시와 색·보정 리소스로 마무리하세요. 파일 형식보다 지금 만들고 싶은 결과에서 시작합니다.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-4 sm:mt-7 sm:pt-5">
                <Link href="/market/browse" className={buttonClass({ variant: "solid", size: "md" })}>
                  <Store className="h-4 w-4" aria-hidden="true" />
                  리소스 찾기
                </Link>
                <Link
                  href="/market/publish"
                  className={buttonClass({
                    variant: "outline",
                    size: "md",
                    className: "border-accent text-accent hover:bg-accent/10",
                  })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  리소스 배포하기
                </Link>
                <Link
                  href="/studio?assetMarket=community&communityView=share"
                  className={buttonClass({ variant: "outline", size: "md" })}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Studio에서 공유
                </Link>
                <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good">
                  현재 모든 리소스 무료
                </span>
              </div>
            </div>

            <PurposeExperienceStage
              variant="market"
              ariaLabel="리소스를 찾아 미리 보고 Studio에서 사용하는 흐름 미리보기"
              steps={["필요한 결과 선택", "미리보기·조건 확인", "Studio에서 바로 사용"]}
            />
          </div>

          <FriendlyQuickGuide
            className="mt-5"
            title="처음이라면 종류보다 하고 싶은 작업부터 고르세요"
            description="템플릿·에셋·브러시는 적용 방식이 서로 다릅니다. 상세 화면에서 실제 사용 위치와 호환성을 먼저 보여드립니다."
            steps={[
              "장면을 통째로 시작하려면 템플릿, 캔버스에 놓을 재료가 필요하면 2D·3D를 고릅니다.",
              "선화·채색 도구는 브러시, 작품의 색감과 마감은 색·보정에서 찾습니다.",
              "미리보기에서 결과와 사용권을 확인한 뒤 Studio에서 시험하거나 내 리소스에 저장합니다.",
            ]}
            actionLabel="전체 리소스 둘러보기"
            actionHref="/market/browse"
          />
        </Container>
      </section>

      <Container size="wide" className="py-9 sm:py-11 lg:py-14">
        <MarketResourceFamilyExplorer />
      </Container>

      <section className="border-y border-line bg-card/40 py-8 sm:py-10">
        <Container size="wide">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow text-accent">Webtoon Collections</p>
              <h2 className="mt-1 text-lg font-bold text-fg sm:text-xl">장르·제작 목적 컬렉션</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">템플릿부터 브러시·배경·효과까지 같은 장면에 함께 쓰기 좋은 리소스를 묶었습니다.</p>
            </div>
            <Link
              href="/market/browse"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-accent-2"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {MARKET_CURATED_THEMES.map((theme) => {
              const ThemeIcon = theme.icon;
              return (
                <Link
                  key={theme.id}
                  href={`/market/browse?tag=${encodeURIComponent(theme.tag)}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card p-4 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <div className={`absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br ${theme.gradient} blur-2xl opacity-60 transition-all duration-500 group-hover:scale-125 group-hover:opacity-100`} />
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                        <Sparkles className="size-2.5" aria-hidden="true" />
                        {theme.badge}
                      </span>
                      <ThemeIcon className="size-4 text-fg-3 transition-all group-hover:-rotate-6 group-hover:scale-110 group-hover:text-accent" aria-hidden="true" />
                    </div>
                    <h3 className="mt-2.5 text-sm font-bold text-fg transition-colors group-hover:text-accent">{theme.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">{theme.subtitle}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-2.5 text-[0.7rem] font-medium text-fg-2">
                    <span className="font-semibold text-accent">#{theme.tag} 세트</span>
                    <span className="flex items-center gap-1 text-fg-3 transition-transform group-hover:translate-x-1">
                      보러가기 <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      {materials3D.length > 0 ? (
        <Container size="wide" className="py-10 sm:py-12">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cuboid className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-base font-bold text-fg sm:text-lg">3D 배경·데생 추천</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-3">카메라를 돌려 구도를 잡고 캔버스로 가져올 수 있는 3D 리소스입니다.</p>
            </div>
            <Link href="/market/browse?kind=3d-asset" className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-accent-2">
              3D 전체 보기 →
            </Link>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {materials3D.slice(0, 4).map((record) => (
              <li key={record.id}>
                <MarketResourceCard record={record} className="h-full" />
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {popularTags.length >= 3 ? (
        <Container size="wide" className="pb-10 sm:pb-12">
          <h2 className="eyebrow text-fg-3">지금 많이 쓰는 키워드</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {popularTags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-raised px-3 py-2 text-xs text-fg-2 transition-all duration-150 hover:-translate-y-0.5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      <Container size="wide" className="pb-10 sm:pb-12">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="eyebrow text-fg-3">최근 공유</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">최근 공개된 리소스를 실제 미리보기와 함께 확인합니다.</p>
          </div>
          <Link href="/market/browse" className="inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            전체 보기 →
          </Link>
        </div>
        {hasFatalLatestError ? (
          <div role="alert" className="mt-6 rounded-2xl border border-warn/30 bg-warn/5 p-8 text-center sm:p-10">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn/10 text-warn">
              <AlertTriangle className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base font-bold text-fg">최근 공유 리소스를 불러올 수 없어요</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">일시적인 네트워크 문제이거나 서버 장애일 수 있어요. 다시 시도해도 다른 작업에는 영향을 주지 않습니다.</p>
            <button type="button" onClick={latest.reload} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
              다시 시도
            </button>
          </div>
        ) : null}
        {latest.stale ? (
          <StaleNoticeBar
            savedAt={latest.staleSavedAt ?? new Date().toISOString()}
            onRetry={latest.reload}
            className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
          />
        ) : null}
        {hasFatalLatestError ? null : (
          <>
            {latest.loading ? <p role="status" className="sr-only">최근 공유된 마켓 리소스를 불러오는 중입니다.</p> : null}
            <ul aria-busy={latest.loading || undefined} className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {latest.loading && latest.items.length === 0
                ? Array.from({ length: 8 }, (_, index) => (
                    <li key={index} aria-hidden="true">
                      <div className="skeleton aspect-[16/9] w-full rounded-t-xl" />
                      <div className="space-y-2 rounded-b-xl border border-t-0 border-line bg-card p-3.5">
                        <div className="skeleton h-4 w-4/5" />
                        <div className="skeleton h-3 w-2/5" />
                      </div>
                    </li>
                  ))
                : latest.items.map((record) => (
                    <li key={record.id}>
                      <MarketResourceCard record={record} className="h-full" />
                    </li>
                  ))}
            </ul>
            {!latest.loading && latest.items.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel p-8 text-center sm:p-10">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3">
                  <PackageSearch className="size-6" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-base font-bold text-fg">아직 공유된 리소스가 없어요</h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-2">Studio에서 만든 템플릿, 브러시, 팔레트와 에셋을 가장 먼저 공유해 보세요.</p>
                <div className="mt-5 flex justify-center">
                  <Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}>
                    <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                    Studio에서 첫 리소스 공유하기
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Container>

      <Container size="wide" className="pb-14">
        <div>
          <h2 className="eyebrow text-fg-3">사용권 안내</h2>
          <p className="mt-1 text-xs leading-5 text-fg-3">무료 여부와 별개로 상업 이용, 수정, 출처 표기 조건을 확인하세요.</p>
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MARKET_LICENSES.map((license) => (
            <li key={license.license} className="rounded-xl border border-line bg-card p-4 transition-colors hover:border-accent/30 hover:bg-raised/60">
              <h3 className="text-sm font-semibold text-fg">{license.label}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{license.summary}</p>
              <a
                href={license.url ?? "/terms"}
                target={license.url ? "_blank" : undefined}
                rel={license.url ? "noreferrer" : undefined}
                className="mt-2 inline-flex min-h-11 items-center text-xs text-cool underline decoration-current underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                사용권 전문 보기{license.url ? " ↗" : ""}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
