"""Strict, dependency-light contracts shared by API and subprocess admission."""
from __future__ import annotations
import base64, hashlib, io, json, math, re, struct
from pathlib import Path
from PIL import Image, ImageOps

CHUNK_SIZE = 1024 * 1024
MAX_UPLOAD = 32 * CHUNK_SIZE
MODES = {'image-to-video', 'image-to-3d', 'model-to-2d'}
MIMES = {'image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary'}
ID = re.compile(r'^[a-f0-9]{32}$')
HEX = re.compile(r'^[a-f0-9]{64}$')
Image.MAX_IMAGE_PIXELS = 16_000_000

def identifier(value):
    if not isinstance(value, str) or not ID.fullmatch(value): raise ValueError('Invalid resource identifier')
    return value

def integer(value, lo, hi, name):
    if isinstance(value, bool) or not isinstance(value, int) or not lo <= value <= hi: raise ValueError(f'Invalid {name}')
    return value

def finite(value, lo, hi, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi: raise ValueError(f'Invalid {name}')
    return value

def text(value, limit, name):
    if not isinstance(value, str) or len(value) > limit: raise ValueError(f'Invalid {name}')
    return value.strip()

def validate_upload(value):
    if not isinstance(value, dict) or set(value) != {'mime', 'bytes', 'sha256'}: raise ValueError('Invalid upload contract')
    if value['mime'] not in MIMES: raise ValueError('Only PNG/JPEG/WebP/embedded GLB are supported')
    size = integer(value['bytes'], 1, MAX_UPLOAD if value['mime'] == 'model/gltf-binary' else 8 * CHUNK_SIZE, 'upload size')
    if not isinstance(value['sha256'], str) or not HEX.fullmatch(value['sha256']): raise ValueError('Invalid SHA-256')
    return {'mime': value['mime'], 'bytes': size, 'sha256': value['sha256']}

def decode_chunk(value):
    if not isinstance(value, dict) or set(value) != {'data'} or not isinstance(value['data'], str) or len(value['data']) > 4 * ((CHUNK_SIZE + 2) // 3): raise ValueError('Invalid upload chunk')
    data = base64.b64decode(value['data'], validate=True)
    if not data or len(data) > CHUNK_SIZE: raise ValueError('Chunk size exceeded')
    return data

def validate_job(value):
    if not isinstance(value, dict) or set(value) - {'mode', 'assets', 'prompt', 'negativePrompt', 'seed', 'frames', 'steps', 'strength', 'captions', 'yaw'}: raise ValueError('Unknown inference option')
    mode = value.get('mode')
    if mode not in MODES: raise ValueError('Unsupported inference mode')
    assets = value.get('assets')
    if not isinstance(assets, list) or not 1 <= len(assets) <= (8 if mode == 'image-to-video' else 1): raise ValueError('Invalid asset count')
    assets = [identifier(v) for v in assets]
    if len(set(assets)) != len(assets): raise ValueError('Duplicate asset')
    prompt = text(value.get('prompt', ''), 2000, 'prompt')
    if mode != 'image-to-3d' and not prompt: raise ValueError('A prompt is required')
    frames = integer(value.get('frames', 49), 17, 81, 'frame count')
    if (frames - 1) % 4: raise ValueError('Video frames must equal 4n+1')
    captions = value.get('captions', [''] * len(assets))
    if not isinstance(captions, list) or len(captions) != len(assets): raise ValueError('Caption count must match assets')
    return {'mode': mode, 'assets': assets, 'prompt': prompt, 'negativePrompt': text(value.get('negativePrompt', ''), 2000, 'negative prompt'), 'seed': integer(value.get('seed', 42), 0, 2**31-1, 'seed'), 'frames': frames, 'steps': integer(value.get('steps', 30), 10, 50, 'steps'), 'strength': finite(value.get('strength', .45), .15, .85, 'strength'), 'captions': [text(v, 800, 'caption') for v in captions], 'yaw': finite(value.get('yaw', 0), -180, 180, 'view angle')}

def validate_glb(path: Path):
    data = path.read_bytes()
    if len(data) < 20 or len(data) > MAX_UPLOAD: raise ValueError('Invalid GLB length')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data): raise ValueError('GLB header is invalid')
    offset = 12; document = None; index = 0
    while offset < length:
        if offset + 8 > length: raise ValueError('Truncated GLB chunk')
        size, kind = struct.unpack_from('<II', data, offset); offset += 8
        if not size or size % 4 or offset + size > length: raise ValueError('Invalid GLB chunk size')
        if index == 0:
            if kind != 0x4e4f534a: raise ValueError('GLB must begin with JSON')
            document = json.loads(data[offset:offset+size])
        elif kind != 0x004e4942 or index > 1: raise ValueError('Unsupported GLB chunk')
        offset += size; index += 1
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0' or not document.get('meshes'): raise ValueError('A glTF 2.0 mesh is required')
    def inspect(value, depth=0):
        if depth > 40: raise ValueError('GLB nesting limit exceeded')
        if isinstance(value, dict):
            for key, entry in value.items():
                if key.lower() in {'uri', 'url'} and (not isinstance(entry, str) or not re.fullmatch(r'data:(?:image/(?:png|jpeg|webp)|application/octet-stream);base64,[A-Za-z0-9+/=]+', entry)): raise ValueError('External/local GLB references are forbidden')
                inspect(entry, depth+1)
        elif isinstance(value, list):
            if len(value) > 100000: raise ValueError('GLB array limit exceeded')
            for entry in value: inspect(entry, depth+1)
    inspect(document)
    return document

def normalize_image(source: Path, destination: Path):
    with Image.open(source) as image:
        if image.format not in {'PNG', 'JPEG', 'WEBP'} or image.width * image.height > 16_000_000 or getattr(image, 'is_animated', False): raise ValueError('Unsupported image dimensions or animation')
        image = ImageOps.exif_transpose(image).convert('RGBA')
        image.thumbnail((2048, 2048))
        image.save(destination, format='PNG')

def fingerprint(value): return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
