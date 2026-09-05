#!/usr/bin/env python3
"""Acquire explicit Poly Haven originals into staging; never approve unseen art.

The public API permits commercial use as of its July 2026 terms. Every API request
identifies this application. Credits and CC0 provenance travel with each file.
No paid files, font files, website example renders, credentials or user data.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import time
from urllib.parse import quote, urlsplit, unquote
import urllib.request
from PIL import Image
from studio_asset_delivery import gltf_to_glb, geometry_key
from normalize_studio_asset_glb import read_glb

ROOT = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024
MAX_FILE = 32 * MIB
MAX_ASSET = 36 * MIB
MAX_BATCH = 768 * MIB
AGENT = 'ToonStudio-CC0-PBR-Curation/1.0 (asset provenance and offline import)'
ALLOWED = {'api.polyhaven.com', 'dl.polyhaven.org', 'polyhaven.com'}
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024


def checked_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('unapproved HTTPS supplier')
    return url


class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def safe_relative(value: str) -> Path:
    parsed = urlsplit(value)
    path = PurePosixPath(unquote(value))
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or path.is_absolute() or '\\' in value or any(p in {'', '.', '..'} for p in path.parts):
        raise ValueError('unsafe dependency path')
    if path.suffix.lower() not in {'.gltf', '.bin', '.jpg', '.jpeg', '.png'}:
        raise ValueError('unsupported dependency format')
    return Path(*path.parts)


def fetch_bytes(url: str, budget: dict, expected: dict | None = None, limit: int = MAX_FILE) -> bytes:
    checked_url(url)
    if expected is not None and (type(expected.get('size')) is not int or not 0 < expected['size'] <= limit):
        raise ValueError('supplier file size outside budget')
    request = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept-Encoding': 'identity'})
    time.sleep(0.18)
    with urllib.request.build_opener(Redirects()).open(request, timeout=45) as response:
        checked_url(response.url)
        if int(response.headers.get('Content-Length', 0)) > limit:
            raise ValueError('response exceeds file limit')
        chunks, total = [], 0
        while chunk := response.read(256 * 1024):
            total += len(chunk)
            budget['downloadedBytes'] += len(chunk)
            if total > limit or budget['downloadedBytes'] > MAX_BATCH:
                raise ValueError('download budget exceeded')
            chunks.append(chunk)
    raw = b''.join(chunks)
    if expected is not None:
        if len(raw) != expected['size']:
            raise ValueError('supplier byte length mismatch')
        md5 = expected.get('md5')
        if not isinstance(md5, str) or not re.fullmatch(r'[a-fA-F0-9]{1,32}', md5):
            raise ValueError('supplier checksum absent')
        if hashlib.md5(raw, usedforsecurity=False).hexdigest() != md5.lower().zfill(32):
            raise ValueError('supplier checksum mismatch')
    return raw


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def receipt(url: str, raw: bytes) -> dict:
    return {'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def category(item: dict) -> str:
    value = item['category'].lower()
    if any(s in value for s in ['food', 'kitchen', 'tableware']): return 'food'
    if any(s in value for s in ['plant', 'fern', 'nature']): return 'nature'
    if any(s in value for s in ['street', 'outdoor']): return 'outdoor-prop'
    return 'furniture'


def acquire(output: Path, selection: Path) -> dict:
    if output.exists() and any(output.iterdir()):
        raise ValueError('use a new empty staging directory')
    output.mkdir(parents=True, exist_ok=True)
    candidates = json.loads(selection.read_text())
    if len(candidates.get('models', [])) > 40 or len(candidates.get('textures', [])) > 40:
        raise ValueError('selection exceeds explicit review budget')
    budget = {'downloadedBytes': 0}
    for name, url in [('asset-license', 'https://polyhaven.com/license'), ('api-terms', 'https://polyhaven.com/our-api')]:
        raw = fetch_bytes(url, budget, limit=2 * MIB)
        if b'CC0' not in raw: raise ValueError('supplier policy needs renewed review')
        write_json(output / 'provenance' / (name + '.json'), receipt(url, raw))
    assets, errors = [], []
    seen_geometry, seen_pixels = {}, set()
    now = datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory(prefix='toonstudio-pbr-') as scratch_name:
        scratch = Path(scratch_name)
        for collection in ('models', 'textures'):
            for item in candidates.get(collection, []):
                identifier = item['id']
                if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_]{1,100}', identifier):
                    raise ValueError('unsafe supplier identity')
                own_id = 'polyhaven-' + identifier.lower().replace('_', '-')
                folder = output / 'assets' / own_id
                rights = {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                          'provider': 'Poly Haven', 'sourceUrl': 'https://polyhaven.com/a/' + identifier,
                          'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': now}
                try:
                    metadata_url = 'https://api.polyhaven.com/files/' + quote(identifier, safe='')
                    metadata_raw = fetch_bytes(metadata_url, budget, limit=4 * MIB)
                    files = json.loads(metadata_raw)
                    receipts = [receipt(metadata_url, metadata_raw)]
                    folder.mkdir(parents=True)
                    if collection == 'models':
                        spec = files.get('gltf', {}).get('2k', {}).get('gltf')
                        if not isinstance(spec, dict): raise ValueError('native 2K glTF unavailable')
                        includes = spec.get('include', {})
                        if not isinstance(includes, dict) or len(includes) > 32:
                            raise ValueError('too many dependencies')
                        if sum(d.get('size', MAX_ASSET) for d in [spec, *includes.values()]) > MAX_ASSET:
                            raise ValueError('model exceeds 36 MiB native 2K budget')
                        work = scratch / own_id
                        work.mkdir()
                        raw = fetch_bytes(spec['url'], budget, spec, limit=4 * MIB)
                        source = work / 'source.gltf'
                        source.write_bytes(raw)
                        receipts.append(receipt(spec['url'], raw))
                        doc = json.loads(raw)
                        required = {entry['uri'] for group in ('buffers', 'images') for entry in doc.get(group, []) if 'uri' in entry}
                        if not required.issubset(includes): raise ValueError('undeclared glTF dependencies')
                        for relative in sorted(required):
                            local = work / safe_relative(relative)
                            dependency = includes[relative]
                            raw = fetch_bytes(dependency['url'], budget, dependency)
                            if local.suffix.lower() in {'.jpg', '.jpeg', '.png'}:
                                import io
                                with Image.open(io.BytesIO(raw)) as image:
                                    image.load()
                                    if max(image.size) > 4096: raise ValueError('unexpected texture dimension')
                            local.parent.mkdir(parents=True, exist_ok=True)
                            local.write_bytes(raw)
                            receipts.append(receipt(dependency['url'], raw))
                        target = folder / (own_id + '.glb')
                        gltf_to_glb(source, target)
                        raw = target.read_bytes()
                        doc, binary = read_glb(raw)
                        key = geometry_key(doc, binary)
                        if key in seen_geometry: raise ValueError('duplicate geometry:' + seen_geometry[key])
                        seen_geometry[key] = own_id
                        asset = {'id': own_id, 'name': item['name'], 'kind': 'model', 'category': category(item),
                                 'style': 'detailed-pbr', 'path': target.relative_to(output).as_posix(),
                                 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'geometrySha256': key,
                                 'sourceCategory': item['category'], 'nativeTextureResolution': '2K', 'license': rights,
                                 'technicalChecks': ['supplier-checksum', 'self-contained-GLB-2.0', 'finite-positions', 'accessor-bounds', 'native-2K-textures'],
                                 'visualReviewed': False, 'studioRuntimeVerified': False}
                    else:
                        # Three companion maps belong to one material, not four independent assets.
                        aliases = {'baseColor': ['Diffuse', 'diff', 'diffuse'], 'normal': ['nor_gl'], 'roughness': ['Rough', 'rough'], 'ambientOcclusion': ['AO', 'ao']}
                        maps = {}
                        base_image = None
                        for role, keys in aliases.items():
                            spec = next((files[k].get('2k', {}).get('jpg') or files[k].get('2k', {}).get('png') for k in keys if isinstance(files.get(k), dict)), None)
                            if spec is None:
                                if role in {'baseColor', 'normal', 'roughness'}: raise ValueError('missing native PBR map:' + role)
                                continue
                            raw = fetch_bytes(spec['url'], budget, spec, limit=16 * MIB)
                            import io
                            with Image.open(io.BytesIO(raw)) as image:
                                image.load()
                                if min(image.size) < 1024 or max(image.size) < 2048 or max(image.size) > 4096:
                                    raise ValueError('below native 2K material requirement')
                                if role == 'baseColor': base_image = image.convert('RGB')
                            extension = '.png' if raw.startswith(b'\x89PNG') else '.jpg'
                            target = folder / (role + extension)
                            target.write_bytes(raw)
                            maps[role] = {'path': target.relative_to(output).as_posix(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                            receipts.append(receipt(spec['url'], raw))
                        if base_image is None: raise ValueError('base color missing')
                        key = hashlib.sha256(base_image.tobytes()).hexdigest()
                        if key in seen_pixels: raise ValueError('duplicate decoded material')
                        seen_pixels.add(key)
                        target = folder / (own_id + '.webp')
                        base_image.save(target, 'WEBP', lossless=True, method=4)
                        raw = target.read_bytes()
                        asset = {'id': own_id, 'name': item['name'], 'kind': 'surface-texture', 'category': 'surface-material',
                                 'style': 'detailed-pbr', 'path': target.relative_to(output).as_posix(),
                                 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'width': base_image.width, 'height': base_image.height,
                                 'maxRecommendedDisplayWidth': base_image.width, 'license': rights, 'maps': maps,
                                 'sourceCategory': item['category'], 'nativeTextureResolution': '2K',
                                 'technicalChecks': ['supplier-checksum', 'decoded-native-2K', 'lossless-WebP', 'PBR-map-set', 'pixel-deduplicated'],
                                 'visualReviewed': False, 'studioRuntimeVerified': False}
                    write_json(folder / 'SOURCE.json', {'license': rights, 'credit': 'Poly Haven', 'files': receipts})
                    assets.append(asset)
                    print('ACQUIRED PBR', asset['id'], asset['kind'], asset['bytes'], flush=True)
                except Exception as error:
                    shutil.rmtree(folder, ignore_errors=True)
                    errors.append({'id': own_id, 'reason': str(error)[:400]})
                    print('EXCLUDED PBR', own_id, str(error), flush=True)
                if budget['downloadedBytes'] >= MAX_BATCH: break
    report = {'schema': 'toonspectrum.asset-delivery.v1', 'deliveredOriginals': len(assets), 'byKind': dict(Counter(a['kind'] for a in assets)),
              'byCategory': dict(Counter(a['category'] for a in assets)), 'downloadedBytes': budget['downloadedBytes'], 'errors': errors,
              'approvedVisualOriginals': 0, 'productionPublished': 0, 'provider': 'Poly Haven', 'resolution': 'native 2K',
              'notice': 'Downloaded and technically validated; no artistic approval or Studio save/restore claim.'}
    write_json(output / 'manifest.json', {'schema': report['schema'], 'assets': assets})
    write_json(output / 'delivery-report.json', report)
    print('PBR SUMMARY', json.dumps(report, ensure_ascii=False), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--selection', type=Path, default=ROOT / 'docs/reports/asset-visual-review-20260906/polyhaven-candidates.json')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(ROOT / 'public') or output == ROOT: parser.error('use isolated staging, not public/')
    result = acquire(output, args.selection)
    raise SystemExit(0 if result['deliveredOriginals'] else 1)
