#!/usr/bin/env python3
"""Acquire diverse material originals from the official ambientCG API.

Technical validation is not visual approval. Existing files/IDs are never deleted.
No credentials, fonts, upsampling, paid assets, or arbitrary source hosts are used.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
import shutil
import stat
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
import urllib.request
import zipfile
from PIL import Image, ImageDraw
from acquire_studio_asset_pilot import SourceRedirects, checked_url, safe_member

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/assets/studio/cc0-20260906'
GROUPS = ('wood', 'fabric', 'brick', 'stone', 'concrete', 'metal', 'tiles', 'plaster', 'ground', 'gravel', 'leather', 'asphalt')
PER_GROUP = 3
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_BATCH_BYTES = 768 * 1024 * 1024
MAX_EXPANDED_BYTES = 1536 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, maximum: int, budget: dict) -> tuple[bytes, str]:
    checked_url(url)
    request = urllib.request.Request(url, headers={'User-Agent': 'ToonSpectrum-CC0-MaterialReview/2.0', 'Accept-Encoding': 'identity'})
    with urllib.request.build_opener(SourceRedirects()).open(request, timeout=40) as response:
        checked_url(response.url)
        size = int(response.headers.get('Content-Length', 0))
        if size > maximum or budget['downloaded'] + size > MAX_BATCH_BYTES:
            raise ValueError('declared download budget exceeded')
        data = bytearray()
        while block := response.read(256 * 1024):
            data.extend(block)
            budget['downloaded'] += len(block)
            if len(data) > maximum or budget['downloaded'] > MAX_BATCH_BYTES:
                raise ValueError('stream download budget exceeded')
        return bytes(data), response.url


def dicts(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from dicts(child)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def main() -> int:
    manifest_path = OUTPUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    assets = manifest['assets']
    existing_ids = {a['id'] for a in assets}
    existing_hashes = {a['sha256'] for a in assets}
    source_ids = {a.get('license', {}).get('sourceUrl', '').rsplit('/', 1)[-1] for a in assets}
    budget = {'downloaded': 0, 'expanded': 0}
    additions, failures, receipts = [], [], []
    with tempfile.TemporaryDirectory(prefix='studio-materials-') as scratch:
        work = Path(scratch)
        for group in GROUPS:
            api_url = 'https://ambientcg.com/api/v2/full_json?' + urlencode({'type':'Material', 'q':group, 'sort':'Popular', 'limit':10, 'include':'downloadData,tagData,displayData,dimensionsData'})
            try:
                raw, resolved = fetch(api_url, 4 * 1024 * 1024, budget)
                response = json.loads(raw)
                candidates = response.get('foundAssets')
                if not isinstance(candidates, list):
                    raise ValueError('official API missing foundAssets; keys=' + repr(list(response)[:12]))
                print('OFFICIAL_API', group, 'candidates', len(candidates), 'firstKeys', list(candidates[0]) if candidates else [], flush=True)
                received = 0
                for candidate in candidates:
                    if received >= PER_GROUP: break
                    identity = candidate.get('assetId')
                    if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9]{1,80}', identity) or identity in source_ids:
                        continue
                    identifier = 'ambientcg-' + identity.lower() + '-color'
                    if identifier in existing_ids: continue
                    options = [item for item in dicts(candidate) if isinstance(item.get('fileName'), str) and item['fileName'] == identity + '_2K-JPG.zip' and isinstance(item.get('downloadLink'), str)]
                    if not options:
                        failures.append({'source':identity, 'reason':'no-official-2K-JPG-download'})
                        continue
                    option = options[0]
                    download_url = checked_url(option['downloadLink'])
                    try:
                        archive, final_url = fetch(download_url, MAX_FILE_BYTES, budget)
                        folder = work / identity
                        folder.mkdir()
                        files = []
                        with zipfile.ZipFile(io.BytesIO(archive)) as z:
                            infos = z.infolist()
                            if len(infos) > 100 or sum(i.file_size for i in infos) > 128 * 1024 * 1024:
                                raise ValueError('archive expansion limit exceeded')
                            for info in infos:
                                member = safe_member(info.filename)
                                if stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                                    raise ValueError('unsupported archive entry')
                                if info.is_dir() or member.suffix.lower() not in {'.jpg','.jpeg','.png','.txt'}:
                                    continue
                                if info.file_size > MAX_FILE_BYTES or budget['expanded'] + info.file_size > MAX_EXPANDED_BYTES:
                                    raise ValueError('expanded batch limit exceeded')
                                if info.file_size > 1024 * 1024 and info.file_size / max(info.compress_size, 1) > 500:
                                    raise ValueError('unsafe compression ratio')
                                destination = folder.joinpath(*member.parts)
                                destination.parent.mkdir(parents=True, exist_ok=True)
                                if destination.exists(): raise ValueError('archive filename collision')
                                data = z.read(info)
                                budget['expanded'] += len(data)
                                destination.write_bytes(data)
                                files.append(destination)
                        colors = [p for p in files if re.search(r'_Color\.(jpg|jpeg|png)$',p.name,re.I)]
                        if len(colors) != 1: raise ValueError('expected one base-color original')
                        source = colors[0]
                        with Image.open(source) as image:
                            image.load()
                            width,height = image.size
                            if max(width,height) < 2048 or min(width,height) < 1024 or max(width,height) > 4096:
                                raise ValueError('native resolution outside 2K role budget')
                            converted = image.convert('RGB')
                        target_dir = OUTPUT / 'assets' / ('ambientcg-' + identity.lower())
                        target_dir.mkdir(parents=True,exist_ok=True)
                        target = target_dir / (identity.lower() + '-color.webp')
                        if target.exists(): raise ValueError('will not overwrite an existing asset')
                        buffer=io.BytesIO();converted.save(buffer,'WEBP',lossless=True,method=6)
                        data=buffer.getvalue();digest=sha(data)
                        if digest in existing_hashes:
                            failures.append({'source':identity,'reason':'duplicate-color-original'})
                            continue
                        if len(data) > 16 * 1024 * 1024: raise ValueError('image insertion size budget exceeded')
                        with Image.open(io.BytesIO(data)) as roundtrip:
                            roundtrip.load()
                            if roundtrip.size != (width,height) or roundtrip.convert('RGB').tobytes()!=converted.tobytes():
                                raise ValueError('lossless pixel roundtrip failed')
                        target.write_bytes(data)
                        companions=[]
                        for p in files:
                            if p == source or p.suffix.lower() not in {'.jpg','.jpeg','.png'}: continue
                            if not re.search(r'_(NormalGL|Roughness|Metalness|AmbientOcclusion|Displacement)\.', p.name,re.I): continue
                            with Image.open(p) as image:
                                image.load()
                                if image.size!=(width,height): raise ValueError('PBR companion dimensions mismatch')
                            destination=target_dir/p.name
                            shutil.copyfile(p,destination)
                            companions.append({'path':destination.relative_to(OUTPUT).as_posix(),'sha256':sha(destination.read_bytes())})
                        license={'id':'CC0-1.0','url':'https://creativecommons.org/publicdomain/zero/1.0/','provider':'ambientCG','sourceUrl':'https://ambientcg.com/a/'+identity,'commercialUse':True,'redistributionAllowed':True,'checkedOn':'2026-09-06'}
                        asset={'id':identifier,'name':identity+' · '+group,'kind':'surface-texture','category':'surface-material','materialFamily':group,'path':target.relative_to(OUTPUT).as_posix(),'width':width,'height':height,'maxRecommendedDisplayWidth':width,'bytes':len(data),'sha256':digest,'sourceSha256':sha(source.read_bytes()),'license':license,'technicalChecks':['decoded','native-2K','lossless-pixel-roundtrip','SHA-256','same-size-PBR-maps'],'visualReviewed':False,'studioRuntimeVerified':False,'companionMaps':companions}
                        receipt={'sourceId':identity,'metadataUrl':api_url,'metadataResponseSha256':sha(raw),'downloadUrl':download_url,'resolvedUrl':final_url,'archiveSha256':sha(archive),'bytes':len(archive),'license':license}
                        write_json(target_dir/'SOURCE.json',receipt)
                        (target_dir/'LICENSE.txt').write_text('CC0 1.0 Universal\nhttps://creativecommons.org/publicdomain/zero/1.0/\nOfficial license: https://docs.ambientcg.com/license/\nSource: '+license['sourceUrl']+'\n')
                        additions.append(asset);receipts.append(receipt);existing_ids.add(identifier);existing_hashes.add(digest);source_ids.add(identity);received+=1
                        print('ACQUIRED_NATIVE_MATERIAL',identity,group,width,height,len(data),flush=True)
                    except Exception as error:
                        failures.append({'source':identity,'reason':str(error)[:300]})
                        print('MATERIAL_REJECTED',identity,str(error)[:300],flush=True)
                    time.sleep(.75)
            except Exception as error:
                failures.append({'group':group,'reason':str(error)[:300]})
                print('GROUP_FAILED',group,str(error)[:300],flush=True)
            time.sleep(.75)
    manifest['assets'] = assets + additions
    write_json(manifest_path,manifest)
    review_pages=[]
    for start in range(0,len(additions),12):
        page=Image.new('RGB',(1600,1200),'#f2f2f4');draw=ImageDraw.Draw(page)
        for i,asset in enumerate(additions[start:start+12]):
            x,y=i%4*400,i//4*400
            with Image.open(OUTPUT/asset['path']) as original:
                image=original.convert('RGB');image.thumbnail((384,350));page.paste(image,(x+(400-image.width)//2,y+4))
            draw.text((x+8,y+358),asset['name'],fill='#15151b')
            draw.text((x+8,y+378),f"{asset['width']} x {asset['height']} | CC0 | native",fill='#55555d')
        page.save(OUTPUT/f'material-review-{start//12+1:02d}.jpg',quality=94)
        review_pages.append(page)
    if review_pages:review_pages[0].save(OUTPUT/'visual-proof-additional-materials.pdf',save_all=True,append_images=review_pages[1:],resolution=96)
    report={'addedOriginals':len(additions),'addedIds':[a['id'] for a in additions],'byFamily':dict(Counter(a['materialFamily'] for a in additions)),'downloadedBytes':budget['downloaded'],'expandedBytes':budget['expanded'],'sourceReceipts':receipts,'failures':failures,'visualApprovalCount':0,'studioRuntimeVerified':False,'productionPublished':False,'completedAt':datetime.now(timezone.utc).isoformat()}
    write_json(OUTPUT/'material-acquisition-report.json',report)
    print('MATERIAL_EXPANSION_SUMMARY',json.dumps(report,ensure_ascii=False),flush=True)
    return 0 if additions else 1


if __name__=='__main__':
    raise SystemExit(main())
