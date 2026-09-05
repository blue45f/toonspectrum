#!/usr/bin/env python3
"""Acquire a bounded curated set of official Poly Haven CC0 originals.

No live API is shipped to the browser. A downloaded asset is not artistically
approved until its actual renders have been reviewed. Never writes user storage.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
from PIL import Image
from studio_asset_delivery import gltf_to_glb, read_glb, geometry_key, save_json, slug

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = 'ToonStudio-AssetCuration/2.0 (blue45f/toonspectrum; offline-CC0-library)'
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 640 * 1024 * 1024
MAX_MODEL = 40 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 32 * 1024 * 1024
ALLOWED = {'api.polyhaven.com', 'dl.polyhaven.org'}
MODEL_NAMES = {
 'modern_arm_chair_01':'패브릭 암체어', 'outdoor_table_chair_set_01':'야외 테이블·의자 세트',
 'GreenChair_01':'그린 빈티지 의자', 'Lantern_01':'휴대용 랜턴',
 'wooden_table_02':'원목 테이블', 'tea_set_01':'찻잔 세트',
 'potted_plant_02':'화분 식물 02', 'potted_plant_04':'화분 식물 04',
 'fern_02':'고사리', 'potted_plant_01':'화분 식물 01', 'street_lamp_01':'가로등',
 'modern_ceiling_lamp_01':'현대식 천장 조명', 'desk_lamp_arm_01':'관절 데스크 램프',
 'sofa_02':'소파 02', 'sofa_03':'소파 03', 'Sofa_01':'소파 01',
 'decorative_book_set_01':'장식용 책 세트', 'book_encyclopedia_set_01':'백과사전 세트',
 'steel_frame_shelves_01':'철제 프레임 선반', 'wine_bottles_01':'유리병 세트',
 'food_apple_01':'사과', 'brass_goblets':'황동 고블릿',
 'wooden_bowl_01':'나무 그릇 01', 'wooden_bowl_02':'나무 그릇 02',
 'brass_pan_01':'황동 팬', 'brass_pot_02':'황동 냄비', 'planter_pot_clay':'토분',
 'Barrel_01':'금속 드럼통', 'Barrel_02':'플라스틱 드럼통', 'wine_barrel_01':'나무 오크통',
 'modular_street_seating':'모듈형 거리 벤치', 'bench_vice_01':'작업대 바이스',
 'painted_wooden_bench':'도장 원목 벤치', 'GothicCabinet_01':'고딕 수납장',
 'vintage_cabinet_01':'빈티지 수납장', 'painted_wooden_cabinet':'도장 원목 수납장',
}
TERMS = {'wood':'나무','fabric':'직물','brick':'벽돌','metal':'금속','plaster':'미장',
 'asphalt':'아스팔트','concrete':'콘크리트','stone':'석재','leather':'가죽',
 'tile':'타일','paper':'종이','ground':'지면'}


def safe_url(url: str) -> str:
    u = urlsplit(url)
    if u.scheme != 'https' or u.hostname not in ALLOWED or u.username or u.password or u.port or u.fragment:
        raise ValueError('unapproved source URL')
    return url


class Redirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Downloader:
    def __init__(self):
        self.total = 0
        self.opener = build_opener(Redirects())

    def read(self, url: str, limit: int, expected: dict | None = None) -> bytes:
        safe_url(url)
        time.sleep(0.2)
        with self.opener.open(Request(url, headers={'User-Agent':USER_AGENT}), timeout=45) as response:
            safe_url(response.url)
            declared = response.headers.get('Content-Length')
            if declared and int(declared) > limit: raise ValueError('declared file exceeds budget')
            result = bytearray()
            while True:
                chunk = response.read(min(128*1024, limit+1-len(result)))
                if not chunk: break
                result.extend(chunk); self.total += len(chunk)
                if len(result)>limit or self.total>MAX_TOTAL: raise ValueError('download budget exceeded')
        raw = bytes(result)
        if expected:
            if expected.get('size') != len(raw): raise ValueError('source length mismatch')
            md5 = str(expected.get('md5','')).lower()
            # The upstream metadata occasionally omits leading zeroes.
            if not re.fullmatch(r'[0-9a-f]{1,32}',md5) or hashlib.md5(raw,usedforsecurity=False).hexdigest() != md5.zfill(32):
                raise ValueError('source checksum mismatch')
        return raw

    def metadata(self, identifier: str) -> dict:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',identifier): raise ValueError('invalid source identifier')
        return json.loads(self.read('https://api.polyhaven.com/files/'+identifier, 8*1024*1024))


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def category(item: dict) -> str:
    value = item.get('category','').lower()
    if value.startswith('nature/'): return 'nature'
    if value.startswith('food & kitchen/'): return 'food'
    if value.startswith('lighting/'): return 'lighting'
    if value.startswith(('office & stationery/', 'decor & art/')): return 'daily-prop'
    if value.startswith(('containers & storage/','tools & equipment/')): return 'outdoor-prop'
    return 'furniture'


def license_for(identifier: str) -> dict:
    return {'id':'CC0-1.0','url':'https://creativecommons.org/publicdomain/zero/1.0/',
      'provider':'Poly Haven','sourceUrl':'https://polyhaven.com/a/'+identifier,
      'commercialUse':True,'redistributionAllowed':True,'checkedOn':'2026-09-06'}


def local_file(root: Path, relative: str) -> Path:
    if '\\' in relative or '%' in relative or urlsplit(relative).scheme:
        raise ValueError('unsafe dependency path')
    p = PurePosixPath(relative)
    if p.is_absolute() or any(part in ('..','.') for part in p.parts): raise ValueError('unsafe dependency path')
    target = root.joinpath(*p.parts).resolve()
    if not target.is_relative_to(root.resolve()) or target.suffix.lower() not in {'.gltf','.bin','.png','.jpg','.jpeg'}:
        raise ValueError('unsupported dependency path')
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def acquire(output: Path) -> None:
    output.mkdir(parents=True,exist_ok=True)
    candidates=json.loads((ROOT/'docs/reports/asset-visual-review-20260906/polyhaven-candidates.json').read_text())
    if len(candidates['models'])>40 or len(candidates['textures'])>40: raise ValueError('candidate plan exceeds reviewed scope')
    dl=Downloader(); assets=[]; failures=[]; hashes=set()
    with tempfile.TemporaryDirectory(prefix='studio-pbr-') as temporary:
        scratch=Path(temporary)
        for kind in ('models','textures'):
            for item in candidates[kind]:
                identifier=item['id']; asset_id='polyhaven-'+slug(identifier)
                folder=output/'assets'/asset_id; folder.mkdir(parents=True,exist_ok=True)
                rights=license_for(identifier); receipts=[]
                try:
                    files=dl.metadata(identifier)
                    save_json(folder/'SOURCE.json',{'license':rights,'metadataEndpoint':'https://api.polyhaven.com/files/'+identifier,'apiCredit':'Poly Haven','candidate':item})
                    if kind=='models':
                        entry=files.get('gltf',{}).get('2k',{}).get('gltf')
                        if not isinstance(entry,dict): raise ValueError('no native 2K glTF rendition')
                        dependencies=entry.get('include',{})
                        if not isinstance(dependencies,dict) or len(dependencies)>48: raise ValueError('dependency budget exceeded')
                        entries=[entry,*dependencies.values()]
                        if any(type(e.get('size')) is not int or not 0<e['size']<=MAX_FILE for e in entries):
                            raise ValueError('invalid or oversized source file')
                        if sum(e['size'] for e in entries)>MAX_MODEL: raise ValueError('2K model exceeds interactive size budget')
                        source_root=scratch/asset_id; source_root.mkdir()
                        source=source_root/'model.gltf'; raw=dl.read(entry['url'],MAX_FILE,entry); source.write_bytes(raw)
                        receipts.append({'url':entry['url'],'bytes':len(raw),'sha256':sha(raw)})
                        for relative,dependency in dependencies.items():
                            target=local_file(source_root,relative)
                            if target.exists(): raise ValueError('duplicate source path')
                            raw=dl.read(dependency['url'],MAX_FILE,dependency);target.write_bytes(raw)
                            receipts.append({'path':relative,'url':dependency['url'],'bytes':len(raw),'sha256':sha(raw)})
                        gltf=json.loads(source.read_text())
                        for row in [*gltf.get('buffers',[]),*gltf.get('images',[])]:
                            if 'uri' in row and not local_file(source_root,row['uri']).is_file(): raise ValueError('missing glTF dependency')
                        target=folder/(slug(identifier)+'.glb');gltf_to_glb(source,target)
                        raw=target.read_bytes(); doc,binary=read_glb(raw)
                        if len(raw)>MAX_MODEL or not doc.get('meshes'): raise ValueError('invalid final model budget or geometry')
                        if any('uri' in i for i in doc.get('images',[])): raise ValueError('external texture survived packaging')
                        geometric_hash=geometry_key(doc,binary)
                        if sha(raw) in hashes: raise ValueError('duplicate final file')
                        hashes.add(sha(raw))
                        asset={'id':asset_id,'name':MODEL_NAMES.get(identifier,item['name']),
                          'originalName':item['name'],'kind':'model','category':category(item),'style':'pbr-detailed',
                          'path':target.relative_to(output).as_posix(),'bytes':len(raw),'sha256':sha(raw),
                          'geometrySha256':geometric_hash,'sourceTextureResolution':'2k',
                          'technicalChecks':['source-size-and-checksum','self-contained-GLB','finite-positions','accessor-bounds'],
                          'license':rights,'visualReviewed':False,'studioRuntimeVerified':False}
                    else:
                        diffuse=next((files.get(k,{}).get('2k',{}).get('jpg') for k in ('diff','Diffuse','albedo','color') if files.get(k,{}).get('2k',{}).get('jpg')),None)
                        if not diffuse: raise ValueError('no native 2K diffuse map')
                        raw=dl.read(diffuse['url'],MAX_FILE,diffuse)
                        with Image.open(io.BytesIO(raw)) as image:
                            image.load(); image=image.convert('RGB')
                            if min(image.size)<2048: raise ValueError('not native 2K resolution')
                            width,height=image.size
                            target=folder/(slug(identifier)+'-diffuse.webp');image.save(target,'WEBP',lossless=True,method=6)
                        receipts.append({'url':diffuse['url'],'bytes':len(raw),'sha256':sha(raw)})
                        maps={}
                        for key,label in [('nor_gl','normal'),('rough','roughness'),('disp','displacement'),('arm','ao-roughness-metallic')]:
                            entry=files.get(key,{}).get('2k',{}).get('jpg')
                            if not entry: continue
                            raw=dl.read(entry['url'],MAX_FILE,entry)
                            with Image.open(io.BytesIO(raw)) as image:
                                image.load()
                                if image.size!=(width,height): raise ValueError('PBR map dimension mismatch')
                            map_path=folder/(slug(identifier)+'-'+label+'.jpg');map_path.write_bytes(raw)
                            maps[label]={'path':map_path.relative_to(output).as_posix(),'bytes':len(raw),'sha256':sha(raw)}
                            receipts.append({'url':entry['url'],'bytes':len(raw),'sha256':sha(raw)})
                        if not maps.get('normal') or not maps.get('roughness'):
                            raise ValueError('missing normal or roughness map')
                        raw=target.read_bytes()
                        if sha(raw) in hashes: raise ValueError('duplicate final file')
                        hashes.add(sha(raw))
                        asset={'id':asset_id,'name':TERMS.get(item['selectionTerm'],'재질')+' · '+item['name'],
                          'originalName':item['name'],'kind':'surface-texture','category':'surface-material','style':'pbr-detailed',
                          'path':target.relative_to(output).as_posix(),'width':width,'height':height,
                          'bytes':len(raw),'sha256':sha(raw),'pbrMaps':maps,'sourceTextureResolution':'2k',
                          'technicalChecks':['source-size-and-checksum','native-2K','decoded-PBR-maps'],
                          'license':rights,'visualReviewed':False,'studioRuntimeVerified':False}
                    save_json(folder/'SOURCE.json',{'license':rights,'apiCredit':'Poly Haven','candidate':item,'files':receipts})
                    assets.append(asset);print('PBR ACQUIRED',kind,asset_id,asset['bytes'],flush=True)
                except Exception as error:
                    failures.append({'id':asset_id,'reason':str(error)});print('PBR EXCLUDED',asset_id,str(error),flush=True)
                    # This per-run staging folder has no existing or user-owned contents.
                    import shutil
                    shutil.rmtree(folder)
                if dl.total>=MAX_TOTAL: break
    save_json(output/'manifest.json',{'schema':'toonspectrum.asset-delivery.v1','assets':assets})
    save_json(output/'delivery-report.json',{'deliveredOriginals':len(assets),'downloadedBytes':dl.total,'failures':failures,'visualReviewed':False})
    print('PBR ACQUISITION COMPLETE',len(assets),'failures',len(failures),'downloaded',dl.total,flush=True)
    if not assets: raise ValueError('no assets acquired')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    output=args.output.resolve()
    if output==ROOT or output.is_relative_to(ROOT/'public'): parser.error('use an empty staging directory outside public/')
    if output.exists() and any(output.iterdir()): parser.error('staging directory must be empty')
    acquire(output)
