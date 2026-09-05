#!/usr/bin/env python3
"""Apply reviewed selection decisions, preview fixes and a per-entry visual ledger.

No user database or uploaded file is read or changed. Historic file paths and IDs
remain available; only new-selection visibility changes. Review scope is catalog
preview screening, not all procedural settings or full-resolution artistic signoff.
"""
from __future__ import annotations
from collections import Counter
import hashlib
import html
import json
from pathlib import Path
import re
from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/assets/studio/cc0-20260906'
REPORT = ROOT / 'docs/reports/asset-pbr-review-20260906'
QUARANTINE = {
    'kenney-food-glass-wine': 'Transparent surface shows irregular dark speckling in the actual preview; quarantine pending renderer compatibility review.',
    'polyhaven-wine-bottles-01': 'Glass surfaces show high-contrast white/black mottling in the actual neutral-light preview; quarantine pending renderer compatibility review.',
}
RETIRED_FX = ['original-golden-dust', 'original-night-bokeh', 'original-soft-snow-overlay', 'original-layered-fog-overlay']
ROTATED = [
    'flame-05', 'flame-06', 'muzzle-01', 'muzzle-02', 'muzzle-03', 'muzzle-04', 'muzzle-05',
    'spark-05', 'spark-06', 'trace-01', 'trace-02', 'trace-03', 'trace-04', 'trace-05', 'trace-06', 'trace-07',
]


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def replace_once(path: Path, before: str, after: str) -> None:
    text = path.read_text(encoding='utf-8')
    if after in text:
        return
    if text.count(before) != 1:
        raise ValueError('Reviewed source anchor changed: ' + str(path) + ' ' + before[:100])
    path.write_text(text.replace(before, after, 1), encoding='utf-8')


def verify_rotations(assets: list[dict]) -> list[dict]:
    lookup = {a['id']: a for a in assets}
    evidence = []
    for stem in ROTATED:
        canonical_id = 'kenney-particles-' + stem
        variant_id = canonical_id + '-rotated'
        original, variant = lookup[canonical_id], lookup[variant_id]
        with Image.open(PUBLIC / original['path']) as image:
            canonical = image.convert('RGBA')
        with Image.open(PUBLIC / variant['path']) as image:
            candidate = image.convert('RGBA')
        best = None
        for degrees, operation in [(90, Image.Transpose.ROTATE_90), (180, Image.Transpose.ROTATE_180), (270, Image.Transpose.ROTATE_270)]:
            rotated = canonical.transpose(operation)
            if candidate.size != rotated.size:
                continue
            maxima, means = [], []
            for background in [(0, 0, 0, 255), (255, 255, 255, 255)]:
                first = Image.alpha_composite(Image.new('RGBA', candidate.size, background), candidate).convert('RGB')
                second = Image.alpha_composite(Image.new('RGBA', candidate.size, background), rotated).convert('RGB')
                difference = ImageChops.difference(first, second)
                maxima.append(max(channel[1] for channel in difference.getextrema()))
                means.append(sum(ImageStat.Stat(difference).mean) / 3)
            row = {'id': variant_id, 'canonicalId': canonical_id, 'rotationDegrees': degrees,
                   'maxChannelDifference': max(maxima), 'meanChannelDifference': max(means),
                   'comparison': 'visible pixels composited on BOTH black and white; not byte identity',
                   'sourceSha256': variant['sha256'], 'canonicalSha256': original['sha256']}
            if best is None or (row['meanChannelDifference'], row['maxChannelDifference']) < (best['meanChannelDifference'], best['maxChannelDifference']):
                best = row
        if best is None or best['maxChannelDifference'] > 5 or best['meanChannelDifference'] > 0.12:
            raise ValueError('Named rotation does not match reviewed visual equivalence: ' + variant_id)
        evidence.append(best)
    return evidence


