#!/usr/bin/env python3
"""Apply inspected selection changes and record the actual contact-sheet scope.

This is a source migration, not a user-data migration. No upload, work or OPFS
record is deleted. It does not label uninspected dynamic poses as approved.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
RETIRED = ('original-soft-snow-overlay', 'original-night-bokeh', 'original-golden-dust')


def replace_once(path: Path, before: str, after: str) -> None:
    text = path.read_text()
    if after in text:
        return
    if text.count(before) != 1:
        raise ValueError(f'Reviewed source anchor changed: {path.name}: {before[:100]}')
    path.write_text(text.replace(before, after, 1))


def apply() -> None:
    creator = ROOT / 'src/domains/creator'
    catalog = creator / 'studio-original-free-asset-packs.ts'
    replace_once(catalog,
        'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([...EVERYDAY_ASSETS]);',
        'export const STUDIO_VISUALLY_RETIRED_OVERLAY_IDS: ReadonlySet<string> = new Set([\n'
        '  "original-soft-snow-overlay",\n'
        '  "original-night-bokeh",\n'
        '  "original-golden-dust",\n'
        ']);\n\n'
        'export const STUDIO_RETIRED_ORIGINAL_FREE_ASSETS = Object.freeze([\n'
        '  ...EVERYDAY_ASSETS,\n'
        '  ...ATMOSPHERE_ASSETS.filter((asset) => STUDIO_VISUALLY_RETIRED_OVERLAY_IDS.has(asset.id)),\n'
        ']);')
    replace_once(catalog,
        '  Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID));',
        '  Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES\n'
        '    .filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID)\n'
        '    .map((pkg) => pkg.id !== ATMOSPHERE_PACKAGE_ID ? pkg : Object.freeze({\n'
        '      ...pkg,\n'
        '      version: "1.1.0",\n'
        '      packageFingerprint: `${pkg.packageFingerprint}:visual-curation-20260906`,\n'
        '      includedItems: Object.freeze(pkg.includedItems.filter((asset) => !STUDIO_VISUALLY_RETIRED_OVERLAY_IDS.has(asset.id))),\n'
        '      summary: "비·안개·햇살·꽃잎·낙엽의 선택 가능한 오버레이 5종입니다. 이전 원본의 작품 참조는 유지합니다.",\n'
        '      changelog: [{version: "1.1.0", releasedAt: "2026-09-06", changes: ["대각선 군집 결함이 확인된 눈·보케·먼지 3종을 신규 선택에서 제외"]}, ...pkg.changelog],\n'
        '      updatedAt: "2026-09-06T00:00:00.000Z",\n'
        '    })));')
    tests = creator / 'studio-cc0-asset-delivery.test.ts'
    text = tests.read_text()
    text = text.replace('removes eight draft backgrounds from new selection without deleting their identities',
                        'retires eight draft backgrounds and three degenerate overlays while preserving legacy identities')
    text = text.replace('expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(8);',
                        'expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(11);')
    text = text.replace('expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(24);',
                        'expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(21);')
    text = text.replace('filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(8)',
                        'filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(5)')
    tests.write_text(text)
    for name in ('studio-original-free-asset-packs.test.ts', 'StudioOriginalAssetMarketplacePanel.test.tsx'):
        p = creator / name
        text = p.read_text().replace('24 unique non-blockout SVG assets', '21 unique selected SVG assets')
        text = text.replace('all 24 selectable', 'all 21 selectable').replace('"24 FREE"', '"21 FREE"')
        text = text.replace('toHaveLength(24)', 'toHaveLength(21)').replace('.toBe(24)', '.toBe(21)')
        p.write_text(text)
    # The existing drag test still iterates all 32 legacy + selectable SVGs.
    print('Applied selection-only retirement of three inspected overlays. All legacy SVG sources remain.')


def record_visual_scope() -> None:
    evidence = ROOT / 'docs/reports/asset-visual-review-20260906'
    original = json.loads((evidence / 'review-index.json').read_text())
    if original['totalVisualItems'] != 1351 or len(original['items']) != 1351:
        raise ValueError('Inspected inventory identity changed; do not assert an unseen batch was reviewed')
    files = ROOT / 'public/assets/studio/cc0-20260906'
    manifest = json.loads((files / 'manifest.json').read_text())
    digests = {a['id']: a['sha256'] for a in manifest['assets']}
    records = []
    for item in original['items']:
        row = dict(item)
        row['visuallyReviewed'] = True
        row['reviewLevel'] = 'contact-sheet-static-appearance'
        row['reviewer'] = 'assistant-visual-inspection'
        row['decision'] = 'retain-for-declared-style-and-role'
        row['findings'] = []
        if item['number'] <= 1097:
            row['evidence'] = {'artifactId': 9974215583,
                'artifactSha256': 'fee754df55af09cc7cad2d40ad120986797a971558e7262633eca696ebf3cb86',
                'sheet': f'review-sheet-{(item["number"]-1)//48+1:02d}.jpg',
                'cell': (item['number']-1)%48+1}
            row['sourceSha256'] = digests.get(item['id'])
        else:
            row['evidence'] = {'artifactId': 9974508464,
                'artifactSha256': 'beaca1b82c92d2b80683d4483b91de601221f33db684d05443876f8ed4cea6f8',
                'pdf': f'review-{(item["page"]-1)//12+1:02d}.pdf',
                'pageWithinPdf': (item['page']-1)%12+1,'cell':item['cell']}
        if item['id'] in RETIRED:
            row['decision'] = 'retire-from-new-selection-preserve-legacy-source'
            row['findings'] = ['particles-collapse-into-repeated-diagonal-clusters']
        elif item['group'] == 'cc0-original' and item['sourcePath'].endswith('.glb'):
            row['findings'] = ['intentional-stylized-low-poly-not-high-detail-PBR', 'preview-lighting-needs-neutral-contrast']
            if item['id'] == 'kenney-food-glass-wine':
                row['decision'] = 'needs-neutral-light-closeup-before-material-quality-approval'
                row['findings'].append('speckled-transparency-in-original-preview')
        elif 'outfit_' in item['sourcePath']:
            row['decision'] = 'already-quarantined-preview-reference-not-newly-removed'
            row['findings'] = ['ellipsoid-torso-reference-not-wearable-garment', 'runtime-URL-policy-already-blocks-this-source']
        records.append(row)
    report = {'schema':'toonspectrum.visual-inspection.v1', 'sourceRevision':'0c99edac76dc728f8ba3a58b887a3ce35bcfab7b',
        'staticVisualItemsInspected':len(records), 'reviewLevel':'contact-sheet-static-appearance',
        'newlyRetiredOverlayIds':list(RETIRED), 'previouslyRetiredBlockoutBackgrounds':8,
        'alreadyQuarantinedOutfitReferences':18,
        'notCovered':['all-procedural-brush-strokes','all-template-layouts','all-character-poses-and-clothing-combinations','all-runtime-generated-or-user-uploaded-assets','full-size-three-view-inspection-of-every-legacy-model'],
        'records':records}
    (evidence/'visual-decisions.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('Recorded actual static contact-sheet review scope:', len(records))


if __name__ == '__main__':
    apply()
    record_visual_scope()
