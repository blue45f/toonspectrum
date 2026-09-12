#!/usr/bin/env python3
"""Prepare source-bound 2D backgrounds and CC0 review sheets; never grant visual approval.

The photographic backgrounds are rectilinear projections of official tonemapped
panoramas, not scraped supplier thumbnails, painted art, or invented 3D geometry.
One panorama contributes at most one background original. No paid API is used.
"""
from __future__ import annotations

from collections import Counter
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_WIDTH, OUTPUT_HEIGHT = 2048, 1152
MAX_SOURCE_PIXELS = 140_000_000
# Large native panoramas are decoded sequentially; no unbounded parallel buffers.
Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
BACKGROUND_GROUPS = (
    ('alley', '골목 거리', 'background-street'),
    ('street', '도심 거리', 'background-street'),
    ('courtyard', '건축 중정', 'background-street'),
    ('rooftop', '옥상 전망', 'background-street'),
    ('garden', '정원', 'background-nature'),
    ('forest', '숲길', 'background-nature'),
    ('coast', '해안 풍경', 'background-nature'),
    ('interior', '실내 공간', 'background-interior'),
    ('hall', '홀과 복도', 'background-interior'),
    ('warehouse', '창고 공간', 'background-interior'),
)
KOREAN_TERMS = {
    'chair': '의자', 'stool': '스툴', 'table': '테이블', 'sofa': '소파',
    'bench': '벤치', 'cabinet': '수납장', 'wardrobe': '옷장', 'bed': '침대',
    'lamp': '조명', 'mirror': '거울', 'clock': '시계', 'book': '책',
    'ceramic': '도자기', 'vase': '꽃병', 'frame': '액자', 'potted': '화분',
    'suitcase': '여행 가방', 'backpack': '배낭', 'telephone': '전화기',
    'camera': '카메라', 'radio': '라디오', 'television': '텔레비전',
    'helmet': '헬멧', 'bicycle': '자전거', 'plate': '접시', 'cup': '컵',
    'teapot': '찻주전자', 'pan': '팬 냄비', 'kettle': '주전자',
    'fruit': '과일', 'bread': '빵', 'hydrant': '소화전', 'bin': '쓰레기통',
    'sign': '표지판', 'crate': '상자', 'rock': '바위', 'tree': '나무',
    'plant': '식물', 'gate': '대문', 'marble': '대리석', 'tile': '타일',
    'wood': '나무 목재', 'painted': '페인트', 'plaster': '회벽',
    'fabric': '직물 천', 'leather': '가죽', 'metal': '금속',
    'brick': '벽돌', 'grass': '잔디', 'forest': '숲 바닥', 'sand': '모래',
}


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def project_panorama(image: Image.Image, width: int = OUTPUT_WIDTH,
                     height: int = OUTPUT_HEIGHT, yaw: float = 0) -> Image.Image:
    """90-degree perspective projection with bilinear sampling and longitude wrap.

    Work in 64-row tiles. Refuse nominal resolution inflation: the 90-degree
    source arc must contain at least as many pixels as the output width.
    """
    if not 1 <= width <= 4096 or not 1 <= height <= 4096 or not math.isfinite(yaw):
        raise ValueError('Invalid projection dimensions or yaw')
    source_width, source_height = image.size
    if source_width != 2 * source_height or source_width < width * 4:
        raise ValueError('A native 2:1 panorama with sufficient angular resolution is required')
    if source_width * source_height > MAX_SOURCE_PIXELS:
        raise ValueError('Panorama exceeds the decoded-pixel budget')
    source = np.asarray(image.convert('RGB'))
    output = np.empty((height, width, 3), dtype=np.uint8)
    horizontal = ((np.arange(width, dtype=np.float32) + .5) / width * 2 - 1)[None, :]
    sin_yaw, cos_yaw = math.sin(yaw), math.cos(yaw)
    for start in range(0, height, 64):
        end = min(height, start + 64)
        vertical = (1 - (np.arange(start, end, dtype=np.float32) + .5) / height * 2)[:, None] * height / width
        longitude = np.arctan2(horizontal * cos_yaw + sin_yaw, cos_yaw - horizontal * sin_yaw)
        latitude = np.arctan2(vertical, np.sqrt(1 + horizontal * horizontal))
        x = np.broadcast_to(((longitude / (2 * math.pi) + .5) * source_width - .5) % source_width, (end - start, width))
        y = np.clip((.5 - latitude / math.pi) * source_height - .5, 0, source_height - 1)
        x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
        x1, y1 = (x0 + 1) % source_width, np.minimum(y0 + 1, source_height - 1)
        fx, fy = (x - x0)[..., None], (y - y0)[..., None]
        top = source[y0, x0] * (1 - fx) + source[y0, x1] * fx
        bottom = source[y1, x0] * (1 - fx) + source[y1, x1] * fx
        output[start:end] = np.clip(np.rint(top * (1 - fy) + bottom * fy), 0, 255).astype(np.uint8)
    return Image.fromarray(output)