def write_policy(rotations: list[dict]) -> None:
    path = ROOT / 'src/domains/creator/studio-asset-curation-policy.ts'
    mapping = {row['id']: row['canonicalId'] for row in rotations}
    code = '''/** New-selection policy. Original bytes, historic IDs and saved works are preserved. */
export const STUDIO_CC0_ROTATED_VARIANTS: Readonly<Record<string, string>> = Object.freeze(MAPPING);
export const STUDIO_CC0_QUARANTINE_REASONS: Readonly<Record<string, string>> = Object.freeze(QUARANTINE);
export const STUDIO_RETIRED_ATMOSPHERE_IDS: readonly string[] = Object.freeze(RETIRED);
export function isStudioCc0AssetSelectable(id: string): boolean {
  return !Object.hasOwn(STUDIO_CC0_ROTATED_VARIANTS, id) && !Object.hasOwn(STUDIO_CC0_QUARANTINE_REASONS, id);
}
export function getStudioCc0StyleLabel(asset: { readonly kind: string; readonly provider: string }): string {
  if (asset.kind === "surface-texture") return "PBR 표면 재질";
  if (asset.kind === "effect-mask") return "투명 효과 마스크";
  return asset.provider === "Poly Haven" ? "텍스처 포함 PBR 모델" : "스타일화 로우폴리";
}
'''
    for token, value in [('MAPPING', mapping), ('QUARANTINE', QUARANTINE), ('RETIRED', RETIRED_FX)]:
        code = code.replace(token + ')', json.dumps(value, ensure_ascii=False, indent=2) + ')')
    path.write_text(code, encoding='utf-8')


