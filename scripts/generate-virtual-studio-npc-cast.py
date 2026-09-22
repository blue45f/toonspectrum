#!/usr/bin/env python3
"""Generate ToonStudio-owned NPC cast art without reusing player sprites."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/web/public/assets/virtual-studio/npc-cast-v1"
W, H = 384, 512
Direction = Literal["down", "left", "right", "up"]

CAST = {
    "concierge": {"skin": "#efc3a5", "hair": "#50352f", "top": "#177f83", "accent": "#f1c453", "role": "guide"},
    "editor": {"skin": "#e7b795", "hair": "#29243d", "top": "#43557d", "accent": "#b7c8ff", "role": "writer"},
    "atelier": {"skin": "#f0b797", "hair": "#7f3c52", "top": "#d96961", "accent": "#ffd16d", "role": "artist"},
    "archivist": {"skin": "#d8aa8b", "hair": "#38362d", "top": "#49745e", "accent": "#d4e6aa", "role": "librarian"},
}
DIRECTIONS: tuple[Direction, ...] = ("down", "left", "right", "up")


def ellipse(draw: ImageDraw.ImageDraw, box, fill, outline=None, width=1):
    draw.ellipse(tuple(int(v) for v in box), fill=fill, outline=outline, width=width)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(tuple(int(v) for v in box), radius=int(radius), fill=fill, outline=outline, width=width)


def polygon(draw: ImageDraw.ImageDraw, points, fill, outline=None):
    draw.polygon([(int(x), int(y)) for x, y in points], fill=fill, outline=outline)


def render(key: str, direction: Direction, phase: int = 0, action: str | None = None) -> Image.Image:
    cfg = CAST[key]
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    bob = (0, -4, 0, -2)[phase % 4]
    swing = (-12, 10, 12, -8)[phase % 4]
    cx, foot = 192, 470 + bob
    side = -1 if direction == "left" else 1

    # soft grounded shadow
    ellipse(draw, (105, 446, 279, 485), "#221c2238")

    # legs, intentionally role-specific silhouettes
    leg_color = "#283240" if cfg["role"] != "artist" else "#48505e"
    if direction == "up":
        left_x, right_x = 151 + swing // 5, 207 - swing // 5
    else:
        left_x, right_x = 150 + swing // 4, 208 - swing // 4
    rounded(draw, (left_x, 354 + bob, left_x + 38, foot), 17, leg_color)
    rounded(draw, (right_x, 354 + bob, right_x + 38, foot), 17, leg_color)
    rounded(draw, (left_x - 9, foot - 17, left_x + 42, foot + 4), 10, "#312b2a")
    rounded(draw, (right_x - 5, foot - 17, right_x + 47, foot + 4), 10, "#312b2a")

    # torso / role uniform
    rounded(draw, (112, 226 + bob, 272, 382 + bob), 53, cfg["top"], "#2b2831", 5)
    if cfg["role"] == "guide":
        polygon(draw, [(133, 248 + bob), (192, 303 + bob), (251, 248 + bob), (225, 344 + bob), (159, 344 + bob)], cfg["accent"])
        rounded(draw, (176, 285 + bob, 209, 345 + bob), 8, "#243d47")
    elif cfg["role"] == "writer":
        rounded(draw, (133, 248 + bob, 251, 365 + bob), 20, "#eef0e8")
        draw.line((192, 249 + bob, 192, 365 + bob), fill="#8b8d98", width=4)
        rounded(draw, (151, 300 + bob, 233, 367 + bob), 6, cfg["top"])
    elif cfg["role"] == "artist":
        rounded(draw, (143, 257 + bob, 241, 382 + bob), 18, "#596c79")
        rounded(draw, (162, 278 + bob, 222, 347 + bob), 10, cfg["accent"])
        draw.line((154, 242 + bob, 171, 291 + bob), fill="#424852", width=10)
        draw.line((230, 242 + bob, 213, 291 + bob), fill="#424852", width=10)
    else:
        polygon(draw, [(120, 251 + bob), (192, 225 + bob), (264, 251 + bob), (240, 377 + bob), (144, 377 + bob)], cfg["top"])
        draw.line((192, 243 + bob, 192, 370 + bob), fill=cfg["accent"], width=8)

    # arms and props
    arm_y = 270 + bob
    if action == "draw" or (action is None and cfg["role"] == "artist" and phase % 2):
        rounded(draw, (77, arm_y + 18, 137, arm_y + 48), 14, cfg["skin"])
        draw.line((102, arm_y + 23, 67, arm_y - 31), fill="#6a4b30", width=9)
        ellipse(draw, (49, arm_y - 54, 83, arm_y - 20), cfg["accent"], "#3a2e2f", 4)
        rounded(draw, (246, arm_y - 5, 309, arm_y + 27), 14, cfg["skin"])
        draw.line((283, arm_y + 3, 321, arm_y - 42), fill="#704523", width=7)
    elif action == "review" or cfg["role"] in {"writer", "librarian"}:
        rounded(draw, (80, arm_y + 2, 139, arm_y + 35), 14, cfg["skin"])
        rounded(draw, (245, arm_y + 2, 304, arm_y + 35), 14, cfg["skin"])
        rounded(draw, (123, arm_y + 10, 261, arm_y + 100), 8, "#f3e9cc", "#52483f", 5)
        draw.line((192, arm_y + 15, 192, arm_y + 96), fill="#a68e69", width=4)
        draw.line((143, arm_y + 37, 181, arm_y + 31), fill="#927b5c", width=3)
        draw.line((203, arm_y + 31, 242, arm_y + 38), fill="#927b5c", width=3)
    else:
        rounded(draw, (82 + swing // 3, arm_y, 140 + swing // 3, arm_y + 32), 14, cfg["skin"])
        rounded(draw, (244 - swing // 3, arm_y, 302 - swing // 3, arm_y + 32), 14, cfg["skin"])

    # neck and head
    rounded(draw, (169, 194 + bob, 215, 249 + bob), 18, cfg["skin"])
    ellipse(draw, (112, 65 + bob, 272, 235 + bob), cfg["skin"], "#443136", 5)

    # hair silhouette differs by facing
    if direction == "up":
        ellipse(draw, (106, 54 + bob, 278, 214 + bob), cfg["hair"], "#30272b", 5)
        polygon(draw, [(112, 128 + bob), (132, 225 + bob), (163, 194 + bob), (192, 226 + bob), (221, 194 + bob), (253, 225 + bob), (272, 127 + bob)], cfg["hair"])
    else:
        ellipse(draw, (105, 52 + bob, 279, 180 + bob), cfg["hair"], "#30272b", 5)
        if direction == "down":
            polygon(draw, [(111, 111 + bob), (135, 181 + bob), (154, 138 + bob), (179, 182 + bob), (203, 137 + bob), (229, 183 + bob), (271, 107 + bob)], cfg["hair"])
        else:
            polygon(draw, [(106, 104 + bob), (128, 207 + bob), (161, 167 + bob), (177, 212 + bob), (219, 182 + bob), (274, 120 + bob)], cfg["hair"])

    # face only when visible
    if direction != "up":
        eye_y = 145 + bob
        if direction == "down":
            ellipse(draw, (148, eye_y, 164, eye_y + 21), "#30242b")
            ellipse(draw, (220, eye_y, 236, eye_y + 21), "#30242b")
            draw.arc((169, eye_y + 18, 215, eye_y + 50), 10, 170, fill="#a15d62", width=5)
        else:
            eye_x = 212 if direction == "right" else 156
            ellipse(draw, (eye_x, eye_y, eye_x + 17, eye_y + 21), "#30242b")
            draw.arc((eye_x - 8, eye_y + 18, eye_x + 27, eye_y + 48), 10 if side > 0 else 190, 165 if side > 0 else 345, fill="#a15d62", width=5)

    # role identity accessories
    if cfg["role"] == "guide":
        draw.arc((107, 103 + bob, 277, 226 + bob), 190, 350, fill=cfg["accent"], width=11)
        rounded(draw, (248, 153 + bob, 282, 188 + bob), 10, cfg["accent"], "#41352f", 4)
    elif cfg["role"] == "writer" and direction != "up":
        if direction == "down":
            rounded(draw, (134, 137 + bob, 174, 173 + bob), 12, None, cfg["accent"], 6)
            rounded(draw, (210, 137 + bob, 250, 173 + bob), 12, None, cfg["accent"], 6)
            draw.line((174, 153 + bob, 210, 153 + bob), fill=cfg["accent"], width=5)
        else:
            x = 202 if direction == "right" else 143
            rounded(draw, (x, 137 + bob, x + 43, 173 + bob), 12, None, cfg["accent"], 6)
    elif cfg["role"] == "artist":
        polygon(draw, [(112, 80 + bob), (192, 33 + bob), (274, 82 + bob), (244, 106 + bob), (141, 106 + bob)], cfg["accent"], "#4c3840")
        ellipse(draw, (176, 31 + bob, 210, 60 + bob), cfg["accent"], "#4c3840", 4)
    elif cfg["role"] == "librarian" and direction != "up":
        if direction == "down":
            rounded(draw, (136, 139 + bob, 174, 172 + bob), 11, None, cfg["accent"], 5)
            rounded(draw, (210, 139 + bob, 248, 172 + bob), 11, None, cfg["accent"], 5)
            draw.line((174, 154 + bob, 210, 154 + bob), fill=cfg["accent"], width=4)
        else:
            x = 204 if direction == "right" else 141
            rounded(draw, (x, 139 + bob, x + 40, 172 + bob), 11, None, cfg["accent"], 5)

    return image


def save_png(path: Path, image: Image.Image) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    data = path.read_bytes()
    return {"file": path.name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "size": [W, H]}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for key in CAST:
        for direction in DIRECTIONS:
            records.append(save_png(OUT / f"npc-{key}-direction-{direction}.png", render(key, direction)))
            sheet = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
            for phase in range(4):
                sheet.alpha_composite(render(key, direction, phase), ((phase % 2) * W, (phase // 2) * H))
            path = OUT / f"npc-{key}-walk-{direction}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            sheet.save(path, format="PNG", optimize=True)
            data = path.read_bytes()
            records.append({"file": path.name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "size": [W * 2, H * 2]})
    for key, action in (("editor", "review"), ("atelier", "draw"), ("atelier", "review")):
        records.append(save_png(OUT / f"npc-{key}-state-{action}.png", render(key, "down", 1, action)))
    manifest = {
        "version": 1,
        "license": "ToonStudio original generated asset; repository use",
        "generator": "scripts/generate-virtual-studio-npc-cast.py",
        "playerSpriteReuse": False,
        "files": records,
    }
    (OUT / "art-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"generated {len(records)} NPC assets in {OUT}")


if __name__ == "__main__":
    main()
