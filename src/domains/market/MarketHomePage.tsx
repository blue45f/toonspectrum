import { Store, Upload } from "lucide-react";

import { MARKET_KINDS, MARKET_LICENSES } from "./market-kind";
import { MarketResourceCard } from "./MarketResourceCard";
import { useMarketResources } from "./use-market-resources";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import Link from "@/src/compat/router-link";
import { ErrorState } from "@/src/components/error-state";


export function MarketHomePage() {
  const latest = useMarketResources({ limit: 8 });

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-12 lg:py-16">
          <p className="eyebrow text-accent">Creator Market</p>
          <h1 className="mt-2.5 text-pretty text-3xl font-bold leading-[1.1] sm:mt-3 sm:text-4xl lg:text-[2.9rem]">
            창작 마켓
          </h1>
          <p className="mt-3 max-w-xl text-pretty font-serif text-base italic leading-relaxed text-fg-2 sm:mt-4 sm:text-lg">
            스튜디오에서 태어난 브러시·팔레트·템플릿이 다음 작가의 도구가 되는 곳.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-line pt-5 sm:mt-9 sm:pt-6">
            <Link href="/market/browse" className={buttonClass({ variant: "solid", size: "md" })}>
              <Store className="h-4 w-4" aria-hidden="true" />
              리소스 둘러보기
            </Link>
            <Link href="/studio" className={buttonClass({ variant: "outline", size: "md" })}>
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
        <h2 className="eyebrow text-fg-3">Categories</h2>
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

      <Container size="wide" className="pb-10 sm:pb-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-fg-3">Latest</h2>
          <Link href="/market/browse" className="text-sm text-accent hover:text-accent-2">
            전체 보기 →
          </Link>
        </div>
        {latest.error ? (
          <ErrorState
            title="마켓 리소스를 불러오지 못했습니다"
            message={latest.error}
            onRetry={latest.reload}
            className="mt-4"
          />
        ) : (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
                <Link href="/studio" className="text-accent underline-offset-2 hover:underline">
                  스튜디오에서 첫 리소스를 공유해 보세요.
                </Link>
              </p>
            ) : null}
          </>
        )}
      </Container>

      <Container size="wide" className="pb-14">
        <h2 className="eyebrow text-fg-3">Licenses</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MARKET_LICENSES.map((license) => (
            <li key={license.license} className="rounded-xl border border-line bg-card p-4">
              <h3 className="text-sm font-semibold text-fg">{license.label}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{license.summary}</p>
              {license.url ? (
                <a
                  href={license.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-cool underline-offset-2 hover:underline"
                >
                  라이선스 전문 보기 ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
