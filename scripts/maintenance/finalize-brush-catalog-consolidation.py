#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip("\n") + "\n", encoding="utf-8")
    print(f"[write] {path}")


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"{path}: expected text not found: {old[:180]}")
    (ROOT / path).write_text(content.replace(old, new), encoding="utf-8")
    print(f"[replace] {path}")


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    content = read(path)
    start_index = content.find(start)
    end_index = content.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise RuntimeError(f"{path}: block markers not found")
    updated = content[:start_index] + replacement.rstrip() + "\n\n" + content[end_index:]
    (ROOT / path).write_text(updated, encoding="utf-8")
    print(f"[replace block] {path}")


def delete(path: str) -> None:
    target = ROOT / path
    if target.exists():
        target.unlink()
        print(f"[delete] {path}")


replace(
    "apps/web/src/domains/creator/studio-integration-closure.test.ts",
    '  it("keeps V5 catalogue recovery and V6 program ownership reachable from one brush route", () => {',
    '  it("keeps the consolidated product catalogue and V6 program ownership reachable from one brush route", () => {',
)
replace(
    "apps/web/src/domains/creator/studio-integration-closure.test.ts",
    '    expect(page).toContain("<StudioBrushLegacyCataloguePanel");',
    '    expect(page).toContain("<StudioBrushProductCataloguePanel");',
)
replace(
    "apps/web/src/domains/creator/studio-integration-closure.test.ts",
    '    expect(versionBridge).toContain("BRUSH_QUALITY_CATALOG");',
    '    expect(versionBridge).toContain("BRUSH_QUALITY_CATALOG");\n    expect(versionBridge).toContain("resolveProductBrushV6RecipeId");',
)
replace(
    "scripts/verify-toonstudio-integration.sh",
    "apps/web/src/domains/creator/brush-lab/StudioBrushLegacyCataloguePanel.tsx",
    "apps/web/src/domains/creator/brush-lab/StudioBrushProductCataloguePanel.tsx",
)

replace_between(
    "apps/web/src/domains/creator/brush/studio-brush-catalog-contract.test.ts",
    '  it("keeps all identities behind one searchable quick/full catalogue source", () => {',
    '  it("keeps quarantined presets resolvable for persisted documents while removing picker exposure", () => {',
    '''  it("keeps the full registry internal and exposes one 48-brush product catalogue", () => {
    const counts = STUDIO_BRUSH_CATALOG_COUNTS;
    expect(counts.core).toBe(BRUSH_PRESETS.length);
    expect(counts.pro).toBe(160);
    expect(counts.total).toBe(counts.core + counts.pro);
    expect(counts.erase).toBe(2);
    expect(counts.paint).toBe(counts.total - counts.erase);
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(counts.total);
    expect(new Set(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id))).toHaveProperty(
      "size",
      counts.total,
    );

    const productIds = new Set(
      filterStudioBrushCatalogItems({ category: "all" }).map((item) => item.id),
    );
    expect(productIds.size).toBe(48);

    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS) {
      expect(studioBrushCatalogItemById(item.id), `${item.id}: lookup drift`).toBe(item);
      expect(studioBrushCatalogKindLabel(item), `${item.id}: missing kind label`).toMatch(
        /^(펜·잉크|연필·흑연|마커|수채·수묵|유화·아크릴|에어브러시|목탄·파스텔|질감|망점·해칭|빛·효과|지우개)$/u,
      );
      const matches = filterStudioBrushCatalogItems({
        category: "beginner",
        query: item.id,
      });
      expect(
        matches.every((candidate) => productIds.has(candidate.id)),
        `${item.id}: search escaped the product catalogue`,
      ).toBe(true);
      if (!productIds.has(item.id)) {
        expect(
          matches.some((candidate) => candidate.id === item.id),
          `${item.id}: internal implementation became a product`,
        ).toBe(false);
      }
    }

    const quick = listStudioQuickBrushCatalogItems({
      favoriteIds: ["gpen"],
      recentIds: ["pencil", "pen"],
      limit: 3,
    });
    expect(quick.map(({ id, quickSource }) => [id, quickSource])).toEqual([
      ["gpen", "favorite"],
      ["pencil", "recent"],
      ["pen", "recent"],
    ]);
  });''',
)

contract_path = ROOT / "apps/web/src/domains/creator/brush/studio-brush-catalog-contract.test.ts"
contract = contract_path.read_text(encoding="utf-8")
if "STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS" not in contract.split('from "./studio-brush-catalog";')[0]:
    contract = contract.replace(
        "  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,\n",
        "  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,\n  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,\n",
    )
