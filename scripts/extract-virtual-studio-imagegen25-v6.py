#!/usr/bin/env python3
"""Extract production runtime assets from committed Image Generation 2.5 concept boards.

The source boards are preserved byte-for-byte under living-town-v6/source. This script crops
only the generated tiles, props and character sprites; it does not recolour another style pack.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Final

from PIL import Image, ImageEnhance, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1]
PACK: Final = ROOT / "apps/web/public/assets/virtual-studio/living-town-v6"
SOURCE: Final = PACK / "source"
DESIGN_BOARD: Final = SOURCE / "imagegen25-design-board.png"
WORLD_CONCEPT: Final = SOURCE / "imagegen25-world-concept.png"
SKY: Final = PACK / "sky-island"
CHARACTER: Final = PACK / "imagegen25-character"

DESIGN_FILE_ID: Final = "file_000000001c9081fdbfb6bcbe9e715172"
WORLD_FILE_ID: Final = "file_00000000854881f482a2bd88a6ed7433"
GENERATION_IDS: Final = (
    "66b20001-32fd-4d90-9a6f-14b676399191",
    "9ffa2971-6d20-49bd-a8b3-aaa3da97d83f",
    "22beabfc-ecd4-47a7-8925-1c83b56003c2",
)


def crop(source: Image.Image, center: tuple[int, int], width: int, height: int) -> Image.Image:
    x, y = center
    return source.crop((round(x - width / 2), round(y - height / 2),
                        round(x + width / 2), round(y + height / 2)))


def transparent_panel_background(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            maximum, minimum = max(red, green, blue), min(red, green, blue)
            light_panel = red > 215 and green > 220 and blue > 225 and maximum - minimum < 45
            near_white = red > 238 and green > 238 and blue > 238
            if light_panel or near_white:
                pixels[x, y] = (red, green, blue, 0)
    return result


def trim(image: Image.Image, padding: int = 2) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        return image
    left, top, right, bottom = bounds
    return image.crop((max(0, left - padding), max(0, top - padding),
                       min(image.width, right + padding), min(image.height, bottom + padding)))


def fit(image: Image.Image, size: tuple[int, int], margin: int = 7, *, pixel: bool = False) -> Image.Image:
    source = trim(transparent_panel_background(image))
    ratio = min((size[0] - margin * 2) / max(1, source.width),
                (size[1] - margin * 2) / max(1, source.height))
    target = (max(1, round(source.width * ratio)), max(1, round(source.height * ratio)))
    source = source.resize(target, Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(source, ((size[0] - source.width) // 2, size[1] - source.height - margin))
    return canvas


def save(image: Image.Image, path: Path, *, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=96, method=6, exact=True, lossless=lossless)


def build_terrain(board: Image.Image) -> Image.Image:
    centers = (
        (376, 837), (418, 837), (460, 837), (376, 883),
        (418, 883), (460, 883), (376, 928), (418, 928),
        (460, 928), (518, 837), (558, 837), (598, 837),
        (518, 883), (558, 883), (598, 883), (518, 928),
    )
    atlas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for index, center in enumerate(centers):
        tile = crop(board, center, 34, 34).resize((128, 128), Image.Resampling.LANCZOS)
        tile = ImageEnhance.Sharpness(tile).enhance(1.2)
        atlas.alpha_composite(tile, ((index % 4) * 128, (index // 4) * 128))
    return atlas


def build_decor(board: Image.Image) -> Image.Image:
    specs = (
        ((648, 853), 42, 45), ((727, 853), 42, 43), ((777, 852), 48, 35),
        ((731, 925), 34, 49), ((1424, 914), 35, 48), ((1215, 850), 55, 46),
        ((942, 852), 47, 48), ((1024, 852), 47, 50), ((460, 927), 32, 32),
        ((1390, 916), 32, 46), ((818, 881), 48, 47), ((321, 915), 38, 46),
    )
    sheet = Image.new("RGBA", (1536, 128), (0, 0, 0, 0))
    for index, (center, width, height) in enumerate(specs):
        sheet.alpha_composite(fit(crop(board, center, width, height), (128, 128), 8), (index * 128, 0))
    return sheet


def build_district_previews(world: Image.Image) -> Image.Image:
    # Seven real concept-art districts; no colour filter or procedural repaint.
    boxes = (
        (0, 44, 320, 224), (305, 32, 625, 212), (606, 36, 926, 216),
        (176, 284, 496, 464), (538, 276, 858, 456), (858, 275, 1178, 455),
        (480, 480, 800, 660),
    )
    sheet = Image.new("RGBA", (2240, 180), (0, 0, 0, 255))
    for index, box in enumerate(boxes):
        district = world.crop(box).resize((320, 180), Image.Resampling.LANCZOS)
        sheet.alpha_composite(district, (index * 320, 0))
    return sheet


def character_frame(
    board: Image.Image,
    center: tuple[int, int],
    width: int = 43,
    height: int = 48,
) -> Image.Image:
    return fit(crop(board, center, width, height), (160, 160), 8, pixel=True)


def animated_strip(frame: Image.Image, action: str) -> Image.Image:
    offsets = {
        "walk": ((-2, 1), (0, -3), (2, 1), (0, 2)),
        "talk": ((-1, 0), (1, -1), (-1, 0), (1, 1)),
        "draw": ((-2, 0), (0, -2), (2, 0), (0, 1)),
        "review": ((0, 0), (0, -1), (0, 0), (0, 1)),
    }[action]
    strip = Image.new("RGBA", (640, 160), (0, 0, 0, 0))
    for index, (offset_x, offset_y) in enumerate(offsets):
        cell = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        cell.alpha_composite(frame, (offset_x, offset_y))
        strip.alpha_composite(cell, (index * 160, 0))
    return strip


def build_character_pack(board: Image.Image) -> list[Path]:
    # The ImageGen board includes a labelled four-direction example. Earlier extraction reused
    # one front frame for three directions, which made movement look like a sliding sticker.
    # Use the authored direction cells and the matching seated/action row instead.
    direction_centers = {
        "down": (210, 916),
        "left": (246, 854),
        "right": (282, 854),
        "up": (316, 854),
    }
    action_centers = {
        "down": (210, 916),
        "left": (246, 916),
        "right": (282, 916),
        "up": (316, 854),
    }
    frames = {facing: character_frame(board, center, 34, 48) for facing, center in direction_centers.items()}
    action_frames = {facing: character_frame(board, center, 34, 48) for facing, center in action_centers.items()}
    files: list[Path] = []
    for facing, frame in frames.items():
        target = CHARACTER / f"player-imagegen25-direction-{facing}.webp"
        save(frame, target, lossless=True); files.append(target)
        for action in ("walk", "talk", "draw", "review"):
            action_frame = action_frames[facing] if action in {"draw", "review"} else frame
            target = CHARACTER / f"player-imagegen25-{action}-{facing}.webp"
            strip = animated_strip(action_frame, action)
            save(strip, target, lossless=True); files.append(target)
            if facing == "down" and action != "walk":
                state = CHARACTER / f"player-imagegen25-state-{action}.webp"
                save(strip.crop((0, 0, 160, 160)), state, lossless=True); files.append(state)

    wave = Image.new("RGBA", (640, 160), (0, 0, 0, 0))
    sit = Image.new("RGBA", (640, 160), (0, 0, 0, 0))
    for index, facing in enumerate(("down", "right", "left", "up")):
        wave.alpha_composite(frames[facing], (index * 160, -2 if index % 2 else 0))
        sit.alpha_composite(action_frames[facing], (index * 160, 2))
    for name, pose in (("wave", wave), ("sit", sit)):
        target = CHARACTER / f"player-imagegen25-{name}.webp"
        save(pose, target, lossless=True); files.append(target)

    preset_centers = ((47, 854), (87, 854), (128, 854), (168, 854),
                      (47, 916), (87, 916), (128, 916), (168, 916))
    presets = Image.new("RGBA", (1024, 128), (0, 0, 0, 0))
    for index, center in enumerate(preset_centers):
        presets.alpha_composite(fit(crop(board, center, 45, 50), (128, 128), 6, pixel=True), (index * 128, 0))
    target = CHARACTER / "player-imagegen25-preset-sheet.webp"
    save(presets, target, lossless=True); files.append(target)
    return files


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def visual_signature(path: Path) -> str:
    with Image.open(path) as image:
        sample = image.convert("RGB").resize((24, 24), Image.Resampling.BILINEAR)
    return hashlib.sha256(sample.tobytes()).hexdigest()


def file_record(path: Path) -> dict[str, object]:
    image = Image.open(path)
    return {"file": path.relative_to(PACK).as_posix(), "bytes": path.stat().st_size,
            "sha256": sha256(path), "size": [image.width, image.height],
            "visualSignature": visual_signature(path)}


def main() -> None:
    design = Image.open(DESIGN_BOARD).convert("RGBA")
    world = Image.open(WORLD_CONCEPT).convert("RGBA")
    generated: list[Path] = []

    terrain = SKY / "terrain-tile-atlas.webp"
    decor = SKY / "decor-sheet.webp"
    previews = SKY / "district-preview-sheet.webp"
    save(build_terrain(design), terrain); generated.append(terrain)
    save(build_decor(design), decor); generated.append(decor)
    save(build_district_previews(world), previews); generated.append(previews)
    generated.extend(build_character_pack(design))

    manifest = {
        "version": 1,
        "generator": "OpenAI Image Generation 2.5 concept extraction",
        "sourceFiles": [
            {"file": DESIGN_BOARD.relative_to(PACK).as_posix(), "fileId": DESIGN_FILE_ID,
             "sha256": sha256(DESIGN_BOARD), "bytes": DESIGN_BOARD.stat().st_size},
            {"file": WORLD_CONCEPT.relative_to(PACK).as_posix(), "fileId": WORLD_FILE_ID,
             "sha256": sha256(WORLD_CONCEPT), "bytes": WORLD_CONCEPT.stat().st_size},
        ],
        "sessionGenerationIds": list(GENERATION_IDS),
        "policy": "Runtime crops only; no CSS filter, hue rotation, or cross-style recolour derivation.",
        "files": [file_record(path) for path in sorted(generated)],
    }
    target = PACK / "imagegen25-source-manifest.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    # Refresh the three overwritten Sky Island records in the main living-town manifest.
    living_manifest_path = PACK / "art-v6-manifest.json"
    living_manifest = json.loads(living_manifest_path.read_text())
    replacements = {record["file"]: record for record in (file_record(terrain), file_record(decor), file_record(previews))}
    living_manifest["files"] = [replacements.get(record["file"], record) for record in living_manifest["files"]]
    living_manifest["imageGeneration25SourceManifest"] = target.relative_to(PACK).as_posix()
    living_manifest_path.write_text(json.dumps(living_manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"ImageGen 2.5 Virtual Studio extraction: {len(generated)} runtime files")


if __name__ == "__main__":
    main()