def select_backgrounds(metadata: dict, existing_sources: set[str]) -> list[tuple]:
    ordered = sorted(metadata.items(), key=lambda item: item[1].get('download_count', 0) if isinstance(item[1], dict) else 0, reverse=True)
    seen, selected = set(existing_sources), []
    for term, label, category in BACKGROUND_GROUPS:
        count = 0
        for slug, meta in ordered:
            if not isinstance(meta, dict) or meta.get('type') != 0 or slug in seen:
                continue
            if not re.fullmatch(r'[a-z0-9_-]{1,100}', slug):
                continue
            dimensions = meta.get('max_resolution', [])
            if len(dimensions) != 2 or not all(isinstance(v, (int, float)) for v in dimensions):
                continue
            if dimensions[0] < 8192 or dimensions[0] * dimensions[1] > MAX_SOURCE_PIXELS:
                continue
            haystack = (slug + ' ' + str(meta.get('name', '')) + ' ' + str(meta.get('category', ''))).lower()
            if term not in haystack:
                continue
            seen.add(slug)
            selected.append((slug, meta, label, category))
            count += 1
            if count == 2:
                break
    return selected


def acquire_backgrounds(stage: Path, manifest: dict) -> None:
    from acquire_studio_pbr_assets import Fetcher
    Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
    receipt_path = stage / 'background-acquisition.json'
    if receipt_path.exists():
        return
    fetcher = Fetcher(384 * 1024 * 1024)
    existing = {a.get('sourcePanoramaId') for a in manifest['assets'] if a.get('sourcePanoramaId')}
    selected = select_backgrounds(fetcher.api('assets'), existing)
    receipts, errors = [], []
    for slug, metadata, label, category in selected:
        try:
            files = fetcher.api('files/' + slug)
            spec = files.get('tonemapped')
            if not isinstance(spec, dict) or not isinstance(spec.get('size'), int) or not 0 < spec['size'] <= 24 * 1024 * 1024:
                raise ValueError('No bounded official tonemapped panorama')
            source_path = stage / '_source' / ('background-' + slug) / 'panorama.jpg'
            receipt = fetcher.file(spec, source_path)
            with Image.open(source_path) as source:
                if source.width * source.height > MAX_SOURCE_PIXELS:
                    raise ValueError('Source panorama pixel budget exceeded')
                source.load()
                image = project_panorama(source)
                source_size = list(source.size)
            identifier = 'polyhaven-background-' + slug.replace('_', '-')
            relative = 'assets/' + identifier + '/background.webp'
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, 'WEBP', quality=95, method=6)
            raw = target.read_bytes()
            license_info = {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                            'provider': 'Poly Haven', 'sourceUrl': 'https://polyhaven.com/a/' + slug,
                            'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': date.today().isoformat()}
            row = {'id': identifier, 'name': (label + ' · ' + metadata.get('name', slug))[:160],
                   'kind': 'background', 'category': category, 'style': 'photographic-reference',
                   'path': relative, 'bytes': len(raw), 'sha256': digest(raw),
                   'width': OUTPUT_WIDTH, 'height': OUTPUT_HEIGHT, 'license': license_info,
                   'sourcePanoramaId': slug, 'sourceDimensions': source_size,
                   'sourceSha256': receipt['sha256'], 'projection': {'horizontalFov': 90, 'yaw': 0},
                   'visualReviewed': False, 'studioRuntimeVerified': False, 'curationStatus': 'candidate',
                   'technicalChecks': ['official-API-checksum', 'native-angular-resolution', 'decoded-pixels', 'rectilinear-projection'],
                   'contentNotice': '실사 레퍼런스 배경입니다. 인물·간판·상표 유무는 사용 전 원본을 확인하세요.'}
            write_json(target.parent / 'SOURCE.json', {'license': license_info, 'metadata': metadata, 'files': [receipt], 'projection': row['projection'], 'sourceDimensions': source_size})
            manifest['assets'].append(row)
            receipts.append({'id': identifier, **receipt})
            write_json(stage / 'manifest.json', manifest)
            print('BACKGROUND ACQUIRED', identifier, flush=True)
        except Exception as error:
            errors.append({'id': slug, 'reason': str(error)[:500]})
            print('BACKGROUND EXCLUDED', slug, str(error)[:240], flush=True)
    write_json(receipt_path, {'sources': receipts, 'errors': errors, 'downloadedBytes': fetcher.total, 'artisticApproval': False})