for old, new in [
    ('favoriteIds: [quarantinedId, "heart-stamp"]', 'favoriteIds: [quarantinedId, "gpen"]'),
    ('recentIds: [quarantinedId, "hair-fiber", "pen"]', 'recentIds: [quarantinedId, "pencil", "pen"]'),
    ('recentIds: [quarantinedId, "pen"]', 'recentIds: [quarantinedId, "pencil"]'),
    ('["heart-stamp", "favorite"]', '["gpen", "favorite"]'),
    ('["hair-fiber", "recent"]', '["pencil", "recent"]'),
    ('{ favoriteIds: ["heart-stamp"], recentIds: ["hair-fiber", "pen"] }', '{ favoriteIds: ["gpen"], recentIds: ["pencil", "pen"] }'),
    ('{ favoriteIds: ["heart-stamp"], recentIds: ["hair-fiber", "pen"], limit: 3 }', '{ favoriteIds: ["gpen"], recentIds: ["pencil", "pen"], limit: 3 }'),
    ('{ limit: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length }', '{ limit: STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length }'),
    ('catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,', 'catalogItems: STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,'),
]:
    contract = contract.replace(old, new)
contract_path.write_text(contract, encoding="utf-8")
print("[patch] studio-brush-catalog-contract.test.ts")

write(
    "docs/rewrite/brush-quality-design-productization-20260912.md",
    '''# 브러시 제품 카탈로그 축소 결정

## 결정

제품 브러시는 **48종**으로 고정한다.

브러시 이름이나 과거 실험 브랜치의 설계 개수가 아니라 다음 기준으로 별도 제품 슬롯을
판단한다.

1. 실제 live·commit·export 결과가 육안으로 구분된다.
2. 필압·기울기·속도에 대한 손맛이 다른 브러시로 느껴진다.
3. 재질, 패턴 위상 또는 입자 분포를 일반 굵기·불투명도 설정으로 재현할 수 없다.
4. 고유한 렌더 경로가 있으며 제품 품질 게이트를 통과한다.

이 기준을 충족하지 않는 구현 변형은 내부 렌더러 메타데이터로만 남고 제품 선택기에는
노출하지 않는다.

## 정본

`STUDIO_BRUSH_QUALITY_PORTFOLIO`가 제품 브러시의 단일 정본이다.

- 전체 제품 브러시: 48
- 페인트 브러시: 46
- 지우개: 2
- 기본 목록, 전체 탭, 검색, 즐겨찾기, 최근 사용, 빠른 선택은 모두 같은 48종을 사용한다.
- Brush Editor도 같은 48종에서 시작한다.
- 72종 V5 설계 택소노미와 별도 승계 카탈로그는 제거한다.

## 내부 구현과 제품 종류의 분리

`STUDIO_ALL_BRUSH_CATALOG_ITEMS`는 렌더러와 개발 도구가 사용하는 내부 등록부다. 내부
등록부에 행이 있다고 해서 사용자에게 별도 브러시로 노출하지 않는다.

제품 검색과 선택은 `STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS`를 사용하며, 이 값은 48종
제품 포트폴리오와 동일하다.

`absorbedIds`는 어떤 구현 변형을 대표 브러시에 합쳤는지 설명하는 감사 메타데이터다.
마이그레이션, 숨은 검색 결과 또는 저장 문서 복구를 위한 resolver로 사용하지 않는다.

## 편집과 렌더링

페인트 브러시는 가장 가까운 V6 편집 레시피를 시작점으로 사용한다. 지우개는 V6 페인트
레시피를 만들지 않고 제품 선택기로 이동한다.

저장된 V6 프로그램은 공통 resolver를 통해 다음 세 경로에 동일하게 적용한다.

- live stroke
- settled document render
- SVG export

## CI 계약

필수 `core` 체크는 더 이상 skip되지 않는다. 다음을 실제로 실행한다.

- architecture·CSP·toolchain 검사
- 전체 strict ESLint
- application·API·realtime worker typecheck
- 48종 제품 카탈로그와 렌더 경계 집중 테스트
- 제품 카탈로그 정적 감사
- API 및 웹 production build
- Studio bundle budget
''',
)

