import { Store, Upload } from "lucide-react";

import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketHomeJsonLd } from "../models/market-jsonld";
import { MARKET_KINDS, MARKET_LICENSES } from "../models/market-kind";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import Link from "@/src/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/src/hooks/use-document-title";

const MARKET_HOME_DESCRIPTION =
  "브러시, 팔레트, 필터, 장면 템플릿, 3D 프리셋과 에셋을 살펴보고 ToonSpectrum Studio에서 바로 활용하세요.";

export function MarketHomePage() {
  const latest = useMarketResources({ limit: 8, sort: "newest" });
  const hasLatestItems = latest.items.length > 0;
  const hasFatalLatestError = Boolean(latest.error) && !hasLatestItems;

  useDocumentTitle("창작 마켓");
  useMetaDescription(MARKET_HOME_DESCRIPTION);
  usePageSocialMeta({
    canonicalPath: "/market",
    title: "창작 마켓 · 툰스펙트럼",
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

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-12 lg:py-16">
          <p className="eyebrow text-accent">Creator Market</p>
          <h1 className="mt-2.5 text-pretty text-3xl font-bold leading-[1.1] sm:mt-3 sm:text-4xl lg:text-[2.9rem]">
            창작 마켓
          </h1>
          <p className="mt-3 max-w-xl text-pretty font-serif text-base italic leading-relaxed text-fg-2 sm:mt-4 sm:text-lg">
            스튜디오에서 태어난 창작 리소스가 다음 작가의 도구가 되는 곳.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-line pt-5 sm:mt-9 sm:pt-6">
            <Link href="/market/browse" className={buttonClass({ variant: "solid", size: "md" })}>
              <Store className="h-4 w-4" aria-hidden="true" />
              리소스 둘러보기
            </Link>
            <Link
              href="/studio?assetMarket=community&communityView=share"
              className={buttonClass({ variant: "outline", size: "md" })}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              스튜디오에서 공유하기
            </Link>
            <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good">
              전 리소스 무료 공유
            </span>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-8 sm:py-10 lg:py-12">
        <h2 className="eyebrow text-fg-3">리소스 종류</h2>
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {MARKET_KINDS.map((kind) => {
            const KindIcon = kind.icon;
            return (
              <li key={kind.kind}>
                <Link
                  href={`/market/browse?kind=${kind.kind}`}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-card p-3.5 transition-[border-color,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <KindIcon
                    strokeWidth={1.5}
                    className="h-6 w-6 transition-colors duration-200"
                    style={{ color: `oklch(0.78 0.11 ${kind.hue})` }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-fg">{kind.label}</span>
                  <span className="line-clamp-2 text-xs leading-snug text-fg-3">{kind.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>

      {popularTags.length >= 3 ? (
        <Container size="wide" className="pb-10 sm:pb-12">
          <h2 className="eyebrow text-fg-3">최신 리소스 태그</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {popularTags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex min-h-11 items-center rounded bg-raised px-3 py-2 text-xs text-fg-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
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
          <h2 className="eyebrow text-fg-3">최근 공유</h2>
          <Link
            href="/market/browse"
            className="inline-flex min-h-6 items-center text-sm text-accent hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
          >
            전체 보기 →
          </Link>
        </div>
        {hasFatalLatestError ? (
          <StaleNoticeBar
            message="지금은 새 목록을 불러올 수 없어요. 잠시 후 다시 시도해 주세요."
            onRetry={latest.reload}
            className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
          />
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
            {latest.loading ? (
              <p role="status" className="sr-only">
                최근 공유된 마켓 리소스를 불러오는 중입니다.
              </p>
            ) : null}
            <ul
              aria-busy={latest.loading || undefined}
              className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
            >
              {latest.loading
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
              <p className="mt-6 rounded-xl border border-dashed border-line bg-panel p-8 text-center text-sm text-fg-2">
                아직 공유된 리소스가 없어요.{" "}
                <Link
                  href="/studio?assetMarket=community&communityView=share"
                  className="inline-flex min-h-6 items-center text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
                >
                  스튜디오에서 첫 리소스를 공유해 보세요.
                </Link>
              </p>
            ) : null}
          </>
        )}
      </Container>

      <Container size="wide" className="pb-14">
        <h2 className="eyebrow text-fg-3">사용권 안내</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MARKET_LICENSES.map((license) => (
            <li key={license.license} className="rounded-xl border border-line bg-card p-4">
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
