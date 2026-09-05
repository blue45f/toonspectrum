#!/usr/bin/env python3
"""Update explicit catalog-count fixtures; preserve coverage of every legacy SVG."""
from pathlib import Path
from finalize_studio_asset_delivery import replace_once

ROOT = Path(__file__).resolve().parents[1]


def prepare_regressions() -> None:
    original = ROOT / 'src/domains/creator/studio-original-free-asset-packs.test.ts'
    replace_once(original,
        'ships four distinct packages and 32 unique original SVG assets',
        'ships three selectable packages and 24 unique non-blockout SVG assets')
    # These assertions describe the selection catalog, not legacy identity resolution.
    text = original.read_text()
    text = text.replace('toHaveLength(4);', 'toHaveLength(3);').replace('toHaveLength(32);', 'toHaveLength(24);')
    text = text.replace('.toBe(4);', '.toBe(3);').replace('.toBe(32);', '.toBe(24);')
    original.write_text(text)
    replace_once(original,
        '.toEqual(["original-clinic-waiting-room"]);',
        '.toEqual([]); // The blockout remains resolvable by ID, but is not a new-selection result.')

    panel = ROOT / 'src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx'
    text = panel.read_text().replace('"32 FREE"', '"24 FREE"').replace('"무료 (4)"', '"무료 (3)"')
    text = text.replace('renders all 32 accessible, draggable starter assets', 'renders all 24 selectable, draggable starter assets')
    text = text.replace('toHaveLength(32);', 'toHaveLength(24);')
    text = text.replace('expect(html).toContain("일상 공간 블록아웃");', 'expect(html).not.toContain("일상 공간 블록아웃");')
    text = text.replace('expect(html).toContain(\'data-studio-original-asset="original-compact-studio-room"\');', 'expect(html).not.toContain(\'data-studio-original-asset="original-compact-studio-room"\');')
    panel.write_text(text)

    drag = ROOT / 'src/domains/creator/studio-shared-asset-drag.test.ts'
    replace_once(drag,
        '  STUDIO_ORIGINAL_FREE_ASSETS,\n} from "./studio-original-free-asset-packs";',
        '  STUDIO_ORIGINAL_FREE_ASSETS,\n  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,\n} from "./studio-original-free-asset-packs";')
    replace_once(drag,
        '    expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(32);\n    for (const asset of STUDIO_ORIGINAL_FREE_ASSETS) {',
        '    const allLegacyAndSelectableAssets = [...STUDIO_ORIGINAL_FREE_ASSETS, ...STUDIO_RETIRED_ORIGINAL_FREE_ASSETS];\n'
        '    expect(allLegacyAndSelectableAssets).toHaveLength(32);\n'
        '    for (const asset of allLegacyAndSelectableAssets) {')
    print('Selection fixtures updated; all 32 legacy SVGs retain safe drag-parser coverage.')


if __name__ == '__main__':
    prepare_regressions()
