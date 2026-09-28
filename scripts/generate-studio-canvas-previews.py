"""드로잉 시작 안내 미리보기를 원본에서 생성하거나 --check로 검증한다."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/public/brand/studio-canvas-previews"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((OUTPUT / "SOURCE.json").read_text(encoding="utf-8"))
    source_bytes = 0
    preview_bytes = 0
    for entry in manifest["images"]:
        source = ROOT / entry["source"]
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sourceSha256"]:
            raise SystemExit(f"원본 출처가 변경되었습니다: {entry['id']}")
        with Image.open(io.BytesIO(data)) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((manifest["maxEdge"], manifest["maxEdge"]), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="WEBP", quality=manifest["quality"], method=6)
        encoded = buffer.getvalue()
        target = OUTPUT / entry["output"]
        if args.check:
            if not target.exists() or target.read_bytes() != encoded:
                raise SystemExit(f"미리보기 재생성이 필요합니다: {target.name}")
        else:
            target.write_bytes(encoded)
        source_bytes += len(data)
        preview_bytes += len(encoded)
    print(json.dumps({"sourceBytes": source_bytes, "previewBytes": preview_bytes,
                      "reductionPercent": round(100 * (1 - preview_bytes / source_bytes), 2)}))


if __name__ == "__main__":
    main()
