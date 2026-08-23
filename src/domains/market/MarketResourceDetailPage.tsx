import { ArrowLeft, Cpu, Download, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  formatMarketByteSize,
  formatMarketDate,
  marketKindMeta,
  marketLicenseMeta,
} from "./market-kind";
import { MarketResourceCard } from "./MarketResourceCard";
import { useMarketResources } from "./use-market-resources";

import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import Link from "@/src/compat/router-link";
import { getCreatorMarketplaceResource } from "@/src/infrastructure/creator-marketplace-client";
import { NotFoundError } from "@/src/infrastructure/use-api-resource";

const ENGINE_LABELS: Record<string, string> = {
  canvas2d: "Canvas 2D",
  webgl2: "WebGL 2",
  webgpu: "WebGPU",
  three: "Three.js",
};

const DELIVERY_LABELS: Record<string, string> = {
  "portable-json": "portable JSON",
  "procedural-recipe": "절차형 레시피",
  "builtin-ref": "스튜디오 내장 참조",
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-fg-3">{label}</dt>
      <dd className="text-right text-xs font-medium text-fg">{children}</dd>
    </div>
  );
}

export function MarketResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<CreatorMarketplaceResourceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setRecord(null);
    setLoading(true);
    setNotFound(false);
    setError(null);

    getCreatorMarketplaceResource(id, controller.signal)
      .then((parsed) => {
        if (controller.signal.aborted) return;
        setRecord(parsed);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof NotFoundError) {
          setNotFound(true);
        } else {
          setError(cause instanceof Error && cause.message ? cause.message : "공유 리소스를 불러오지 못했습니다.");
        }
        setLoading(false);
      });

    return () => controller.abort();
  }, [id, reloadToken]);

  const related = useMarketResources(
    record ? { kind: record.kind, limit: 4 } : null
  );
  const relatedItems = related.items.filter((item) => item.id !== record?.id).slice(0, 4);

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <Link
        href="/market/browse"
        className="inline-flex items-center gap-1.5 text-sm text-fg-2 transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        마켓으로 돌아가기
      </Link>

      {loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-hidden="true">
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
      ) : notFound ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-panel p-12 text-center">
          <p className="text-sm font-medium text-fg">리소스를 찾을 수 없어요</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2">
            삭제되었거나 주소가 잘못되었을 수 있어요. 마켓에서 다른 리소스를 둘러보세요.
          </p>
          <Link href="/market/browse" className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
            마켓 탐색으로 이동
          </Link>
        </div>
      ) : error || !record ? (
        <div
          role="alert"
          className="mt-8 rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] p-12 text-center"
        >
          <p className="text-sm font-medium text-fg">공유 리소스를 불러오지 못했습니다</p>
          <p className="mt-1 text-sm text-fg-2">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
          >
            다시 시도
          </button>
        </div>
      ) : (
        (() => {
          const kind = marketKindMeta(record.kind);
          const license = marketLicenseMeta(record.license);
          const KindIcon = kind.icon;
          return (
            <article className="mt-6">
              <header
                className="relative overflow-hidden rounded-xl border border-line p-6 sm:p-8"
                style={{
                  background: `linear-gradient(140deg, oklch(0.30 0.07 ${kind.hue}) 0%, oklch(0.22 0.04 ${kind.hue}) 60%, oklch(0.19 0.02 ${kind.hue}) 100%)`,
                }}
              >
                <p className="eyebrow" style={{ color: `oklch(0.82 0.10 ${kind.hue})` }}>
                  {kind.english}
                </p>
                <h1 className="mt-2 max-w-2xl text-pretty text-2xl font-bold leading-tight text-fg sm:text-3xl">
                  {record.name}
                </h1>
                {record.description ? (
                  <p className="mt-2 max-w-xl text-pretty font-serif text-sm italic leading-relaxed text-fg/85 sm:text-base">
                    {record.description}
                  </p>
                ) : null}
                <KindIcon strokeWidth={1} aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 h-36 w-36 text-fg/10" />
              </header>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-6">
                  <section aria-labelledby="market-entries-heading">
                    <h2 id="market-entries-heading" className="eyebrow text-fg-3">
                      Contents · <span className="numeral tnum">{record.entries.length}</span> items
                    </h2>
                    <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
                      {record.entries.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-fg">{entry.name}</p>
                            <p className="truncate text-xs text-fg-3">{entry.id}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] text-fg-2">
                              {DELIVERY_LABELS[entry.delivery.mode] ?? entry.delivery.mode}
                            </span>
                            <span className="numeral tnum text-xs text-fg-3">
                              {entry.delivery.byteSize > 0 ? formatMarketByteSize(entry.delivery.byteSize) : "—"}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {record.tags.length > 0 ? (
                    <section aria-label="태그">
                      <ul className="flex flex-wrap gap-1.5">
                        {record.tags.map((tag) => (
                          <li key={tag}>
                            <Link
                              href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                              className="rounded bg-raised px-2 py-1 text-xs text-fg-2 transition-colors duration-150 hover:text-accent"
                            >
                              #{tag}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {relatedItems.length > 0 ? (
                    <section aria-labelledby="market-related-heading">
                      <h2 id="market-related-heading" className="eyebrow text-fg-3">
                        같은 종류 최신 리소스
                      </h2>
                      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {relatedItems.map((item) => (
                          <li key={item.id}>
                            <MarketResourceCard record={item} className="h-full" />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4">
                    <Link
                      href="/studio?assetMarket=community"
                      className={buttonClass({ variant: "solid", size: "md", className: "w-full" })}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      스튜디오에서 불러오기
                    </Link>
                    <p className="text-center text-[0.68rem] leading-relaxed text-fg-3">
                      Studio 자산 메뉴의 커뮤니티 마켓에서 설치할 수 있어요.
                    </p>
                  </div>

                  <dl className="divide-y divide-line rounded-xl border border-line bg-card px-4 py-1">
                    <MetaRow label="배급자">
                      {record.publisher.avatar ? (
                        <img
                          src={record.publisher.avatar}
                          alt=""
                          className="mr-1.5 inline-block h-4 w-4 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <Link
                        href={`/market/browse?q=${encodeURIComponent(record.publisher.name)}`}
                        className="underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                      >
                        {record.publisher.name}
                      </Link>
                    </MetaRow>
                    <MetaRow label="버전">
                      <span className="numeral tnum">v{record.resourceVersion}</span>
                    </MetaRow>
                    <MetaRow label="라이선스">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                        {license.label}
                      </span>
                    </MetaRow>
                    <MetaRow label="호환 엔진">
                      {record.compatibility.engines.map((engine) => ENGINE_LABELS[engine] ?? engine).join(", ")}
                    </MetaRow>
                    <MetaRow label="최소 스튜디오 버전">
                      <span className="numeral tnum">v{record.minimumStudioVersion}</span>
                    </MetaRow>
                    <MetaRow label="AI 사용">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className={`h-3.5 w-3.5 ${record.containsAi ? "text-warn" : "text-good"}`} aria-hidden="true" />
                        {record.containsAi ? "포함" : "미포함"}
                      </span>
                    </MetaRow>
                    {record.attributionText ? (
                      <MetaRow label="출처 표기">
                        <span className="block max-w-[180px] whitespace-normal break-words text-fg-2">
                          {record.attributionText}
                        </span>
                      </MetaRow>
                    ) : null}
                    <MetaRow label="업데이트">
                      <time dateTime={record.updatedAt}>{formatMarketDate(record.updatedAt)}</time>
                    </MetaRow>
                  </dl>

                  {record.provenance.origin === "permissive" ? (
                    <div className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-fg-2">
                      <p className="mb-1 inline-flex items-center gap-1 font-medium text-fg">
                        <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                        외부 허용 리소스
                      </p>
                      출처: {record.provenance.sourceName}
                      <br />
                      <a
                        href={record.provenance.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-cool underline-offset-2 hover:underline"
                      >
                        원본 소스 ↗
                      </a>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-fg-2">
                      <p className="mb-1 inline-flex items-center gap-1 font-medium text-fg">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        오리지널 창작
                      </p>
                      배급자가 직접 만든 리소스입니다.
                    </div>
                  )}
                </aside>
              </div>
            </article>
          );
        })()
      )}
    </Container>
  );
}
