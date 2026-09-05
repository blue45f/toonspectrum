#!/usr/bin/env python3
"""Bundle an explicit visual-review allowlist, keeping all legacy URLs intact."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import html
import json
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/assets/studio/cc0-20260906'
REVIEW = ROOT / 'docs/reports/asset-visual-review-20260906'


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, data: object):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def safe_path(root: Path, relative: str) -> Path:
    p = Path(relative)
    resolved = (root / p).resolve()
    if p.is_absolute() or '..' in p.parts or not resolved.is_relative_to(root.resolve()):
        raise ValueError('Unsafe delivery path')
    return resolved


def copy_verified(source: Path, relative: str, sha256: str, size: int) -> None:
    p = safe_path(source, relative)
    raw = p.read_bytes()
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError('File integrity mismatch:' + relative)
    dest = safe_path(PUBLIC, relative)
    if dest.exists() and dest.read_bytes() != raw:
        raise ValueError('Do not overwrite a different asset at an existing URL:' + relative)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)


def stage(source: Path, approval: Path) -> None:
    decision = read(approval)
    if decision.get('schema') != 'toonspectrum.pbr-visual-review.v1' or decision.get('allThreeModelViewsInspected') is not True:
        raise ValueError('Explicit three-angle visual review is required')
    allowed = set(decision['acceptedIds'])
    if not allowed or len(allowed) != len(decision['acceptedIds']):
        raise ValueError('Invalid visual allowlist')
    manifest = read(source / 'manifest.json')
    candidates = {a['id']: a for a in manifest['assets']}
    if not allowed.issubset(candidates): raise ValueError('Unknown visual-review ID')
    existing = read(PUBLIC / 'manifest.json')
    by_id = {a['id']: a for a in existing['assets']}
    if allowed.intersection(by_id): raise ValueError('IDs already exist; do not silently replace')
    additions = []
    for identifier in sorted(allowed):
        asset = dict(candidates[identifier])
        rights = asset.get('license', {})
        if rights.get('id') != 'CC0-1.0' or rights.get('redistributionAllowed') is not True:
            raise ValueError('Redistribution provenance missing')
        if asset.get('nativeTextureResolution') != '2K': raise ValueError('Unexpected resolution')
        copy_verified(source, asset['path'], asset['sha256'], asset['bytes'])
        if asset['kind'] == 'model':
            if asset.get('browserRenderVerified') is not True: raise ValueError('Model lacks actual renderer evidence')
            preview = asset['previewPath']
            raw = safe_path(source, preview).read_bytes()
            copy_verified(source, preview, hashlib.sha256(raw).hexdigest(), len(raw))
        else:
            preview = f'previews/{identifier}.webp'
            target = safe_path(PUBLIC, preview)
            target.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(safe_path(source, asset['path'])) as image:
                image.load()
                image.thumbnail((512, 512))
                image.convert('RGB').save(target, 'WEBP', quality=88, method=4)
            asset['previewPath'] = preview
            for m in asset.get('maps', {}).values(): copy_verified(source, m['path'], m['sha256'], m['bytes'])
        receipt = Path(asset['path']).parent / 'SOURCE.json'
        raw = safe_path(source, str(receipt)).read_bytes()
        copy_verified(source, str(receipt), hashlib.sha256(raw).hexdigest(), len(raw))
        asset['visualReviewed'] = True
        asset['visualReviewLevel'] = 'three-angle-384px' if asset['kind'] == 'model' else 'native-map-and-contact-sheet'
        asset['visualReviewEvidence'] = 'docs/reports/asset-visual-review-20260906/pbr-visual-approval.json'
        asset['studioRuntimeVerified'] = False
        additions.append(asset)
    existing['assets'].extend(additions)
    write(PUBLIC / 'manifest.json', existing)
    decisions = read(REVIEW / 'curation-decisions.json')
    quarantined = {a['id'] for a in decisions['quarantine']}
    variants = set(decisions['groupRotationVariants'])
    hidden = quarantined | variants
    assert len(quarantined) == 1 and len(variants) == 16
    assert hidden.issubset({a['id'] for a in existing['assets']})
    visible = [a for a in existing['assets'] if a['id'] not in hidden]
    # Revalidate all existing originals, including retained compatibility files.
    for a in existing['assets']:
        raw = safe_path(PUBLIC, a['path']).read_bytes()
        if len(raw) != a['bytes'] or hashlib.sha256(raw).hexdigest() != a['sha256']:
            raise ValueError('Existing original was changed:' + a['id'])
    index = read(REVIEW / 'review-index.json')
    assert len(index['items']) == 1351
    ledger = []
    for item in index['items']:
        item = dict(item)
        identifier = item['id']
        disposition = 'screened-retained'
        if identifier in quarantined: disposition = 'quarantined-new-selection'
        elif identifier in variants: disposition = 'grouped-rotation-variant'
        elif '/outfits/' in item['sourcePath']: disposition = 'already-retired-reference-not-new-removal'
        elif item['group'] == 'original-svg': disposition = 'starter-reviewed-see-compositing-repair-record'
        item.update({'visuallyReviewed': True, 'reviewMethod': 'contact-sheet-inspection',
                     'fullResolutionApproval': False, 'allAnglesInspected': False,
                     'studioSaveRestoreVerified': False, 'disposition': disposition,
                     'evidenceRevision': decisions['evidenceRevision']})
        ledger.append(item)
    write(REVIEW / 'completed-static-review-ledger.json', {'schema': 'toonspectrum.static-visual-review.v1',
          'reviewedItems': len(ledger), 'items': ledger,
          'notice': 'Preview images are inspection items, not additional original assets. This does not inspect all generated brush/pose/wardrobe combinations.'})
    write(REVIEW / 'pbr-visual-approval.json', decision)
    write(REVIEW / 'pbr-acquisition-report.json', read(source / 'delivery-report.json'))
    write(REVIEW / 'pbr-browser-render-evidence.json', read(source / 'browser-render-evidence.json'))
    report = {'schema': 'toonspectrum.screened-asset-delivery.v1', 'storedOriginals': len(existing['assets']),
              'selectableOriginals': len(visible), 'newDetailedPbrOriginals': len(additions),
              'newPbrByKind': dict(Counter(a['kind'] for a in additions)),
              'byCategory': dict(Counter(a['category'] for a in visible)),
              'quarantinedRenderingDefects': len(quarantined), 'groupedRotationVariants': len(variants),
              'transparentStarterPropsRepaired': 16, 'particleDistributionsRepaired': 3,
              'previouslyRetiredBlockouts': 8, 'previouslyExcludedOutfitReferences': 18,
              'existingStaticVisualItemsInspected': len(ledger), 'newOriginalIntegrityVerified': len(additions),
              'allStoredOriginalIntegrityVerified': len(existing['assets']), 'productionDeployed': False,
              'allDynamicStudioCombinationsInspected': False, 'allAssetsSaveRestoreVerified': False}
    write(REVIEW / 'curated-delivery-report.json', report)
    write(PUBLIC / 'curated-delivery-report.json', report)
    visible.sort(key=lambda a: (a.get('style') != 'detailed-pbr', a['category'], a['name']))
    cards = []
    for a in visible:
        title = html.escape(a['name']); preview = html.escape(a.get('previewPath', a['path']), quote=True)
        link = html.escape(a['path'], quote=True); style = html.escape(a.get('style', 'utility'))
        cards.append(f'<article><a href="{link}" download><img loading="lazy" src="{preview}" alt="{title}"><strong>{title}</strong></a><small>{style} · CC0 · {a["bytes"]/1048576:.1f} MB</small></article>')
    page = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ToonStudio 검수 에셋</title><style>body{font:16px system-ui;margin:24px;background:#f5f6f8;color:#171b23}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}article{background:white;border:1px solid #ccd0d8;border-radius:12px;padding:12px}img{width:100%;height:180px;object-fit:contain;background:conic-gradient(#c8ccd2 25%,#a8adb5 0 50%,#c8ccd2 0 75%,#a8adb5 0);background-size:24px 24px}a{color:inherit;text-decoration:none}strong,small{display:block;margin-top:8px}input{font:inherit;min-height:44px;width:min(90%,600px);margin:12px 0 24px}article[hidden]{display:none}</style><h1>검수 에셋 라이브러리</h1><p>' + str(len(visible)) + '종 선택 가능 · 정밀 PBR과 로우폴리를 구분합니다. 결함 1종과 회전 파생본 16종은 새 선택에서 제외하고 기존 파일을 보존했습니다.</p><label>검색 <input id="q" type="search"></label><main>' + ''.join(cards) + '</main><script>document.getElementById("q").addEventListener("input",event=>{const q=event.target.value.toLowerCase();document.querySelectorAll("article").forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(q);});});</script></html>'
    (PUBLIC / 'index.html').write_text(page, encoding='utf-8')
    print('SCREENED DELIVERY', json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--approval', type=Path, required=True)
    args = parser.parse_args()
    stage(args.source.resolve(), args.approval.resolve())