def localize_and_review(stage: Path, manifest: dict) -> None:
    review = stage / 'review'
    review.mkdir(exist_ok=True)
    index = []
    for asset in manifest['assets']:
        korean = KOREAN_TERMS.get(asset.get('selectionTerm'))
        if korean and not asset.get('originalName'):
            asset['originalName'] = asset['name']
            asset['name'] = (korean + ' · ' + asset['name'])[:160]
        index.append({'id': asset['id'], 'name': asset['name'], 'kind': asset['kind'], 'sha256': asset['sha256'], 'sourceUrl': asset['license']['sourceUrl']})
    for page, start in enumerate(range(0, len(manifest['assets']), 12), 1):
        sheet = Image.new('RGB', (1200, 1016), '#eeeeef')
        draw = ImageDraw.Draw(sheet)
        for local, asset in enumerate(manifest['assets'][start:start + 12]):
            file = stage / asset.get('previewPath', asset['path'])
            if file.suffix == '.glb':
                raise ValueError('Every candidate model requires an actual rendered preview')
            with Image.open(file) as source:
                tile = ImageOps.contain(source.convert('RGBA'), (388, 214))
            x, y = (local % 3) * 400 + 6, (local // 3) * 254 + 6
            sheet.paste(tile, (x + (388 - tile.width) // 2, y + (214 - tile.height) // 2), tile)
            # IDs are ASCII and remain legible on workers without Korean fonts.
            text = str(start + local + 1) + ' ' + asset['id']
            draw.text((x, y + 218), text[:53], fill='#111111')
            draw.text((x, y + 234), asset['kind'] + ' | ' + str(asset['bytes']) + ' bytes', fill='#333333')
        sheet.save(review / f'sheet-{page:02d}.jpg', quality=94)
    write_json(review / 'index.json', {'assets': index, 'reviewStatus': 'pending-visual-inspection'})
    write_json(stage / 'manifest.json', manifest)
    report_path = stage / 'delivery-report.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    report.update(deliveredOriginals=len(manifest['assets']), byKind=dict(Counter(a['kind'] for a in manifest['assets'])))
    write_json(report_path, report)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: studio-premium-assets-20260913.py STAGING_DIRECTORY')
    stage = Path(sys.argv[1]).resolve()
    if not stage.is_relative_to(ROOT / 'artifacts'):
        raise ValueError('Use an acquisition directory under artifacts, never public assets')
    manifest = json.loads((stage / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != 'toonspectrum.asset-delivery.v1' or not isinstance(manifest.get('assets'), list):
        raise ValueError('Unsupported candidate manifest')
    acquire_backgrounds(stage, manifest)
    localize_and_review(stage, manifest)


if __name__ == '__main__':
    main()
