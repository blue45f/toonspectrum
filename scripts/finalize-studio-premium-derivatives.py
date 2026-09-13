#!/usr/bin/env python3
"""Package rendered derivatives without increasing the independent-original count."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def package(stage: Path) -> dict:
    if not stage.is_relative_to(ROOT / 'artifacts'):
        raise ValueError('Use a repository staging directory')
    manifest_path = stage / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    evidence = json.loads((stage / 'rendered-prop-candidates.json').read_text(encoding='utf-8'))
    by_id = {asset['id']: asset for asset in manifest['assets']}
    added = []
    for render in evidence['rendered']:
        model = by_id.get(render['sourceId'])
        if not model or model['kind'] != 'model' or model['sha256'] != render['sourceSha256']:
            raise ValueError('Rendered derivative is not bound to the current GLB bytes')
        identifier = model['id'] + '-cutout'
        if identifier in by_id:
            continue
        source = (stage / render['path']).resolve()
        if not source.is_relative_to(stage / 'high-resolution-props') or source.suffix != '.png':
            raise ValueError('Unsafe render evidence path')
        with Image.open(source) as decoded:
            decoded.load()
            if decoded.size != (1536, 1536) or decoded.mode != 'RGBA':
                raise ValueError('Expected a native 1536px RGBA render')
            image = decoded.copy()
        alpha = image.getchannel('A')
        bounds = alpha.getbbox()
        if not bounds or alpha.getextrema()[0] != 0 or bounds[0] < 2 or bounds[1] < 2 or bounds[2] > 1534 or bounds[3] > 1534:
            raise ValueError('Missing transparency, empty silhouette, or clipped prop')
        relative = 'assets/' + identifier + '/prop.webp'
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, 'WEBP', quality=95, method=6, exact=True)
        raw = target.read_bytes()
        if not 0 < len(raw) <= 16 * 1024 * 1024:
            raise ValueError('Derivative exceeds image delivery budget')
        row = {'id': identifier, 'name': (model['name'] + ' · 2D 소품')[:160],
               'kind': 'prop-image', 'category': 'rendered-prop', 'style': 'pbr-rendered-derivative',
               'path': relative, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
               'width': 1536, 'height': 1536, 'license': model['license'],
               'derivedFrom': model['id'], 'sourceModelSha256': model['sha256'],
               'independentOriginal': False, 'renderResolution': [1536, 1536],
               'visualReviewed': False, 'curationStatus': 'candidate', 'studioRuntimeVerified': False,
               'technicalChecks': ['source-GLB-checksum-bound', 'native-1536px-render', 'transparent-alpha', 'unclipped-silhouette'],
               'contentNotice': '기존 3D 원본의 고해상도 투명 렌더입니다. 별도 3D 원본으로 집계하지 않습니다.'}
        write_json(target.parent / 'SOURCE.json', {'license': model['license'], 'sourceId': model['id'],
                   'sourceModelSha256': model['sha256'], 'render': render, 'independentOriginal': False})
        manifest['assets'].append(row)
        by_id[identifier] = row
        added.append(identifier)
    # The grid decodes at most 384px per image; inserting and enlarging use asset.path.
    for row in manifest['assets']:
        if row['kind'] == 'model':
            continue
        with Image.open(stage / row['path']) as decoded:
            thumbnail = ImageOps.contain(decoded.convert('RGBA'), (384, 384), Image.Resampling.LANCZOS)
        relative = str(Path(row['path']).parent / 'thumbnail.webp')
        thumbnail.save(stage / relative, 'WEBP', quality=86, method=6, exact=True)
        raw = (stage / relative).read_bytes()
        row.update(previewPath=relative, previewWidth=thumbnail.width, previewHeight=thumbnail.height,
                   previewBytes=len(raw), previewSha256=hashlib.sha256(raw).hexdigest())
    write_json(manifest_path, manifest)
    report = {'addedDerivatives': added, 'independentOriginals': 0, 'resolution': [1536, 1536],
              'thumbnailMaximumDimension': 384, 'artisticApproval': False}
    write_json(stage / 'derivative-packaging-report.json', report)
    return report


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: finalize-studio-premium-derivatives.py STAGE')
    print(json.dumps(package(Path(sys.argv[1]).resolve()), ensure_ascii=False))
