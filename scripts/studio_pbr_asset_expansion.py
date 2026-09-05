#!/usr/bin/env python3
"""Native 2K PBR expansion via the official Poly Haven API; never an art-approval claim.

No website scraping, account credentials, paid assets, fonts, or user files. The
explicit --integrate action only appends to the repository-owned CC0 catalog.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import quote, unquote, urlsplit

from PIL import Image
from studio_asset_delivery import geometry_key, gltf_to_glb, save_json
from normalize_studio_asset_glb import read_glb

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/assets/studio/cc0-20260906'
REVIEW = ROOT / 'docs/reports/asset-visual-review-20260906'
UA = 'ToonStudio-PBR-Curation/1.0 (https://github.com/blue45f/toonspectrum)'
SCHEMA = 'toonspectrum.asset-delivery.v1'
MAX_BYTES = 32 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024
MODEL_SELECTION = {
    'modern_arm_chair_01': ('패브릭 암체어', 'furniture'),
    'GreenChair_01': ('그린 체어', 'furniture'),
    'wooden_table_02': ('원목 테이블', 'furniture'),
    'tea_set_01': ('찻잔과 티포트', 'food'),
    'potted_plant_04': ('실내 화분', 'nature'),
    'desk_lamp_arm_01': ('관절 데스크 램프', 'furniture'),
    'sofa_02': ('패브릭 소파', 'furniture'),
    'wooden_bowl_02': ('원목 그릇', 'food'),
    'brass_pan_01': ('황동 팬', 'food'),
    'planter_pot_clay': ('테라코타 화분', 'nature'),
    'painted_wooden_bench': ('원목 벤치', 'furniture'),
    'painted_wooden_cabinet': ('원목 수납장', 'furniture'),
}
MATERIAL_LABELS = {'wood': '목재', 'fabric': '직물', 'brick': '벽돌', 'metal': '금속',
                   'plaster': '회벽', 'asphalt': '아스팔트', 'concrete': '콘크리트',
                   'stone': '석재', 'leather': '가죽', 'tile': '타일', 'paper': '종이', 'ground': '지면'}


def allowed_url(url: str, api: bool = False) -> str:
    parsed = urlsplit(url)
    host = 'api.polyhaven.com' if api else 'dl.polyhaven.org'
    if (parsed.scheme != 'https' or parsed.hostname != host or parsed.username or parsed.password
            or parsed.port or parsed.query or parsed.fragment or '\\' in url):
        raise ValueError('Unapproved source URL')
    decoded = unquote(parsed.path)
    if any(part in {'.', '..'} for part in decoded.split('/')):
        raise ValueError('Noncanonical source path')
    if api:
        if not re.fullmatch(r'/(?:assets|files/[A-Za-z0-9_-]{1,100})', decoded):
            raise ValueError('Unapproved API route')
    elif not decoded.startswith('/file/ph-assets/'):
        raise ValueError('Not a public asset file')
    return url


class SourceRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        allowed_url(newurl, api=urlsplit(request.full_url).hostname == 'api.polyhaven.com')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def get_bytes(url: str, limit: int, budget: dict, api: bool = False) -> bytes:
    allowed_url(url, api)
    if budget['bytes'] + limit > MAX_TOTAL and budget['bytes'] >= MAX_TOTAL:
        raise ValueError('Acquisition total budget exceeded')
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json' if api else '*/*'})
    with urllib.request.build_opener(SourceRedirects()).open(request, timeout=45) as response:
        allowed_url(response.url, api)
        declared = response.headers.get('Content-Length')
        if declared and int(declared) > limit:
            raise ValueError('Declared response size exceeds budget')
        chunks, size = [], 0
        while chunk := response.read(min(128 * 1024, limit + 1 - size)):
            size += len(chunk)
            budget['bytes'] += len(chunk)
            if size > limit or budget['bytes'] > MAX_TOTAL:
                raise ValueError('Response exceeded acquisition budget')
            chunks.append(chunk)
        return b''.join(chunks)


def get_api(route: str, budget: dict) -> dict:
    time.sleep(0.25)
    value = json.loads(get_bytes('https://api.polyhaven.com/' + route, 8 * 1024 * 1024, budget, api=True))
    if not isinstance(value, dict):
        raise ValueError('Invalid API document')
    return value


def safe_path(root: Path, relative: str) -> Path:
    decoded = unquote(relative)
    parts = PurePosixPath(decoded)
    if (not decoded or parts.is_absolute() or '\\' in decoded or ':' in decoded
            or any(p in {'.', '..', ''} for p in decoded.split('/'))):
        raise ValueError('Unsafe dependency path')
    path = (root / decoded).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Dependency escaped staging')
    return path


def asset_bytes(description: dict, destination: Path, budget: dict) -> dict:
    if not isinstance(description, dict) or type(description.get('size')) is not int:
        raise ValueError('File descriptor lacks size')
    expected = description['size']
    if not 0 < expected <= MAX_BYTES:
        raise ValueError('File exceeds native-resolution download budget')
    raw = get_bytes(description['url'], expected, budget)
    if len(raw) != expected:
        raise ValueError('Source file size mismatch')
    md5 = description.get('md5')
    if not isinstance(md5, str) or not re.fullmatch(r'[a-fA-F0-9]{1,32}', md5):
        raise ValueError('Missing source digest')
    # MD5 is the supplier's integrity receipt, not a security signature. SHA-256
    # below is used for the delivered catalog's runtime integrity checks.
    if hashlib.md5(raw, usedforsecurity=False).hexdigest() != md5.lower().zfill(32):
        raise ValueError('Source file digest mismatch')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
    return {'url': description['url'], 'bytes': len(raw), 'sourceMd5': md5,
            'sha256': hashlib.sha256(raw).hexdigest(), 'sourceDigestMatched': True}


def native_image(raw: bytes) -> Image.Image:
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        if min(image.size) < 1024 or max(image.size) < 2048 or max(image.size) > 4096:
            raise ValueError('Image is not a native 2K material')
        result = image.convert('RGBA')
        if result.getchannel('A').getbbox() is None:
            raise ValueError('Empty image')
        return result


def file_variants(document: dict, extension: str, ancestry: tuple = ()):
    for key, value in document.items():
        if not isinstance(value, dict):
            continue
        route = (*ancestry, key)
        if isinstance(value.get('url'), str) and urlsplit(value['url']).path.lower().endswith(extension):
            yield route, value
        else:
            yield from file_variants(value, extension, route)


def license_for(identifier: str) -> dict:
    return {'id': 'CC0-1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'provider': 'Poly Haven', 'sourceUrl': 'https://polyhaven.com/a/' + quote(identifier),
            'commercialUse': True, 'redistributionAllowed': True, 'checkedOn': '2026-09-06',
            'licenseEvidenceUrl': 'https://polyhaven.com/license'}


def inspect_images_in_model(document: dict, source: Path) -> None:
    for image in document.get('images', []):
        uri = image.get('uri')
        if not isinstance(uri, str):
            raise ValueError('Model must have explicit, locally verified source textures')
        path = safe_path(source.parent, uri)
        with Image.open(path) as decoded:
            decoded.load()
            if decoded.width * decoded.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError('Model image exceeds decode budget')


def acquire(output: Path) -> None:
    if output.exists():
        raise ValueError('Acquisition requires an empty, new staging directory')
    output.mkdir(parents=True)
    (output / 'previews').mkdir()
    budget = {'bytes': 0}
    candidate_doc = json.loads((REVIEW / 'polyhaven-candidates.json').read_text())
    fresh = get_api('assets', budget)
    assets, rejected, variants, receipts = [], [], [], []
    pixels, geometry = set(), set()
    with tempfile.TemporaryDirectory(prefix='toon-pbr-sources-') as directory:
        scratch = Path(directory)
        for candidate in candidate_doc['textures'][:36]:
            identifier = candidate['id']
            folder = output / 'assets' / ('polyhaven-' + identifier.lower().replace('_', '-'))
            try:
                if fresh.get(identifier, {}).get('type') != 1:
                    raise ValueError('Supplier no longer lists this texture')
                files = get_api('files/' + quote(identifier), budget)
                diffuse = next((files[key] for key in ('Diffuse', 'diff', 'diffuse', 'Color', 'albedo') if key in files), None)
                native = (diffuse or {}).get('2k', {})
                descriptor = native.get('jpg') or native.get('png')
                if not descriptor:
                    raise ValueError('No native 2K base-color file')
                native_path = scratch / (identifier + '-color' + Path(urlsplit(descriptor['url']).path).suffix)
                receipt = asset_bytes(descriptor, native_path, budget)
                image = native_image(native_path.read_bytes())
                pixel_hash = hashlib.sha256(struct.pack('<II', *image.size) + image.tobytes()).hexdigest()
                if pixel_hash in pixels:
                    variants.append({'id': identifier, 'reason': 'identical-native-pixels'})
                    continue
                folder.mkdir(parents=True)
                target = folder / 'base-color.webp'
                image.save(target, 'WEBP', lossless=True, method=4)
                if target.stat().st_size > 16 * 1024 * 1024:
                    raise ValueError('Lossless native image exceeds insertion budget')
                # Assert conversion has not changed source pixels or dimensions.
                with Image.open(target) as check:
                    if check.convert('RGBA').tobytes() != image.tobytes():
                        raise ValueError('Conversion changed source pixels')
                item_id = 'polyhaven-' + identifier.lower().replace('_', '-')
                preview = output / 'previews' / (item_id + '.webp')
                thumb = image.copy(); thumb.thumbnail((384, 384)); thumb.save(preview, 'WEBP', quality=90, method=4)
                maps = []
                for key, role in (('nor_gl', 'normal-opengl'), ('rough', 'roughness'), ('ao', 'ambient-occlusion')):
                    desc = files.get(key, {}).get('2k', {}).get('jpg') or files.get(key, {}).get('2k', {}).get('png')
                    if not desc:
                        continue
                    try:
                        original_path = scratch / (identifier + '-' + role + Path(urlsplit(desc['url']).path).suffix)
                        map_receipt = asset_bytes(desc, original_path, budget)
                        decoded = native_image(original_path.read_bytes())
                        if decoded.size != image.size:
                            raise ValueError('PBR map dimensions differ from base color')
                        map_file = folder / (role + '.webp')
                        decoded.save(map_file, 'WEBP', lossless=True, method=4)
                        maps.append({'role': role, 'path': map_file.relative_to(output).as_posix(),
                                     'sha256': hashlib.sha256(map_file.read_bytes()).hexdigest(), 'source': map_receipt})
                    except (OSError, ValueError, KeyError) as error:
                        rejected.append({'id': identifier, 'role': role, 'reason': str(error)})
                name = MATERIAL_LABELS.get(candidate['selectionTerm'], '재질') + ' · ' + candidate['name']
                rights = license_for(identifier)
                row = {'id': item_id, 'name': name, 'kind': 'surface-texture', 'category': 'surface-material',
                       'style': 'realistic-pbr', 'path': target.relative_to(output).as_posix(),
                       'previewPath': preview.relative_to(output).as_posix(), 'width': image.width, 'height': image.height,
                       'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                       'sourceSha256': receipt['sha256'], 'license': rights, 'companionMaps': maps,
                       'technicalChecks': ['native-2K', 'decoded', 'lossless-pixel-roundtrip', 'source-size-and-digest', 'pixel-deduplicated'],
                       'visualReviewed': False, 'studioRuntimeVerified': False}
                save_json(folder / 'SOURCE.json', {'license': rights, 'download': receipt, 'companionMaps': maps})
                assets.append(row); receipts.append(receipt); pixels.add(pixel_hash)
                print('PBR MATERIAL', item_id, image.size, 'maps', len(maps), flush=True)
            except (OSError, ValueError, KeyError, TypeError) as error:
                rejected.append({'id': identifier, 'reason': str(error)})
                if folder.exists(): shutil.rmtree(folder)
                print('PBR MATERIAL EXCLUDED', identifier, str(error), flush=True)
        for identifier, (label, category) in MODEL_SELECTION.items():
            folder = output / 'assets' / ('polyhaven-' + identifier.lower().replace('_', '-'))
            try:
                if fresh.get(identifier, {}).get('type') != 2:
                    raise ValueError('Supplier no longer lists this model')
                files = get_api('files/' + quote(identifier), budget)
                options = [d for route, d in file_variants(files, '.gltf') if '2k' in route]
                if len(options) != 1:
                    raise ValueError('Expected exactly one native 2K glTF package')
                descriptor = options[0]
                dependencies = descriptor.get('include', {})
                if not isinstance(dependencies, dict) or not 1 <= len(dependencies) <= 32:
                    raise ValueError('Unexpected dependency graph')
                if sum(d.get('size', MAX_BYTES + 1) for d in dependencies.values()) > 60 * 1024 * 1024:
                    raise ValueError('Self-contained 2K model exceeds browser budget')
                source_root = scratch / identifier; source_root.mkdir()
                source = source_root / Path(urlsplit(descriptor['url']).path).name
                model_receipt = asset_bytes(descriptor, source, budget)
                dep_receipts = []
                for relative, description in dependencies.items():
                    destination = safe_path(source_root, relative)
                    if destination.suffix.lower() not in {'.bin', '.png', '.jpg', '.jpeg'}:
                        raise ValueError('Unsupported model dependency')
                    dep_receipts.append({'path': relative, **asset_bytes(description, destination, budget)})
                document = json.loads(source.read_text())
                inspect_images_in_model(document, source)
                folder.mkdir(parents=True)
                target = folder / 'model.glb'
                gltf_to_glb(source, target)
                doc, binary = read_glb(target.read_bytes())
                if not doc.get('meshes') or not doc.get('scenes'):
                    raise ValueError('Model has no visible scene')
                key = geometry_key(doc, binary)
                if key in geometry:
                    variants.append({'id': identifier, 'reason': 'same-geometry'})
                    shutil.rmtree(folder)
                    continue
                rights = license_for(identifier)
                row = {'id': 'polyhaven-' + identifier.lower().replace('_', '-'),
                       'name': label + ' · ' + fresh[identifier].get('name', identifier), 'kind': 'model',
                       'category': category, 'style': 'realistic-pbr', 'path': target.relative_to(output).as_posix(),
                       'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                       'geometrySha256': key, 'license': rights,
                       'technicalChecks': ['GLB-2.0', 'self-contained-textures', 'source-size-and-digest', 'finite-positions', 'accessor-bounds'],
                       'visualReviewed': False, 'studioRuntimeVerified': False}
                save_json(folder / 'SOURCE.json', {'license': rights, 'model': model_receipt, 'dependencies': dep_receipts})
                assets.append(row); receipts.append(model_receipt); geometry.add(key)
                print('PBR MODEL', row['id'], row['bytes'], flush=True)
            except (OSError, ValueError, KeyError, TypeError) as error:
                rejected.append({'id': identifier, 'reason': str(error)})
                if folder.exists(): shutil.rmtree(folder)
                print('PBR MODEL EXCLUDED', identifier, str(error), flush=True)
    save_json(output / 'manifest.json', {'schema': SCHEMA, 'assets': assets})
    report = {'schema': SCHEMA, 'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'deliveredOriginals': len(assets), 'byKind': dict(Counter(a['kind'] for a in assets)),
              'byCategory': dict(Counter(a['category'] for a in assets)), 'downloadedBytes': budget['bytes'],
              'deduplicatedVariants': len(variants), 'excludedCandidates': len(rejected),
              'approvedVisualOriginals': 0, 'productionPublished': 0, 'packs': [],
              'notice': 'Real 2K files and self-contained PBR models. Technical acceptance is not full artistic approval.'}
    save_json(output / 'delivery-report.json', report)
    save_json(output / 'excluded-and-variants.json', {'excluded': rejected, 'variants': variants})
    save_json(output / 'source-receipts.json', receipts)
    print('PBR ACQUISITION', json.dumps(report, ensure_ascii=False), flush=True)
    if len(assets) < 12:
        raise ValueError('Too few native originals passed acquisition')


def integrate(output: Path) -> None:
    from finalize_studio_asset_delivery import stage
    expansion = json.loads((output / 'manifest.json').read_text())
    if any(a['kind'] == 'model' and not a.get('browserRenderVerified') for a in expansion['assets']):
        raise ValueError('Render new models before integration')
    combined = output.parent / (output.name + '-combined')
    if combined.exists():
        raise ValueError('Combined staging directory must be new')
    shutil.copytree(PUBLIC, combined)
    for folder in ('assets', 'previews'):
        shutil.copytree(output / folder, combined / folder, dirs_exist_ok=True)
    current = json.loads((PUBLIC / 'manifest.json').read_text())
    old_ids = {a['id'] for a in current['assets']}
    if any(a['id'] in old_ids for a in expansion['assets']):
        raise ValueError('Expansion must not overwrite existing asset IDs')
    current['assets'].extend(expansion['assets'])
    save_json(combined / 'manifest.json', current)
    report = json.loads((PUBLIC / 'delivery-report.json').read_text())
    extra = json.loads((output / 'delivery-report.json').read_text())
    report.update({'deliveredOriginals': len(current['assets']),
                   'byKind': dict(Counter(a['kind'] for a in current['assets'])),
                   'byCategory': dict(Counter(a['category'] for a in current['assets']))})
    for key in ('deduplicatedVariants', 'excludedCandidates', 'downloadedBytes', 'browserRenderedModels', 'browserRejectedModels'):
        report[key] = report.get(key, 0) + extra.get(key, 0)
    report['additionalPbrOriginals'] = len(expansion['assets'])
    report['additionalPbrByKind'] = extra['byKind']
    report['productionPublished'] = 0
    report['approvedVisualOriginals'] = 0
    save_json(combined / 'delivery-report.json', report)
    excluded = json.loads((PUBLIC / 'excluded-and-variants.json').read_text())
    more_excluded = json.loads((output / 'excluded-and-variants.json').read_text())
    for key in ('excluded', 'variants'): excluded[key].extend(more_excluded[key])
    save_json(combined / 'excluded-and-variants.json', excluded)
    evidence = json.loads((PUBLIC / 'browser-render-evidence.json').read_text())
    more_evidence = json.loads((output / 'browser-render-evidence.json').read_text())
    for key in ('rendered', 'failed'): evidence[key].extend(more_evidence[key])
    save_json(combined / 'browser-render-evidence.json', evidence)
    shutil.copyfile(ROOT / 'data/studio-assets/delivery-20260906/existing-asset-audit.json', combined / 'existing-asset-audit.json')
    stage(combined)
    save_json(PUBLIC / 'pbr-expansion-report.json', extra)
    save_json(ROOT / 'data/studio-assets/delivery-20260906/pbr-expansion-report.json', extra)
    shutil.copyfile(output / 'source-receipts.json', PUBLIC / 'pbr-source-receipts.json')
    # Preserve provenance. Old IDs and user data are untouched; this is append-only.
    panel = ROOT / 'src/domains/creator/StudioCc0AssetLibraryPanel.tsx'
    text = panel.read_text()
    before = '3D는 로우폴리 스타일이며,'
    after = '3D는 로우폴리와 정밀 PBR 소품을 함께 제공하며,'
    if before in text: text = text.replace(before, after)
    if after not in text: raise ValueError('Expected reviewed style-label anchor')
    panel.write_text(text)
    print('INTEGRATED PBR ORIGINALS', len(expansion['assets']), 'TOTAL', len(current['assets']), flush=True)


def self_test() -> None:
    import unittest
    class SourceBoundaryTests(unittest.TestCase):
        def test_rejects_url_substitution(self):
            for url in ('http://dl.polyhaven.org/file/ph-assets/x.jpg', 'https://dl.polyhaven.org.evil.test/x.jpg',
                        'https://user@dl.polyhaven.org/file/ph-assets/x.jpg', 'https://dl.polyhaven.org/file/ph-assets/../x.jpg',
                        'https://dl.polyhaven.org/file/ph-assets/%2e%2e/x.jpg', 'https://dl.polyhaven.org/file/ph-assets/x.jpg?token=x'):
                with self.assertRaises(ValueError): allowed_url(url)
        def test_explicit_source_host(self):
            self.assertEqual(allowed_url('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/x.jpg'), 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/x.jpg')
        def test_api_routes(self):
            self.assertTrue(allowed_url('https://api.polyhaven.com/files/GreenChair_01', True))
            with self.assertRaises(ValueError): allowed_url('https://api.polyhaven.com/users', True)
        def test_dependency_traversal(self):
            for relative in ('../secret.bin', '/secret.bin', 'textures/../../x.png', 'textures\\x.png', 'https://evil/x.png', '%2e%2e/x.png'):
                with self.assertRaises(ValueError): safe_path(Path('/tmp/curation'), relative)
        def test_dependency_within_staging(self):
            self.assertEqual(safe_path(Path('/tmp/curation'), 'textures/map.png'), Path('/tmp/curation/textures/map.png'))
        def test_variants_discovery(self):
            doc = {'gltf': {'2k': {'gltf': {'url': 'https://dl.polyhaven.org/file/ph-assets/model.gltf', 'size': 123}}}}
            rows = list(file_variants(doc, '.gltf'))
            self.assertEqual(rows[0][0], ('gltf', '2k', 'gltf'))
        def test_does_not_upscale(self):
            image = Image.new('RGB', (512, 512)); encoded = io.BytesIO(); image.save(encoded, 'PNG')
            with self.assertRaises(ValueError): native_image(encoded.getvalue())
        def test_empty_alpha(self):
            image = Image.new('RGBA', (2048, 2048)); encoded = io.BytesIO(); image.save(encoded, 'PNG')
            with self.assertRaises(ValueError): native_image(encoded.getvalue())
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SourceBoundaryTests))
    if not result.wasSuccessful(): raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acquire', type=Path)
    parser.add_argument('--integrate', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test: self_test()
    if args.acquire:
        target = args.acquire.resolve()
        if target.is_relative_to(ROOT): parser.error('Acquire outside the repository; integration is explicit')
        acquire(target)
    if args.integrate: integrate(args.integrate.resolve())
    if not any((args.self_test, args.acquire, args.integrate)): parser.error('Choose an operation')
