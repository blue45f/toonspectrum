#!/usr/bin/env python3
"""Record the completed contact-sheet inspection, only for the exact reviewed bytes.

This script records an authored review plan; it does not itself judge images.
Runtime-generated garments, brushes, poses and full-resolution editing round trips
are explicitly outside this file-preview inspection.
"""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/assets/studio/cc0-20260906'
ORIGINAL_DIGEST = 'ef76850505ca7ebd90841616651f76a8d9d9e43e762774811f94e201d5d2a3e8'
LEGACY_DIGEST = 'd5f6d5b3bf944c9a4709e84b225b8a899d6240bb294ce547526cfde4a79b75fc'
QUARANTINED = {
    'kenney-food-glass-wine': 'Dense black speckled/interference artifacts in actual model preview.',
    'original-soft-snow-overlay': 'Nearly overlapping snow particles collapse into a sparse diagonal band.',
    'original-night-bokeh': 'Overlapping bokeh circles collapse into a diagonal chain with a flat overlay.',
    'original-golden-dust': 'Repeated particle coordinates form obvious diagonal streaks rather than dispersed dust.',
}
PBR_ORDER = 'modern-arm-chair-01 outdoor-table-chair-set-01 wooden-table-02 tea-set-01 potted-plant-02 potted-plant-04 street-lamp-01 modern-ceiling-lamp-01 sofa-02 sofa-03 book-encyclopedia-set-01 wooden-bowl-01 wooden-bowl-02 wine-barrel-01 barrel-03 modular-street-seating bench-vice-01 plywood laminate-floor-02 wood-table-001 denmin-fabric-02 red-brick red-brick-03 medieval-blocks-03 metal-plate green-metal-rust rust-coarse-01 beige-wall-001 painted-plaster-wall white-plaster-02 asphalt-02 aerial-asphalt-01 asphalt-01 concrete-floor-worn-001 concrete-floor-02 concrete-layers-02 coast-sand-rocks-02 aerial-rocks-02 aerial-grass-rock brown-leather marble-01 leather-white floor-tiles-06 decrepit-wallpaper brown-mud-leaves-01 forrest-ground-01 rocky-terrain-02'.split()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def assembly(identifier):
    return identifier.startswith(('kenney-building-', 'kenney-roads-', 'polyhaven-modular-street-seating')) or any(identifier == 'kenney-furniture-' + stem or identifier.startswith('kenney-furniture-' + stem + '-') for stem in ['wall', 'floor', 'stairs'])