def integrate_selection() -> None:
    delivery = ROOT / 'src/domains/creator/studio-cc0-asset-delivery.ts'
    replace_once(delivery,
        'import type { StudioAsset } from "./studio-asset-library";',
        'import { getStudioCc0StyleLabel, isStudioCc0AssetSelectable } from "./studio-asset-curation-policy";\n\nimport type { StudioAsset } from "./studio-asset-library";')
    replace_once(delivery,
        'return assets.filter(asset => (!kind || asset.kind === kind) && terms.every(term =>',
        'return assets.filter(asset => isStudioCc0AssetSelectable(asset.id) && (!kind || asset.kind === kind) && terms.every(term =>')
    replace_once(delivery,
        '[asset.name, asset.category, STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? "", asset.provider]',
        '[asset.name, asset.category, STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? "", asset.provider, getStudioCc0StyleLabel(asset)]')
    replace_once(delivery,
        '    studioCc0AssetUrl(asset.path);\n    const kind',
        '    studioCc0AssetUrl(asset.path);\n'
        '    if (asset.previewPath !== undefined) {\n'
        '      if (typeof asset.previewPath !== "string" || !asset.previewPath.startsWith("previews/") || !/\\.(png|jpg|webp)$/u.test(asset.previewPath)) throw new TypeError("허용되지 않은 미리보기입니다.");\n'
        '      studioCc0AssetUrl(asset.previewPath);\n'
        '    }\n    const kind')

    originals = ROOT / 'src/domains/creator/studio-original-free-asset-packs.ts'
    text = originals.read_text()
    policy_import = 'import { STUDIO_RETIRED_ATMOSPHERE_IDS } from "./studio-asset-curation-policy";\n'
    if policy_import not in text:
        originals.write_text(policy_import + text)
    replace_once(originals,
        'Object.freeze([...EVERYDAY_ASSETS]);',
        'Object.freeze([...EVERYDAY_ASSETS, ...ATMOSPHERE_ASSETS.filter((asset) => STUDIO_RETIRED_ATMOSPHERE_IDS.includes(asset.id))]);')
    replace_once(originals,
        'Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID));',
        '''Object.freeze(ALL_STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.filter((pkg) => pkg.id !== EVERYDAY_PACKAGE_ID).map((pkg) => {
    if (pkg.id !== ATMOSPHERE_PACKAGE_ID) return pkg;
    return Object.freeze({ ...pkg,
      includedItems: Object.freeze(pkg.includedItems.filter((asset) => !STUDIO_RETIRED_ATMOSPHERE_IDS.includes(asset.id))),
      version: "1.0.1",
      packageFingerprint: `original-pack:v1:${pkg.id}:1.0.1`,
      summary: "비·햇살·꽃잎·낙엽의 선택 가능한 오버레이 4종입니다. 검수 제외 항목의 기존 작품 참조는 유지됩니다.",
      updatedAt: "2026-09-06T00:00:00.000Z",
      changelog: [{version: "1.0.1", releasedAt: "2026-09-06", changes: ["반복 입자 뭉침·딱딱한 안개 띠 4종 신규 선택 제외", "기존 원본 ID·패키지 조회 보존"]}, ...pkg.changelog],
    });
  }));''')
    marketplace = ROOT / 'src/domains/creator/StudioOriginalAssetMarketplacePanel.tsx'
    replace_once(marketplace,
        '? findStudioOriginalFreeAssetPackage(previewAsset.packageId)',
        '? STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.find((pkg) => pkg.id === previewAsset.packageId) ?? findStudioOriginalFreeAssetPackage(previewAsset.packageId)')
    # Only exact, now-stale selection-count expectations change. Legacy coverage stays 32.
    test = ROOT / 'src/domains/creator/studio-cc0-asset-delivery.test.ts'
    text = test.read_text().replace('expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(8);', 'expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(12);')
    text = text.replace('expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(24);', 'expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(20);')
    text = text.replace('expect(filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(8);', 'expect(filterStudioOriginalFreeAssets({categories: ["atmosphere-fx"]})).toHaveLength(4);')
    text = text.replace('removes eight draft backgrounds from new selection without deleting their identities', 'retires eight blockouts and four flawed overlays without deleting their identities')
    test.write_text(text)
    test = ROOT / 'src/domains/creator/studio-original-free-asset-packs.test.ts'
    text = test.read_text().replace('24 unique', '20 unique').replace('toHaveLength(24)', 'toHaveLength(20)').replace('.toBe(24)', '.toBe(20)')
    text = text.replace('expect(pkg.includedItems).toHaveLength(8);', 'expect(pkg.includedItems).toHaveLength(pkg.id === "original-atmosphere-overlays" ? 4 : 8);')
    # Resolve the actual package ID from source rather than infer it from its label.
    identifier = re.search(r'const ATMOSPHERE_PACKAGE_ID = "([^"]+)"', originals.read_text()).group(1)
    text = text.replace('pkg.id === "original-atmosphere-overlays"', 'pkg.id === ' + json.dumps(identifier))
    text = text.replace('categories: ["atmosphere-fx"],\n    })).toHaveLength(8);', 'categories: ["atmosphere-fx"],\n    })).toHaveLength(4);')
    test.write_text(text)
    test = ROOT / 'src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx'
    text = test.read_text().replace('24 FREE', '20 FREE').replace('all 24 selectable', 'all 20 selectable').replace('toHaveLength(24)', 'toHaveLength(20)')
    text = text.replace('expect(html).toContain(\'data-studio-original-asset="original-night-bokeh"\');', 'expect(html).not.toContain(\'data-studio-original-asset="original-night-bokeh"\');')
    test.write_text(text)


