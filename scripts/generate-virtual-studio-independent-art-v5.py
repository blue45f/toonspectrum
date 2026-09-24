#!/usr/bin/env python3
"""Generate independent Virtual Studio v5 RPG art packs.

Every art direction owns distinct actor, world, object and environment bytes. The approved
high-resolution Sky Island pack remains the canonical source for that one direction; no source
pixels are reused across styles and no style is produced by filtering another style's output.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1]
ASSETS: Final = ROOT / "apps/web/public/assets/virtual-studio"
OUT: Final = ASSETS / "style-packs-v5"
SKY_SOURCE: Final = ASSETS / "style-packs/sky-island"
STYLES: Final = ("sky-island", "webtoon", "pastel", "retro", "ink", "neon")
DIRECTIONS: Final = ("down", "right", "left", "up")
PLAYER_KEYS: Final = ("pink", "silver", "dark", "purple")
NPC_ROLES: Final = ("concierge", "producer", "editor", "artist", "archivist", "cafe", "security", "host")
CELL: Final = 160
ROOMS: Final = {
    "assets": (35, 35, 280, 190), "storyboard": (345, 35, 280, 190),
    "production": (655, 35, 280, 190), "release": (965, 35, 280, 190),
    "writers": (35, 285, 280, 230), "drawing": (345, 285, 280, 230),
    "review": (655, 285, 280, 230), "quality": (965, 285, 280, 230),
    "teams": (35, 575, 280, 250), "lounge": (345, 575, 280, 210),
    "live": (655, 575, 250, 250), "meeting": (965, 575, 280, 250),
    "assistant": (345, 820, 280, 125), "lobby": (655, 850, 250, 100),
}
EDGES: Final = (
    ("assets", "storyboard"), ("storyboard", "production"), ("production", "release"),
    ("writers", "drawing"), ("drawing", "review"), ("review", "quality"),
    ("teams", "lounge"), ("lounge", "live"), ("live", "meeting"),
    ("assets", "writers"), ("storyboard", "drawing"), ("production", "review"),
    ("release", "quality"), ("writers", "teams"), ("drawing", "lounge"),
    ("review", "live"), ("quality", "meeting"), ("lounge", "assistant"),
    ("live", "lobby"), ("assistant", "lobby"),
)

@dataclass(frozen=True)
class ActorSpec:
    key: str
    hair: tuple[int, int, int]
    eye: tuple[int, int, int]
    accent: tuple[int, int, int]
    skin: tuple[int, int, int]
    hair_kind: str
    prop: str = "none"
PLAYERS: Final = {
    "pink": ActorSpec("pink", (65, 44, 55), (94, 51, 77), (235, 102, 156), (255, 218, 199), "long"),
    "silver": ActorSpec("silver", (211, 222, 235), (68, 104, 141), (94, 168, 226), (253, 218, 198), "bob"),
    "dark": ActorSpec("dark", (33, 37, 50), (58, 86, 110), (66, 122, 198), (238, 188, 159), "short"),
    "purple": ActorSpec("purple", (84, 58, 110), (100, 64, 139), (159, 99, 215), (250, 209, 190), "wave"),
}
NPCS: Final = {
    "concierge": ActorSpec("concierge", (43, 58, 78), (58, 122, 166), (66, 199, 231), (255, 217, 197), "bob", "orb"),
    "producer": ActorSpec("producer", (65, 45, 36), (85, 66, 51), (238, 170, 63), (244, 195, 166), "short", "clipboard"),
    "editor": ActorSpec("editor", (47, 37, 58), (119, 55, 82), (234, 83, 116), (251, 211, 191), "wave", "glasses"),
    "artist": ActorSpec("artist", (94, 48, 75), (114, 68, 105), (225, 98, 188), (255, 219, 202), "long", "brush"),
    "archivist": ActorSpec("archivist", (59, 55, 92), (72, 67, 130), (134, 105, 224), (248, 207, 188), "bob", "book"),
    "cafe": ActorSpec("cafe", (72, 48, 34), (68, 83, 61), (100, 185, 130), (234, 181, 151), "short", "cup"),
    "security": ActorSpec("security", (35, 47, 74), (52, 82, 138), (70, 121, 205), (245, 201, 175), "short", "badge"),
    "host": ActorSpec("host", (109, 51, 45), (124, 73, 55), (255, 116, 81), (254, 212, 191), "wave", "mic"),
}

STYLE_SEEDS: Final = {style: index * 1009 + 73 for index, style in enumerate(STYLES)}
STYLE_PALETTES: Final = {
    "sky-island": ((86, 181, 247), (213, 242, 255), (80, 156, 88), (242, 226, 188), (116, 78, 176)),
    "webtoon": ((223, 238, 247), (255, 229, 211), (96, 157, 116), (221, 213, 197), (109, 86, 207)),
    "pastel": ((218, 221, 249), (255, 238, 247), (153, 196, 164), (240, 222, 237), (174, 126, 216)),
    "retro": ((38, 48, 76), (81, 101, 128), (85, 132, 91), (176, 145, 100), (232, 112, 154)),
    "ink": ((235, 234, 229), (255, 255, 250), (174, 178, 169), (214, 211, 202), (65, 65, 72)),
    "neon": ((7, 12, 33), (31, 20, 65), (23, 99, 87), (31, 37, 70), (179, 70, 244)),
}
def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(x * (1 - amount) + y * amount) for x, y in zip(a, b))


def rgba(color: tuple[int, int, int], alpha: int = 255) -> tuple[int, int, int, int]:
    return (*color, alpha)


def save(image: Image.Image, path: Path, *, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".webp":
        image.save(path, "WEBP", quality=94, method=5, exact=True, lossless=lossless)
    else:
        image.save(path, optimize=True)


def outlined(draw: ImageDraw.ImageDraw, shape: str, box: tuple[int, int, int, int], fill, outline, width: int, **kwargs) -> None:
    fn = getattr(draw, shape)
    fn(box, fill=fill, outline=outline, width=width, **kwargs)


def actor_colors(spec: ActorSpec, style: str) -> dict[str, tuple[int, int, int]]:
    if style == "ink":
        return {"hair": (40, 40, 45), "eye": (22, 22, 25), "accent": (95, 95, 103), "skin": (242, 240, 232), "cloth": (220, 220, 215), "line": (24, 24, 28)}
    if style == "neon":
        return {"hair": mix(spec.hair, (20, 22, 50), .46), "eye": mix(spec.eye, (43, 235, 255), .55), "accent": mix(spec.accent, (215, 68, 255), .28), "skin": mix(spec.skin, (180, 171, 211), .18), "cloth": (27, 35, 65), "line": (3, 7, 22)}
    if style == "pastel":
        return {"hair": mix(spec.hair, (245, 225, 240), .32), "eye": spec.eye, "accent": mix(spec.accent, (247, 205, 235), .24), "skin": mix(spec.skin, (255, 239, 229), .18), "cloth": mix(spec.accent, (250, 244, 246), .62), "line": mix(spec.hair, (126, 102, 129), .46)}
    return {"hair": spec.hair, "eye": spec.eye, "accent": spec.accent, "skin": spec.skin, "cloth": mix(spec.accent, (245, 244, 238), .58), "line": mix(spec.hair, (25, 26, 36), .38)}
def draw_actor(spec: ActorSpec, style: str, facing: str, frame: int = 0, action: str = "idle", npc: bool = False) -> Image.Image:
    scale = 4
    size = CELL * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    colors = actor_colors(spec, style)
    line = rgba(colors["line"])
    stroke = 5 * scale if style != "pastel" else 4 * scale
    phase = (0, 1, 0, -1)[frame % 4]
    walking = action in {"walk", "run"}
    bob = (-2 * phase if walking else 0) * scale
    cx = size // 2
    ground = 148 * scale + bob
    side = -1 if facing == "left" else 1
    profile = facing in {"left", "right"}
    back = facing == "up"
    head_y = ground - 92 * scale
    head_w = (38 if profile else 43) * scale
    head_h = 45 * scale
    body_top = ground - 61 * scale
    body_bottom = ground - 23 * scale
    leg_shift = (7 * phase if walking else 0) * scale

    if style == "neon":
        glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow, "RGBA")
        gd.ellipse((cx-42*scale, head_y-32*scale, cx+42*scale, ground+3*scale), fill=rgba(colors["accent"], 65))
        glow = glow.filter(ImageFilter.GaussianBlur(15 * scale))
        image.alpha_composite(glow)
        draw = ImageDraw.Draw(image, "RGBA")

    hair_back = (cx-head_w-4*scale, head_y-head_h//2-5*scale, cx+head_w+4*scale, head_y+head_h//2+13*scale)
    outlined(draw, "ellipse", hair_back, rgba(colors["hair"]), line, stroke)
    if spec.hair_kind == "long" and not back:
        draw.rounded_rectangle((cx-38*scale, head_y+8*scale, cx+38*scale, body_bottom+12*scale), radius=15*scale,
                               fill=rgba(mix(colors["hair"], colors["line"], .08)), outline=line, width=stroke)
    elif spec.hair_kind == "wave":
        for offset in (-35, 35):
            draw.ellipse((cx+(offset-13)*scale, head_y-3*scale, cx+(offset+13)*scale, head_y+40*scale), fill=rgba(colors["hair"]), outline=line, width=stroke)

    leg_color = mix(colors["cloth"], colors["line"], .18)
    for index, offset in enumerate((-12, 12)):
        step = leg_shift if index == 0 else -leg_shift
        x = cx + offset*scale + (side * 3*scale if profile else 0)
        draw.rounded_rectangle((x-8*scale, body_bottom-1*scale, x+8*scale, ground-4*scale-step//5), radius=5*scale,
                               fill=rgba(leg_color), outline=line, width=stroke)
        draw.ellipse((x-12*scale+step, ground-10*scale, x+12*scale+step, ground+1*scale), fill=rgba(colors["line"]), outline=line, width=max(scale, stroke//2))
    if style == "sky-island":
        draw.polygon([(cx-35*scale, body_top+7*scale), (cx+35*scale, body_top+7*scale), (cx+28*scale, ground-18*scale),
                      (cx, ground-7*scale), (cx-28*scale, ground-18*scale)], fill=rgba(colors["cloth"]), outline=line)
        draw.line((cx-32*scale, body_top+9*scale, cx, body_bottom+5*scale, cx+32*scale, body_top+9*scale), fill=rgba(colors["accent"]), width=5*scale)
    elif style == "retro":
        draw.rectangle((cx-31*scale, body_top, cx+31*scale, body_bottom+8*scale), fill=rgba(colors["cloth"]), outline=line, width=stroke)
        draw.rectangle((cx-31*scale, body_top, cx+31*scale, body_top+10*scale), fill=rgba(colors["accent"]))
    elif style == "neon":
        draw.rounded_rectangle((cx-34*scale, body_top, cx+34*scale, body_bottom+10*scale), radius=11*scale,
                               fill=rgba(colors["cloth"]), outline=line, width=stroke)
        draw.line((cx-25*scale, body_top+9*scale, cx+25*scale, body_bottom+2*scale), fill=rgba(colors["accent"]), width=4*scale)
        draw.line((cx+25*scale, body_top+9*scale, cx-25*scale, body_bottom+2*scale), fill=(44, 226, 255, 220), width=2*scale)
    else:
        draw.rounded_rectangle((cx-33*scale, body_top, cx+33*scale, body_bottom+8*scale), radius=13*scale,
                               fill=rgba(colors["cloth"]), outline=line, width=stroke)
        draw.rounded_rectangle((cx-25*scale, body_top+7*scale, cx+25*scale, body_top+17*scale), radius=4*scale,
                               fill=rgba(colors["accent"], 220))

    arm_raise = action in {"wave", "talk"}
    use_action = action in {"draw", "review", "push", "carry"}
    for index, offset in enumerate((-38, 38)):
        x = cx + offset*scale
        y2 = body_bottom + (0 if use_action else 7)*scale
        if arm_raise and index == (1 if facing != "left" else 0):
            y2 = head_y - 27*scale
            x += side * 13*scale
        elif use_action:
            x = cx + (-17 if index == 0 else 17)*scale
            y2 = body_top + 31*scale
        draw.line((cx + offset*.65*scale, body_top+11*scale, x, y2), fill=line, width=13*scale)
        draw.line((cx + offset*.65*scale, body_top+11*scale, x, y2), fill=rgba(colors["cloth"]), width=8*scale)
        draw.ellipse((x-5*scale, y2-5*scale, x+5*scale, y2+5*scale), fill=rgba(colors["skin"]), outline=line, width=max(scale, stroke//2))
    face_box = (cx-head_w, head_y-head_h//2, cx+head_w, head_y+head_h//2)
    outlined(draw, "ellipse", face_box, rgba(colors["skin"]), line, stroke)
    if back:
        draw.pieslice((cx-head_w-3*scale, head_y-head_h//2-5*scale, cx+head_w+3*scale, head_y+head_h//2+8*scale),
                      170, 370, fill=rgba(colors["hair"]), outline=line, width=stroke)
    else:
        eye_y = head_y + (4 if profile else 5)*scale
        eyes = [(cx+side*13*scale, eye_y)] if profile else [(cx-15*scale, eye_y), (cx+15*scale, eye_y)]
        for ex, ey in eyes:
            draw.ellipse((ex-6*scale, ey-7*scale, ex+6*scale, ey+7*scale), fill=rgba(colors["eye"]), outline=line, width=max(scale, stroke//3))
            draw.ellipse((ex-1*scale, ey-4*scale, ex+2*scale, ey-1*scale), fill=(255, 255, 255, 235))
        mouth_y = head_y + 19*scale
        if action == "talk":
            draw.ellipse((cx-6*scale, mouth_y-3*scale, cx+6*scale, mouth_y+5*scale), fill=(124, 55, 69, 255), outline=line, width=max(scale, stroke//3))
        else:
            draw.arc((cx-7*scale, mouth_y-4*scale, cx+7*scale, mouth_y+6*scale), 15, 165, fill=line, width=max(scale, stroke//3))
        fringe = [(cx-head_w, head_y-head_h//2+5*scale), (cx-14*scale, head_y-7*scale),
                  (cx, head_y-head_h//2+11*scale), (cx+14*scale, head_y-5*scale),
                  (cx+head_w, head_y-head_h//2+6*scale)]
        draw.polygon(fringe, fill=rgba(colors["hair"]), outline=line)
        if spec.hair_kind == "bob":
            draw.arc((cx-head_w-2*scale, head_y-head_h//2, cx+head_w+2*scale, head_y+head_h//2+8*scale),
                     190, 350, fill=line, width=stroke)

    if npc:
        badge_x = cx + (26 if facing != "left" else -26)*scale
        draw.ellipse((badge_x-7*scale, body_top+12*scale, badge_x+7*scale, body_top+26*scale),
                     fill=rgba(colors["accent"]), outline=(255, 255, 255, 240), width=2*scale)
    draw_actor_prop(draw, spec, style, facing, action, cx, head_y, body_top, ground, scale, line, colors)
    image = finish_actor_style(image, style)
    method = Image.Resampling.NEAREST if style == "retro" else Image.Resampling.LANCZOS
    return image.resize((CELL, CELL), method)
def draw_actor_prop(draw: ImageDraw.ImageDraw, spec: ActorSpec, style: str, facing: str, action: str,
                    cx: int, head_y: int, body_top: int, ground: int, scale: int, line, colors) -> None:
    side = -1 if facing == "left" else 1
    accent = rgba(colors["accent"])
    if style == "sky-island":
        draw.polygon([(cx-8*scale, head_y-48*scale), (cx, head_y-61*scale), (cx+8*scale, head_y-48*scale),
                      (cx, head_y-42*scale)], fill=(255, 238, 139, 245), outline=line)
        draw.arc((cx-49*scale, body_top-4*scale, cx+49*scale, ground-8*scale), 200, 340, fill=accent, width=3*scale)
    elif style == "pastel":
        draw.ellipse((cx-42*scale, head_y-47*scale, cx-20*scale, head_y-27*scale), fill=accent, outline=line, width=2*scale)
        draw.ellipse((cx+20*scale, head_y-47*scale, cx+42*scale, head_y-27*scale), fill=accent, outline=line, width=2*scale)
    elif style == "neon":
        draw.line((cx-28*scale, body_top+8*scale, cx+28*scale, body_top+8*scale), fill=(54, 226, 255, 230), width=2*scale)
    px = cx + side * 44 * scale
    py = body_top + 34 * scale
    prop = spec.prop
    if prop == "orb":
        draw.ellipse((px-10*scale, py-28*scale, px+10*scale, py-8*scale), fill=accent, outline=(245, 252, 255, 255), width=2*scale)
        draw.ellipse((px-3*scale, py-24*scale, px+2*scale, py-19*scale), fill=(255, 255, 255, 220))
    elif prop == "clipboard":
        draw.rounded_rectangle((px-13*scale, py-18*scale, px+13*scale, py+18*scale), radius=3*scale,
                               fill=(247, 236, 202, 255), outline=accent, width=3*scale)
        draw.line((px-7*scale, py-6*scale, px+7*scale, py-6*scale), fill=line, width=2*scale)
    elif prop == "glasses" and facing != "up":
        gy = head_y + 5*scale
        draw.rounded_rectangle((cx-30*scale, gy-9*scale, cx-5*scale, gy+9*scale), radius=4*scale,
                               outline=accent, width=3*scale)
        draw.rounded_rectangle((cx+5*scale, gy-9*scale, cx+30*scale, gy+9*scale), radius=4*scale,
                               outline=accent, width=3*scale)
        draw.line((cx-5*scale, gy, cx+5*scale, gy), fill=accent, width=3*scale)
    elif prop == "brush":
        draw.line((px-5*scale, py+15*scale, px+6*scale, py-18*scale), fill=(90, 60, 38, 255), width=4*scale)
        draw.polygon([(px+2*scale, py-18*scale), (px+10*scale, py-24*scale), (px+7*scale, py-13*scale)], fill=accent)
    elif prop == "book":
        draw.polygon([(px-16*scale, py-15*scale), (px, py-8*scale), (px, py+14*scale), (px-16*scale, py+8*scale)],
                     fill=accent, outline=line)
        draw.polygon([(px+16*scale, py-15*scale), (px, py-8*scale), (px, py+14*scale), (px+16*scale, py+8*scale)],
                     fill=rgba(mix(colors["accent"], (255, 255, 255), .25)), outline=line)
    elif prop == "cup":
        draw.rounded_rectangle((px-11*scale, py-10*scale, px+8*scale, py+10*scale), radius=3*scale,
                               fill=(247, 238, 219, 255), outline=line, width=2*scale)
        draw.arc((px+4*scale, py-7*scale, px+16*scale, py+8*scale), 270, 90, fill=accent, width=3*scale)
    elif prop == "badge":
        draw.polygon([(px, py-15*scale), (px+11*scale, py-5*scale), (px+7*scale, py+12*scale),
                      (px, py+17*scale), (px-7*scale, py+12*scale), (px-11*scale, py-5*scale)], fill=accent, outline=line)
    elif prop == "mic":
        draw.line((px, py-14*scale, px-6*scale, py+15*scale), fill=line, width=5*scale)
        draw.ellipse((px-8*scale, py-22*scale, px+8*scale, py-7*scale), fill=accent, outline=line, width=2*scale)
def finish_actor_style(image: Image.Image, style: str) -> Image.Image:
    if style == "pastel":
        paper = Image.new("RGBA", image.size, (255, 247, 252, 0))
        noise = Image.effect_noise(image.size, 8).point(lambda value: int(value * .045))
        paper.putalpha(Image.composite(noise, Image.new("L", image.size, 0), image.getchannel("A")))
        image = Image.alpha_composite(image, paper)
    elif style == "ink":
        alpha = image.getchannel("A")
        gray = ImageEnhance.Contrast(ImageOps.grayscale(image.convert("RGB"))).enhance(1.55)
        gray = ImageOps.posterize(gray, 3)
        image = Image.merge("RGBA", (gray, gray, gray, alpha))
        dots = Image.new("RGBA", image.size, (0, 0, 0, 0))
        dd = ImageDraw.Draw(dots, "RGBA")
        for y in range(0, image.height, 16):
            for x in range((y // 16 % 2) * 8, image.width, 16):
                if alpha.getpixel((x, y)) > 40:
                    dd.ellipse((x, y, x+4, y+4), fill=(10, 10, 13, 48))
        image = Image.alpha_composite(image, dots)
    elif style == "retro":
        image = image.resize((CELL//2, CELL//2), Image.Resampling.BOX)
        image = image.quantize(colors=32, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
        image = image.resize((CELL*4, CELL*4), Image.Resampling.NEAREST)
    elif style == "neon":
        alpha = image.getchannel("A")
        halo = Image.new("RGBA", image.size, (55, 218, 255, 0))
        halo.putalpha(alpha.filter(ImageFilter.GaussianBlur(20)).point(lambda value: int(value * .3)))
        image = Image.alpha_composite(halo, image)
    return image


def horizontal_strip(frames: list[Image.Image]) -> Image.Image:
    if not frames:
        raise ValueError("horizontal strip requires at least one frame")
    width, height = frames[0].size
    if any(frame.size != (width, height) for frame in frames):
        raise ValueError("horizontal strip frames must have identical dimensions")
    strip = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * width, 0))
    return strip


def fit_source_actor(image: Image.Image) -> Image.Image:
    """Fit approved source art to the v5 cell while preserving feet and transparency."""
    source = image.convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds:
        source = source.crop(bounds)
    ratio = min(142 / max(1, source.width), 154 / max(1, source.height))
    size = (max(1, round(source.width * ratio)), max(1, round(source.height * ratio)))
    source = source.resize(size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(source, ((CELL - source.width) // 2, CELL - source.height - 2))
    return cell


def source_frames(image: Image.Image) -> list[Image.Image]:
    source = image.convert("RGBA")
    columns, rows = (4, 1) if source.width >= source.height * 3 else (2, 2)
    width, height = source.width // columns, source.height // rows
    return [fit_source_actor(source.crop((column * width, row * height, (column + 1) * width, (row + 1) * height)))
            for row in range(rows) for column in range(columns)]


def animate_source_cell(cell: Image.Image, action: str) -> list[Image.Image]:
    offsets = {
        "walk": ((-2, 1), (0, -3), (2, 1), (0, 2)),
        "talk": ((-1, 0), (1, -1), (-1, 0), (1, 1)),
        "draw": ((-2, 0), (0, -2), (2, 0), (0, 1)),
        "review": ((0, 0), (0, -1), (0, 0), (0, 1)),
        "wave": ((0, 0), (1, -2), (0, 0), (-1, 1)),
        "sit": ((0, 5), (0, 4), (0, 5), (0, 4)),
    }[action]
    frames: list[Image.Image] = []
    for index, (x, y) in enumerate(offsets):
        frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        angle = 0 if action in {"review", "sit"} else (-0.8, 0.8, -0.5, 0.5)[index]
        actor = cell.rotate(angle, Image.Resampling.BICUBIC, expand=False)
        frame.alpha_composite(actor, (x, y))
        frames.append(frame)
    return frames


def build_sky_actor_pack(actors: dict[str, ActorSpec], folder: str, npc: bool) -> list[Path]:
    root = OUT / "sky-island" / folder
    source_root = SKY_SOURCE / ("npc-cast-v4" if npc else "production-v2")
    drawn_root = SKY_SOURCE / "drawn-characters-v1"
    prefix = "npc" if npc else "player"
    files: list[Path] = []
    for key in actors:
        cells: dict[str, Image.Image] = {}
        for facing in DIRECTIONS:
            direction_source = source_root / f"{prefix}-{key}-direction-{facing}.webp"
            idle = fit_source_actor(Image.open(direction_source))
            cells[facing] = idle
            target = root / f"{prefix}-{key}-direction-{facing}.webp"
            save(idle, target); files.append(target)

            walk_source = (source_root if npc else drawn_root) / f"{prefix}-{key}-walk-{facing}.webp"
            walk_frames = source_frames(Image.open(walk_source)) if walk_source.exists() else animate_source_cell(idle, "walk")
            target = root / f"{prefix}-{key}-walk-{facing}.webp"
            save(horizontal_strip(walk_frames[:4]), target); files.append(target)

            for action in ("talk", "draw", "review"):
                action_source = drawn_root / f"{prefix}-{key}-{action}-{facing}.webp"
                action_frames = source_frames(Image.open(action_source)) if action_source.exists() else animate_source_cell(idle, action)
                target = root / f"{prefix}-{key}-{action}-{facing}.webp"
                save(horizontal_strip(action_frames[:4]), target); files.append(target)
                if facing == "down":
                    state = root / f"{prefix}-{key}-state-{action}.webp"
                    save(action_frames[0], state); files.append(state)

        for pose in ("wave", "sit"):
            pose_source = drawn_root / f"{prefix}-{key}-{pose}.webp"
            if pose_source.exists():
                pose_frames = source_frames(Image.open(pose_source))[:4]
            else:
                pose_frames = [animate_source_cell(cells[facing], pose)[1] for facing in DIRECTIONS]
            target = root / f"{prefix}-{key}-{pose}.webp"
            save(horizontal_strip(pose_frames), target); files.append(target)
    return files


def build_actor_pack(style: str, actors: dict[str, ActorSpec], folder: str, npc: bool) -> list[Path]:
    if style == "sky-island":
        return build_sky_actor_pack(actors, folder, npc)
    root = OUT / style / folder
    files: list[Path] = []
    for key, spec in actors.items():
        for facing in DIRECTIONS:
            idle = draw_actor(spec, style, facing, 0, "idle", npc)
            target = root / f"{'npc' if npc else 'player'}-{key}-direction-{facing}.webp"
            save(idle, target, lossless=style == "retro"); files.append(target)
            walk = horizontal_strip([draw_actor(spec, style, facing, frame, "walk", npc) for frame in range(4)])
            target = root / f"{'npc' if npc else 'player'}-{key}-walk-{facing}.webp"
            save(walk, target, lossless=style == "retro"); files.append(target)
            for action in ("talk", "draw", "review"):
                frames = horizontal_strip([draw_actor(spec, style, facing, frame, action, npc) for frame in range(4)])
                target = root / f"{'npc' if npc else 'player'}-{key}-{action}-{facing}.webp"
                save(frames, target, lossless=style == "retro"); files.append(target)
                if facing == "down":
                    state = root / f"{'npc' if npc else 'player'}-{key}-state-{action}.webp"
                    save(frames.crop((0, 0, CELL, CELL)), state, lossless=style == "retro"); files.append(state)
        for pose in ("wave", "sit"):
            sheet = horizontal_strip([draw_actor(spec, style, facing, 0, pose, npc) for facing in DIRECTIONS])
            target = root / f"{'npc' if npc else 'player'}-{key}-{pose}.webp"
            save(sheet, target, lossless=style == "retro"); files.append(target)
    return files


def room_center(name: str) -> tuple[int, int]:
    x, y, width, height = ROOMS[name]
    return x + width // 2, y + height // 2


def gradient(size: tuple[int, int], top, bottom) -> Image.Image:
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        ratio = y / max(1, size[1] - 1)
        color = tuple(round(a * (1-ratio) + b * ratio) for a, b in zip(top, bottom))
        draw.line((0, y, size[0], y), fill=(*color, 255))
    return image


def cloud_blob(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, color, outline=None) -> None:
    height = max(18, width // 3)
    circles = [(-.34, .08, .28), (-.12, -.18, .34), (.16, -.09, .29), (.36, .12, .23)]
    for ox, oy, radius in circles:
        r = width * radius
        box = (x + width*ox-r, y + height*oy-r, x + width*ox+r, y + height*oy+r)
        draw.ellipse(box, fill=color, outline=outline, width=max(1, width//45) if outline else 1)


def path_between(draw: ImageDraw.ImageDraw, a, b, style: str, width: int = 28) -> None:
    _, _, _, path_color, accent = STYLE_PALETTES[style]
    if style == "retro":
        draw.line((*a, *b), fill=(28, 30, 48, 255), width=width+12)
        draw.line((*a, *b), fill=rgba(path_color), width=width)
    elif style == "ink":
        draw.line((*a, *b), fill=(35, 35, 42, 210), width=width+8)
        draw.line((*a, *b), fill=(243, 242, 235, 255), width=width)
    elif style == "neon":
        draw.line((*a, *b), fill=rgba(accent, 75), width=width+18)
        draw.line((*a, *b), fill=(39, 65, 98, 255), width=width)
        draw.line((*a, *b), fill=(62, 228, 255, 180), width=3)
    else:
        draw.line((*a, *b), fill=(82, 67, 68, 80), width=width+10)
        draw.line((*a, *b), fill=rgba(path_color), width=width)


def draw_room_structure(draw: ImageDraw.ImageDraw, name: str, rect, style: str, rng: random.Random) -> None:
    x, y, width, height = rect
    sky, low, plant, path_color, accent = STYLE_PALETTES[style]
    margin = 18 if style != "retro" else 12
    bx, by = x + margin, y + margin
    bw, bh = width - margin*2, height - margin*2
    if style == "sky-island":
        shadow = (bx-10, by+12, bx+bw+10, by+bh+28)
        draw.rounded_rectangle(shadow, radius=35, fill=(43, 87, 109, 145))
        draw.rounded_rectangle((bx-14, by-10, bx+bw+14, by+bh+10), radius=42,
                               fill=(82, 145, 85, 255), outline=(42, 95, 75, 230), width=5)
        for offset in (0, 8, 16):
            draw.arc((bx-12-offset, by+bh-24+offset, bx+bw+12+offset, by+bh+36+offset), 5, 175,
                     fill=(207, 229, 204, 130), width=3)
        roof = mix(accent, (93, 65, 142), .35)
        draw.rounded_rectangle((bx+25, by+28, bx+bw-25, by+bh-28), radius=16,
                               fill=(248, 231, 194, 255), outline=(79, 72, 91, 255), width=5)
        draw.polygon([(bx+12, by+52), (bx+bw//2, by+4), (bx+bw-12, by+52)], fill=rgba(roof), outline=(67, 58, 85, 255))
    elif style == "webtoon":
        draw.rounded_rectangle((bx, by, bx+bw, by+bh), radius=18, fill=(248, 244, 235, 255), outline=(91, 84, 91, 255), width=5)
        draw.rounded_rectangle((bx+12, by+12, bx+bw-12, by+48), radius=8, fill=rgba(mix(accent, (255,255,255), .45)), outline=(91,84,91,220), width=3)
        for wx in range(bx+25, bx+bw-35, 46):
            draw.rounded_rectangle((wx, by+67, wx+28, by+100), radius=4, fill=(125, 200, 225, 220), outline=(78, 91, 104, 220), width=3)
    elif style == "pastel":
        draw.rounded_rectangle((bx, by+12, bx+bw, by+bh), radius=34, fill=(255, 245, 248, 255), outline=(159, 134, 169, 210), width=5)
        draw.pieslice((bx-8, by-28, bx+bw+8, by+80), 180, 360, fill=rgba(mix(accent,(255,255,255),.55)), outline=(151,128,166,230), width=5)
        for wx in (bx+38, bx+bw-68):
            draw.ellipse((wx, by+74, wx+30, by+109), fill=(190, 224, 234, 245), outline=(135, 125, 155, 210), width=3)
    elif style == "retro":
        draw.rectangle((bx, by, bx+bw, by+bh), fill=(66, 71, 88, 255), outline=(21, 24, 39, 255), width=6)
        draw.polygon([(bx-6, by+38), (bx+bw//2, by-8), (bx+bw+6, by+38)], fill=rgba(accent), outline=(24,22,37,255))
        for wx in range(bx+22, bx+bw-28, 38):
            draw.rectangle((wx, by+60, wx+20, by+86), fill=(98, 164, 181, 255), outline=(24, 25, 39, 255), width=3)
    elif style == "ink":
        draw.rectangle((bx, by, bx+bw, by+bh), fill=(248, 247, 241, 255), outline=(30, 30, 35, 255), width=5)
        draw.polygon([(bx-8, by+38), (bx+bw//2, by-5), (bx+bw+8, by+38)], fill=(205, 204, 198, 255), outline=(28,28,32,255))
        for hatch in range(bx+8, bx+bw, 13):
            draw.line((hatch, by+48, hatch+36, by+bh), fill=(45,45,50,45), width=1)
        for wx in (bx+34, bx+bw-66):
            draw.rectangle((wx, by+62, wx+32, by+98), fill=(235,235,230,255), outline=(30,30,35,255), width=3)
    else:
        draw.rounded_rectangle((bx, by+10, bx+bw, by+bh), radius=10, fill=(15, 23, 48, 255), outline=rgba(accent), width=5)
        draw.polygon([(bx+4, by+44), (bx+bw//2, by-2), (bx+bw-4, by+44)], fill=(39, 30, 76, 255), outline=(49, 223, 255, 230))
        for wx in range(bx+22, bx+bw-30, 42):
            draw.rounded_rectangle((wx, by+63, wx+24, by+100), radius=3, fill=(33, 112, 137, 230), outline=(56, 229, 255, 230), width=2)
        draw.line((bx+12, by+bh-18, bx+bw-12, by+bh-18), fill=rgba(accent), width=3)

    door_w = 38 if style != "retro" else 30
    door_x = x + width//2 - door_w//2
    door_y = y + height - margin - 47
    door_color = (112, 76, 55) if style not in {"neon", "ink"} else ((25, 62, 91) if style == "neon" else (95, 95, 91))
    draw.rounded_rectangle((door_x, door_y, door_x+door_w, y+height-margin+2), radius=5,
                           fill=rgba(door_color), outline=(42, 36, 42, 245), width=3)
    if style == "neon":
        draw.line((door_x+4, door_y+5, door_x+door_w-4, door_y+5), fill=(62, 230, 255, 255), width=2)
    for _ in range(6 if style != "retro" else 3):
        tx = rng.randint(x+12, x+width-12)
        ty = rng.choice([y+8, y+height-8])
        radius = rng.randint(5, 11)
        leaf = plant if style not in {"neon", "ink"} else ((28, 140, 112) if style == "neon" else (120, 124, 116))
        draw.ellipse((tx-radius, ty-radius, tx+radius, ty+radius), fill=rgba(leaf, 225), outline=rgba(mix(leaf,(20,25,27),.25),180))


def draw_world(style: str) -> Image.Image:
    width, height = 1280, 960
    if style == "sky-island":
        source = Image.open(SKY_SOURCE / "tiles/world-base.webp").convert("RGBA")
        return source.resize((width, height), Image.Resampling.LANCZOS)
    sky, low, plant, path_color, accent = STYLE_PALETTES[style]
    image = gradient((width, height), sky, low)
    draw = ImageDraw.Draw(image, "RGBA")
    rng = random.Random(STYLE_SEEDS[style])
    if style == "sky-island":
        for _ in range(34):
            cloud_blob(draw, rng.randint(-60, width+60), rng.randint(-30, height), rng.randint(70, 190),
                       (255, 255, 255, rng.randint(42, 112)))
        for name, rect in ROOMS.items():
            x, y, rw, rh = rect
            draw.rounded_rectangle((x-8, y+18, x+rw+8, y+rh+30), radius=55, fill=(43, 87, 109, 130))
            draw.rounded_rectangle((x-11, y-6, x+rw+11, y+rh+10), radius=50,
                                   fill=(78, 148, 83, 255), outline=(42, 104, 79, 230), width=4)
            for drop in range(0, rw, 48):
                if rng.random() < .55:
                    wx = x + 18 + drop
                    draw.polygon([(wx, y+rh+3), (wx+18, y+rh+3), (wx+10, y+rh+rng.randint(36,82))],
                                 fill=(57, 176, 226, 190))
    elif style == "webtoon":
        draw.rectangle((0, 0, width, height), fill=(225, 237, 231, 215))
        for gx in range(0, width, 64):
            draw.line((gx, 0, gx, height), fill=(255, 255, 255, 22), width=1)
        for gy in range(0, height, 64):
            draw.line((0, gy, width, gy), fill=(82, 110, 100, 18), width=1)
    elif style == "pastel":
        for _ in range(58):
            x, y = rng.randrange(width), rng.randrange(height)
            draw.ellipse((x-18, y-10, x+18, y+10), fill=(255, 255, 255, rng.randint(22,58)))
    elif style == "retro":
        for y in range(0, height, 32):
            for x in range(0, width, 32):
                color = (65, 104, 76, 255) if (x//32+y//32)%3 else (73, 113, 82, 255)
                draw.rectangle((x, y, x+31, y+31), fill=color)
    elif style == "ink":
        draw.rectangle((0, 0, width, height), fill=(241, 240, 234, 255))
        for y in range(-height, height, 11):
            draw.line((0, y, width, y+width), fill=(30, 30, 35, 18), width=1)
    else:
        for _ in range(180):
            x, y = rng.randrange(width), rng.randrange(height)
            color = (56, 225, 255, rng.randint(35,110)) if rng.random()<.62 else (210,72,255,rng.randint(30,95))
            draw.ellipse((x-1, y-1, x+2, y+2), fill=color)
    for left, right in EDGES:
        path_between(draw, room_center(left), room_center(right), style, 24 if style == "sky-island" else 30)
    for name, rect in ROOMS.items():
        draw_room_structure(draw, name, rect, style, rng)

    if style == "sky-island":
        for wx in (315, 625, 935):
            draw.rounded_rectangle((wx-16, 205, wx+16, 302), radius=8, fill=(117, 79, 53, 255), outline=(69,48,42,255), width=3)
            for plank in range(215, 294, 14):
                draw.line((wx-13, plank, wx+13, plank), fill=(222, 180, 111, 255), width=5)
        draw.ellipse((726, 645, 834, 753), fill=(67, 188, 235, 230), outline=(233, 251, 255, 230), width=5)
        draw.ellipse((750, 669, 810, 729), fill=(92, 91, 230, 180), outline=(255, 246, 172, 255), width=4)
    elif style == "webtoon":
        draw.ellipse((735, 655, 825, 745), fill=(102, 190, 220, 230), outline=(255,255,255,245), width=5)
        draw.rounded_rectangle((745,665,815,735), radius=22, outline=(109,86,207,185), width=4)
    elif style == "pastel":
        draw.ellipse((730, 650, 830, 750), fill=(183, 218, 240, 230), outline=(255,247,255,255), width=7)
        for angle in range(0,360,45):
            x=780+int(math.cos(math.radians(angle))*35); y=700+int(math.sin(math.radians(angle))*35)
            draw.ellipse((x-8,y-8,x+8,y+8),fill=(250,185,222,230))
    elif style == "retro":
        draw.rectangle((744,664,816,736), fill=(39,116,166,255), outline=(238,209,102,255), width=6)
    elif style == "ink":
        draw.ellipse((738,658,822,742), fill=(220,220,216,255), outline=(31,31,36,255), width=5)
        draw.arc((748,668,812,732),0,360,fill=(76,76,82,255),width=3)
    else:
        draw.ellipse((736,656,824,744), fill=(24,73,101,255), outline=(56,230,255,255), width=5)
        draw.ellipse((754,674,806,726), outline=(212,71,255,255), width=4)
    return image


def draw_cloud_layer(style: str, front: bool) -> Image.Image:
    size = (640, 320)
    image = Image.new("RGBA", size, (0,0,0,0))
    draw = ImageDraw.Draw(image, "RGBA")
    rng = random.Random(STYLE_SEEDS[style] + (911 if front else 433))
    count = 7 if front else 10
    for _ in range(count):
        x, y = rng.randrange(-30, size[0]+30), rng.randrange(0, size[1])
        width = rng.randrange(60, 170) if front else rng.randrange(45, 125)
        if style == "neon": color = (80, 50, 150, rng.randrange(25,70))
        elif style == "retro": color = (219, 214, 181, rng.randrange(75,145))
        elif style == "ink": color = (255,255,250,rng.randrange(80,150))
        else: color = (255,255,255,rng.randrange(55,145))
        cloud_blob(draw, x, y, width, color, (80,80,95,30) if style=="ink" else None)
    if style == "retro":
        image = image.resize((160,80), Image.Resampling.BOX).resize(size, Image.Resampling.NEAREST)
    return image


def water_frame(style: str, frame: int) -> Image.Image:
    image = Image.new("RGBA", (256,128), (0,0,0,0))
    draw = ImageDraw.Draw(image,"RGBA")
    base = STYLE_PALETTES[style][0]
    water = (45,177,232) if style not in {"ink","neon","retro"} else ((117,117,126) if style=="ink" else (28,217,240) if style=="neon" else (45,102,158))
    draw.rounded_rectangle((2,12,254,126), radius=28, fill=rgba(mix(water,base,.18),210), outline=rgba(water,235), width=3)
    for index in range(7):
        y=27+index*13
        offset=(frame*11+index*19)%55
        for x in range(-55+offset,256,55):
            draw.arc((x,y-6,x+38,y+7),5,175,fill=(255,255,255,95),width=2)
    if style=="retro": image=image.resize((64,32),Image.Resampling.BOX).resize((256,128),Image.Resampling.NEAREST)
    return image


def foliage_frame(style: str, frame: int) -> Image.Image:
    image=Image.new("RGBA",(256,128),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    plant=STYLE_PALETTES[style][2]
    sway=(0,3,0,-3)[frame%4]
    for x in range(18,250,28):
        height=30+(x*7)%22
        draw.line((x,118,x+sway,118-height),fill=rgba(mix(plant,(35,65,44),.35)),width=4)
        for y in range(0,3):
            oy=118-height+y*9
            direction=-1 if (x//28+y)%2 else 1
            draw.ellipse((x+sway+direction*2-8,oy-5,x+sway+direction*9,oy+6),fill=rgba(plant,225),outline=rgba(mix(plant,(22,34,30),.35),150))
    if style=="pastel":
        for x in range(30,240,48): draw.ellipse((x-5,80,x+7,92),fill=(249,174,215,220))
    if style=="neon":
        for x in range(25,250,43): draw.ellipse((x-3,84,x+4,91),fill=(58,230,255,210))
    if style=="retro": image=image.resize((64,32),Image.Resampling.BOX).resize((256,128),Image.Resampling.NEAREST)
    return image


def light_frame(style: str, frame: int) -> Image.Image:
    image=Image.new("RGBA",(256,128),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    pulse=(.55,.8,1,.72)[frame%4]
    accent=STYLE_PALETTES[style][4]
    for x in (32,96,160,224):
        radius=20+int(7*pulse)
        glow=Image.new("RGBA",image.size,(0,0,0,0)); gd=ImageDraw.Draw(glow,"RGBA")
        color=(255,224,126) if style not in {"neon","ink"} else ((58,226,255) if style=="neon" else (145,145,151))
        gd.ellipse((x-radius,40-radius,x+radius,40+radius),fill=rgba(color,int(70*pulse)))
        glow=glow.filter(ImageFilter.GaussianBlur(9)); image=Image.alpha_composite(image,glow); draw=ImageDraw.Draw(image,"RGBA")
        draw.ellipse((x-5,35,x+5,45),fill=rgba(color,235),outline=rgba(accent,220))
        draw.line((x,45,x,91),fill=(62,52,56,230),width=4)
    return image


def weather_frame(style: str, frame: int) -> Image.Image:
    image=Image.new("RGBA",(256,256),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    rng=random.Random(STYLE_SEEDS[style]+frame*701)
    for _ in range(42):
        x,y=rng.randrange(256),rng.randrange(256)
        if style=="sky-island":
            draw.ellipse((x-2,y-2,x+3,y+3),fill=(255,242,160,rng.randrange(80,200)))
        elif style=="pastel":
            draw.ellipse((x-3,y-2,x+4,y+3),fill=(250,174,215,rng.randrange(60,160)))
        elif style=="retro":
            draw.rectangle((x,y,x+2,y+2),fill=(236,218,134,rng.randrange(70,170)))
        elif style=="ink":
            draw.line((x,y,x+5,y+8),fill=(45,45,50,rng.randrange(25,80)),width=1)
        elif style=="neon":
            draw.line((x,y,x-4,y+13),fill=(58,226,255,rng.randrange(45,140)),width=2)
        else:
            draw.ellipse((x-1,y-1,x+2,y+2),fill=(255,255,255,rng.randrange(45,120)))
    return image


def object_asset(style: str, kind: str) -> Image.Image:
    image=Image.new("RGBA",(128,128),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    line=(27,27,34,255); accent=STYLE_PALETTES[style][4]
    wood=(139,90,58) if style not in {"neon","ink"} else ((42,62,91) if style=="neon" else (135,135,130))
    if kind=="door":
        draw.rounded_rectangle((27,12,101,118),radius=9,fill=rgba(wood),outline=line,width=5)
        draw.rounded_rectangle((36,22,92,106),radius=6,outline=rgba(accent),width=4)
        draw.ellipse((82,63,90,71),fill=(255,222,126,255),outline=line,width=2)
    elif kind=="crate":
        draw.rounded_rectangle((22,34,106,112),radius=5,fill=rgba(wood),outline=line,width=5)
        draw.line((29,42,99,104),fill=rgba(mix(wood,(245,207,146),.32)),width=7)
        draw.line((99,42,29,104),fill=rgba(mix(wood,(245,207,146),.32)),width=7)
    elif kind=="lantern":
        draw.line((64,112,64,47),fill=line,width=7)
        draw.rounded_rectangle((46,24,82,61),radius=9,fill=(255,225,135,235),outline=rgba(accent),width=4)
        draw.ellipse((36,14,92,72),fill=rgba(accent,45))
    elif kind=="bench":
        draw.rounded_rectangle((15,51,113,81),radius=6,fill=rgba(wood),outline=line,width=5)
        draw.line((28,80,23,115),fill=line,width=7); draw.line((100,80,105,115),fill=line,width=7)
    if style=="retro": image=image.resize((32,32),Image.Resampling.BOX).resize((128,128),Image.Resampling.NEAREST)
    return image


def terrain_atlas(style: str) -> Image.Image:
    atlas=Image.new("RGBA",(512,128),(0,0,0,0))
    rng=random.Random(STYLE_SEEDS[style]+808)
    colors={
        "sky-island":((103,181,100),(231,215,183),(57,180,229),(127,113,109)),
        "webtoon":((121,180,128),(215,206,188),(87,178,213),(148,144,141)),
        "pastel":((174,211,180),(236,219,232),(170,213,235),(190,181,198)),
        "retro":((75,120,82),(163,138,98),(42,104,164),(91,91,104)),
        "ink":((195,198,190),(224,222,214),(145,145,153),(172,170,166)),
        "neon":((25,98,84),(47,48,81),(18,147,181),(52,52,78)),
    }[style]
    draw=ImageDraw.Draw(atlas,"RGBA")
    for index,color in enumerate(colors):
        x=index*128
        draw.rectangle((x,0,x+127,127),fill=rgba(color))
        for _ in range(45):
            px=x+rng.randrange(128); py=rng.randrange(128); radius=rng.choice((1,1,2,3))
            draw.ellipse((px-radius,py-radius,px+radius,py+radius),fill=(255,255,255,rng.randrange(15,55)))
        if index==1:
            for offset in range(0,128,32): draw.line((x+offset,0,x+offset,128),fill=(50,45,55,40),width=2)
        if index==2:
            for y in range(15,128,27): draw.arc((x,y-7,x+62,y+8),5,175,fill=(255,255,255,85),width=2)
    if style=="retro": atlas=atlas.resize((128,32),Image.Resampling.BOX).resize((512,128),Image.Resampling.NEAREST)
    return atlas


def build_world_pack(style: str) -> list[Path]:
    root=OUT/style/"world"; files=[]
    assets={
        "world-base.webp":draw_world(style),
        "cloud-back.webp":draw_cloud_layer(style,False),
        "cloud-front.webp":draw_cloud_layer(style,True),
        "water-sheet.webp":horizontal_strip([water_frame(style,i) for i in range(4)]),
        "foliage-sheet.webp":horizontal_strip([foliage_frame(style,i) for i in range(4)]),
        "lights-sheet.webp":horizontal_strip([light_frame(style,i) for i in range(4)]),
        "weather-sheet.webp":horizontal_strip([weather_frame(style,i) for i in range(4)]),
        "terrain-atlas.webp":terrain_atlas(style),
    }
    for name,image in assets.items():
        target=root/name; save(image,target,lossless=style=="retro"); files.append(target)
    for kind in ("door","crate","lantern","bench"):
        target=OUT/style/"objects"/f"{kind}.webp"; save(object_asset(style,kind),target,lossless=style=="retro"); files.append(target)
    return files


def file_record(path: Path, root: Path) -> dict[str, object]:
    data=path.read_bytes()
    with Image.open(path) as image:
        size=[image.width,image.height]
        sample=image.convert("RGB").resize((16,16),Image.Resampling.BILINEAR)
        signature=hashlib.sha256(sample.tobytes()).hexdigest()
    return {"file":path.relative_to(root).as_posix(),"bytes":len(data),
            "sha256":hashlib.sha256(data).hexdigest(),"size":size,"visualSignature":signature}


def main() -> None:
    all_files: list[Path]=[]
    for style in STYLES:
        all_files.extend(build_actor_pack(style,PLAYERS,"players",False))
        all_files.extend(build_actor_pack(style,NPCS,"npcs",True))
        all_files.extend(build_world_pack(style))
    manifest={
        "version":5,
        "generatedAt":"2026-09-24",
        "sourceTechnique":"independent style-specific rendering; approved high-resolution Sky Island source retained only for Sky Island; no cross-style pixel reuse, recolour, or filter-derived variants",
        "independentSource":True,
        "sourceProvenance":{"sky-island":"approved style-packs/sky-island source art","otherStyles":"semantic independent renderer"},
        "styles":list(STYLES),
        "players":list(PLAYER_KEYS),
        "npcRoles":list(NPC_ROLES),
        "frame":{"width":CELL,"height":CELL,"walkFrames":4,"actionFrames":4},
        "styleSeeds":STYLE_SEEDS,
        "files":[file_record(path,OUT) for path in sorted(all_files)],
    }
    target=OUT/"art-v5-manifest.json"
    target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(f"Virtual Studio independent art v5: {len(all_files)} assets, {sum(p.stat().st_size for p in all_files):,} bytes")


if __name__ == "__main__":
    main()
