#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def path(relative: str) -> Path:
    return ROOT / relative


def replace_once(relative: str, old: str, new: str) -> None:
    target = path(relative)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one replacement, found {count}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_between(relative: str, start: str, end: str, replacement: str) -> None:
    target = path(relative)
    text = target.read_text(encoding="utf-8")
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{relative}: start marker not found: {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{relative}: end marker not found: {end!r}")
    target.write_text(
        text[:start_index] + replacement + text[end_index:],
        encoding="utf-8",
    )


def write(relative: str, content: str) -> None:
    target = path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# Market navigation and route wiring.
replace_once(
    "src/domains/market/components/MarketNavHeader.tsx",
    "  FolderHeart,\n  Library,",
    "  FolderHeart,\n  GitCompareArrows,\n  Library,",
)
replace_once(
    "src/domains/market/components/MarketNavHeader.tsx",
    'import { useMarketLibrary } from "../hooks/use-market-library";\n',
    'import { useMarketCompare } from "../hooks/use-market-compare";\n'
    'import { useMarketLibrary } from "../hooks/use-market-library";\n',
)
replace_once(
    "src/domains/market/components/MarketNavHeader.tsx",
    "  const { totalCount: libraryCount } = useMarketLibrary();\n"
    "  const { wishlistCount } = useMarketWishlist();",
    "  const { totalCount: libraryCount } = useMarketLibrary();\n"
    "  const { wishlistCount } = useMarketWishlist();\n"
    "  const { compareCount } = useMarketCompare();",
)
replace_once(
    "src/domains/market/components/MarketNavHeader.tsx",
    "    {\n"
    "      href: \"/market/wishlist\",\n"
    "      label: \"찜 목록\",\n"
    "      icon: FolderHeart,\n"
    "      badge: wishlistCount > 0 ? wishlistCount : null,\n"
    "      active: pathname === \"/market/wishlist\",\n"
    "    },\n"
    "    {\n"
    "      href: \"/market/manage\",",
    "    {\n"
    "      href: \"/market/wishlist\",\n"
    "      label: \"찜 목록\",\n"
    "      icon: FolderHeart,\n"
    "      badge: wishlistCount > 0 ? wishlistCount : null,\n"
    "      active: pathname === \"/market/wishlist\",\n"
    "    },\n"
    "    {\n"
    "      href: \"/market/compare\",\n"
    "      label: \"에셋 비교\",\n"
    "      icon: GitCompareArrows,\n"
    "      badge: compareCount > 0 ? compareCount : null,\n"
    "      active: pathname === \"/market/compare\",\n"
    "    },\n"
    "    {\n"
    "      href: \"/market/manage\",",
)
replace_once(
    "src/domains/market/components/MarketNavHeader.tsx",
    "              {item.badge !== null ? (",
    "              {item.badge !== null && item.badge !== undefined ? (",
)

replace_once(
    "src/app/routes/groups/market.routes.tsx",
    "const MarketWishlistPage = lazyRetry(\n"
    "  () => import(\"@/src/domains/market/pages/MarketWishlistPage\").then((module) => ({ default: module.MarketWishlistPage })),\n"
    "  \"MarketWishlistPage\",\n"
    ");\n",
    "const MarketWishlistPage = lazyRetry(\n"
    "  () => import(\"@/src/domains/market/pages/MarketWishlistPage\").then((module) => ({ default: module.MarketWishlistPage })),\n"
    "  \"MarketWishlistPage\",\n"
    ");\n"
    "const MarketComparePage = lazyRetry(\n"
    "  () => import(\"@/src/domains/market/pages/MarketComparePage\").then((module) => ({ default: module.MarketComparePage })),\n"
    "  \"MarketComparePage\",\n"
    ");\n",
)
replace_once(
    "src/app/routes/groups/market.routes.tsx",
    '  { id: "market-wishlist", path: "/market/wishlist", element: <MarketWishlistPage /> },\n'
    '  { id: "market-resource", path: "/market/resource/:id", element: <MarketResourceDetailPage /> },',
    '  { id: "market-wishlist", path: "/market/wishlist", element: <MarketWishlistPage /> },\n'
    '  { id: "market-compare", path: "/market/compare", element: <MarketComparePage /> },\n'
    '  { id: "market-resource", path: "/market/resource/:id", element: <MarketResourceDetailPage /> },',
)

# Cards: remove invented ratings and name-based verification, then add comparison selection.
replace_once(
    "src/domains/market/components/MarketResourceCard.tsx",
    'import { ArrowUpRight, CheckCircle2, Heart, Layers, Star } from "lucide-react";',
    'import { ArrowUpRight, Heart, Layers } from "lucide-react";',
)
replace_once(
    "src/domains/market/components/MarketResourceCard.tsx",
    'import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";\n',
    'import { MarketCompareToggle } from "./MarketCompareToggle";\n\n'
    'import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";\n',
)
replace_once(
    "src/domains/market/components/MarketResourceCard.tsx",
    '  const isOfficial = record.publisher.name.includes("공식") || record.publisher.id.startsWith("00000000");\n',
    "",
)
replace_once(
    "src/domains/market/components/MarketResourceCard.tsx",
    "        {/* Wishlist Button (Top Left) */}\n"
    "        <button\n"
    "          type=\"button\"\n"
    "          onClick={(e) => {\n"
    "            e.preventDefault();\n"
    "            e.stopPropagation();\n"
    "            toggleWishlist(record);\n"
    "          }}\n"
    "          aria-label={wishlisted ? \"찜 해제\" : \"찜하기\"}\n"
    "          className={cn(\n"
    "            \"absolute left-2.5 top-2.5 z-10 flex size-7 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm shadow-sm transition-transform hover:scale-110\",\n"
    "            wishlisted ? \"text-warn\" : \"text-fg-3 hover:text-warn\",\n"
    "          )}\n"
    "        >\n"
    "          <Heart className={cn(\"size-3.5\", wishlisted && \"fill-warn text-warn\")} />\n"
    "        </button>\n",
    "        {/* Personal shortlist actions. They never imply acquisition or verification. */}\n"
    "        <div className=\"absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5\">\n"
    "          <button\n"
    "            type=\"button\"\n"
    "            onClick={(event) => {\n"
    "              event.preventDefault();\n"
    "              event.stopPropagation();\n"
    "              toggleWishlist(record);\n"
    "            }}\n"
    "            aria-label={wishlisted ? \"찜 해제\" : \"찜하기\"}\n"
    "            className={cn(\n"
    "              \"flex size-7 items-center justify-center rounded-full bg-card/80 shadow-sm backdrop-blur-sm transition-transform hover:scale-110\",\n"
    "              wishlisted ? \"text-warn\" : \"text-fg-3 hover:text-warn\",\n"
    "            )}\n"
    "          >\n"
    "            <Heart\n"
    "              className={cn(\"size-3.5\", wishlisted && \"fill-warn text-warn\")}\n"
    "              aria-hidden=\"true\"\n"
    "            />\n"
    "          </button>\n"
    "          <MarketCompareToggle record={record} compact />\n"
    "        </div>\n",
)
replace_once(
    "src/domains/market/components/MarketResourceCard.tsx",
    "        <div className=\"flex items-center justify-between text-xs text-fg-2\">\n"
    "          <div className=\"flex items-center gap-1.5 min-w-0\">\n"
    "            <span className=\"truncate\">{record.publisher.name}</span>\n"
    "            {isOfficial ? (\n"
    "              <CheckCircle2 className=\"size-3 shrink-0 text-accent\" aria-label=\"공식 인증 배급자\" />\n"
    "            ) : null}\n"
    "          </div>\n"
    "          <div className=\"flex items-center gap-1 text-[0.68rem] font-semibold text-fg shrink-0\">\n"
    "            <Star className=\"size-3 fill-amber-400 text-amber-400\" />\n"
    "            <span className=\"numeral tnum\">4.9</span>\n"
    "          </div>\n"
    "        </div>",
    "        <div className=\"flex items-center justify-between gap-2 text-xs text-fg-2\">\n"
    "          <span className=\"truncate\">{record.publisher.name}</span>\n"
    "          <span className=\"numeral tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2\">\n"
    "            v{record.resourceVersion}\n"
    "          </span>\n"
    "        </div>",
)

# Creator management: replace synthetic score with package facts.
replace_once(
    "src/domains/market/pages/MarketManagePage.tsx",
    "  RefreshCw,\n  Star,\n  Trash2,",
    "  RefreshCw,\n  Trash2,",
)
replace_once(
    "src/domains/market/pages/MarketManagePage.tsx",
    'import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";',
    'import {\n  formatMarketByteSize,\n  marketKindMeta,\n  marketLicenseMeta,\n} from "../models/market-kind";',
)
replace_once(
    "src/domains/market/pages/MarketManagePage.tsx",
    "                      <span className=\"flex items-center gap-1 text-amber-400 font-semibold\">\n"
    "                        <Star className=\"size-3 fill-amber-400\" />\n"
    "                        <span>4.9</span>\n"
    "                      </span>\n",
    "                      <span>항목: {record.entries.length}개</span>\n"
    "                      <span>manifest: {formatMarketByteSize(record.manifestByteSize)}</span>\n",
)

# Detail page: keep only manifest-backed evidence and expose the comparison action.
replace_once(
    "src/domains/market/components/MarketResourceDetailArticle.tsx",
    'import { MarketCommentsSection } from "./MarketCommentsSection";\n',
    'import { MarketCommentsSection } from "./MarketCommentsSection";\n'
    'import { MarketCompareToggle } from "./MarketCompareToggle";\n',
)
replace_once(
    "src/domains/market/components/MarketResourceDetailArticle.tsx",
    "          <MarketWebtoonSpecBadge\n"
    "            format={record.kind.startsWith(\"3d\") ? \"glb\" : \"portable-json\"}\n"
    "            polycountGrade=\"optimal-webtoon\"\n"
    "            hasLineExtraction={true}\n"
    "            isNoAiProtected={!record.containsAi}\n"
    "            licenseTier=\"solo-creator\"\n"
    "          />",
    "          <MarketWebtoonSpecBadge\n"
    "            format={record.kind.startsWith(\"3d\") ? \"glb\" : \"portable-json\"}\n"
    "          />",
)
replace_between(
    "src/domains/market/components/MarketResourceDetailArticle.tsx",
    "          {/* Trust & License Guarantee Banner (Acon3D & Clip Studio Benchmark) */}",
    "          {/* Artist Reviews & Ratings (Real interactive submission & feedback) */}",
    """          {/* Decision evidence from the immutable public manifest. */}
          <section aria-labelledby="market-trust-guarantee-heading" className="rounded-xl border border-line bg-card p-5">
            <h2 id="market-trust-guarantee-heading" className="flex items-center gap-2 text-sm font-bold text-fg">
              <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" />
              게시 manifest 기반 권리·호환성 확인
            </h2>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              아래 내용은 배급자가 게시한 현재 릴리스의 선언입니다. 독립적인 법률·성능 보증으로 해석하지 말고 실제 프로젝트 적용 전에 세부 조건을 확인하세요.
            </p>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">{license.label}</p>
                  <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
                  <p className="mt-1 break-words text-[0.65rem] leading-relaxed text-fg-3">
                    {record.attributionText ? `출처 표기: ${record.attributionText}` : "게시된 출처 표기문 없음"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">Studio 호환 선언</p>
                  <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                    {record.compatibility.engines.map((engine) => ENGINE_LABELS[engine] ?? engine).join(", ")}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-fg-3">최소 Studio v{record.minimumStudioVersion}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">
                    {record.containsAi ? "AI 사용 포함으로 공개" : "AI 사용 미포함으로 공개"}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                    배급자 manifest의 공개값이며 ToonSpectrum의 독립 감정이나 NoAI 보증 배지가 아닙니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-cool" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">
                    {record.provenance.origin === "original" ? "배급자 직접 제작으로 공개" : "외부 허용 출처로 공개"}
                  </p>
                  {record.provenance.origin === "permissive" ? (
                    <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                      {record.provenance.sourceName} ·{" "}
                      <a
                        href={record.provenance.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line-strong underline-offset-2 hover:text-accent"
                      >
                        원본 확인
                      </a>
                      {" · "}
                      <a
                        href={record.provenance.sourceLicenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line-strong underline-offset-2 hover:text-accent"
                      >
                        원본 사용권
                      </a>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                      배급자가 원본 제작자로 선언한 릴리스입니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

""",
)
replace_once(
    "src/domains/market/components/MarketResourceDetailArticle.tsx",
    "              <span>{wishlisted ? \"찜한 에셋에서 제거\" : \"찜 목록에 추가\"}</span>\n"
    "            </button>\n"
    "            {currentRecord.isOwner ? (",
    "              <span>{wishlisted ? \"찜한 에셋에서 제거\" : \"찜 목록에 추가\"}</span>\n"
    "            </button>\n"
    "            <MarketCompareToggle record={currentRecord} className=\"w-full\" />\n"
    "            {currentRecord.isOwner ? (",
)

# Badge rendering must be evidence opt-in. Optional props no longer synthesize claims.
write(
    "src/domains/market/components/MarketWebtoonSpecBadge.tsx",
    '''import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { WebtoonLicenseTier } from "../models/market-webtoon-licensing";
import type {
  AssetFormatId,
  PolycountGrade,
} from "../models/market-webtoon-spec-inspector";

import { cn } from "@/lib/utils";

export interface MarketWebtoonSpecBadgeProps {
  readonly polycountGrade?: PolycountGrade;
  readonly format?: AssetFormatId;
  readonly hasLineExtraction?: boolean;
  readonly isNoAiProtected?: boolean;
  readonly licenseTier?: WebtoonLicenseTier;
  readonly className?: string;
}

export function MarketWebtoonSpecBadge({
  polycountGrade,
  format,
  hasLineExtraction,
  isNoAiProtected,
  licenseTier,
  className,
}: MarketWebtoonSpecBadgeProps) {
  if (
    !polycountGrade
    && !format
    && !hasLineExtraction
    && !isNoAiProtected
    && !licenseTier
  ) {
    return null;
  }

  return (
    <div
      data-testid="market-webtoon-spec-badge"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[0.65rem] font-semibold",
        className,
      )}
    >
      {format ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 font-mono uppercase text-fg">
          <Box className="size-3 text-fg-3" aria-hidden="true" />
          <span>{format.toUpperCase()}</span>
        </span>
      ) : null}

      {polycountGrade === "ultra-light" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-emerald-500">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          <span>초경량 3D</span>
        </span>
      ) : null}
      {polycountGrade === "optimal-webtoon" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-2 py-0.5 text-accent">
          <Sparkles className="size-3" aria-hidden="true" />
          <span>웹툰 최적화</span>
        </span>
      ) : null}
      {polycountGrade === "mid-poly" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
          <AlertTriangle className="size-3" aria-hidden="true" />
          <span>중밀도 3D</span>
        </span>
      ) : null}
      {polycountGrade === "heavy-warning" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-500">
          <AlertTriangle className="size-3" aria-hidden="true" />
          <span>고밀도 (LOD 권장)</span>
        </span>
      ) : null}

      {hasLineExtraction ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
          <span>은선 렌더링 지원</span>
        </span>
      ) : null}

      {isNoAiProtected ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-purple-500">
          <ShieldCheck className="size-3" aria-hidden="true" />
          <span>NoAI 조건 공개</span>
        </span>
      ) : null}

      {licenseTier ? (
        <span className="inline-flex items-center rounded-md border border-line/60 bg-panel px-2 py-0.5 text-fg-3">
          {licenseTier === "solo-creator" && "1인 작가 상업"}
          {licenseTier === "studio-team" && "스튜디오 팀(5인)"}
          {licenseTier === "corporate-agency" && "에이전시 법인"}
          {licenseTier === "open-cc0" && "CC0 공개"}
        </span>
      ) : null}
    </div>
  );
}
''',
)
write(
    "src/domains/market/components/MarketWebtoonSpecBadge.test.tsx",
    '''import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarketWebtoonSpecBadge } from "./MarketWebtoonSpecBadge";

describe("MarketWebtoonSpecBadge", () => {
  it("renders only explicitly supplied technical and rights evidence", () => {
    const markup = renderToStaticMarkup(
      <MarketWebtoonSpecBadge
        format="glb"
        polycountGrade="optimal-webtoon"
        hasLineExtraction={true}
        isNoAiProtected={true}
        licenseTier="solo-creator"
      />,
    );

    expect(markup).toContain("GLB");
    expect(markup).toContain("웹툰 최적화");
    expect(markup).toContain("은선 렌더링 지원");
    expect(markup).toContain("NoAI 조건 공개");
    expect(markup).toContain("1인 작가 상업");
  });

  it("does not invent optional badges from defaults", () => {
    const formatOnly = renderToStaticMarkup(
      <MarketWebtoonSpecBadge format="portable-json" />,
    );
    expect(formatOnly).toContain("PORTABLE-JSON");
    expect(formatOnly).not.toContain("웹툰 최적화");
    expect(formatOnly).not.toContain("은선 렌더링 지원");
    expect(formatOnly).not.toContain("NoAI");
    expect(formatOnly).not.toContain("1인 작가 상업");
    expect(renderToStaticMarkup(<MarketWebtoonSpecBadge />)).toBe("");
  });

  it("renders heavy warning badge when measured metadata supplies the grade", () => {
    const markup = renderToStaticMarkup(
      <MarketWebtoonSpecBadge polycountGrade="heavy-warning" />,
    );
    expect(markup).toContain("고밀도 (LOD 권장)");
  });
});
''',
)

# 3D viewer: remove fabricated mesh, optimization, NoAI, and license defaults.
replace_once(
    "src/domains/market/components/MarketWebtoon3dViewerModal.tsx",
    "  format = \"glb\",\n"
    "  triangleCount = 45000,\n"
    "  vertexCount = 28000,\n"
    "  polycountGrade = \"optimal-webtoon\",\n"
    "  licenseTier = \"solo-creator\",",
    "  format = \"glb\",\n"
    "  triangleCount,\n"
    "  vertexCount,\n"
    "  polycountGrade,\n"
    "  licenseTier,",
)
replace_once(
    "src/domains/market/components/MarketWebtoon3dViewerModal.tsx",
    "                구매 전 은선 추출, 셀 셰이딩, 낮/밤 조명 및 스튜디오 호환성을 실시간 확인하세요",
    "                뷰어 렌더 모드로 형태와 조명 조건을 비교하세요. 에셋 지원 여부는 게시 manifest를 기준으로 확인합니다",
)
replace_once(
    "src/domains/market/components/MarketWebtoon3dViewerModal.tsx",
    "            <MarketWebtoonSpecBadge\n"
    "              format={format}\n"
    "              polycountGrade={polycountGrade}\n"
    "              hasLineExtraction={true}\n"
    "              isNoAiProtected={true}\n"
    "              licenseTier={licenseTier}\n"
    "            />",
    "            <MarketWebtoonSpecBadge\n"
    "              format={format}\n"
    "              polycountGrade={polycountGrade}\n"
    "              licenseTier={licenseTier}\n"
    "            />",
)
replace_once(
    "src/domains/market/components/MarketWebtoon3dViewerModal.tsx",
    "          <div className=\"absolute bottom-4 left-4 rounded-xl border border-white/10 bg-black/70 px-3.5 py-2 text-[0.68rem] text-white/80 backdrop-blur-md\">\n"
    "            <div className=\"flex items-center gap-3 font-mono\">\n"
    "              <span>Triangles: {triangleCount.toLocaleString()}</span>\n"
    "              <span>Vertices: {vertexCount.toLocaleString()}</span>\n"
    "              <span>회전각: {orbitAngle}°</span>\n"
    "            </div>\n"
    "          </div>",
    "          <div className=\"absolute bottom-4 left-4 rounded-xl border border-white/10 bg-black/70 px-3.5 py-2 text-[0.68rem] text-white/80 backdrop-blur-md\">\n"
    "            <div className=\"flex items-center gap-3 font-mono\">\n"
    "              {triangleCount !== undefined ? (\n"
    "                <span>Triangles: {triangleCount.toLocaleString()}</span>\n"
    "              ) : null}\n"
    "              {vertexCount !== undefined ? (\n"
    "                <span>Vertices: {vertexCount.toLocaleString()}</span>\n"
    "              ) : null}\n"
    "              {triangleCount === undefined && vertexCount === undefined ? (\n"
    "                <span>메시 통계 미제공</span>\n"
    "              ) : null}\n"
    "              <span>회전각: {orbitAngle}°</span>\n"
    "            </div>\n"
    "          </div>",
)

# Drizzle schema parity for the already-public 3D asset kind.
replace_once(
    "apps/api/src/db/creator-marketplace-library.schema.ts",
    "sql`${table.kind} in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')`",
    "sql`${table.kind} in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset')`",
)
replace_once(
    "apps/api/src/db/creator-marketplace-report.schema.ts",
    "and ${table.evidence}->>'kind' in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')",
    "and ${table.evidence}->>'kind' in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset')",
)

# Production migration manifests and bootstrap/integration contracts.
manifest_path = path("scripts/production-database-migrations.manifest")
manifest = manifest_path.read_text(encoding="utf-8")
entry = "apps/api/src/db/migrations/0037_creator_marketplace_3d_asset_parity.sql"
if entry not in manifest.splitlines():
    manifest_path.write_text(manifest.rstrip() + "\n" + entry + "\n", encoding="utf-8")

replace_once(
    "scripts/run-production-database-migrations.test.mjs",
    "  expect(manifest).toHaveLength(36);\n"
    "  expect(manifest[0].id).toBe(\"0001_studio_ai_usage_ledger\");\n"
    "  expect(manifest.at(-1).id).toBe(\n"
    "    \"0036_traffic_analytics_relations\",\n"
    "  );\n"
    "  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(36);",
    "  expect(manifest).toHaveLength(37);\n"
    "  expect(manifest[0].id).toBe(\"0001_studio_ai_usage_ledger\");\n"
    "  expect(manifest.at(-1).id).toBe(\n"
    "    \"0037_creator_marketplace_3d_asset_parity\",\n"
    "  );\n"
    "  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(37);",
)
replace_once(
    "scripts/bootstrap-empty-production-database.mjs",
    '  "0035_creator_marketplace_3d_asset_kind",\n]);',
    '  "0035_creator_marketplace_3d_asset_kind",\n'
    '  "0037_creator_marketplace_3d_asset_parity",\n]);',
)
replace_once(
    "scripts/bootstrap-empty-production-database.test.mjs",
    '      "0036_traffic_analytics_relations",\n    ]);',
    '      "0036_traffic_analytics_relations",\n'
    '      "0037_creator_marketplace_3d_asset_parity",\n    ]);',
)
replace_once(
    "scripts/verify-creator-marketplace-db.mts",
    '        "0033_creator_marketplace_cloud_library.sql",\n'
    '        "0034_creator_marketplace_package_moderation.sql",\n',
    '        "0033_creator_marketplace_cloud_library.sql",\n'
    '        "0034_creator_marketplace_package_moderation.sql",\n'
    '        "0035_creator_marketplace_3d_asset_kind.sql",\n'
    '        "0037_creator_marketplace_3d_asset_parity.sql",\n',
)

# Focused regression expectations for card trust and comparison affordances.
replace_once(
    "src/domains/market/components/MarketResourceCard.test.tsx",
    '    expect(html).toContain("text-on-accent");\n'
    '    expect(html).not.toContain("text-white");',
    '    expect(html).toContain("text-on-accent");\n'
    '    expect(html).toContain("비교 목록에 추가");\n'
    '    expect(html).not.toContain(">4.9<");\n'
    '    expect(html).not.toContain("공식 인증 배급자");\n'
    '    expect(html).not.toContain("text-white");',
)

print("Marketplace engagement, comparison, and trust upgrade applied.")
