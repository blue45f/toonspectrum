#!/usr/bin/env python3
"""Rebuild ToonStudio's Spectrum Ribbon icons from favicon.svg.

Developer-only: Python 3.10+, CairoSVG 2.8.2, Pillow 11.3+ and system Cairo.
Run from any directory: python scripts/generate-brand-icons.py [--check]
The root copies preserve implicit browser/PWA URLs; versioned copies guarantee cache rotation.
"""
from __future__ import annotations

import argparse
import copy
import io
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
VERSIONED = Path("brand/spectrum-ribbon-v2")
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def svg_bytes(node: ET.Element) -> bytes:
    ET.indent(node, space="  ")
    return ET.tostring(node, encoding="utf-8") + b"\n"


def render(source: bytes, size: int, opaque: bool = False) -> bytes:
    image = Image.open(io.BytesIO(cairosvg.svg2png(
        bytestring=source, output_width=size, output_height=size,
    ))).convert("RGBA")
    if opaque:
        assert image.getchannel("A").getextrema() == (255, 255)
        image = image.convert("RGB")
    image = image.quantize(colors=96, method=Image.Quantize.FASTOCTREE)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = output.getvalue()
    colors = image.getextrema()[1] + 1
    chunks = [encoded[:8]]
    offset = 8
    while offset < len(encoded):
        length = int.from_bytes(encoded[offset:offset + 4], "big")
        kind = encoded[offset + 4:offset + 8]
        data = encoded[offset + 8:offset + 8 + length]
        if kind == b"PLTE":
            data = data[:colors * 3]
        if kind == b"tRNS":
            data = data[:colors].rstrip(b"\xff")
        if data or kind != b"tRNS":
            chunks.append(struct.pack(">I", len(data)) + kind + data
                          + struct.pack(">I", zlib.crc32(kind + data)))
        offset += length + 12
    return b"".join(chunks)


def build_maskable(master: ET.Element, background_color: str) -> bytes:
    mask = ET.Element(f"{{{SVG_NS}}}svg", {
        "viewBox": "0 0 64 64", "role": "img", "aria-labelledby": "title",
    })
    ET.SubElement(mask, f"{{{SVG_NS}}}title", {"id": "title"}).text = "ToonStudio — Spectrum Ribbon, maskable"
    for child in master:
        if child.tag == f"{{{SVG_NS}}}defs":
            mask.append(copy.deepcopy(child))
    ET.SubElement(mask, f"{{{SVG_NS}}}rect", {"width": "64", "height": "64", "fill": background_color})
    group = ET.SubElement(mask, f"{{{SVG_NS}}}g", {"transform": "translate(7.68 7.68) scale(.76)"})
    for child in master:
        if child.tag not in {f"{{{SVG_NS}}}title", f"{{{SVG_NS}}}defs", f"{{{SVG_NS}}}rect"}:
            group.append(copy.deepcopy(child))
    return svg_bytes(mask)


def build_monochrome() -> bytes:
    mono = ET.Element(f"{{{SVG_NS}}}svg", {"viewBox": "0 0 64 64"})
    ET.SubElement(mono, f"{{{SVG_NS}}}path", {
        "fill": "none", "stroke": "#000", "stroke-width": "10", "stroke-linecap": "round",
        "d": "M47 13C37 8 20 11 15 20c-5 10 10 12 20 11 12-1 18 3 14 11-4 8-18 12-31 8",
    })
    ET.SubElement(mono, f"{{{SVG_NS}}}path", {
        "fill": "#000", "fill-rule": "evenodd",
        "d": "m43 39 10 9-10 10-8-3 2-9Zm3 5-8 9 4 2 7-7Z",
    })
    return svg_bytes(mono)


def generate() -> dict[Path, bytes]:
    source = (PUBLIC / "favicon.svg").read_bytes()
    master = ET.fromstring(source)
    background = master.find(f"{{{SVG_NS}}}rect")
    assert background is not None and background.attrib.get("fill"), "favicon.svg needs a solid background rect"
    masked = build_maskable(master, background.attrib["fill"])
    files: dict[Path, bytes] = {
        Path("favicon.svg"): source,
        Path("icon-maskable.svg"): masked,
        Path("safari-pinned-tab.svg"): build_monochrome(),
    }
    for name, size in [("favicon-32.png", 32), ("favicon-96.png", 96)]:
        files[Path(name)] = render(source, size)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("icon-maskable-192.png", 192),
                       ("icon-maskable-512.png", 512)]:
        files[Path(name)] = render(masked, size, opaque=True)
    frames = [(size, render(source, size)) for size in (16, 32, 48)]
    offset = 6 + 16 * len(frames)
    entries = []
    for size, png in frames:
        entries.append(struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(png), offset))
        offset += len(png)
    files[Path("favicon.ico")] = struct.pack("<HHH", 0, 1, len(frames)) + b"".join(entries) + b"".join(png for _, png in frames)
    versioned = {VERSIONED / path.name: content for path, content in files.items()}
    versioned[VERSIONED / "manifest.webmanifest"] = (PUBLIC / "manifest.webmanifest").read_bytes()
    return files | versioned


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for relative, content in generate().items():
        target = PUBLIC / relative
        if args.check:
            actual = target.read_bytes()
            if relative.suffix == ".png":
                expected_image = Image.open(io.BytesIO(content)).convert("RGBA")
                actual_image = Image.open(io.BytesIO(actual)).convert("RGBA")
                assert actual_image.size == expected_image.size, str(relative)
                assert actual_image.tobytes() == expected_image.tobytes(), str(relative)
            else:
                assert actual == content, str(relative)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        print(f"{'OK' if args.check else 'WROTE'} {relative}: {len(content)} bytes")


if __name__ == "__main__":
    main()
