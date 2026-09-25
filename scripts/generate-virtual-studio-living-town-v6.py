#!/usr/bin/env python3
"""Generate Virtual Studio living-town v6 tile, waterfall, decor and interaction art.

The gameplay pack follows three Image Generation 2.5 concept boards produced for the project,
then converts the approved visual direction into isolated runtime sheets with deterministic bounds.
No CSS filter or cross-style recolour is used by the runtime.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
import subprocess
import sys
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1]
V5: Final = ROOT / "apps/web/public/assets/virtual-studio/style-packs-v5"
OUT: Final = ROOT / "apps/web/public/assets/virtual-studio/living-town-v6"
STYLES: Final = ("sky-island", "webtoon", "pastel", "retro", "ink", "neon")
IMAGEGEN_25_CONCEPTS: Final = (
    "66b20001-32fd-4d90-9a6f-14b676399191",
    "9ffa2971-6d20-49bd-a8b3-aaa3da97d83f",
    "22beabfc-ecd4-47a7-8925-1c83b56003c2",
)

PALETTES: Final = {
    "sky-island": ((88, 184, 245), (238, 225, 185), (72, 159, 91), (70, 188, 232), (126, 88, 202), (255, 227, 132)),
    "webtoon": ((214, 232, 238), (226, 216, 198), (93, 159, 117), (87, 184, 216), (126, 99, 218), (255, 210, 132)),
    "pastel": ((228, 225, 250), (243, 225, 239), (151, 202, 169), (166, 216, 235), (190, 141, 222), (255, 205, 225)),
    "retro": ((36, 46, 74), (181, 149, 99), (73, 126, 82), (52, 120, 174), (235, 104, 153), (240, 211, 104)),
    "ink": ((238, 236, 229), (218, 215, 205), (146, 150, 141), (136, 142, 150), (65, 65, 74), (185, 185, 178)),
    "neon": ((7, 13, 35), (35, 40, 76), (24, 113, 91), (39, 223, 247), (194, 69, 246), (255, 80, 178)),
}

ROOMS: Final = {
    "assets": (40, 40, 270, 210), "storyboard": (340, 40, 270, 210),
    "production": (670, 40, 270, 210), "release": (970, 40, 270, 210),
    "writers": (40, 300, 270, 230), "drawing": (340, 300, 290, 230),
    "review": (670, 300, 290, 230), "quality": (990, 300, 250, 230),
    "teams": (40, 590, 300, 260), "lounge": (370, 590, 240, 180),
    "live": (640, 590, 280, 220), "meeting": (950, 590, 290, 260),
    "assistant": (370, 790, 240, 130), "lobby": (640, 840, 280, 100),
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
WATERFALLS: Final = ((300, 214, 44, 112), (625, 502, 48, 122), (958, 500, 48, 124), (350, 780, 42, 116))


def mix(left, right, amount: float):
    return tuple(round(a * (1 - amount) + b * amount) for a, b in zip(left, right))


def rgba(color, alpha=255):
    return (*color, alpha)


def room_center(name: str):
    x, y, width, height = ROOMS[name]
    return x + width / 2, y + height / 2


def edge_points(left: str, right: str):
    lx, ly, lw, lh = ROOMS[left]
    rx, ry, rw, rh = ROOMS[right]
    lc = room_center(left); rc = room_center(right)
    horizontal = abs(lc[0] - rc[0]) >= abs(lc[1] - rc[1])
    if horizontal:
        direction = 1 if rc[0] > lc[0] else -1
        return (lc[0] + direction * lw * .34, lc[1]), (rc[0] - direction * rw * .34, rc[1])
    direction = 1 if rc[1] > lc[1] else -1
    return (lc[0], lc[1] + direction * lh * .34), (rc[0], rc[1] - direction * rh * .34)


def save(image: Image.Image, path: Path, quality=94, lossless=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, exact=True, lossless=lossless)


def antialias_canvas(size, scale=2):
    return Image.new("RGBA", (size[0] * scale, size[1] * scale), (0, 0, 0, 0)), scale


def scaled_point(point, scale):
    return tuple(round(value * scale) for value in point)


def path_colors(style: str, kind: str):
    sky, path, plant, water, accent, glow = PALETTES[style]
    if kind == "bridge": return mix(path, (104, 72, 48), .55), mix(path, (255, 238, 190), .32), (66, 46, 39)
    if kind == "boardwalk": return mix(path, (126, 83, 48), .48), mix(path, (255, 235, 190), .36), (70, 45, 34)
    if kind == "garden": return mix(path, plant, .17), mix(path, (255, 255, 240), .22), mix(plant, (35, 55, 42), .3)
    return path, mix(path, (255, 255, 255), .24), mix(path, (40, 38, 46), .36)


def draw_path(draw, start, end, style, kind="stone", width=48, scale=2):
    base, highlight, border = path_colors(style, kind)
    p1 = scaled_point(start, scale); p2 = scaled_point(end, scale)
    draw.line((*p1, *p2), fill=rgba(border, 115), width=(width + 12) * scale)
    draw.line((*p1, *p2), fill=rgba(base, 245), width=width * scale)
    draw.line((*p1, *p2), fill=rgba(highlight, 175), width=max(2, width // 8) * scale)
    if kind in {"bridge", "boardwalk"}:
        length = math.dist(start, end)
        count = max(1, int(length // 16))
        for index in range(count + 1):
            ratio = index / max(1, count)
            x = start[0] + (end[0] - start[0]) * ratio
            y = start[1] + (end[1] - start[1]) * ratio
            nx = end[1] - start[1]; ny = -(end[0] - start[0]); norm = max(1, math.hypot(nx, ny))
            nx, ny = nx / norm * width * .38, ny / norm * width * .38
            draw.line((*scaled_point((x - nx, y - ny), scale), *scaled_point((x + nx, y + ny), scale)),
                      fill=rgba(highlight, 150), width=max(1, 2 * scale))


def path_overlay(style: str):
    image, scale = antialias_canvas((1280, 960), 2)
    draw = ImageDraw.Draw(image, "RGBA")
    special = {
        tuple(sorted(("live", "meeting"))): "bridge",
        tuple(sorted(("production", "release"))): "bridge",
        tuple(sorted(("review", "quality"))): "bridge",
        tuple(sorted(("teams", "lounge"))): "garden",
        tuple(sorted(("lounge", "live"))): "garden",
        tuple(sorted(("assistant", "lobby"))): "boardwalk",
        tuple(sorted(("live", "lobby"))): "boardwalk",
    }
    for left, right in EDGES:
        kind = special.get(tuple(sorted((left, right))), "stone")
        draw_path(draw, *edge_points(left, right), style, kind, 38 if kind == "bridge" else 44 if kind == "boardwalk" else 48, scale)
    _, path, plant, water, accent, glow = PALETTES[style]
    for center, radii, kind in [((780, 700), (126, 98), "stone"), ((780, 887), (124, 66), "boardwalk"), ((485, 700), (108, 80), "garden")]:
        base, highlight, border = path_colors(style, kind)
        cx, cy = scaled_point(center, scale); rx, ry = radii[0] * scale, radii[1] * scale
        draw.ellipse((cx-rx-7*scale, cy-ry-7*scale, cx+rx+7*scale, cy+ry+7*scale), fill=rgba(border, 105))
        draw.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), fill=rgba(base, 224), outline=rgba(highlight, 185), width=3*scale)
    # Directional diamonds make corridors readable without relying on color alone.
    for x, y in ((325, 700), (630, 700), (940, 700), (485, 550), (815, 550), (1100, 550), (780, 830)):
        sx, sy = x * scale, y * scale; r = 7 * scale
        draw.polygon([(sx, sy-r), (sx+r, sy), (sx, sy+r), (sx-r, sy)], fill=rgba(glow, 215), outline=rgba(accent, 230))
    resized = image.resize((1280, 960), Image.Resampling.LANCZOS)
    if style == "retro": resized = resized.resize((640, 480), Image.Resampling.BOX).resize((1280, 960), Image.Resampling.NEAREST)
    return resized


def texture_noise(size, color, seed):
    rng = random.Random(seed)
    image = Image.new("RGBA", size, rgba(color))
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(max(40, size[0] * size[1] // 320)):
        x, y = rng.randrange(size[0]), rng.randrange(size[1]); radius = rng.choice((1, 1, 2, 3))
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=(255, 255, 255, rng.randrange(8, 35)))
    return image


def tile(style: str, kind: int):
    sky, path, plant, water, accent, glow = PALETTES[style]
    base_colors = [plant, path, mix(path, (126, 85, 53), .48), water,
                   mix(path, plant, .18), mix(path, (255, 255, 255), .22),
                   mix(plant, (48, 78, 54), .35), mix(water, sky, .22)]
    image = texture_noise((128, 128), base_colors[kind % len(base_colors)], 2000 + kind * 37 + STYLES.index(style) * 911)
    draw = ImageDraw.Draw(image, "RGBA")
    if kind in {1, 4, 5, 8, 9, 10, 11, 12}:
        border = mix(path, (53, 48, 53), .35)
        draw.rounded_rectangle((8, 8, 120, 120), radius=20 if kind != 5 else 8, outline=rgba(border, 170), width=5)
    if kind == 2:  # boardwalk
        for x in range(3, 128, 16): draw.rectangle((x, 8, x+11, 120), fill=rgba(mix(path, (125, 79, 45), .48)), outline=(70, 48, 38, 170))
    if kind == 3:  # water
        for y in range(18, 128, 22): draw.arc((5, y-8, 75, y+8), 8, 172, fill=(255,255,255,110), width=2)
    if kind == 6:  # cliff
        draw.rectangle((0, 72, 128, 128), fill=rgba(mix(path, (54, 55, 68), .52)))
        for x in range(0, 128, 18): draw.polygon([(x,72),(x+12,72),(x+5,128)], fill=(30,38,50,75))
    if kind == 7:  # shallow water
        draw.rectangle((0,0,128,128), fill=rgba(mix(water, sky, .1),220))
        for x in range(10,128,28): draw.arc((x,30,x+45,55),0,180,fill=(255,255,255,115),width=2)
    if kind >= 8:
        # auto-tile direction marks and edge shapes
        mask = kind - 8
        if mask & 1: draw.rectangle((0, 44, 64, 84), fill=rgba(path, 235))
        if mask & 2: draw.rectangle((64, 44, 128, 84), fill=rgba(path, 235))
        if mask & 4: draw.rectangle((44, 0, 84, 64), fill=rgba(path, 235))
        if mask & 8: draw.rectangle((44, 64, 84, 128), fill=rgba(path, 235))
        draw.ellipse((44,44,84,84), fill=rgba(path,235))
    if style == "ink": image = ImageOps.grayscale(image.convert("RGB")).convert("RGBA")
    if style == "retro": image = image.resize((32,32),Image.Resampling.BOX).resize((128,128),Image.Resampling.NEAREST)
    return image


def tile_atlas(style: str):
    atlas = Image.new("RGBA", (512, 512), (0,0,0,0))
    for index in range(16): atlas.alpha_composite(tile(style, index), ((index % 4) * 128, (index // 4) * 128))
    return atlas


def waterfall_frame(style: str, frame: int):
    sky, path, plant, water, accent, glow = PALETTES[style]
    image = Image.new("RGBA", (128, 192), (0,0,0,0))
    draw = ImageDraw.Draw(image, "RGBA")
    # soft glow behind water
    glow_layer = Image.new("RGBA", image.size, (0,0,0,0)); gd = ImageDraw.Draw(glow_layer, "RGBA")
    gd.rounded_rectangle((29, 2, 99, 184), radius=28, fill=rgba(mix(water, (255,255,255), .36), 95))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(10)); image = Image.alpha_composite(image, glow_layer)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((35, 0, 93, 183), radius=25, fill=rgba(mix(water, sky, .16), 210))
    rng = random.Random(7000 + frame * 97 + STYLES.index(style) * 313)
    for strand in range(11):
        x = 39 + strand * 5 + rng.randint(-2, 2)
        offset = (frame * 17 + strand * 13) % 48
        for y in range(-48 + offset, 180, 48):
            draw.rounded_rectangle((x, y, x+rng.randint(2,5), y+rng.randint(25,44)), radius=3,
                                   fill=(245, 254, 255, rng.randint(90, 180)))
    draw.ellipse((24, 164, 104, 191), fill=rgba(mix(water,(255,255,255),.38), 185), outline=(255,255,255,150), width=3)
    for _ in range(14):
        x=rng.randint(25,103); y=rng.randint(155,188); r=rng.randint(1,4)
        draw.ellipse((x-r,y-r,x+r,y+r),fill=(255,255,255,rng.randint(90,210)))
    if style == "ink": image = ImageOps.grayscale(image.convert("RGB")).convert("RGBA")
    if style == "retro": image = image.resize((32,48),Image.Resampling.BOX).resize((128,192),Image.Resampling.NEAREST)
    return image


def waterfall_sheet(style: str):
    sheet = Image.new("RGBA", (1024, 192), (0,0,0,0))
    for frame in range(8): sheet.alpha_composite(waterfall_frame(style, frame), (frame*128,0))
    return sheet


def splash_frame(style: str, frame: int):
    _, _, _, water, accent, glow = PALETTES[style]
    image = Image.new("RGBA", (128, 64), (0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    progress=frame/7; radius=18+progress*40
    draw.ellipse((64-radius,32-radius*.35,64+radius,32+radius*.35), outline=rgba(mix(water,(255,255,255),.45), int(230*(1-progress))), width=max(1,4-int(progress*3)))
    rng=random.Random(8000+frame+STYLES.index(style)*101)
    for _ in range(10):
        angle=rng.random()*math.tau; distance=12+progress*42
        x=64+math.cos(angle)*distance; y=32+math.sin(angle)*distance*.35; r=2+rng.random()*2
        draw.ellipse((x-r,y-r,x+r,y+r),fill=(255,255,255,int(210*(1-progress))))
    return image


def splash_sheet(style: str):
    sheet=Image.new("RGBA",(1024,64),(0,0,0,0))
    for frame in range(8): sheet.alpha_composite(splash_frame(style,frame),(frame*128,0))
    return sheet


def effect_frame(style: str, frame: int):
    _, _, _, water, accent, glow = PALETTES[style]
    image=Image.new("RGBA",(128,128),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    progress=frame/7; alpha=int(240*(1-progress)); radius=10+progress*48
    draw.ellipse((64-radius,64-radius,64+radius,64+radius),outline=rgba(glow,alpha),width=max(1,5-frame//2))
    for index in range(8):
        angle=index*math.tau/8+progress*.7; distance=18+progress*45
        x=64+math.cos(angle)*distance; y=64+math.sin(angle)*distance
        r=max(1,5-frame//2)
        draw.polygon([(x,y-r*1.6),(x+r,y),(x,y+r*1.6),(x-r,y)],fill=rgba(accent if index%2 else glow,alpha))
    return image


def effect_sheet(style: str):
    sheet=Image.new("RGBA",(1024,128),(0,0,0,0))
    for frame in range(8): sheet.alpha_composite(effect_frame(style,frame),(frame*128,0))
    return sheet


def decor_frame(style: str, kind: int):
    _, path, plant, water, accent, glow = PALETTES[style]
    image=Image.new("RGBA",(128,128),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA")
    line=rgba(mix(path,(30,32,40),.55),240)
    wood=mix(path,(124,76,44),.48)
    if kind==0:  # tree
        draw.ellipse((35,10,93,78),fill=rgba(mix(plant,(80,170,92),.25)),outline=line,width=4); draw.rectangle((57,64,71,120),fill=rgba(wood),outline=line,width=3)
    elif kind==1:  # flower bed
        draw.rounded_rectangle((12,76,116,116),radius=14,fill=rgba(wood),outline=line,width=4)
        for x in range(24,110,18): draw.ellipse((x-8,50+(x%3)*5,x+8,72+(x%3)*5),fill=rgba(accent if x%2 else glow),outline=line,width=2)
    elif kind==2:  # bench
        draw.rounded_rectangle((15,52,113,82),radius=7,fill=rgba(wood),outline=line,width=5); draw.line((27,80,22,116),fill=line,width=7); draw.line((101,80,106,116),fill=line,width=7)
    elif kind==3:  # lamp
        draw.line((64,112,64,47),fill=line,width=7); draw.rounded_rectangle((45,20,83,60),radius=10,fill=rgba(glow,235),outline=rgba(accent),width=4)
        halo=Image.new("RGBA",image.size,(0,0,0,0)); hd=ImageDraw.Draw(halo,"RGBA"); hd.ellipse((30,6,98,74),fill=rgba(glow,55)); image=Image.alpha_composite(halo.filter(ImageFilter.GaussianBlur(9)),image)
    elif kind==4:  # banner
        draw.line((30,18,30,118),fill=line,width=6); draw.line((98,18,98,118),fill=line,width=6); draw.rounded_rectangle((24,22,104,83),radius=8,fill=rgba(accent),outline=line,width=4); draw.polygon([(64,35),(78,57),(64,73),(50,57)],fill=rgba(glow))
    elif kind==5:  # market stall
        draw.rectangle((18,56,110,116),fill=rgba(mix(path,(245,220,175),.35)),outline=line,width=4); draw.polygon([(10,55),(28,20),(100,20),(118,55)],fill=rgba(accent),outline=line)
        for x in range(27,108,20): draw.rectangle((x,20,x+10,53),fill=rgba(glow,210))
    elif kind==6:  # fountain
        draw.ellipse((18,73,110,118),fill=rgba(water,190),outline=line,width=4); draw.ellipse((42,50,86,88),fill=rgba(mix(water,(255,255,255),.25),210),outline=line,width=3); draw.line((64,52,64,20),fill=rgba(water),width=6)
    elif kind==7:  # portal
        draw.ellipse((25,10,103,118),outline=rgba(accent),width=10); draw.ellipse((35,20,93,108),fill=rgba(mix(water,accent,.45),100),outline=rgba(glow),width=4)
    elif kind==8:  # rug
        draw.rounded_rectangle((12,42,116,104),radius=15,fill=rgba(accent,210),outline=line,width=4); draw.rounded_rectangle((26,55,102,91),radius=10,outline=rgba(glow),width=4)
    elif kind==9:  # sign
        draw.rounded_rectangle((14,22,114,82),radius=8,fill=rgba(wood),outline=line,width=4); draw.line((64,82,64,118),fill=line,width=7); draw.polygon([(38,48),(85,48),(75,38),(93,52),(75,66),(85,56),(38,56)],fill=rgba(glow))
    elif kind==10:  # parasol
        draw.pieslice((15,12,113,94),180,360,fill=rgba(accent),outline=line,width=4); draw.line((64,53,64,118),fill=line,width=6); draw.ellipse((32,103,96,121),fill=rgba(path,160),outline=line,width=3)
    else:  # pet
        draw.ellipse((28,47,100,108),fill=rgba(mix(path,(255,245,225),.5)),outline=line,width=4); draw.polygon([(33,58),(38,24),(55,49)],fill=rgba(accent),outline=line); draw.polygon([(73,49),(92,24),(97,59)],fill=rgba(accent),outline=line); draw.ellipse((49,70,57,80),fill=line); draw.ellipse((75,70,83,80),fill=line)
    if style=="ink": image=ImageOps.grayscale(image.convert("RGB")).convert("RGBA")
    if style=="retro": image=image.resize((32,32),Image.Resampling.BOX).resize((128,128),Image.Resampling.NEAREST)
    return image


def decor_sheet(style: str):
    sheet=Image.new("RGBA",(1536,128),(0,0,0,0))
    for frame in range(12): sheet.alpha_composite(decor_frame(style,frame),(frame*128,0))
    return sheet


def accessory_frame(style: str, accessory: int, facing: int):
    _, path, plant, water, accent, glow=PALETTES[style]
    image=Image.new("RGBA",(96,96),(0,0,0,0)); draw=ImageDraw.Draw(image,"RGBA"); line=rgba(mix(path,(25,27,35),.55),240)
    back=facing==3; side=facing in (1,2)
    if accessory==0: return image
    if accessory==1:  # headset
        draw.arc((23,18,73,69),190,350,fill=rgba(accent),width=7); draw.rounded_rectangle((19,45,31,70),radius=5,fill=rgba(glow),outline=line,width=2); draw.rounded_rectangle((65,45,77,70),radius=5,fill=rgba(glow),outline=line,width=2)
    elif accessory==2:  # beret
        draw.ellipse((22,17,74,48),fill=rgba(accent),outline=line,width=4); draw.ellipse((58,10,68,22),fill=rgba(glow),outline=line,width=2)
    elif accessory==3:  # star pin
        points=[]
        for index in range(10):
            angle=-math.pi/2+index*math.pi/5; radius=15 if index%2==0 else 7
            points.append((48+math.cos(angle)*radius,30+math.sin(angle)*radius))
        draw.polygon(points,fill=rgba(glow),outline=line)
    elif accessory==4 and not back:  # glasses
        y=42; draw.rounded_rectangle((23,y-9,44,y+9),radius=4,outline=rgba(accent),width=4); draw.rounded_rectangle((52,y-9,73,y+9),radius=4,outline=rgba(accent),width=4); draw.line((44,y,52,y),fill=rgba(accent),width=4)
    if side: image=image.transform(image.size,Image.Transform.AFFINE,(1,0,3 if facing==1 else -3,0,1,0),resample=Image.Resampling.BICUBIC)
    if style=="retro": image=image.resize((24,24),Image.Resampling.BOX).resize((96,96),Image.Resampling.NEAREST)
    return image


def accessory_sheet(style: str):
    sheet=Image.new("RGBA",(1920,96),(0,0,0,0))
    for accessory in range(5):
        for facing in range(4): sheet.alpha_composite(accessory_frame(style,accessory,facing),((accessory*4+facing)*96,0))
    return sheet


def district_previews(style: str):
    base=Image.open(V5/style/"world/world-base.webp").convert("RGB")
    centers=((175,145),(475,145),(805,145),(485,420),(815,420),(780,715))
    sheet=Image.new("RGB",(1920,180),(14,16,22))
    for index,(cx,cy) in enumerate(centers):
        left=max(0,min(base.width-320,cx-160)); top=max(0,min(base.height-180,cy-90))
        crop=base.crop((left,top,left+320,top+180)).resize((320,180),Image.Resampling.LANCZOS)
        sheet.paste(crop,(index*320,0))
    return sheet.convert("RGBA")


def visual_signature(path: Path):
    with Image.open(path) as image:
        sample=image.convert("RGB").resize((24,24),Image.Resampling.BILINEAR)
    return hashlib.sha256(sample.tobytes()).hexdigest()


def record(path: Path):
    data=path.read_bytes()
    with Image.open(path) as image: size=[image.width,image.height]
    return {"file":path.relative_to(OUT).as_posix(),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"size":size,"visualSignature":visual_signature(path)}


def main():
    files=[]
    for style in STYLES:
        assets={
            "path-overlay.webp":path_overlay(style),
            "terrain-tile-atlas.webp":tile_atlas(style),
            "waterfall-sheet.webp":waterfall_sheet(style),
            "waterfall-splash-sheet.webp":splash_sheet(style),
            "interaction-fx-sheet.webp":effect_sheet(style),
            "decor-sheet.webp":decor_sheet(style),
            "accessory-sheet.webp":accessory_sheet(style),
            "district-preview-sheet.webp":district_previews(style),
        }
        for name,image in assets.items():
            target=OUT/style/name; save(image,target,lossless=style=="retro"); files.append(target)
    manifest={
        "version":6,
        "generatedAt":"2026-09-25",
        "sourceTechnique":"Image Generation 2.5-directed semantic runtime sheet generation; independent style bytes; no CSS filter variants",
        "imageGeneration25ConceptIds":list(IMAGEGEN_25_CONCEPTS),
        "styles":list(STYLES),
        "sheets":{"terrainTiles":16,"waterfallFrames":8,"splashFrames":8,"interactionFrames":8,"decorFrames":12,"accessories":5,"directions":4,"districtPreviews":6},
        "files":[record(path) for path in sorted(files)],
    }
    target=OUT/"art-v6-manifest.json"; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    subprocess.run([sys.executable, str(ROOT / "scripts/extract-virtual-studio-imagegen25-v6.py")], check=True)
    print(f"Virtual Studio living town v6: {len(files)} assets, {sum(path.stat().st_size for path in files):,} bytes")


if __name__ == "__main__":
    main()
