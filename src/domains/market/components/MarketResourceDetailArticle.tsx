import { Cpu, Download, FileJson, Link2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useState } from "react";

import {
  formatMarketByteSize,
  formatMarketDate,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import {
  brushPreviewData,
  filterPreviewData,
  palettePreviewColors,
  recipePreviewData,
  templatePreviewData,
} from "../models/market-preview";

import { MarketBrushPreview } from "./MarketBrushPreview";
import { MarketFilterPreview } from "./MarketFilterPreview";
import { MarketPalettePreview } from "./MarketPalettePreview";
import { MarketResourceCard } from "./MarketResourceCard";
import { MarketScene3dPreview } from "./MarketScene3dPreview";
import { MarketTemplatePreview } from "./MarketTemplatePreview";
import { StaleNoticeBar } from "./StaleNoticeBar";

import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/components/ui/button-utils";
import Link from "@/src/compat/router-link";

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

function ShareLinkButton() {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function shareCurrentLink() {
    const url = window.location.href;
    setStatus("idle");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: document.title });
        setStatus("shared");
        return;
      } catch (error) {
        if ((error as { name?: unknown } | null)?.name === "AbortError") return;
        // 공유 시트가 실패하면 클립보드 복사를 한 번 더 시도한다.
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
    }
  }

  const label = status === "shared"
    ? "공유했어요"
    : status === "copied"
      ? "링크를 복사했어요"
      : status === "failed"
        ? "공유할 수 없어요 · 다시 시도"
        : "링크 공유";

  return (
    <button
      type="button"
      onClick={() => void shareCurrentLink()}
      className={buttonClass({ variant: "ghost", size: "sm", className: "w-full" })}
      aria-live="polite"
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function downloadMetadataSnapshot(record: CreatorMarketplaceResourceRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.packageId.replace(/[^a-z0-9._-]+/giu, "-")}-${record.resourceVersion}-metadata-snapshot.json`;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface MarketResourceDetailArticleProps {
  record: CreatorMarketplaceResourceRecord;
  relatedItems: readonly CreatorMarketplaceResourceRecord[];
  staleSavedAt: string | null;
  onRetry: () => void;
}

/** 로딩이 끝난 단건 리소스 본문 — 상태 분기는 페이지가, 렌더는 이 컴포넌트가 맡는다. */
export function MarketResourceDetailArticle({
  record,
  relatedItems,
  staleSavedAt,
  onRetry,
}: MarketResourceDetailArticleProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const KindIcon = kind.icon;
  const paletteColors = palettePreviewColors(record);
  const brushPreviews = brushPreviewData(record);
  const filterPreviews = filterPreviewData(record);
  const templatePreviews = templatePreviewData(record);
  const recipePreviews = recipePreviewData(record);
  const isDirectAsset = record.kind === "asset";
  const studioActionLabel = isDirectAsset
    ? "스튜디오 캔버스에 에셋 삽입"
    : record.kind === "template"
      ? "장면 템플릿 카탈로그 열기"
      : record.kind === "3d-preset"
        ? "3D 배경 카탈로그 열기"
        : "스튜디오에 리소스 팩 설치";
  const studioActionSummary = isDirectAsset
    ? "Studio 커뮤니티 마켓을 열고 지원되는 첫 에셋을 현재 캔버스에 삽입합니다."
    : record.kind === "template"
      ? "Studio 장면 템플릿 카탈로그와 참조된 템플릿 계열을 엽니다. 장면 카드를 눌러야 현재 컷에 적용됩니다."
      : record.kind === "3d-preset"
        ? "Studio 배경 3D 도형·절차형 카탈로그를 엽니다. 항목을 직접 선택해야 장면에 추가됩니다."
        : "Studio 커뮤니티 마켓을 열고 이 리소스 팩을 로컬 도구 라이브러리에 설치합니다.";

  return (
    <article className="mt-6">
      {staleSavedAt ? (
        <StaleNoticeBar
          savedAt={staleSavedAt}
          onRetry={onRetry}
          className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
        />
      ) : null}
      <header
        className="relative overflow-hidden rounded-xl border border-line bg-[linear-gradient(140deg,var(--color-card)_0%,var(--color-panel)_60%,var(--color-canvas)_100%)] p-6 text-fg sm:p-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex min-h-6 items-center rounded-md bg-accent px-2 text-xs font-bold text-on-accent"
          >
            {kind.label}
          </span>
          <span className="inline-flex min-h-6 items-center rounded-md bg-raised px-2 text-xs font-semibold text-fg">
            v{record.resourceVersion}
          </span>
          {record.containsAi ? (
            <span className="inline-flex min-h-6 items-center rounded-md border border-warn/40 bg-raised px-2 text-xs font-semibold text-fg">
              AI 포함
            </span>
          ) : (
            <span className="inline-flex min-h-6 items-center rounded-md border border-good/40 bg-raised px-2 text-xs font-semibold text-fg">
              순수 창작
            </span>
          )}
        </div>

        <h1 className="mt-3 max-w-2xl text-pretty text-2xl font-bold leading-tight text-fg sm:text-3xl">
          {record.name}
        </h1>
        {record.description ? (
          <p className="mt-2.5 max-w-xl text-pretty font-serif text-sm italic leading-relaxed text-fg sm:text-base">
            {record.description}
          </p>
        ) : null}
        <KindIcon strokeWidth={1} aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 h-36 w-36 text-fg/10" />
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Dynamic Interactive Previews by Kind */}
          {paletteColors ? (
            <MarketPalettePreview colors={paletteColors} paletteName={record.name} />
          ) : null}

          {brushPreviews && brushPreviews[0] ? (
            <MarketBrushPreview brush={brushPreviews[0]} />
          ) : null}

          {filterPreviews && filterPreviews[0] ? (
            <MarketFilterPreview filter={filterPreviews[0]} />
          ) : null}

          {templatePreviews && templatePreviews[0] ? (
            <MarketTemplatePreview template={templatePreviews[0]} />
          ) : null}

          {record.kind === "3d-preset" && recipePreviews && recipePreviews[0] ? (
            <MarketScene3dPreview recipe={recipePreviews[0]} />
          ) : null}

          {/* Contents Section */}
          <section aria-labelledby="market-entries-heading">
            <div className="flex items-center justify-between">
              <h2 id="market-entries-heading" className="eyebrow text-fg-3">
                패키지 항목 · <span className="numeral tnum">{record.entries.length}</span>개
              </h2>
              <span className="text-xs text-fg-3">
                전체 크기: {formatMarketByteSize(record.manifestByteSize)}
              </span>
            </div>
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
                      {entry.delivery.byteSize > 0 ? formatMarketByteSize(entry.delivery.byteSize) : "내장 참조"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Tags */}
          {record.tags.length > 0 ? (
            <section aria-label="태그">
              <ul className="flex flex-wrap gap-1.5">
                {record.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                      className="inline-flex min-h-6 items-center rounded bg-raised px-2.5 text-xs text-fg-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11 pointer-coarse:px-3"
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Related Resources */}
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
              href={`/studio?installMarketResource=${record.id}&assetMarket=community`}
              className={buttonClass({ variant: "solid", size: "md", className: "w-full" })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {studioActionLabel}
            </Link>
            <button
              type="button"
              onClick={() => downloadMetadataSnapshot(record)}
              className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
            >
              <FileJson className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              메타데이터 스냅샷 다운로드
            </button>
            <Link
              href={`/market/browse?kind=${record.kind}`}
              className={buttonClass({ variant: "ghost", size: "sm", className: "w-full" })}
            >
              이 리소스와 비슷한 것 더 보기
            </Link>
            <ShareLinkButton />
            <p className="text-center text-[0.68rem] leading-relaxed text-fg-3">
              {studioActionSummary}
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
                href={`/market/browse?publisher=${encodeURIComponent(record.publisher.id)}`}
                className="inline-flex min-h-6 items-center underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
              >
                {record.publisher.name}
              </Link>
            </MetaRow>
            <MetaRow label="패키지 ID">
              <span className="font-mono text-[0.68rem] text-fg-2">{record.packageId}</span>
            </MetaRow>
            <MetaRow label="버전">
              <span className="numeral tnum">v{record.resourceVersion}</span>
            </MetaRow>
            <MetaRow label="라이선스">
              <span className="flex max-w-[190px] flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                  {license.url ? (
                    <a
                      href={license.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-6 items-center underline decoration-line-strong underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                    >
                      {license.label}
                    </a>
                  ) : (
                    <Link
                      href="/terms"
                      className="inline-flex min-h-6 items-center underline decoration-line-strong underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                    >
                      {license.label}
                    </Link>
                  )}
                </span>
                <span className="font-normal leading-relaxed text-fg-2">{license.summary}</span>
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
                className="inline-flex min-h-6 items-center break-all text-cool underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
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
}
