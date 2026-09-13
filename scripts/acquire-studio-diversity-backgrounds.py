#!/usr/bin/env python3
"""Acquire explicit CC0 background candidates; does not grant visual approval."""
from __future__ import annotations
import csv
import importlib.util
import json
import re
from datetime import date
from pathlib import Path
from PIL import Image
from acquire_studio_pbr_assets import Fetcher, write_json, sha256

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('premium_projection', ROOT / 'scripts/studio-premium-assets-20260913.py')
projection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(projection)
Image.MAX_IMAGE_PIXELS = projection.MAX_SOURCE_PIXELS


def main() -> None:
    stage = ROOT / 'artifacts/studio-diversity-backgrounds-20260913'
    if stage.exists():
        raise ValueError('Use an empty staging directory')
    stage.mkdir(parents=True)
    metadata = Fetcher(16 * 1024 * 1024).api('assets')
    current = json.loads((ROOT / 'apps/web/public/assets/studio/cc0-20260906/manifest.json').read_text())
    existing = {a.get('sourcePanoramaId') for a in current['assets']}
    fetcher = Fetcher(640 * 1024 * 1024)
    assets, errors, receipts = [], [], []
    plan = ROOT / 'data/studio-assets/diversity-20260913-backgrounds.tsv'
    for selected in csv.DictReader(plan.open(encoding='utf-8'), delimiter='\t'):
        slug = selected['sourceId']
        try:
            if not re.fullmatch(r'[a-z0-9_-]{1,100}', slug) or slug in existing:
                raise ValueError('Duplicate or unsafe panorama ID')
            existing.add(slug)
            meta = metadata[slug]
            if meta.get('type') != 0:
                raise ValueError('Not a panorama source')
            file_spec = fetcher.api('files/' + slug).get('tonemapped')
            if not isinstance(file_spec, dict) or not 0 < file_spec.get('size', 0) <= 24 * 1024 * 1024:
                raise ValueError('Panorama exceeds bounded source size')
            receipt = fetcher.file(file_spec, stage / '_source' / slug / 'panorama.jpg')
            with Image.open(stage / '_source' / slug / 'panorama.jpg') as source:
                image = projection.project_panorama(source)
                dimensions = list(source.size)
            identifier = 'polyhaven-background-' + slug.replace('_', '-')
            relative = 'assets/' + identifier + '/background.webp'
            target = stage / relative
            target.parent.mkdir(parents=True)
            image.save(target, 'WEBP', quality=95, method=6)
            raw = target.read_bytes()
            license_info = {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                            'provider': 'Poly Haven', 'sourceUrl': 'https://polyhaven.com/a/' + slug,
                            'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': date.today().isoformat()}
            asset = {'id': identifier, 'name': selected['name'] + ' · ' + meta['name'],
                     'kind': 'background', 'category': selected['category'], 'style': 'photographic-reference',
                     'path': relative, 'bytes': len(raw), 'sha256': sha256(raw), 'width': image.width, 'height': image.height,
                     'license': license_info, 'sourcePanoramaId': slug, 'sourceDimensions': dimensions,
                     'sourceSha256': receipt['sha256'], 'projection': {'horizontalFov': 90, 'yaw': 0},
                     'visualReviewed': False, 'studioRuntimeVerified': False, 'curationStatus': 'candidate',
                     'technicalChecks': ['official-API-checksum', 'native-angular-resolution', 'rectilinear-projection'],
                     'contentNotice': '실사 레퍼런스 배경입니다. 인물·간판·상표 유무는 사용 전 원본을 확인하세요.'}
            write_json(target.parent / 'SOURCE.json', {'license': license_info, 'metadata': meta,
                       'files': [receipt], 'projection': asset['projection'], 'sourceDimensions': dimensions})
            assets.append(asset)
            receipts.append({'id': identifier, **receipt})
            write_json(stage / 'manifest.json', {'schema': 'toonspectrum.asset-delivery.v1', 'assets': assets})
            print('BACKGROUND ACQUIRED', identifier, flush=True)
        except Exception as error:
            errors.append({'id': slug, 'reason': str(error)[:500]})
            print('BACKGROUND EXCLUDED', slug, str(error)[:200], flush=True)
    write_json(stage / 'source-receipts.json', receipts)
    write_json(stage / 'delivery-report.json', {'deliveredOriginals': len(assets), 'errors': errors,
               'downloadedBytes': fetcher.total, 'artisticApproval': False})
    if not assets:
        raise ValueError('No background passed acquisition')


if __name__ == '__main__':
    main()
