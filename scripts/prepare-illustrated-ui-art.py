#!/usr/bin/env python3
"""독립 3×2 생성 아트를 자르고 모바일용 WebP 파생본과 출처 원장을 만든다."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "apps/web/public/brand/illustrated-20260928"
ATLASES = {
    "characters": {
        "generationId": "9TXGBhwhK0JwwpKm8TCv",
        "names": ["hero", "canvas-noir", "luna", "character-pink", "character-blue", "background-city"],
        "labels": ["네온 도시의 여주인공", "빗속 흑백 원고", "Luna 창작 도우미", "로맨스 캐릭터", "푸른 판타지 캐릭터", "벚꽃 도시 배경"],
    },
    "production": {
        "generationId": "XUEKIltKGnuYmkBa5k4V",
        "names": ["project-romance", "project-crimson", "storyboard", "materials", "background-classroom", "blank-canvas"],
        "labels": ["달빛 로맨스 예시", "붉은 도시 예시", "흑백 콘티 예시", "작품 소재 정물", "햇살이 드는 교실", "빈 캔버스의 시작"],
    },
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare(atlas_name, source):
    definition = ATLASES[atlas_name]
    source = source.resolve(strict=True)
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    width, height = image.size
    if width < 1800 or height < 1200 or abs(width / height - 1.5) > 0.05:
        raise ValueError("원본은 최소 1800×1200 크기의 3:2 아트 시트여야 합니다.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schemaVersion": 1, "createdAt": "2026-09-28", "model": "gpt-image-2",
        "generatedArtwork": True, "purpose": "브랜드·예시 일러스트이며 사용자 작품이나 실제 편집 결과가 아님",
        "sources": {}, "assets": {},
    }
    manifest["sources"][atlas_name] = {
        "generationId": definition["generationId"], "sha256": digest(source),
        "width": width, "height": height, "bytes": source.stat().st_size,
    }
    for index, name in enumerate(definition["names"]):
        column, row = index % 3, index // 3
        # 셀 경계의 가는 구분선을 빼고 자르며 원본보다 확대하지 않는다.
        box = [round(column * width / 3) + 3, round(row * height / 2) + 3,
               round((column + 1) * width / 3) - 3, round((row + 1) * height / 2) - 3]
        cell = image.crop(box)
        variants = []
        for target, quality in [(320, 83), (640, 88), (None, 90)]:
            variant = cell.copy()
            if target:
                variant.thumbnail((target, target), Image.Resampling.LANCZOS)
            filename = f"{name}-{target}.webp" if target else f"{name}.webp"
            path = OUTPUT / filename
            variant.save(path, "WEBP", quality=quality, method=6)
            variants.append({"file": filename, "width": variant.width, "height": variant.height,
                             "bytes": path.stat().st_size, "sha256": digest(path)})
        manifest["assets"][name] = {"source": atlas_name, "crop": box,
                                    "labelKo": definition["labels"][index], "variants": variants}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"{atlas_name}: {len(definition['names'])}개 아트, {len(definition['names']) * 3}개 WebP 파일 생성")
    print(f"원장: {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("atlas", choices=ATLASES)
    parser.add_argument("source", type=Path)
    arguments = parser.parse_args()
    prepare(arguments.atlas, arguments.source)


if __name__ == "__main__":
    main()
