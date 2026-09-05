#!/usr/bin/env python3
"""Acquire real PBR assets to staging; artistic approval is a separate recorded step."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import unquote, urlsplit
import urllib.request
from PIL import Image
from studio_asset_delivery import gltf_to_glb, geometry_key
from normalize_studio_asset_glb import read_glb

ROOT = Path(__file__).resolve().parents[1]
MAX_TOTAL = 512 * 1024 * 1024
MAX_FILE = 24 * 1024 * 1024
UA = 'ToonStudio-PbrCuration/1.0 (github.com/blue45f/toonspectrum)'
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024


def checked_url(url: str) -> str:
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in {'api.polyhaven.com', 'dl.polyhaven.org'} or p.username or p.password or p.port:
        raise ValueError('Unapproved supplier URL')
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(SafeRedirect())


def fetch(url: str, budget: dict, limit: int, expected: dict | None = None) -> bytes:
    checked_url(url)
    if budget['bytes'] >= MAX_TOTAL:
        raise ValueError('Acquisition budget exhausted')
    time.sleep(0.3)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with OPENER.open(req, timeout=45) as response:
        checked_url(response.url)
        raw = bytearray()
        while chunk := response.read(64 * 1024):
            budget['bytes'] += len(chunk)
            raw.extend(chunk)
            if len(raw) > limit or budget['bytes'] > MAX_TOTAL:
                raise ValueError('Download exceeds budget')
    result = bytes(raw)
    if expected:
        if len(result) != expected['size']:
            raise ValueError('Official file size mismatch')
        # Provider MD5 is transport consistency only; SHA-256 is our delivery identity.
        if hashlib.md5(result, usedforsecurity=False).hexdigest() != expected['md5']:
            raise ValueError('Official download digest mismatch')
    return result


def local_path(root: Path, relative: str) -> Path:
    if not re.fullmatch(r'[A-Za-z0-9_./-]+', relative) or any(p in {'', '.', '..'} for p in relative.split('/')):
        raise ValueError('Unsafe dependency path')
    result = (root / relative).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError('Dependency escapes staging')
    result.parent.mkdir(parents=True, exist_ok=True)
    return result


def save(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def rights(identifier: str) -> dict:
    return {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'provider': 'Poly Haven', 'sourceUrl': 'https://polyhaven.com/a/' + identifier,
            'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': '2026-09-06'}


def validate_image(raw: bytes, minimum: int = 1) -> Image.Image:
    image = Image.open(io.BytesIO(raw))
    if min(image.size) < minimum or image.width * image.height > 32 * 1024 * 1024:
        raise ValueError('Native image resolution outside intended-role budget')
    image.load()
    if image.format not in {'JPEG', 'PNG'}:
        raise ValueError('Unsupported official texture format')
    return image


def file_receipt(meta: dict, raw: bytes) -> dict:
    return {'url': meta['url'], 'bytes': len(raw), 'providerMd5': meta['md5'], 'sha256': sha(raw)}


def classify(candidate: dict) -> str:
    category = candidate.get('category', '').lower()
    if 'nature/' in category:
        return 'nature'
    if 'food & kitchen/' in category:
        return 'food'
    if 'street' in category or 'outdoor' in category or 'containers' in category:
        return 'outdoor-prop'
    return 'furniture'


def acquire(output: Path) -> dict:
    if output.exists():
        raise ValueError('Use a new empty staging directory')
    if output.is_relative_to(ROOT / 'public'):
        raise ValueError('Acquire outside public; render and review before publication')
    output.mkdir(parents=True)
    candidates = json.loads((ROOT / 'docs/reports/asset-visual-review-20260906/polyhaven-candidates.json').read_text())
    budget, assets, errors, receipts, seen = {'bytes': 0}, [], [], [], set()
    with tempfile.TemporaryDirectory(prefix='toon-pbr-') as temp:
        scratch = Path(temp)
        for kind in ('models', 'textures'):
            for candidate in candidates[kind]:
                identifier = candidate['id']
                normalized = identifier.lower().replace('_', '-')
                if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', identifier):
                    raise ValueError('Unsafe source identity')
                folder = output / 'assets' / ('polyhaven-' + normalized)
                entry = None
                try:
                    files = json.loads(fetch('https://api.polyhaven.com/files/' + identifier, budget, 6 * 1024 * 1024))
                    source_receipts = []
                    folder.mkdir(parents=True)
                    if kind == 'models':
                        choices = files.get('gltf', {})
                        selected = None
                        resolution = None
                        for option in ('2k', '1k'):
                            meta = choices.get(option, {}).get('gltf')
                            if not meta:
                                continue
                            dependencies = meta.get('include', {})
                            if len(dependencies) <= 24 and sum(v['size'] for v in dependencies.values()) + meta['size'] <= 22 * 1024 * 1024:
                                selected, resolution = meta, option
                                break
                        if not selected:
                            raise ValueError('No self-contained glTF within intended web budget')
                        work = scratch / identifier
                        work.mkdir()
                        source = work / (identifier + '.gltf')
                        raw = fetch(selected['url'], budget, MAX_FILE, selected)
                        doc = json.loads(raw)
                        if doc.get('asset', {}).get('version') != '2.0':
                            raise ValueError('Unsupported glTF')
                        source.write_bytes(raw)
                        source_receipts.append(file_receipt(selected, raw))
                        dependencies = selected.get('include', {})
                        for reference in [v.get('uri') for key in ('buffers', 'images') for v in doc.get(key, []) if 'uri' in v]:
                            if not isinstance(reference, str) or reference not in dependencies:
                                raise ValueError('Unlisted glTF dependency')
                        for name, meta in dependencies.items():
                            target = local_path(work, unquote(name))
                            raw = fetch(meta['url'], budget, MAX_FILE, meta)
                            if target.suffix.lower() in {'.jpg', '.jpeg', '.png'}:
                                validate_image(raw)
                            target.write_bytes(raw)
                            source_receipts.append(file_receipt(meta, raw))
                        target = folder / (normalized + '.glb')
                        gltf_to_glb(source, target)
                        raw = target.read_bytes()
                        doc, binary = read_glb(raw)
                        key = geometry_key(doc, binary)
                        if key in seen:
                            raise ValueError('Duplicate source geometry')
                        seen.add(key)
                        if not doc.get('materials') or not doc.get('images'):
                            raise ValueError('PBR candidate lacks material textures')
                        entry = {'id': 'polyhaven-' + normalized, 'name': candidate['name'], 'kind': 'model',
                                 'category': classify(candidate), 'style': 'realistic-pbr', 'textureResolution': resolution,
                                 'geometrySha256': key, 'technicalChecks': ['official-digest', 'GLB-2.0', 'embedded-PBR-textures', 'finite-positions', 'accessor-bounds']}
                    else:
                        color = next((v for k,v in files.items() if k.lower() in {'diff', 'diffuse', 'albedo', 'color'}), None)
                        meta = color.get('2k', {}).get('jpg') or color.get('2k', {}).get('png') if color else None
                        if not meta:
                            raise ValueError('No native 2K base color')
                        original = fetch(meta['url'], budget, MAX_FILE, meta)
                        image = validate_image(original, 2048).convert('RGB')
                        source_receipts.append(file_receipt(meta, original))
                        target = folder / (normalized + '.webp')
                        image.save(target, 'WEBP', quality=95, method=5)
                        raw = target.read_bytes()
                        with Image.open(io.BytesIO(raw)) as check:
                            check.load()
                            if check.size != image.size:
                                raise ValueError('Texture encoding altered dimensions')
                        key = sha(image.tobytes())
                        if key in seen:
                            raise ValueError('Duplicate decoded base color')
                        seen.add(key)
                        maps = {}
                        for purpose, names in [('normal', {'nor_gl'}), ('roughness', {'rough','roughness'})]:
                            values = next((v for k,v in files.items() if k.lower() in names), None)
                            map_meta = values.get('2k', {}).get('jpg') or values.get('2k', {}).get('png') if values else None
                            if not map_meta:
                                raise ValueError('Missing required PBR companion: ' + purpose)
                            map_raw = fetch(map_meta['url'], budget, MAX_FILE, map_meta)
                            validate_image(map_raw, 2048)
                            extension = '.png' if map_raw.startswith(b'\x89PNG') else '.jpg'
                            companion = folder / (normalized + '-' + purpose + extension)
                            companion.write_bytes(map_raw)
                            maps[purpose] = companion.relative_to(output).as_posix()
                            source_receipts.append(file_receipt(map_meta, map_raw))
                        entry = {'id': 'polyhaven-' + normalized, 'name': candidate['name'], 'kind': 'surface-texture',
                                 'category': 'surface-material', 'materialFamily': candidate['selectionTerm'], 'style': 'realistic-pbr',
                                 'width': image.width, 'height': image.height, 'companionMaps': maps,
                                 'technicalChecks': ['official-digest', 'native-2K', 'decoded', 'pixel-deduplicated', 'PBR-companion-maps']}
                    entry.update({'path': target.relative_to(output).as_posix(), 'bytes': len(raw), 'sha256': sha(raw),
                                  'license': rights(identifier), 'visualReviewed': False, 'studioRuntimeVerified': False})
                    assets.append(entry)
                    save(folder / 'SOURCE.json', {'license': rights(identifier), 'files': source_receipts, 'sourceCandidate': candidate})
                    receipts.append({'id': entry['id'], 'files': source_receipts})
                    print('ACQUIRED', entry['id'], kind, len(raw), flush=True)
                except Exception as error:
                    # Only this isolated staging folder is removed on incomplete acquisition.
                    import shutil
                    if folder.exists():
                        shutil.rmtree(folder)
                    errors.append({'id': identifier, 'reason': str(error)[:500]})
                    print('NOT ADMITTED', identifier, str(error), flush=True)
    from collections import Counter
    report = {'schema':'toonspectrum.asset-delivery.v1', 'deliveredOriginals':len(assets),
              'byKind':dict(Counter(a['kind'] for a in assets)), 'downloadedBytes':budget['bytes'], 'errors':errors,
              'approvedVisualOriginals':0, 'productionPublished':0, 'provider':'Poly Haven', 'license':'CC0-1.0'}
    save(output / 'manifest.json', {'schema':report['schema'], 'assets':assets})
    save(output / 'delivery-report.json', report)
    save(output / 'acquisition-receipts.json', receipts)
    print('PBR ACQUISITION', json.dumps(report), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = acquire(args.output.resolve())
    raise SystemExit(0 if result['deliveredOriginals'] else 1)