def prepare_previews(assets: list[dict]) -> None:
    for asset in assets:
        if asset['kind'] == 'model':
            continue
        with Image.open(PUBLIC / asset['path']) as original:
            preview = original.convert('RGBA')
            preview.thumbnail((512, 512), Image.Resampling.LANCZOS)
        canvas = Image.new('RGB', (512, 512), '#d6d6dc')
        if asset['kind'] == 'effect-mask':
            draw = ImageDraw.Draw(canvas)
            for y in range(0, 512, 32):
                for x in range(0, 512, 32):
                    draw.rectangle((x, y, x + 31, y + 31), fill='#555965' if (x // 32 + y // 32) % 2 else '#686d7a')
        canvas.paste(preview, ((512 - preview.width) // 2, (512 - preview.height) // 2), preview)
        path = 'previews/' + asset['id'] + '-material.jpg'
        canvas.save(PUBLIC / path, quality=92)
        asset['previewPath'] = path
        # Full-resolution original bytes and alpha are never touched for a preview fix.


def main() -> None:
    manifest = json.loads((PUBLIC / 'manifest.json').read_text())
    assets = manifest['assets']
    if len(assets) != 1162 or len({a['id'] for a in assets}) != len(assets):
        raise ValueError('Unexpected source catalog/version')
    for asset in assets:
        raw = (PUBLIC / asset['path']).read_bytes()
        if len(raw) != asset['bytes'] or hashlib.sha256(raw).hexdigest() != asset['sha256']:
            raise ValueError('Source integrity mismatch: ' + asset['id'])
    rotations = verify_rotations(assets)
    write_policy(rotations)
    integrate_selection()
    prepare_previews(assets)
    variant_ids = {r['id'] for r in rotations}
    by_id = {a['id']: a for a in assets}
    reviewed_index = json.loads((ROOT / 'docs/reports/asset-visual-review-20260906/review-index.json').read_text())
    ledger = []
    for item in reviewed_index['items']:
        row = dict(item)
        row['visuallyReviewed'] = True
        row['reviewScope'] = 'actual catalog contact-sheet / model-preview screening; not all procedural states or full-resolution signoff'
        identifier = row['id']
        row['decision'] = 'retain-in-existing-role'
        row['reason'] = 'No blocking visual defect identified at preview screening scale; no blanket high-detail-quality claim.'
        if identifier in variant_ids:
            row.update(decision='hide-rotation-variant', reason='Quarter-turn visual duplicate; original bytes and ID preserved.')
        elif identifier in QUARANTINE:
            row.update(decision='quarantine-new-selection', reason=QUARANTINE[identifier])
        elif identifier in RETIRED_FX:
            row.update(decision='retire-new-selection', reason='Repeated diagonal particle clumps or hard-edged fog bands are unsuitable as natural atmospheric overlays.')
        elif identifier.startswith('legacy-') and 'outfit_' in row['sourcePath']:
            row.update(decision='already-legacy-only', reason='Capsule proxy, already absent from current wardrobe runtime; not counted as a new removal.')
        if identifier in by_id:
            asset = by_id[identifier]
            row['sourceSha256'] = asset['sha256']
            if asset['kind'] == 'effect-mask': row['previewRemediation'] = 'dark checker backdrop; original transparency preserved'
            elif asset['kind'] == 'surface-texture': row['previewRemediation'] = 'bounded 512px thumbnail; original native resolution preserved'
            elif identifier not in QUARANTINE: row['previewRemediation'] = 'neutral-light actual model re-render'
        ledger.append(row)
    new_assets = [a for a in assets if a['id'].startswith('polyhaven-')]
    for index, asset in enumerate(new_assets):
        ledger.append({'id': asset['id'], 'group': 'new-pbr-original', 'sourcePath': asset['path'], 'sourceSha256': asset['sha256'],
                       'evidence': f'pbr-review-{index // 12 + 1:02d}.jpg', 'cell': index % 12 + 1,
                       'visuallyReviewed': True, 'reviewScope': 'actual neutral-light model / native texture contact-sheet screening',
                       'decision': 'quarantine-new-selection' if asset['id'] in QUARANTINE else 'retain-in-existing-role',
                       'reason': QUARANTINE.get(asset['id'], 'Detailed geometry/material appearance or usable native surface detail visible in the reviewed preview.')})
    selected = []
    for asset in assets:
        selectable = asset['id'] not in variant_ids and asset['id'] not in QUARANTINE
        asset['curation'] = {'selection': 'included' if selectable else 'excluded', 'reviewScope': 'preview-screening', 'reviewedOn': '2026-09-06'}
        asset['visualReviewed'] = True
        if selectable: selected.append(asset)
    selected.sort(key=lambda a: (not a['id'].startswith('polyhaven-'), a['category'], a['id']))
    save(PUBLIC / 'manifest.json', manifest)
    save(REPORT / 'rotation-variant-evidence.json', rotations)
    save(REPORT / 'visual-review-ledger.json', {'schema': 'toonstudio.visual-review.v1', 'entries': ledger,
        'reviewedEntries': len(ledger), 'notice': 'Includes legacy representations and thumbnails, not 1416 distinct new assets. Static catalog screening is not a review of every procedural brush, pose or clothing state.'})
    report = {'reviewedCatalogEntries': len(ledger), 'acquiredPbrOriginals': len(new_assets),
              'selectableNewPbrOriginals': sum(a['id'].startswith('polyhaven-') for a in selected),
              'totalAcquiredRecordsIncludingVariants': len(assets), 'selectableCc0Originals': len(selected),
              'byKind': dict(Counter(a['kind'] for a in selected)), 'byCategory': dict(Counter(a['category'] for a in selected)),
              'rotatedVariantsHidden': len(rotations), 'glassModelsQuarantined': len(QUARANTINE),
              'newSvgOverlaysRetired': len(RETIRED_FX), 'previouslyRetiredBlockouts': 8,
              'nativeRasterThumbnailsRefreshed': sum(a['kind'] != 'model' for a in assets),
              'newSelectionOnly': True, 'historicFileDeletionCount': 0, 'userDataChanges': 0,
              'allProceduralStatesReviewed': False, 'fullResolutionArtisticApproval': False, 'productionDeployment': 'not-performed'}
    save(REPORT / 'curation-summary.json', report)
    save(PUBLIC / 'curation-summary.json', report)
    # Refresh the downloadable gallery from the same selection policy, not the old count.
    cards = []
    for asset in selected:
        title = html.escape(asset['name'])
        preview = html.escape(asset.get('previewPath', asset['path']), quote=True)
        href = html.escape(asset['path'], quote=True)
        label = 'PBR' if asset['id'].startswith('polyhaven-') else 'low-poly' if asset['kind'] == 'model' else asset['kind']
        cards.append(f'<article><a href="{href}" download><img src="{preview}" alt="{title}" loading="lazy"><strong>{title}</strong></a><small>{html.escape(asset["category"])} · {label} · CC0</small></article>')
    page = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ToonStudio curated assets</title><style>body{font:16px system-ui;background:#f5f5f7;color:#17171c;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}article{background:white;border:1px solid #ddd;border-radius:12px;padding:12px}article[hidden]{display:none}img{width:100%;height:160px;object-fit:contain}a{color:inherit;text-decoration:none}strong,small{display:block;margin-top:8px}small{color:#555}input{font:inherit;padding:12px;width:min(90%,600px);margin:12px 0 24px}</style><h1>검수한 CC0 에셋 ' + str(len(selected)) + '종</h1><p>PBR 모델·고해상도 재질·효과 마스크·스타일화 소품을 구분합니다. 기존 파일의 참조를 보존하면서 중복과 시각 문제 항목을 신규 선택에서 제외했습니다.</p><label>검색 <input id="q" type="search" placeholder="PBR, furniture, tree, wood"></label><main>' + ''.join(cards) + '</main><script>document.getElementById("q").addEventListener("input",e=>{const q=e.target.value.toLowerCase().split(/\\s+/).filter(Boolean);document.querySelectorAll("article").forEach(a=>a.hidden=!q.every(t=>a.textContent.toLowerCase().includes(t)));});</script></html>'
    (PUBLIC / 'index.html').write_text(page)
    print('CURATION SUMMARY', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
