#!/usr/bin/env python3
"""생성된 3×2 역할 아트 시트를 검사하고 반응형 WebP 정본을 준비한다."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'apps/web/public/brand/workflow-20260928'
SHEETS = {
    'production': ('rs4O3CxbxSHemdzUc6aM', ['plan', 'storyboard', 'create', 'collaborate', 'review', 'publish']),
    'support': ('mWPFReR0rpIqUt9evF6i', ['assets', 'learn', 'ai', 'recovery', 'rights', 'community']),
}
VARIANT_LIMITS = {320: 130_000, 640: 130_000, 960: 130_000}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def encode(image, width):
    fitted = ImageOps.fit(image, (width, width * 5 // 8), Image.Resampling.LANCZOS)
    for quality in range(72, 51, -4):
        stream = io.BytesIO()
        fitted.save(stream, 'WEBP', quality=quality, method=6)
        result = stream.getvalue()
        if len(result) < VARIANT_LIMITS[width]:
            return result, quality
    raise ValueError(f'{width}px 이미지가 품질 하한 52에서 전송 예산을 넘습니다.')


def prepare(directory):
    manifest = {'schemaVersion': 2, 'method': 'AI-generated independent illustrations, atlas crop and WebP compression',
                'model': 'gpt-image-2', 'externalRequests': 2, 'newCharges': 0.2571002919708029,
                'currency': 'USD', 'artIsIllustrative': True, 'sources': {}, 'assets': {}}
    prepared = {}
    for sheet, (generation_id, names) in SHEETS.items():
        source = directory / f'{sheet}-atlas.png'
        data = source.read_bytes()
        with Image.open(io.BytesIO(data)) as opened:
            if opened.size != (3072, 1280):
                raise ValueError(f'{source.name}: 예상한 원본 크기 3072×1280과 다릅니다.')
            image = opened.convert('RGB')
        manifest['sources'][sheet] = {'generationId': generation_id, 'sha256': sha256(data), 'width': image.width, 'height': image.height}
        for index, name in enumerate(names):
            col, row = index % 3, index // 3
            box = (col * 1024 + 4, row * 640 + 4, (col + 1) * 1024 - 4, (row + 1) * 640 - 4)
            cell = image.crop(box)
            variants = []
            for width in VARIANT_LIMITS:
                content, quality = encode(cell, width)
                filename = f'{name}-{width}.webp'
                prepared[filename] = content
                variants.append({'file': filename, 'width': width, 'height': width * 5 // 8,
                                 'bytes': len(content), 'quality': quality, 'sha256': sha256(content)})
            manifest['assets'][name] = {'source': sheet, 'crop': list(box), 'variants': variants}
    total = sum(len(content) for content in prepared.values())
    if total >= 1_500_000:
        raise ValueError('전체 전송 예산 1.5MB를 넘었으므로 정본을 변경하지 않습니다.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, content in prepared.items():
        (OUTPUT / filename).write_bytes(content)
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'12종, {len(prepared)}개 WebP, 총 {total:,}바이트')
    print('품질 분포:', sorted({item['quality'] for asset in manifest['assets'].values() for item in asset['variants']}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory', type=Path, help='production-atlas.png, support-atlas.png 원본 디렉터리')
    arguments = parser.parse_args()
    prepare(arguments.source_directory.resolve(strict=True))


if __name__ == '__main__':
    main()
