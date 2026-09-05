#!/usr/bin/env python3
"""Stage explicitly selected Poly Haven CC0 originals for visual review.

No website example renders, fonts, paid files, user work or production database.
Every download is bounded, allowlisted and checked against the source file receipt.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
import time
from urllib.parse import urlsplit
import urllib.request

from PIL import Image, ImageDraw
from studio_asset_delivery import gltf_to_glb, geometry_key
from normalize_studio_asset_glb import read_glb

MODELS = 'modern_arm_chair_01 outdoor_table_chair_set_01 GreenChair_01 Lantern_01 wooden_table_02 tea_set_01 potted_plant_02 potted_plant_04 fern_02 potted_plant_01 street_lamp_01 modern_ceiling_lamp_01 desk_lamp_arm_01 sofa_02 sofa_03 Sofa_01 decorative_book_set_01 book_encyclopedia_set_01 steel_frame_shelves_01 wine_bottles_01 food_apple_01 brass_goblets wooden_bowl_01 wooden_bowl_02 brass_pan_01 brass_pot_02 planter_pot_clay Barrel_01 Barrel_02 wine_barrel_01 modular_street_seating bench_vice_01 painted_wooden_bench GothicCabinet_01 vintage_cabinet_01 painted_wooden_cabinet'.split()
TEXTURES = 'plywood laminate_floor_02 wood_table_001 fabric_pattern_07 denmin_fabric_02 fabric_pattern_05 red_brick red_brick_03 medieval_blocks_03 metal_plate green_metal_rust rust_coarse_01 beige_wall_001 painted_plaster_wall white_plaster_02 asphalt_02 aerial_asphalt_01 asphalt_01 concrete_floor_worn_001 concrete_floor_02 concrete_layers_02 coast_sand_rocks_02 aerial_rocks_02 aerial_grass_rock leather_red_02 book_pattern brown_leather marble_01 leather_white floor_tiles_06 decrepit_wallpaper brown_mud_leaves_01 forrest_ground_01 rocky_terrain_02'.split()
USER_AGENT = 'ToonStudio-CC0-Review/1.0 (github.com/blue45f/toonspectrum; asset curation)'
MAX_TOTAL = 768 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024
HOSTS = {'api.polyhaven.com', 'dl.polyhaven.org'}


def checked_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError('Unapproved source URL')
    return url


class SourceRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Downloader:
    def __init__(self):
        self.total = 0
        self.opener = urllib.request.build_opener(SourceRedirects())
        self.receipts = []

    def read(self, url: str, metadata: dict | None = None, limit: int = MAX_FILE) -> bytes:
        checked_url(url)
        expected = metadata.get('size') if metadata else None
        if expected is not None and (type(expected) is not int or not 0 < expected <= limit):
            raise ValueError('Source file exceeds budget')
        if self.total + (expected or limit) > MAX_TOTAL:
            raise ValueError('Acquisition total budget exhausted')
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with self.opener.open(request, timeout=45) as response:
            checked_url(response.url)
            declared = response.headers.get('Content-Length')
            if declared and int(declared) > limit:
                raise ValueError('Response exceeds budget')
            chunks, size = [], 0
            while chunk := response.read(128 * 1024):
                size += len(chunk)
                self.total += len(chunk)
                if size > limit or self.total > MAX_TOTAL:
                    raise ValueError('Download exceeds byte budget')
                chunks.append(chunk)
            data = b''.join(chunks)
        if expected is not None and len(data) != expected:
            raise ValueError('Source size receipt mismatch')
        if metadata:
            md5 = metadata.get('md5')
            if not isinstance(md5, str) or not re.fullmatch(r'[a-fA-F0-9]{1,32}', md5):
                raise ValueError('Source does not provide a valid file receipt')
            # API historical MD5 values occasionally omit leading zeroes.
            if hashlib.md5(data, usedforsecurity=False).hexdigest() != md5.lower().zfill(32):
                raise ValueError('Source digest receipt mismatch')
        self.receipts.append({'url': url, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        return data

    def api(self, route: str) -> dict:
        time.sleep(0.25)
        return json.loads(self.read('https://api.polyhaven.com/' + route, limit=8 * 1024 * 1024))


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def identifier(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')


def category(name: str) -> str:
    if any(x in name.lower() for x in ['plant', 'fern']): return 'nature'
    if any(x in name.lower() for x in ['tea_', 'food_', 'goblet', 'bowl', 'pan_', 'pot_', 'bottle']): return 'food'
    if any(x in name.lower() for x in ['street', 'barrel', 'bench', 'outdoor']): return 'outdoor-prop'
    return 'furniture'


def local_dependency(root: Path, relative: str) -> Path:
    parsed = urlsplit(relative)
    parts = PurePosixPath(relative).parts
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or not parts or any(p in {'.', '..'} for p in parts) or '\\' in relative or '%' in relative:
        raise ValueError('Unsafe dependency path')
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()): raise ValueError('Dependency escapes staging root')
    return target


def acquire(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=False)
    downloader = Downloader()
    assets, errors, receipts, geometry_seen, pixel_seen = [], [], [], set(), set()
    with tempfile.TemporaryDirectory(prefix='studio-pbr-') as temporary:
        scratch = Path(temporary)
        for source_id in MODELS + TEXTURES:
            start_receipt = len(downloader.receipts)
            asset_id = 'polyhaven-' + identifier(source_id)
            folder = output / 'assets' / asset_id
            folder.mkdir(parents=True)
            rights = {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/', 'provider': 'Poly Haven',
                      'sourceUrl': 'https://polyhaven.com/a/' + source_id, 'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': '2026-09-06'}
            try:
                files = downloader.api('files/' + source_id)
                if source_id in MODELS:
                    spec = files.get('gltf', {}).get('2k', {}).get('gltf')
                    if not isinstance(spec, dict): raise ValueError('No native 2K glTF delivery')
                    include = spec.get('include', {})
                    if not isinstance(include, dict) or len(include) > 48: raise ValueError('Invalid glTF dependency map')
                    if spec.get('size', 0) + sum(m.get('size', MAX_FILE + 1) for m in include.values()) > 60 * 1024 * 1024:
                        raise ValueError('Model dependency total exceeds 60MiB')
                    work = scratch / asset_id
                    work.mkdir()
                    source = work / 'model.gltf'
                    source.write_bytes(downloader.read(spec['url'], spec, limit=8 * 1024 * 1024))
                    for relative, metadata in include.items():
                        destination = local_dependency(work, relative)
                        if destination.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.bin'}: raise ValueError('Unsupported dependency type')
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        raw = downloader.read(metadata['url'], metadata)
                        if destination.suffix.lower() != '.bin':
                            with Image.open(io.BytesIO(raw)) as image: image.verify()
                        destination.write_bytes(raw)
                    target = folder / (asset_id + '.glb')
                    gltf_to_glb(source, target)
                    raw = target.read_bytes()
                    doc, binary = read_glb(raw)
                    key = geometry_key(doc, binary)
                    if key in geometry_seen: raise ValueError('Duplicate model geometry')
                    geometry_seen.add(key)
                    row = {'kind': 'model', 'category': category(source_id), 'style': 'pbr-detailed', 'geometrySha256': key,
                           'technicalChecks': ['source-receipts', 'self-contained-textures', 'finite-positions', 'accessor-bounds', 'geometry-deduplicated']}
                else:
                    diffuse_key = next((key for key in files if key.lower() in {'diff', 'diffuse', 'color', 'basecolor'}), None)
                    if diffuse_key is None: raise ValueError('No base-color map')
                    spec = files[diffuse_key].get('2k', {}).get('jpg') or files[diffuse_key].get('2k', {}).get('png')
                    if not isinstance(spec, dict): raise ValueError('No native 2K base color')
                    original = downloader.read(spec['url'], spec, limit=16 * 1024 * 1024)
                    with Image.open(io.BytesIO(original)) as source:
                        source.load()
                        image = source.convert('RGB')
                    w, h = image.size
                    if min(w, h) < 1024 or max(w, h) < 2048: raise ValueError('Below native 2K long-edge resolution')
                    key = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
                    if key in pixel_seen: raise ValueError('Duplicate material pixels')
                    pixel_seen.add(key)
                    target = folder / (asset_id + '.webp')
                    image.save(target, 'WEBP', lossless=True, method=6)
                    raw = target.read_bytes()
                    if len(raw) > 16 * 1024 * 1024: raise ValueError('Image delivery exceeds Studio budget')
                    companions = []
                    for map_name in ('nor_gl', 'Rough', 'AO', 'arm'):
                        spec = files.get(map_name, {}).get('2k', {}).get('jpg')
                        if not isinstance(spec, dict): continue
                        data = downloader.read(spec['url'], spec, limit=16 * 1024 * 1024)
                        with Image.open(io.BytesIO(data)) as companion:
                            companion.load()
                            if companion.size != image.size: raise ValueError('Companion map dimensions mismatch')
                        map_file = folder / (identifier(map_name) + '.jpg')
                        map_file.write_bytes(data)
                        companions.append({'map': map_name, 'path': map_file.relative_to(output).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
                    row = {'kind': 'surface-texture', 'category': 'surface-material', 'style': 'pbr-material', 'width': w, 'height': h,
                           'maxRecommendedDisplayWidth': w, 'companionMaps': companions, 'technicalChecks': ['source-receipts', 'native-2K', 'decoded', 'pixel-deduplicated']}
                row.update({'id': asset_id, 'name': source_id.replace('_', ' '), 'sourceAssetId': source_id, 'path': target.relative_to(output).as_posix(),
                            'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'license': rights, 'visualReviewed': False, 'studioRuntimeVerified': False})
                assets.append(row)
                print('ACQUIRED', source_id, row['kind'], len(raw), flush=True)
            except Exception as error:
                errors.append({'sourceId': source_id, 'error': str(error)[:500]})
                print('EXCLUDED', source_id, str(error), flush=True)
            save(folder / 'SOURCE.json', {'license': rights, 'downloads': downloader.receipts[start_receipt:]})
    report = {'schema': 'toonspectrum.asset-delivery.v1', 'deliveredOriginals': len(assets), 'byKind': dict(Counter(a['kind'] for a in assets)),
              'byCategory': dict(Counter(a['category'] for a in assets)), 'downloadedBytes': downloader.total, 'errors': errors,
              'visuallyApproved': 0, 'productionPublished': 0, 'notice': 'Staged files, not visual approval. PBR companion maps are not separate originals.'}
    save(output / 'manifest.json', {'schema': report['schema'], 'assets': assets})
    save(output / 'delivery-report.json', report)
    save(output / 'download-receipts.json', downloader.receipts)
    print('PBR ACQUISITION SUMMARY', json.dumps(report), flush=True)
    if not any(a['kind'] == 'model' for a in assets): raise ValueError('No models acquired')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination.is_relative_to(Path(__file__).resolve().parents[1] / 'public'):
        parser.error('Use a non-public staging directory')
    acquire(destination)
