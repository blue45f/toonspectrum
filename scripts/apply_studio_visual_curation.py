#!/usr/bin/env python3
"""Apply reviewed catalog edits with exact anchors; never touch user storage."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CREATOR = ROOT / 'src/domains/creator'


def replace_once(path: Path, before: str, after: str) -> None:
    text = path.read_text(encoding='utf-8')
    if after in text:
        return
    if text.count(before) != 1:
        raise ValueError(f'Reviewed anchor changed in {path.name}: {before[:120]}')
    path.write_text(text.replace(before, after, 1), encoding='utf-8')


def main() -> None:
    catalog = CREATOR / 'studio-cc0-asset-delivery.ts'
    replace_once(catalog,
        'import type { StudioAsset } from "./studio-asset-library";',
        'import { isStudioAssetVisuallySelectable } from "./studio-asset-visual-curation";\n\nimport type { StudioAsset } from "./studio-asset-library";')
    replace_once(catalog,
        '  "surface-material": "표면 재질",',
        '  "surface-material": "표면 재질",\n  "pbr-detailed-prop": "상세 3D 소품",')
    replace_once(catalog,
        'return assets.filter(asset => (!kind || asset.kind === kind) && terms.every(term =>',
        'return assets.filter(asset => isStudioAssetVisuallySelectable(asset.id) && (!kind || asset.kind === kind) && terms.every(term =>')

    originals = CREATOR / 'studio-original-free-asset-packs.ts'
    replace_once(originals,
        'import type { StudioAsset } from "./studio-asset-library";',
        'import { isStudioAssetVisuallySelectable } from "./studio-asset-visual-curation";\n\nimport type { StudioAsset } from "./studio-asset-library";')
    replace_once(originals,
        'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([...EVERYDAY_ASSETS]);',
        'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([\n'
        '  ...EVERYDAY_ASSETS,\n'
        '  ...ATMOSPHERE_ASSETS.filter((asset) => !isStudioAssetVisuallySelectable(asset.id)),\n'
        ']);')
    replace_once(originals,
        '  Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID));',
        '  Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES\n'
        '    .filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID)\n'
        '    .map((pkg) => {\n'
        '      if (pkg.id !== ATMOSPHERE_PACKAGE_ID) return pkg;\n'
        '      return Object.freeze({\n'
        '        ...pkg,\n'
        '        version: "1.1.0",\n'
        '        packageFingerprint: `original-pack:v1:${pkg.id}:1.1.0`,\n'
        '        summary: "비·안개·햇살·봄 꽃잎·가을 낙엽의 분위기 효과 5종입니다.",\n'
        '        includedItems: Object.freeze(pkg.includedItems.filter((asset) => isStudioAssetVisuallySelectable(asset.id))),\n'
        '        changelog: [{version: "1.1.0", releasedAt: "2026-09-06", changes: ["대각선 중첩이 확인된 효과 3종을 신규 선택에서 제외", "기존 작품과 원본 ID는 유지"]}, ...pkg.changelog],\n'
        '        updatedAt: "2026-09-06T00:00:00.000Z",\n'
        '      });\n'
        '    }));')
    market = CREATOR / 'StudioOriginalAssetMarketplacePanel.tsx'
    replace_once(market,
        '  const previewPackage = previewAsset\n    ? findStudioOriginalFreeAssetPackage(previewAsset.packageId)\n    : null;',
        '  const previewPackage = previewAsset\n'
        '    ? STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.find((pkg) => pkg.id === previewAsset.packageId)\n'
        '      ?? findStudioOriginalFreeAssetPackage(previewAsset.packageId)\n'
        '    : null;')

    cc0_test = CREATOR / 'studio-cc0-asset-delivery.test.ts'
    replace_once(cc0_test,
        'expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(8);',
        'expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(11);')
    for name in ['studio-cc0-asset-delivery.test.ts', 'studio-original-free-asset-packs.test.ts', 'StudioOriginalAssetMarketplacePanel.test.tsx']:
        path = CREATOR / name
        text = path.read_text()
        text = text.replace('toHaveLength(24)', 'toHaveLength(21)').replace('.toBe(24)', '.toBe(21)')
        text = text.replace('24 unique non-blockout', '21 selectable reviewed').replace('all 24 selectable', 'all 21 selectable').replace('24 FREE', '21 FREE')
        text = re.sub(r'(categories:\s*\["atmosphere-fx"\],?\s*\}\)\)\.toHaveLength\()8(\))', r'\g<1>5\2', text)
        path.write_text(text)
    pack_test = CREATOR / 'studio-original-free-asset-packs.test.ts'
    replace_once(pack_test,
        'expect(pkg.includedItems).toHaveLength(8);',
        'expect(pkg.includedItems).toHaveLength(pkg.includedItems.some((asset) => asset.category === "atmosphere-fx") ? 5 : 8);')
    # Legacy safe SVG parsing still runs on all 32 original objects (21 active + 11 retired).
    drag = (CREATOR / 'studio-shared-asset-drag.test.ts').read_text()
    if 'STUDIO_RETIRED_ORIGINAL_FREE_ASSETS' not in drag or 'toHaveLength(32)' not in drag:
        raise ValueError('Legacy drag-parser coverage must not be reduced')
    print('Applied 4 new visual quarantines; legacy IDs, 32 SVGs and source URLs preserved.')


if __name__ == '__main__':
    main()
