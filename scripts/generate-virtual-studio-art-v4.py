#!/usr/bin/env python3
"""Build runtime Virtual Studio v4 art from checked-in generated source sheets.

The source sheets and campus art are original generated assets. This script performs deterministic
frame slicing and style packaging only; it does not claim that palette transforms are new drawings.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Final

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1] / "apps/web/public/assets/virtual-studio"
NPC_ROOT: Final = ROOT / "npc-cast-v4"
STYLE_ROOT: Final = ROOT / "style-packs"
ART_ROOT: Final = ROOT / "art-v4"
DIRECTIONS: Final = ("down", "left", "right", "up")
ROLES: Final = ("concierge", "producer", "editor", "artist", "archivist", "cafe", "security", "host")
STYLES: Final = ("sky-island", "pastel", "retro", "ink", "neon")
STATE_BY_ROLE: Final = {
    "producer": "review",
    "editor": "review",
    "artist": "draw",
    "archivist": "review",
    "host": "draw",
}


def transform(image: Image.Image, style: str) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    if style == "sky-island":
        rgb = ImageEnhance.Color(rgb).enhance(1.13)
        rgb = ImageEnhance.Brightness(rgb).enhance(1.04)
        base = Image.merge("RGBA", (*rgb.split(), alpha))
        glow = alpha.filter(ImageFilter.GaussianBlur(3))
        layer = Image.new("RGBA", image.size, (65, 215, 255, 0))
        layer.putalpha(glow.point(lambda value: int(value * 0.18)))
        return Image.alpha_composite(layer, base)
    if style == "pastel":
        rgb = ImageEnhance.Color(rgb).enhance(0.68)
        rgb = ImageEnhance.Brightness(rgb).enhance(1.12)
        rgb = Image.blend(rgb, Image.new("RGB", rgb.size, (250, 235, 250)), 0.12)
        rgb = rgb.filter(ImageFilter.GaussianBlur(0.35))
        return Image.merge("RGBA", (*rgb.split(), alpha))
    if style == "retro":
        small = image.resize((128, 128), Image.Resampling.LANCZOS)
        small_alpha = small.getchannel("A")
        indexed = small.convert("RGB").quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
        return Image.merge("RGBA", (*indexed.split(), small_alpha)).resize(image.size, Image.Resampling.NEAREST)
    if style == "ink":
        gray = ImageEnhance.Contrast(ImageOps.grayscale(rgb)).enhance(1.55)
        tone = ImageOps.posterize(gray, 3)
        edge = ImageOps.invert(gray.filter(ImageFilter.FIND_EDGES))
        edge = ImageEnhance.Contrast(edge).enhance(2.0)
        merged = ImageChops.multiply(tone, edge)
        return Image.merge("RGBA", (merged, merged, merged, alpha))
    if style == "neon":
        rgb = ImageEnhance.Color(rgb).enhance(1.45)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.25)
        rgb = Image.blend(rgb, Image.new("RGB", rgb.size, (7, 10, 28)), 0.32)
        base = Image.merge("RGBA", (*rgb.split(), alpha))
        ring = ImageChops.subtract(alpha.filter(ImageFilter.MaxFilter(7)), alpha)
        cyan = Image.new("RGBA", image.size, (40, 220, 255, 0))
        cyan.putalpha(ring.point(lambda value: int(value * 0.72)))
        magenta = Image.new("RGBA", image.size, (205, 70, 255, 0))
        magenta.putalpha(ring.filter(ImageFilter.GaussianBlur(4)).point(lambda value: int(value * 0.33)))
        return Image.alpha_composite(magenta, Image.alpha_composite(cyan, base))
    return image


def save_webp(image: Image.Image, path: Path, style: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if style == "retro":
        image.save(path, "WEBP", lossless=True, method=4, exact=True)
    else:
        image.save(path, "WEBP", quality=92, method=4, exact=True)


def build_role(role: str, source: Image.Image, target: Path, style: str) -> None:
    styled = transform(source, style) if style != "webtoon" else source.convert("RGBA")
    frame_width = styled.width // 4
    frame_height = styled.height // 4
    for row, direction in enumerate(DIRECTIONS):
        strip = styled.crop((0, row * frame_height, styled.width, (row + 1) * frame_height))
        idle = strip.crop((0, 0, frame_width, frame_height))
        save_webp(strip, target / f"npc-{role}-walk-{direction}.webp", style)
        save_webp(idle, target / f"npc-{role}-direction-{direction}.webp", style)
    state = STATE_BY_ROLE.get(role)
    if state:
        save_webp(styled.crop((0, 0, frame_width, frame_height)), target / f"npc-{role}-state-{state}.webp", style)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    for role in ROLES:
        sheet = Image.open(NPC_ROOT / f"npc-{role}-sheet.webp").convert("RGBA")
        build_role(role, sheet, NPC_ROOT, "webtoon")
        for style in STYLES:
            build_role(role, sheet, STYLE_ROOT / style / "npc-cast-v4", style)

    # The generated campus art is the visible source of truth for each architecture direction.
    for style in ("sky-island", "webtoon", "pastel", "retro", "ink", "neon"):
        source = ART_ROOT / "world" / f"{style}.webp"
        if source.exists():
            target = STYLE_ROOT / style / "tiles" / "world-base.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())

    files = []
    roots = [NPC_ROOT, ART_ROOT]
    roots.extend(STYLE_ROOT / style / "npc-cast-v4" for style in STYLES)
    for root in roots:
        for path in sorted(root.rglob("*.webp")):
            with Image.open(path) as image:
                size = list(image.size)
            files.append({
                "file": path.relative_to(ROOT).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": digest(path),
                "size": size,
            })
    manifest = {
        "version": 4,
        "generatedAt": "2026-09-24",
        "sourceTechnique": "original generated source art with deterministic slicing and style packaging",
        "roles": list(ROLES),
        "styles": ["webtoon", *STYLES],
        "frame": {"width": 128, "height": 128, "countPerDirection": 4},
        "files": files,
    }
    (ROOT / "art-v4-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Virtual Studio art v4: {len(files)} files")


if __name__ == "__main__":
    main()
