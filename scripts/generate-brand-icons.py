#!/usr/bin/env python3
"""Rebuild ToonStudio's committed icons from favicon.svg (no app/runtime dependency).

Developer-only: Python 3.10+, CairoSVG 2.8.2, Pillow 12.3.0 and system Cairo.
Run from any directory: python scripts/generate-brand-icons.py [--check]
--check compares PNG pixels; SVG and ICO outputs are checked byte-for-byte.
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
    # A restrained palette preserves flat brand colours and anti-aliased edges.
    image = image.quantize(colors=128, method=Image.Quantize.FASTOCTREE)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    # Pillow pads palettes to 128 entries. Remove unused entries losslessly.
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


def generate() -> dict[str, bytes]:
    source = (PUBLIC / "favicon.svg").read_bytes()
    master = ET.fromstring(source)
    background = master.find(f"{{{SVG_NS}}}rect")
    assert background is not None
    ink = background.attrib["fill"]
    graphics = [copy.deepcopy(child) for child in master
                if child.tag not in {f"{{{SVG_NS}}}title", f"{{{SVG_NS}}}rect"}]
    assert len(graphics) == 4, "Expected panel, nib, slit, and breather"
    mask = ET.Element(f"{{{SVG_NS}}}svg", {
        "viewBox": "0 0 64 64", "role": "img", "aria-labelledby": "title",
    })
    ET.SubElement(mask, f"{{{SVG_NS}}}title", {"id": "title"}).text = "ToonStudio — Ink Panel, maskable"
    ET.SubElement(mask, f"{{{SVG_NS}}}rect", {"width": "64", "height": "64", "fill": ink})
    group = ET.SubElement(mask, f"{{{SVG_NS}}}g", {"transform": "translate(7.68 7.68) scale(.76)"})
    group.extend(copy.deepcopy(graphics))
    masked = svg_bytes(mask)
    mono = ET.Element(f"{{{SVG_NS}}}svg", {"viewBox": "0 0 64 64"})
    ET.SubElement(mono, f"{{{SVG_NS}}}path", {
        "fill": ink, "fill-rule": "evenodd",
        "d": graphics[0].attrib["d"] + " " + graphics[1].attrib["d"],
    })
    mono.extend(copy.deepcopy(graphics[2:]))
    files = {"icon-maskable.svg": masked, "safari-pinned-tab.svg": svg_bytes(mono)}
    for name, size in [("favicon-32.png", 32), ("favicon-96.png", 96)]:
        files[name] = render(source, size)
    # Installation surfaces use the same opaque, mask-safe mark on every OS.
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("icon-maskable-192.png", 192),
                       ("icon-maskable-512.png", 512)]:
        files[name] = render(masked, size, opaque=True)
    frames = [(size, render(source, size)) for size in (16, 32, 48)]
    offset = 6 + 16 * len(frames)
    entries = []
    for size, png in frames:
        entries.append(struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(png), offset))
        offset += len(png)
    files["favicon.ico"] = struct.pack("<HHH", 0, 1, len(frames)) + b"".join(entries) + b"".join(png for _, png in frames)
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, content in generate().items():
        target = PUBLIC / name
        if args.check:
            actual = target.read_bytes()
            if name.endswith(".png"):
                expected_image = Image.open(io.BytesIO(content)).convert("RGBA")
                actual_image = Image.open(io.BytesIO(actual)).convert("RGBA")
                assert actual_image.size == expected_image.size, name
                assert actual_image.tobytes() == expected_image.tobytes(), name
            else:
                assert actual == content, name
        else:
            target.write_bytes(content)
        print(f"{'OK' if args.check else 'WROTE'} {name}: {len(content)} bytes")


if __name__ == "__main__":
    main()
