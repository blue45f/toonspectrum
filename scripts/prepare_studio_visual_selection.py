#!/usr/bin/env python3
"""One-time reviewed source migration. No binary, user asset or stored work deletion."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(relative: str, before: str, after: str) -> None:
    path = ROOT / relative
    text = path.read_text()
    if after in text:
        return
    if text.count(before) != 1:
        raise ValueError('Reviewed anchor drift: ' + relative + ': ' + before[:100])
    path.write_text(text.replace(before, after, 1))


def main() -> None:
    originals = 'src/domains/creator/studio-original-free-asset-packs.ts'
    path = ROOT / originals
    text = path.read_text()
    value_import = 'import { isStudioAssetVisuallySelectable } from "./studio-asset-visual-policy";\n\n'
    if value_import not in text:
        path.write_text(value_import + text)
    patch(originals,
          'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([...EVERYDAY_ASSETS]);',
          'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([\n  ...EVERYDAY_ASSETS,\n  ...ATMOSPHERE_ASSETS.filter((asset) => !isStudioAssetVisuallySelectable(asset.id)),\n]);')
    patch(originals,
          '    STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.flatMap((pkg) => pkg.includedItems)\n',
          '    STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.flatMap((pkg) => pkg.includedItems)\n      .filter((asset) => isStudioAssetVisuallySelectable(asset.id))\n')

    catalog = 'src/domains/creator/studio-cc0-asset-delivery.ts'
    patch(catalog,
          'import type { StudioAsset } from "./studio-asset-library";',
          'import { isStudioAssetVisuallySelectable, studioAssetVisualStyle, type StudioAssetVisualStyle } from "./studio-asset-visual-policy";\n\nimport type { StudioAsset } from "./studio-asset-library";')
    patch(catalog,
          'export function filterStudioCc0Assets(assets: readonly StudioCc0Asset[], query: string, kind?: StudioCc0AssetKind): readonly StudioCc0Asset[] {',
          'export function filterStudioCc0Assets(assets: readonly StudioCc0Asset[], query: string, kind?: StudioCc0AssetKind, style: StudioAssetVisualStyle = "all"): readonly StudioCc0Asset[] {')
    patch(catalog,
          '  return assets.filter(asset => (!kind || asset.kind === kind) && terms.every(term =>',
          '  return assets.filter(asset => isStudioAssetVisuallySelectable(asset.id)\n    && (!kind || asset.kind === kind)\n    && (style === "all" || studioAssetVisualStyle(asset) === style)\n    && terms.every(term =>')
    patch(catalog,
          '      .join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(term)));',
          '      .join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(term)))\n    .sort((a, b) => Number(studioAssetVisualStyle(b) === "pbr") - Number(studioAssetVisualStyle(a) === "pbr"));')

    panel = 'src/domains/creator/StudioCc0AssetLibraryPanel.tsx'
    patch(panel,
          'import type { StudioAsset } from "./studio-asset-library";',
          'import { STUDIO_ASSET_VISUAL_STYLE_LABELS, studioAssetVisualStyle, type StudioAssetVisualStyle } from "./studio-asset-visual-policy";\n\nimport type { StudioAsset } from "./studio-asset-library";')
    patch(panel,
          '  const [page, setPage] = useState(0);',
          '  const [style, setStyle] = useState<StudioAssetVisualStyle>("all");\n  const [page, setPage] = useState(0);')
    patch(panel,
          'filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind), [catalog, query, kind]',
          'filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind, style), [catalog, query, kind, style]')
    patch(panel,
          'CC0 원본 에셋 라이브러리 {catalog ? `· ${catalog.length}종` : ""}',
          'CC0 원본 에셋 라이브러리 {catalog ? `· ${filterStudioCc0Assets(catalog, "").length}종` : ""}')
    patch(panel,
          '3D는 로우폴리 스타일이며, GLB 파일을 받은 뒤 3D 도구의 모델 가져오기를 사용하세요.',
          '정밀 PBR 모델과 스타일화 로우폴리를 구분해 고를 수 있습니다. GLB 파일을 받은 뒤 3D 도구의 모델 가져오기를 사용하세요.')
    patch(panel,
          '        {loadError ? <div role="alert"',
          '        <div className="flex flex-wrap gap-1.5" role="group" aria-label="에셋 표현 스타일">\n'
          '          {(["all", "pbr", "stylized", "image"] as const).map(value => <button type="button" key={value} className={`${CONTROL} ${style === value ? "border-accent font-bold text-accent" : ""}`} aria-pressed={style === value} onClick={() => {setStyle(value); setPage(0);}}>{STUDIO_ASSET_VISUAL_STYLE_LABELS[value]}</button>)}\n'
          '        </div>\n'
          '        {loadError ? <div role="alert"')
    patch(panel,
          '<article key={asset.id} className="min-w-0',
          '<article key={asset.id} data-cc0-asset-id={asset.id} data-cc0-style={studioAssetVisualStyle(asset)} className="min-w-0')
    patch(panel,
          'className="aspect-square w-full rounded-md bg-card object-contain" />',
          'className="aspect-square w-full rounded-md bg-card object-contain" style={asset.kind === "effect-mask" ? {backgroundColor: "#272a34", backgroundImage: "conic-gradient(#383c48 25%, transparent 0 50%, #383c48 0 75%, transparent 0)", backgroundSize: "24px 24px"} : undefined} />')
    patch(panel,
          '{asset.provider} · CC0{asset.width',
          '{asset.provider} · CC0 · {STUDIO_ASSET_VISUAL_STYLE_LABELS[studioAssetVisualStyle(asset)]}{asset.width')
    patch(panel,
          '        <p role="status" aria-live="polite"',
          '        <p className="text-xs text-fg-3">정밀 모델·재질 출처: <a href="https://polyhaven.com" target="_blank" rel="noreferrer" className="underline focus-visible:ring-2 focus-visible:ring-accent">Poly Haven</a>. 추가 다운로드 없이 페이지에 표시된 미리보기만 먼저 불러옵니다.</p>\n'
          '        <p role="status" aria-live="polite"')

    marketplace = 'src/domains/creator/StudioOriginalAssetMarketplacePanel.tsx'
    patch(marketplace,
          'STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.reduce((count, pkg) => count + pkg.includedItems.length, 0)',
          'filterStudioOriginalFreeAssets().length')

    # These are catalog selection-count assertions. Legacy source identities remain unchanged.
    for relative in ('src/domains/creator/studio-original-free-asset-packs.test.ts',
                     'src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx'):
        path = ROOT / relative
        text = path.read_text().replace('24 unique', '20 unique').replace('all 24 selectable', 'all 20 selectable')
        text = text.replace('toHaveLength(24)', 'toHaveLength(20)').replace('.toBe(24)', '.toBe(20)').replace('"24 FREE"', '"20 FREE"')
        path.write_text(text)
    tests = 'src/domains/creator/studio-cc0-asset-delivery.test.ts'
    path = ROOT / tests
    text = path.read_text().replace('expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(8)', 'expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(12)')
    text = text.replace('expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(24)', 'expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(20)')
    text = text.replace('expect(filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(8)', 'expect(filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(4)')
    text = text.replace('removes eight draft backgrounds', 'removes eight draft backgrounds and four weak overlays')
    path.write_text(text)
    print('Connected five selection retirements; preserved all legacy raw sources and IDs.')


if __name__ == '__main__':
    main()
