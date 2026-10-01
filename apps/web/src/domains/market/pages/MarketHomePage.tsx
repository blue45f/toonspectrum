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

import { MarketFamilyPicker } from "../components/MarketFamilyPicker";
import { MarketHomeSearch } from "../components/MarketHomeSearch";
import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketMaterialPreview } from "../components/MarketMaterialPreview";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { MarketResourceFamilyExplorer } from "../components/MarketResourceFamilyExplorer";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketHomeJsonLd } from "../models/market-jsonld";
import { MARKET_LICENSE_GUIDE } from "../models/market-kind";
import { isMarketPublicKeywordTag } from "../models/market-catalog-public";
import { marketResourceBrowseHref } from "../models/market-resource-taxonomy";
import { MARKET_CURATED_THEMES } from "../models/market-theme";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { Container } from "@/shared/components/section";
import {
  FriendlyQuickGuide,
} from "@/shared/components/purpose-experience-stage";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

export function MarketHomePage() {
  const t = useBilingual("MarketHomePage");
  const marketHomeDescription = t(
    "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 찾고 미리 본 뒤 ToonStudio 프로젝트에 바로 연결하세요.",
    "Find and preview webtoon templates, 2D/3D assets, brushes, palettes, and filters, then connect them straight to your ToonStudio project.",
  );
  const latest = useMarketResources({ limit: 12, sort: "newest" });
  const { isPaidMode } = useCommerceConfig();
  const hasLatestItems = latest.items.length > 0;
  const hasFatalLatestError = Boolean(latest.error) && !hasLatestItems;

  useDocumentTitle(t("소재 마켓", "Material Market"));
  useMetaDescription(marketHomeDescription);
  usePageSocialMeta({
    canonicalPath: "/market",
    title: t("소재 마켓 · 툰스튜디오", "Material Market · ToonStudio"),
    description: marketHomeDescription,
  });
  useJsonLd(marketHomeJsonLd(latest.items));

  const tagCounts = new Map<string, number>();
  for (const record of latest.items) {
    for (const tag of record.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const popularTags = [...tagCounts.entries()]
    .filter(([tag]) => isMarketPublicKeywordTag(tag))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([tag]) => tag);

  const materials3D = latest.items.filter(
    (item) => item.kind === "3d-asset" || item.kind === "3d-preset",
  );

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10 lg:py-12">
          <MarketNavHeader />
          <SitePageHeader
            size="hero"
            icon={Store}
            eyebrow="MATERIAL MARKET"
            title={<>{t("웹툰의 한 컷을,", "One panel of your webtoon,")}<br />{t("더 깊게 만드는 재료.", "crafted with deeper materials.")}</>}
            description={t(
              "템플릿·2D·3D 에셋·브러시·색 보정 소재를 미리 보고, 사용 조건을 확인한 뒤 내 원고에 바로 연결하세요.",
              "Preview templates, 2D/3D assets, brushes and color resources, check the license, then connect them straight to your manuscript.",
            )}
            aside={<MarketMaterialPreview />}
            asideClassName="market-home-masthead__aside hidden lg:block"
            actions={
              <>
                <Link href="/market/browse" className={buttonClass({ variant: "solid", size: "md", className: "min-h-11" })}>
                  <Store className="h-4 w-4" aria-hidden="true" />
                  {t("소재 찾기", "Find materials")}
                </Link>
                <span className="inline-flex min-h-8 items-center rounded-full border border-good/30 bg-good/10 px-3 text-xs font-semibold text-good">
                  {isPaidMode ? t("현재 유료 운영 모드", "Currently in paid operation mode") : t("현재 무료 운영 모드", "Currently in free operation mode")}
                </span>
              </>
            }
          >
            <MarketHomeSearch className="max-w-xl" />
            <p id="market-home-family-title" className="mb-2 mt-4 text-[0.7rem] font-semibold text-fg-3">
              {t("무엇을 찾고 있나요?", "What are you looking for?")}
            </p>
            <MarketFamilyPicker
              selected={null}
              labelledBy="market-home-family-title"
              target={{ kind: "link", hrefFor: (family) => (family ? marketResourceBrowseHref(family.subcategories[0]) : "/market/browse") }}
              className="max-w-3xl"
            />
          </SitePageHeader>

          <FriendlyQuickGuide
            className="mt-6"
            title={t("처음이라면 종류보다 하고 싶은 작업부터 고르세요", "New here? Start from the task you want to do, not the asset type")}
            description={t("템플릿·에셋·브러시는 적용 방식이 서로 다릅니다. 상세 화면에서 실제 사용 위치와 호환성을 먼저 보여드립니다.", "Templates, assets, and brushes are applied differently. The detail screen shows where each is used and its compatibility first.")}
            steps={[
              t("장면을 통째로 시작하려면 템플릿, 캔버스에 놓을 재료가 필요하면 2D·3D를 고릅니다.", "To start a whole scene, pick a template; for materials to place on the canvas, pick 2D/3D."),
              t("선화·채색 도구는 브러시, 작품의 색감과 마감은 색·보정에서 찾습니다.", "Find line-art and coloring tools under brushes, and your work's color and finish under color/retouch."),
              t("미리보기에서 결과와 사용권을 확인한 뒤 Studio에서 시험하거나 내 에셋에 저장합니다.", "Check the result and license in the preview, then test in Studio or save to your assets."),
            ]}
            actionLabel={t("전체 소재 둘러보기", "Browse all materials")}
            actionHref="/market/browse"
          />
        </Container>
      </section>

      <Container size="wide" className="py-9 sm:py-11 lg:py-14">
        <MarketResourceFamilyExplorer />
      </Container>

      <section className="border-y border-line bg-gradient-to-br from-accent/10 via-panel to-canvas py-8 sm:py-10" aria-labelledby="market-seller-band-title">
        <Container size="wide" className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow text-accent">FOR SELLERS</p>
            <h2 id="market-seller-band-title" className="mt-2 text-xl font-bold text-fg sm:text-2xl">
              {t("만든 소재를 공유하고 판매해 보세요", "Share and sell the materials you made")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">
              {t("브러시·템플릿·3D 에셋을 마켓에 올리면 다른 작가의 컷에 사용됩니다. 게시부터 판매까지의 흐름은 안내를 따라 5분이면 시작할 수 있어요.", "List your brushes, templates, and 3D assets on the market and other artists will use them in their panels. Follow the guide and you can go from listing to selling in 5 minutes.")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/market/publish"
              className={buttonClass({ variant: "solid", size: "md", className: "min-h-11" })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("소재 공유하기", "Share materials")}
            </Link>
            <Link
              href="/studio?assetMarket=community&communityView=share"
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t("Studio에서 공유", "Share from Studio")}
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-card/40 py-8 sm:py-10">
        <Container size="wide">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow text-accent">Webtoon Collections</p>
              <h2 className="mt-1 text-lg font-bold text-fg sm:text-xl">{t("장르·제작 목적 컬렉션", "Genre & purpose collections")}</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">{t("장면 예시에서 출발해 관련 태그의 리소스를 탐색하세요. 이미지는 테마를 설명하기 위한 예시입니다.", "Start from a scene example and explore resources with related tags. Images are illustrative examples of each theme.")}</p>
            </div>
            <Link
              href="/market/browse"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-accent-2"
            >
              {t("전체 보기", "View all")} <ArrowRight size={14} aria-hidden="true" className="ml-1" />
            </Link>
          </div>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {MARKET_CURATED_THEMES.map((theme) => {
              const ThemeIcon = theme.icon;
              return (
                <Link
                  key={theme.id}
                  href={theme.browseHref}
                  className="market-collection-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card p-4 transition-colors duration-200 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <img src={theme.image} alt="" loading="lazy" width={640} height={360} className="-mx-4 -mt-4 mb-4 aspect-[1.9] max-w-none object-cover transition-transform duration-200 motion-reduce:transition-none" style={{ width: "calc(100% + 2rem)", objectPosition: theme.id === "pose-guide-3d" ? "40% 45%" : "center" }} />
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
                    <span className="font-semibold text-accent">{t(`#${theme.tag} 소재 찾기`, `Find #${theme.tag} materials`)}</span>
                    <span className="flex items-center gap-1 text-fg-3 transition-transform group-hover:translate-x-1">
                      {t("보러가기", "See more")} <ArrowRight className="size-3" aria-hidden="true" />
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
                <h2 className="text-base font-bold text-fg sm:text-lg">{t("3D 배경·데생 추천", "Recommended 3D backgrounds & drawing guides")}</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-3">{t("카메라를 돌려 구도를 잡고 캔버스로 가져올 수 있는 3D 리소스입니다.", "3D resources you can orbit to frame a shot, then bring onto the canvas.")}</p>
            </div>
            <Link href="/market/browse?kind=3d-asset" className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-accent-2">
              {t("3D 전체 보기", "View all 3D")} <ArrowRight size={14} aria-hidden="true" className="ml-1" />
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
          <h2 className="eyebrow text-fg-3">{t("최근 공유 소재의 키워드", "Keywords from recently shared materials")}</h2>
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
            <h2 className="eyebrow text-fg-3">{t("최근 공유", "Recently shared")}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">{t("최근 공개된 리소스를 실제 미리보기와 함께 확인합니다.", "Browse recently published resources with real previews.")}</p>
          </div>
          <Link href="/market/browse" className="inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            {t("전체 보기", "View all")} <ArrowRight size={14} aria-hidden="true" className="ml-1" />
          </Link>
        </div>
        {hasFatalLatestError ? (
          <div role="alert" className="mt-6 rounded-2xl border border-warn/30 bg-warn/5 p-8 text-center sm:p-10">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn/10 text-warn">
              <AlertTriangle className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base font-bold text-fg">{t("최근 공유 리소스를 불러올 수 없어요", "Recently shared resources could not be loaded")}</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">{t("일시적인 네트워크 문제이거나 서버 장애일 수 있어요. 다시 시도해도 다른 작업에는 영향을 주지 않습니다.", "This may be a temporary network issue or a server problem. Retrying will not affect your other work.")}</p>
            <button type="button" onClick={latest.reload} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
              {t("다시 시도", "Try again")}
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
            {latest.loading ? <p role="status" className="sr-only">{t("최근 공유된 마켓 리소스를 불러오는 중입니다.", "Loading recently shared market resources.")}</p> : null}
            <ul aria-busy={latest.loading || undefined} className="mt-4 grid grid-cols-2 gap-2.5 pb-16 sm:grid-cols-3 lg:grid-cols-4 lg:pb-8">
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
                <h3 className="mt-3 text-base font-bold text-fg">{t("아직 공유된 리소스가 없어요", "No shared resources yet")}</h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-2">{t("공개 마켓 소재와 별개로 기본 무료 제작 소재는 회원가입 없이 사용할 수 있습니다. 원본 파일과 사용 조건을 확인한 뒤 내 편집기로 가져오세요.", "Separately from public market materials, the built-in free production materials are available without signing up. Check the source files and terms, then bring them into your editor.")}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/studio/assets?view=essentials" className={buttonClass({ variant: "solid", size: "sm" })}>{t("기본 무료 소재 사용하기", "Use built-in free materials")}</Link>
                  <Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}>
                    <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                    {t("Studio에서 첫 리소스 공유하기", "Share your first resource from Studio")}
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Container>

      <Container size="wide" className="pb-14">
        <section className="market-production-route mb-12" aria-labelledby="market-next-step-title">
          <div><span className="eyebrow text-accent">MATERIALS INTO YOUR NEXT PANEL</span><h2 id="market-next-step-title" className="mt-3">{t("재료를 골랐다면,", "Picked your materials?")}<br />{t("이제 내 원고에 맞춰보세요.", "Now fit them to your manuscript.")}</h2><p>{t("마음에 드는 소재를 모으고 제작 조건을 비교하세요. 선화·채색이 막히는 순간에는 학습 과정을, 장면의 근거가 필요할 때에는 리서치 데스크를 이어서 활용할 수 있습니다.", "Collect the materials you like and compare production conditions. When line art or coloring stalls, continue with learning paths; when a scene needs grounding, continue with the research desk.")}</p></div>
          <nav aria-label={t("리소스 선택 다음 작업", "Next steps after choosing resources")}><Link href="/market/library">{t("내 에셋에서 작업 재료 정리", "Organize working materials in my assets")} <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/learn/paths/visual-finish">{t("선과 색의 완성도를 높이는 실습", "Practice to polish lines and colors")} <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/research/assets">{t("복식·소품·배경 레퍼런스 찾기", "Find costume, prop & background references")} <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/studio">{t("ToonStudio에서 다음 컷 그리기", "Draw the next panel in ToonStudio")} <ArrowRight size={16} aria-hidden="true" /></Link></nav>
        </section>
        <div>
          <h2 className="eyebrow text-fg-3">{t("사용권 안내", "License guide")}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-3">{t("무료 여부와 별개로 상업 이용, 수정, 출처 표기 조건을 확인하세요.", "Regardless of whether it's free, check the conditions for commercial use, modification, and attribution.")}</p>
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MARKET_LICENSE_GUIDE.map((license) => (
            <li key={license.license} className="rounded-xl border border-line bg-card p-4 transition-colors hover:border-accent/30 hover:bg-raised/60">
              <h3 className="text-sm font-semibold text-fg">{license.label}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{license.summary}</p>
              <a
                href={license.url ?? "/terms"}
                target={license.url ? "_blank" : undefined}
                rel={license.url ? "noreferrer" : undefined}
                className="mt-2 inline-flex min-h-11 items-center text-xs text-cool underline decoration-current underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {t("사용권 전문 보기", "Read the full license")}{license.url ? " ↗" : ""}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
