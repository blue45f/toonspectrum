#!/usr/bin/env python3
"""Generate deterministic Virtual Studio v3 art-style packs and role-distinct NPC sprites.

The source character drawings remain the approved selectable cast. This script creates independent
runtime assets for art-direction switching and a dedicated NPC cast with role accessories, while
preserving exact atlas dimensions and alpha grids used by the animation registry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/assets/virtual-studio"
PRODUCTION = ASSETS / "production-v2"
DRAWN = ASSETS / "drawn-characters-v1"
NPC_V2 = ASSETS / "npc-cast-v2"
NPC_V3 = ASSETS / "npc-cast-v3"
PACKS = ASSETS / "style-packs"
STYLES = ("sky-island", "pastel", "retro", "ink", "neon")
DIRECTIONS = ("down", "left", "right", "up")

ROLE_SPECS = {
    "concierge": {"base": "silver", "accent": (74, 191, 245), "accessory": "orb", "label": "Moa · Concierge"},
    "producer": {"base": "dark", "accent": (244, 175, 72), "accessory": "clipboard", "label": "Yoon · Producer"},
    "editor": {"base": "purple", "accent": (237, 92, 117), "accessory": "glasses", "label": "Sol · Editor"},
    "artist": {"base": "pink", "accent": (226, 103, 190), "accessory": "beret", "label": "Haru · Artist"},
    "archivist": {"base": "purple", "accent": (132, 107, 229), "accessory": "book", "label": "Dam · Archivist"},
    "cafe": {"base": "dark", "accent": (105, 191, 142), "accessory": "apron", "label": "Rin · Cafe"},
    "security": {"base": "silver", "accent": (84, 126, 208), "accessory": "cap", "label": "Jun · Safety"},
    "host": {"base": "pink", "accent": (255, 121, 91), "accessory": "mic", "label": "Nabi · Event host"},
}


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save_image(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix == ".webp":
        image.save(path, "WEBP", lossless=False, quality=92, method=2, exact=True)
    else:
        image.save(path, optimize=True)


def alpha_outline(image: Image.Image, color: tuple[int, int, int], width: int, opacity: int = 210) -> Image.Image:
    alpha = image.getchannel("A")
    size = max(3, width * 2 + 1)
    if size % 2 == 0:
        size += 1
    expanded = alpha.filter(ImageFilter.MaxFilter(size))
    ring = ImageChops.subtract(expanded, alpha)
    layer = Image.new("RGBA", image.size, color + (0,))
    layer.putalpha(ring.point(lambda value: value * opacity // 255))
    return Image.alpha_composite(layer, image)


def role_tint(image: Image.Image, accent: tuple[int, int, int], strength: float = 0.22) -> Image.Image:
    arr = np.asarray(image).astype(np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3:4]
    maxc, minc = rgb.max(axis=2, keepdims=True), rgb.min(axis=2, keepdims=True)
    saturation = maxc - minc
    skin = (rgb[..., 0:1] > 145) & (rgb[..., 1:2] > 70) & (rgb[..., 0:1] > rgb[..., 1:2]) & (rgb[..., 1:2] > rgb[..., 2:3] * 0.65)
    white = (maxc > 225) & (saturation < 35)
    mask = (alpha > 12) & ~skin & ~white
    local = np.where(saturation < 30, strength * 0.45, strength)
    target = np.array(accent, dtype=np.float32).reshape(1, 1, 3)
    rgb = np.where(mask, rgb * (1 - local) + target * local, rgb)
    arr[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def cells(image: Image.Image, is_sheet: bool) -> list[tuple[int, int, int, int]]:
    if not is_sheet:
        return [(0, 0, image.width, image.height)]
    return [
        (0, 0, image.width // 2, image.height // 2),
        (image.width // 2, 0, image.width, image.height // 2),
        (0, image.height // 2, image.width // 2, image.height),
        (image.width // 2, image.height // 2, image.width, image.height),
    ]


def draw_role_accessory(image: Image.Image, accent: tuple[int, int, int], accessory: str, facing: str, is_sheet: bool) -> Image.Image:
    draw = ImageDraw.Draw(image, "RGBA")
    for x0, y0, x1, y1 in cells(image, is_sheet):
        cell = image.crop((x0, y0, x1, y1))
        bbox = cell.getchannel("A").getbbox()
        if not bbox:
            continue
        left, top, right, bottom = bbox
        width, height = right - left, bottom - top
        cx = x0 + (left + right) // 2
        head_y = y0 + int(top + height * 0.19)
        head_w = max(12, int(width * 0.29))
        line = max(3, head_w // 10)
        if accessory == "orb":
            ox = cx + int(head_w * (0.82 if facing != "left" else -0.82))
            oy = head_y + int(head_w * 0.15)
            radius = max(6, int(head_w * 0.21))
            draw.ellipse((ox-radius, oy-radius, ox+radius, oy+radius), fill=accent+(185,), outline=(238, 252, 255, 255), width=max(2, line//2))
            draw.ellipse((ox-radius//2, oy-radius//2, ox+radius//3, oy+radius//3), fill=(255,255,255,190))
            draw.arc((cx-head_w, head_y-head_w//2, cx+head_w, head_y+head_w), 195, 345, fill=accent+(255,), width=line)
        elif accessory == "clipboard":
            px = x0 + int(left + width * (0.74 if facing != "left" else 0.26))
            py = y0 + int(top + height * 0.54)
            ww, hh = max(14, int(width*0.09)), max(20, int(height*0.11))
            draw.rounded_rectangle((px-ww//2, py-hh//2, px+ww//2, py+hh//2), radius=max(2, ww//6), fill=(255,247,220,245), outline=accent+(255,), width=max(2,line//2))
            draw.line((px-ww//4, py-hh//6, px+ww//4, py-hh//6), fill=(80,65,60,220), width=max(2,line//2))
        elif accessory == "glasses" and facing != "up":
            gy = head_y + int(head_w * 0.42)
            rw, rh, gap = max(7,int(head_w*.35)), max(4,int(head_w*.18)), max(3,int(head_w*.08))
            draw.rounded_rectangle((cx-gap-rw, gy-rh, cx-gap, gy+rh), radius=3, outline=accent+(255,), width=max(2,line//2))
            draw.rounded_rectangle((cx+gap, gy-rh, cx+gap+rw, gy+rh), radius=3, outline=accent+(255,), width=max(2,line//2))
            draw.line((cx-gap, gy, cx+gap, gy), fill=accent+(255,), width=max(2,line//2))
        elif accessory == "beret":
            by = head_y - int(head_w * .45)
            draw.ellipse((cx-int(head_w*.78), by-int(head_w*.23), cx+int(head_w*.68), by+int(head_w*.30)), fill=accent+(238,), outline=(79,45,79,225), width=max(2,line//2))
            draw.ellipse((cx+int(head_w*.20),by-int(head_w*.37),cx+int(head_w*.36),by-int(head_w*.23)), fill=accent+(255,))
        elif accessory == "book":
            px = x0 + int(left + width * (0.73 if facing != "left" else 0.27))
            py = y0 + int(top + height * 0.57)
            ww, hh = max(18,int(width*.12)), max(16,int(height*.09))
            draw.polygon([(px-ww,py-hh),(px,py-hh//2),(px,py+hh),(px-ww,py+hh//2)], fill=accent+(235,), outline=(255,246,255,245))
            draw.polygon([(px+ww,py-hh),(px,py-hh//2),(px,py+hh),(px+ww,py+hh//2)], fill=tuple(min(255,c+24) for c in accent)+(235,), outline=(255,246,255,245))
        elif accessory == "apron":
            tx, ty = cx, y0 + int(top + height * .55)
            ww, hh = max(20,int(width*.18)), max(28,int(height*.18))
            draw.rounded_rectangle((tx-ww,ty-hh//2,tx+ww,ty+hh),radius=max(3,ww//6),fill=accent+(140,),outline=(255,255,245,190),width=max(2,line//2))
        elif accessory == "cap":
            cy = head_y-int(head_w*.42)
            draw.pieslice((cx-head_w,cy-head_w//2,cx+head_w,cy+head_w//2),180,360,fill=accent+(245,),outline=(38,55,85,230),width=max(2,line//2))
            draw.rounded_rectangle((cx,cy-2,cx+int(head_w*.82),cy+max(3,line)),radius=2,fill=accent+(245,))
        elif accessory == "mic":
            px = x0 + int(left + width * (0.76 if facing != "left" else 0.24))
            py = y0 + int(top + height * .48)
            draw.line((px,py,px-int(head_w*.10),py+int(head_w*.55)),fill=(65,62,73,255),width=max(4,line))
            rr=max(5,int(head_w*.12)); draw.ellipse((px-rr,py-rr,px+rr,py+rr),fill=accent+(255,),outline=(255,255,255,230),width=2)
        # Shared NPC role badge: visible at game scale and intentionally absent from player sprites.
        bx = x0 + int(left + width * (0.67 if facing != "left" else 0.33))
        by = y0 + int(top + height * .47)
        br = max(5, int(width * .027))
        draw.ellipse((bx-br,by-br,bx+br,by+br), fill=accent+(245,), outline=(255,255,255,245), width=max(1,br//3))
    return image


def create_npc_asset(source: Path, target: Path, role: str, facing: str, is_sheet: bool) -> None:
    spec = ROLE_SPECS[role]
    image = role_tint(rgba(source), spec["accent"], .24)
    image = alpha_outline(image, tuple(max(0, c-45) for c in spec["accent"]), 5 if is_sheet else 6, 190)
    image = draw_role_accessory(image, spec["accent"], spec["accessory"], facing, is_sheet)
    save_image(image, target)


def generate_npc_v3() -> None:
    NPC_V3.mkdir(parents=True, exist_ok=True)
    produced: list[Path] = []
    for role, spec in ROLE_SPECS.items():
        base = spec["base"]
        for facing in DIRECTIONS:
            directional = PRODUCTION / f"player-{base}-direction-{facing}.png"
            target = NPC_V3 / f"npc-{role}-direction-{facing}.png"
            create_npc_asset(directional, target, role, facing, False); produced.append(target)
            walk = DRAWN / f"player-{base}-walk-{facing}.png"
            target = NPC_V3 / f"npc-{role}-walk-{facing}.png"
            create_npc_asset(walk, target, role, facing, True); produced.append(target)
        # Role action sheets reuse the matching high-quality source pose while remaining independent bytes.
        if role in {"producer", "editor", "archivist"}:
            source = DRAWN / "player-silver-review-down.png"
            if source.exists():
                target = NPC_V3 / f"npc-{role}-state-review.png"
                create_npc_asset(source, target, role, "down", True); produced.append(target)
        if role in {"artist", "host"}:
            source = DRAWN / "player-pink-draw-down.png"
            if source.exists():
                target = NPC_V3 / f"npc-{role}-state-draw.png"
                create_npc_asset(source, target, role, "down", True); produced.append(target)
    manifest = {
        "version": 3,
        "generatedAt": "2026-09-24",
        "playerSpriteReuse": False,
        "derivedFromSelectableStyle": True,
        "roles": ROLE_SPECS,
        "files": [file_record(path, NPC_V3) for path in sorted(produced)],
    }
    (NPC_V3 / "art-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def shift_hsv(rgb: np.ndarray, hue_shift: float, saturation: float, value: float) -> np.ndarray:
    # Vectorized RGB→HSV→RGB using colorsys-equivalent math.
    rgb01 = rgb / 255.0
    maxc = rgb01.max(axis=2); minc = rgb01.min(axis=2); delta = maxc - minc
    hue = np.zeros_like(maxc)
    nz = delta > 1e-5
    r, g, b = rgb01[...,0], rgb01[...,1], rgb01[...,2]
    mask = nz & (maxc == r); hue[mask] = ((g-b)[mask] / delta[mask]) % 6
    mask = nz & (maxc == g); hue[mask] = (b-r)[mask] / delta[mask] + 2
    mask = nz & (maxc == b); hue[mask] = (r-g)[mask] / delta[mask] + 4
    hue = (hue / 6 + hue_shift) % 1.0
    sat = np.where(maxc == 0, 0, delta / np.maximum(maxc, 1e-5)) * saturation
    val = np.clip(maxc * value, 0, 1)
    c = val * np.clip(sat,0,1); x = c * (1 - np.abs((hue*6)%2 - 1)); m = val-c
    h = hue*6
    out = np.zeros_like(rgb01)
    choices = [
        (h<1,(c,x,0)), ((h>=1)&(h<2),(x,c,0)), ((h>=2)&(h<3),(0,c,x)),
        ((h>=3)&(h<4),(0,x,c)), ((h>=4)&(h<5),(x,0,c)), (h>=5,(c,0,x)),
    ]
    for mask, vals in choices:
        for i, value_arr in enumerate(vals):
            out[...,i] = np.where(mask, value_arr if not isinstance(value_arr,int) else value_arr, out[...,i])
    return np.clip((out + m[...,None]) * 255, 0, 255)


def stylize(image: Image.Image, style: str) -> Image.Image:
    original = image.convert("RGBA")
    alpha = original.getchannel("A")
    arr = np.asarray(original).astype(np.float32)
    rgb = arr[..., :3]
    if style == "sky-island":
        rgb = shift_hsv(rgb, .015, 1.13, 1.09)
        rgb = rgb * .88 + np.array([28, 35, 42], dtype=np.float32)
        arr[..., :3] = np.clip(rgb,0,255)
        image = Image.fromarray(arr.astype(np.uint8),"RGBA")
        image = alpha_outline(image,(76,91,155),5,150)
        # Tiny star highlights in existing transparent margins, deterministic and sparse.
        draw=ImageDraw.Draw(image,"RGBA"); bbox=alpha.getbbox()
        if bbox:
            seed=int(hashlib.sha256(original.tobytes()[:4096]).hexdigest()[:8],16); rnd=random.Random(seed)
            for _ in range(8):
                x=rnd.randrange(max(1,bbox[0]),max(bbox[0]+1,bbox[2])); y=rnd.randrange(max(1,bbox[1]),max(bbox[1]+1,bbox[3]))
                if alpha.getpixel((x,y))<20:
                    r=rnd.choice((2,3,4)); draw.line((x-r,y,x+r,y),fill=(255,248,184,170),width=1); draw.line((x,y-r,x,y+r),fill=(255,248,184,170),width=1)
        return image
    if style == "pastel":
        image = ImageEnhance.Color(original).enhance(.72)
        image = ImageEnhance.Contrast(image).enhance(.9)
        overlay=Image.new("RGBA",image.size,(255,238,249,0)); overlay.putalpha(alpha.point(lambda a:a//7))
        image=Image.alpha_composite(image,overlay)
        return alpha_outline(image,(183,151,194),4,120)
    if style == "retro":
        scale=4
        small=original.resize((max(1,original.width//scale),max(1,original.height//scale)),Image.Resampling.BOX)
        a=small.getchannel("A")
        rgb=small.convert("RGB").quantize(colors=28,method=Image.Quantize.MEDIANCUT).convert("RGB")
        pixel=Image.merge("RGBA",(*rgb.split(),a)).resize(original.size,Image.Resampling.NEAREST)
        return alpha_outline(pixel,(28,24,43),max(2,scale),220)
    if style == "ink":
        gray=ImageOps.grayscale(original)
        gray=ImageEnhance.Contrast(gray).enhance(1.55)
        tone=np.asarray(gray).astype(np.uint8)
        yy,xx=np.indices(tone.shape)
        dots=((xx+yy*2)%7<2)&(tone<185)&(tone>55)
        out=np.where(tone>205,250,np.where(tone<65,35,tone))
        out=np.where(dots,np.maximum(25,out-45),out).astype(np.uint8)
        rgba_img=Image.merge("RGBA",(Image.fromarray(out),)*3+(alpha,))
        return alpha_outline(rgba_img,(20,20,25),4,235)
    if style == "neon":
        rgb=shift_hsv(rgb,.08,1.35,.65)
        rgb=np.clip(rgb*0.72+np.array([8,9,24]),0,255)
        arr[..., :3]=rgb
        body=Image.fromarray(arr.astype(np.uint8),"RGBA")
        glow_alpha=alpha.filter(ImageFilter.GaussianBlur(9)).point(lambda a:min(150,a))
        glow=Image.new("RGBA",body.size,(61,222,255,0)); glow.putalpha(glow_alpha)
        body=Image.alpha_composite(glow,body)
        return alpha_outline(body,(190,76,255),6,225)
    raise ValueError(style)


def iter_source_assets() -> list[tuple[str, Path]]:
    items: list[tuple[str, Path]] = []
    for folder in (PRODUCTION, DRAWN, NPC_V3):
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in {".png", ".webp"}:
                items.append((folder.name, path))
    return items


def make_texture(style: str, kind: str, size: int = 256) -> Image.Image:
    rnd = random.Random(f"{style}:{kind}:v3")
    if style == "sky-island":
        palette = {"floor":((90,185,105),(167,225,128)),"path":((221,211,184),(246,235,207)),"water":((51,168,235),(112,224,255)),"cloud":((236,245,255),(255,255,255))}[kind]
    elif style == "pastel":
        palette = {"floor":((220,232,213),(247,239,225)),"path":((226,211,224),(249,239,248)),"water":((178,218,240),(225,243,249)),"cloud":((245,239,251),(255,255,255))}[kind]
    elif style == "retro":
        palette = {"floor":((72,102,76),(104,137,86)),"path":((132,119,104),(178,153,113)),"water":((39,88,141),(73,147,184)),"cloud":((188,200,215),(239,229,191))}[kind]
    elif style == "ink":
        palette = {"floor":((210,210,204),(242,242,236)),"path":((155,155,151),(220,220,216)),"water":((116,116,125),(211,211,216)),"cloud":((230,230,226),(255,255,252))}[kind]
    else:
        palette = {"floor":((18,32,53),(25,57,65)),"path":((32,36,68),(83,49,103)),"water":((7,65,96),(31,212,235)),"cloud":((54,41,88),(116,71,159))}[kind]
    a,b=palette
    image=Image.new("RGBA",(size,size)); pix=image.load()
    for y in range(size):
        for x in range(size):
            wave=(math.sin(x/11)+math.cos(y/17)+math.sin((x+y)/23))/3
            t=max(0,min(1,.5+wave*.18+rnd.uniform(-.055,.055)))
            color=tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
            pix[x,y]=color+(255 if kind!="cloud" else max(30,round(150+105*t)),)
    draw=ImageDraw.Draw(image,"RGBA")
    if kind=="path":
        step=32 if style!="retro" else 24
        for y in range(0,size,step):
            offset=(y//step%2)*(step//2)
            for x in range(-step,size+step,step):
                draw.rounded_rectangle((x+offset+2,y+2,x+offset+step-2,y+step-3),radius=5,outline=(70,60,75,45),width=2)
    elif kind=="water":
        for y in range(12,size,28):
            draw.arc((0,y-8,size//2,y+9),5,175,fill=(255,255,255,75),width=2); draw.arc((size//2,y+3,size,y+20),185,355,fill=(255,255,255,55),width=2)
    elif kind=="floor":
        for _ in range(55):
            x,y=rnd.randrange(size),rnd.randrange(size); r=rnd.choice((1,1,2,3)); draw.ellipse((x-r,y-r,x+r,y+r),fill=(255,255,255,28))
    else:
        image=image.filter(ImageFilter.GaussianBlur(7 if style!="retro" else 1))
    if style=="retro": image=image.resize((size//4,size//4),Image.Resampling.BOX).resize((size,size),Image.Resampling.NEAREST)
    if style=="ink": image=stylize(image,"ink")
    return image


def make_world_base(style: str, width: int = 1280, height: int = 960) -> Image.Image:
    if style == "sky-island": top,bottom=(56,155,246),(205,236,255)
    elif style == "pastel": top,bottom=(208,216,245),(251,238,244)
    elif style == "retro": top,bottom=(35,45,78),(79,100,125)
    elif style == "ink": top,bottom=(211,211,216),(248,248,245)
    else: top,bottom=(8,11,31),(29,18,60)
    image=Image.new("RGBA",(width,height)); draw=ImageDraw.Draw(image,"RGBA")
    for y in range(height):
        t=y/(height-1); c=tuple(round(top[i]*(1-t)+bottom[i]*t) for i in range(3)); draw.line((0,y,width,y),fill=c+(255,))
    rnd=random.Random(f"world:{style}:v3")
    for _ in range(36):
        x=rnd.randrange(-80,width+80); y=rnd.randrange(0,height); w=rnd.randrange(55,190); h=rnd.randrange(20,60)
        if style=="neon": color=(104,56,184,rnd.randrange(18,50))
        elif style=="retro": color=(232,225,192,rnd.randrange(30,80))
        elif style=="ink": color=(255,255,255,rnd.randrange(60,140))
        else: color=(255,255,255,rnd.randrange(45,135))
        draw.ellipse((x-w,y-h,x+w,y+h),fill=color)
    if style=="sky-island":
        for _ in range(65):
            x=rnd.randrange(width); y=rnd.randrange(height//2); r=rnd.choice((1,1,2)); draw.ellipse((x-r,y-r,x+r,y+r),fill=(255,250,190,rnd.randrange(90,220)))
    if style=="retro": image=image.resize((width//4,height//4),Image.Resampling.BOX).resize((width,height),Image.Resampling.NEAREST)
    if style=="ink": image=stylize(image,"ink")
    return image


def file_record(path: Path, root: Path) -> dict[str, object]:
    data=path.read_bytes(); image=Image.open(path)
    return {"file":str(path.relative_to(root)),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"size":[image.width,image.height]}


def generate_style_pack(style: str) -> None:
    sources=iter_source_assets()
    target_root=PACKS/style
    produced: list[Path]=[]
    for folder, source in sources:
        target=target_root/folder/f"{source.stem}.webp"
        save_image(stylize(rgba(source),style),target); produced.append(target)
    textures=target_root/"tiles"
    for kind in ("floor","path","water","cloud"):
        target=textures/f"{kind}-texture.png"; save_image(make_texture(style,kind),target); produced.append(target)
    target=textures/"world-base.webp"; save_image(make_world_base(style),target); produced.append(target)
    manifest={"version":3,"style":style,"generatedAt":"2026-09-24","files":[file_record(path,target_root) for path in sorted(produced)]}
    (target_root/"art-manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--style", choices=STYLES)
    parser.add_argument("--skip-npc", action="store_true")
    args = parser.parse_args()
    if not args.skip_npc:
        generate_npc_v3()
    if args.style:
        generate_style_pack(args.style)
        print(f"generated style pack: {args.style}")
    else:
        for style in STYLES:
            generate_style_pack(style)
        print(f"generated npc-v3 and {len(STYLES)} style packs")


if __name__ == "__main__":
    main()