def record(index_path, svg_path, output):
    items = json.loads(index_path.read_text())['items']
    assert len(items) == 1351, 'The reviewed inventory must not silently expand'
    current = json.loads((PUBLIC / 'manifest.json').read_text())['assets']
    current_by_id = {a['id']: a for a in current}
    assert len(current_by_id) == len(current) == 1144
    serial = ''.join(a['id'] + '\t' + a['sha256'] + '\t' + str(a['bytes']) + '\n' for a in sorted(current, key=lambda a: a['id']))
    assert digest(serial.encode()) == ORIGINAL_DIGEST, 'Catalog bytes differ from the actual inspected originals'
    for a in current:
        path = (PUBLIC / a['path']).resolve()
        assert path.is_relative_to(PUBLIC.resolve())
        raw = path.read_bytes()
        assert len(raw) == a['bytes'] and digest(raw) == a['sha256'], a['id']
    svg = json.loads(svg_path.read_text())
    svg_by_id = {a['id']: a for a in svg['assets']}
    retired = set(svg['retiredIds'])
    legacy = items[1097:]
    legacy_rows = []
    for item in legacy:
        if item['group'] == 'original-svg':
            sha = digest(svg_by_id[item['id']]['svg'].encode())
        else:
            source = (ROOT / item['sourcePath']).resolve()
            assert source.is_relative_to(ROOT)
            sha = digest(source.read_bytes())
        legacy_rows.append((item['id'], item['sourcePath'], sha))
    assert digest(''.join('\t'.join(row) + '\n' for row in sorted(legacy_rows)).encode()) == LEGACY_DIGEST, 'Legacy sources changed after their preview review'
    ledger = []
    for number, item in enumerate(items):
        row = dict(item)
        identifier = item['id']
        if number < 1097:
            asset = current_by_id[identifier]
            row.update(sourceSha256=asset['sha256'], evidenceSheet=f'baseline/review-sheet-{number // 48 + 1:02d}.jpg', evidenceCell=number % 48 + 1)
        else:
            n = number - 1097
            row.update(sourceSha256=legacy_rows[n][2], evidenceSheet=f'legacy/legacy-{n // 24 + 1:02d}.jpg', evidenceCell=n % 24 + 1)
        row['visuallyReviewed'] = True
        row['reviewMethod'] = 'contact-sheet-preview'
        row['decision'] = 'keep-preview-reviewed'
        row['reason'] = 'No selection-blocking visual defect identified at the inspected preview scale.'
        if identifier in QUARANTINED:
            row.update(decision='hide-from-new-selection', reason=QUARANTINED[identifier])
        elif '/outfits/' in item['sourcePath']:
            row.update(decision='already-outside-production-catalog', reason='Rigid ellipsoidal shell; already excluded before this change. Not the runtime-generated wardrobe.')
        elif identifier in retired:
            row.update(decision='previously-retired-blockout', reason='Existing eight-background retirement is preserved; not counted as a new removal.')
        elif assembly(identifier):
            row.update(decision='assembly-opt-in', reason='Valid construction component, separated from standalone props.')
        ledger.append(row)
    for n, suffix in enumerate(PBR_ORDER):
        identifier = 'polyhaven-' + suffix
        asset = current_by_id[identifier]
        ledger.append({'id': identifier, 'sourcePath': asset['path'], 'sourceSha256': asset['sha256'], 'group': 'new-detailed-pbr',
            'visuallyReviewed': True, 'reviewMethod': 'contact-sheet-preview', 'evidenceSheet': f'pbr/pbr-review-{n // 24 + 1:02d}.jpg', 'evidenceCell': n % 24 + 1,
            'decision': 'assembly-opt-in' if assembly(identifier) else 'keep-preview-reviewed',
            'reason': 'Separate modular components, not one finished seat.' if assembly(identifier) else 'Detailed model or native 2K material preview inspected; no selection-blocking defect found.'})
    assert len(ledger) == 1398
    assert sum(r['decision'] == 'hide-from-new-selection' for r in ledger) == 4
    report = {'schema': 'toonspectrum.asset-visual-review.v1', 'reviewDate': '2026-09-06',
        'reviewedPreviewItems': len(ledger), 'baselineCc0Originals': 1097, 'legacyFileAndSvgPreviews': 254, 'newPbrOriginals': 47,
        'newPbrModels': 17, 'newPbrMaterials': 30, 'newlyHiddenSelections': list(QUARANTINED),
        'previouslyRetiredBackgrounds': 8, 'alreadyExcludedLegacyOutfitModels': 18,
        'publicCatalogSourceRecords': len(current), 'publicCatalogSelectableOriginals': len(current) - 1,
        'selectableOriginalSvgs': len(svg['activeIds']), 'legacyAndActiveSvgObjects': len(svg_by_id),
        'decisions': dict(Counter(row['decision'] for row in ledger)),
        'originalByteSetSha256': ORIGINAL_DIGEST, 'legacyByteSetSha256': LEGACY_DIGEST,
        'additionalInspection': ['all 96 white-alpha masks on dark background', 'faulty wine glass individual rendered preview'],
        'notVerified': ['every asset at native-resolution 100-percent zoom', 'all runtime-generated garments and body poses', 'all brush and template parameter combinations', 'complete Studio save/restore round trips'],
        'storageChanges': 'No user uploads, saved works, OPFS, source asset URLs or legacy asset IDs deleted.'}
    write_json(output / 'visual-review-ledger.json', ledger)
    write_json(output / 'visual-review-summary.json', report)
    with (output / 'visual-review-ledger.csv').open('w', newline='', encoding='utf-8-sig') as f:
        fields = ['id', 'group', 'sourcePath', 'sourceSha256', 'reviewMethod', 'evidenceSheet', 'evidenceCell', 'decision', 'reason']
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader(); writer.writerows(ledger)
    print('VISUAL REVIEW RECORDED', json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--svg-snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    record(args.index, args.svg_snapshot, args.output)
