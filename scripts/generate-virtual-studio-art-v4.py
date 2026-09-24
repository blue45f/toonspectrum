#!/usr/bin/env python3
"""Build runtime Virtual Studio v4 art from checked-in generated source sheets.

The source sheets and campus art are original generated assets. This script performs deterministic
frame slicing and style packaging only; it does not claim that palette transforms are new drawings.
"""
from __future__ import annotations

import hashlib
import json
import random
from collections import deque
from pathlib import Path
from typing import Final

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

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



WORLD_CENTERS: Final = {
    "assets": (140, 116), "storyboard": (380, 116), "production": (644, 116), "release": (884, 116),
    "writers": (140, 332), "drawing": (388, 332), "review": (652, 332), "quality": (892, 332),
    "teams": (152, 576), "lounge": (392, 544), "live": (624, 560), "meeting": (876, 576),
    "assistant": (392, 684), "lobby": (624, 712),
}
WORLD_EDGES: Final = (
    ("assets", "storyboard"), ("storyboard", "production"), ("production", "release"),
    ("writers", "drawing"), ("drawing", "review"), ("review", "quality"),
    ("teams", "lounge"), ("lounge", "live"), ("live", "meeting"),
    ("assets", "writers"), ("storyboard", "drawing"), ("production", "review"), ("release", "quality"),
    ("writers", "teams"), ("drawing", "lounge"), ("review", "live"), ("quality", "meeting"),
    ("lounge", "assistant"), ("live", "lobby"), ("assistant", "lobby"),
)


def connected_sky_mask(image: Image.Image) -> Image.Image:
    """Select only border-connected sky/cloud pixels so architecture remains intact."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    selected = bytearray(width * height)
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def candidate(x: int, y: int) -> bool:
        r, g, b = pixels[x, y]
        return b >= 112 and b >= r * 1.07 and b >= g * 0.91 and (b - min(r, g)) >= 20

    for x in range(width):
        for y in (0, height - 1):
            if candidate(x, y): queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if candidate(x, y): queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index]: continue
        visited[index] = 1
        if not candidate(x, y): continue
        selected[index] = 255
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))
    return Image.frombytes("L", (width, height), bytes(selected)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    canvas = Image.new("RGBA", size)
    draw = ImageDraw.Draw(canvas)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(a * (1 - ratio) + b * ratio) for a, b in zip(top, bottom))
        draw.line((0, y, width, y), fill=(*color, 255))
    return canvas


def draw_world_connections(background: Image.Image, style: str) -> None:
    draw = ImageDraw.Draw(background, "RGBA")
    if style == "webtoon":
        colors, widths = ((255, 246, 221, 225), (157, 118, 91, 150)), (24, 32)
    elif style == "pastel":
        colors, widths = ((255, 246, 255, 220), (189, 157, 224, 125)), (28, 38)
    elif style == "retro":
        colors, widths = ((239, 205, 105, 255), (36, 46, 70, 255)), (12, 20)
    elif style == "ink":
        colors, widths = ((248, 248, 244, 255), (35, 35, 39, 210)), (16, 22)
    else:
        colors, widths = ((55, 230, 255, 210), (195, 67, 255, 130)), (8, 24)
    for left, right in WORLD_EDGES:
        a, b = WORLD_CENTERS[left], WORLD_CENTERS[right]
        draw.line((*a, *b), fill=colors[1], width=widths[1])
        draw.line((*a, *b), fill=colors[0], width=widths[0])
    for point in WORLD_CENTERS.values():
        radius = 9 if style == "retro" else 12
        draw.ellipse((point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius), fill=colors[0], outline=colors[1], width=3)


def world_background(style: str, size: tuple[int, int]) -> Image.Image:
    if style == "webtoon":
        image = vertical_gradient(size, (232, 244, 250), (255, 226, 202))
    elif style == "pastel":
        image = vertical_gradient(size, (235, 224, 255), (255, 235, 246))
    elif style == "retro":
        image = vertical_gradient(size, (32, 45, 69), (24, 72, 66))
    elif style == "ink":
        image = vertical_gradient(size, (252, 251, 247), (224, 224, 220))
    else:
        image = vertical_gradient(size, (5, 8, 28), (18, 15, 53))
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = size
    rng = random.Random({"webtoon": 11, "pastel": 23, "retro": 37, "ink": 41, "neon": 53}[style])
    if style in {"webtoon", "pastel"}:
        # The campus art already carries clouds and foliage; keep the open sky clean so room-focus
        # overlays never turn decorative marks into visual noise.
        pass
    elif style == "retro":
        for x in range(0, width, 16): draw.line((x, 0, x, height), fill=(110, 145, 139, 35), width=1)
        for y in range(0, height, 16): draw.line((0, y, width, y), fill=(110, 145, 139, 35), width=1)
    elif style == "ink":
        for x in range(-height, width, 9): draw.line((x, 0, x + height, height), fill=(32, 32, 36, 22), width=1)
    else:
        for _ in range(180):
            x, y = rng.randrange(width), rng.randrange(height)
            color = (80, 222, 255, rng.randrange(45, 150)) if rng.random() < .6 else (224, 93, 255, rng.randrange(35, 120))
            draw.point((x, y), fill=color)
    draw_world_connections(image, style)
    return image


def style_world(source: Image.Image, style: str) -> Image.Image:
    source = source.convert("RGBA")
    if style == "sky-island": return source
    sky = connected_sky_mask(source)
    architecture = source.copy() if style == "retro" else transform(source, style)
    background = world_background(style, source.size)
    composed = Image.composite(background, architecture, sky)
    if style == "retro":
        small = composed.resize((256, 192), Image.Resampling.BOX)
        small = ImageEnhance.Color(small).enhance(0.86)
        small = ImageEnhance.Contrast(small).enhance(1.16)
        indexed = small.convert("RGB").quantize(colors=56, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
        composed = indexed.resize(source.size, Image.Resampling.NEAREST)
    elif style == "ink":
        draw = ImageDraw.Draw(composed, "RGBA")
        for y in range(3, composed.height, 7):
            for x in range((y // 7) % 2 * 3, composed.width, 7):
                draw.ellipse((x, y, x + 1, y + 1), fill=(20, 20, 23, 55))
    return composed

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

    # Keep one authored high-detail floating-island source while generating materially different
    # architecture treatments that preserve the same production-room coordinates and permissions.
    sky_source = Image.open(ART_ROOT / "world" / "sky-island.webp").convert("RGBA")
    for style in ("sky-island", "webtoon", "pastel", "retro", "ink", "neon"):
        source = ART_ROOT / "world" / f"{style}.webp"
        if style != "sky-island":
            save_webp(style_world(sky_source, style), source, style)
        target = STYLE_ROOT / style / "tiles" / "world-base.webp"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())

    files = []
    roots = [NPC_ROOT, ART_ROOT]
    roots.extend(STYLE_ROOT / style / "npc-cast-v4" for style in STYLES)
    roots.extend(STYLE_ROOT / style / "tiles" for style in ("sky-island", "webtoon", "pastel", "retro", "ink", "neon"))
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