write(
    ".github/workflows/ci.yml",
    '''name: CI

on:
  workflow_dispatch:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  core:
    name: core
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    env:
      NODE_OPTIONS: --max-old-space-size=8192
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - name: Install locked workspace
        run: pnpm install --frozen-lockfile --prefer-offline
      - name: Repository contracts
        run: |
          set -euo pipefail
          pnpm run validate:architecture
          pnpm run verify:csp
          pnpm run verify:toolchain-coverage
      - name: Strict lint
        run: pnpm run lint:strict
      - name: Typecheck application, API and realtime worker
        run: |
          set -euo pipefail
          pnpm run typecheck
          pnpm run typecheck:cloudflare-realtime
      - name: Brush product and render contracts
        run: |
          set -euo pipefail
          pnpm exec vitest run \
            apps/web/src/domains/creator/brush/studio-brush-quality-portfolio.test.ts \
            apps/web/src/domains/creator/brush/studio-brush-listed-uniqueness.test.ts \
            apps/web/src/domains/creator/brush/studio-brush-catalog-contract.test.ts \
            apps/web/src/domains/creator/brush/studio-brush-browser-evidence.test.ts \
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts \
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts \
            apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx \
            apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality.test.ts \
            apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts \
            apps/web/src/app/routes/groups/creator-brush-lab-route-contract.test.ts \
            apps/web/src/domains/creator/studio-integration-closure.test.ts
          pnpm exec tsx scripts/audit-studio-brush-quality-portfolio.mts
      - name: Build deployable release
        run: |
          set -euo pipefail
          pnpm --filter @webtoon-nest/api build
          pnpm run build
          pnpm run check:studio-bundle

  verify:
    name: verify
    needs: core
    if: ${{ always() }}
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Require deployable core
        env:
          CORE_RESULT: ${{ needs.core.result }}
        run: |
          set -euo pipefail
          test "$CORE_RESULT" = success
          echo "Required core validation passed."
''',
)

stability_path = ROOT / ".github/workflows/studio-brush-filter-stability.yml"
stability = stability_path.read_text(encoding="utf-8")
old = '''      - name: Product brush taxonomy, succession and render boundary contracts
        run: |
          set -o pipefail
          mkdir -p /tmp/studio-stability-unit-evidence
          git rev-parse HEAD > /tmp/studio-stability-unit-evidence/commit.txt
          pnpm exec vitest run \\
            apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts \\
            apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx \\
            apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts \\
            2>&1 | tee /tmp/studio-stability-unit-evidence/brush-product-contracts.log
'''
new = '''      - name: Consolidated product catalogue and render boundary contracts
        run: |
          set -o pipefail
          mkdir -p /tmp/studio-stability-unit-evidence
          git rev-parse HEAD > /tmp/studio-stability-unit-evidence/commit.txt
          pnpm exec vitest run \\
            apps/web/src/domains/creator/brush/studio-brush-quality-portfolio.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-listed-uniqueness.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-browser-evidence.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts \\
            apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts \\
            apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx \\
            apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality.test.ts \\
            apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts \\
            2>&1 | tee /tmp/studio-stability-unit-evidence/brush-product-contracts.log
          pnpm exec tsx scripts/audit-studio-brush-quality-portfolio.mts \\
            2>&1 | tee /tmp/studio-stability-unit-evidence/brush-product-audit.log
'''
if old not in stability:
    raise RuntimeError("studio brush stability workflow block not found")
stability_path.write_text(stability.replace(old, new), encoding="utf-8")
print("[patch] .github/workflows/studio-brush-filter-stability.yml")

replace(
    "apps/web/src/domains/creator/brush/StudioBrushLibrarySheet.tsx",
    "// 328 brushes behind a drawer that offers 240 (2026-08-21 로스터 축소 이후).",
    "// The drawer count is the curated product inventory, not the internal renderer registry.",
)

for path in [
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-catalog.ts",
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.ts",
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.test.ts",
    "apps/web/src/domains/creator/brush-lab/StudioBrushLegacyCataloguePanel.tsx",
]:
    delete(path)

for pattern in [
    "studio-brush-quality-design-",
    "STUDIO_BRUSH_QUALITY_DESIGNS",
    "StudioBrushLegacyCataloguePanel",
    "legacyBrushId",
    "resolveLegacyBrushV6RecipeId",
]:
    matches: list[str] = []
    for base in [ROOT / "apps/web/src", ROOT / "scripts", ROOT / ".github/workflows"]:
        for target in base.rglob("*"):
            if not target.is_file() or target.suffix not in {".ts", ".tsx", ".mts", ".mjs", ".js", ".sh", ".yml", ".yaml"}:
                continue
            if pattern in target.read_text(encoding="utf-8", errors="ignore"):
                matches.append(str(target.relative_to(ROOT)))
    if matches:
        raise RuntimeError(f"stale {pattern!r} references: {matches}")

print("[done] brush catalogue consolidation finalized")
