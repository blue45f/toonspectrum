#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=os.environ.get('ACESTEP_API_URL','http://127.0.0.1:8001').rstrip('/')
ACE_ROOT=pathlib.Path(os.environ.get('ACESTEP_ROOT', pathlib.Path.home()/'.cache/toonspectrum-ace-step-1.5'))
CONFIG=ROOT/'config/site-original-ost.production.json'
OUT=ROOT/'apps/web/public/audio/original'
RAW=pathlib.Path(os.environ.get('ACESTEP_RAW_DIR','/tmp/toonspectrum-ost-raw'))
OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
config=json.loads(CONFIG.read_text())
config_sha=hashlib.sha256(CONFIG.read_bytes()).hexdigest()

def file_sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''): h.update(b)
    return h.hexdigest()

def generator_provenance():
    return {
      'sourceRevision': subprocess.check_output(['git','-C',str(ACE_ROOT),'rev-parse','HEAD'],text=True).strip(),
      'ditSha256': file_sha(ACE_ROOT/'checkpoints/acestep-v15-turbo/model.safetensors'),
      'vaeSha256': file_sha(ACE_ROOT/'checkpoints/vae/diffusion_pytorch_model.safetensors'),
      'embeddingSha256': file_sha(ACE_ROOT/'checkpoints/Qwen3-Embedding-0.6B/model.safetensors'),
    }

PROV=generator_provenance()


def post(path,obj,timeout=60):
    data=json.dumps(obj,ensure_ascii=False).encode()
    req=urllib.request.Request(BASE+path,data=data,headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=timeout) as r: return json.load(r)

def lyrics_for(track):
    lines=[]
    for sec in track.get('sections',[]):
        lyrics=sec.get('lyrics') or []
        if lyrics:
            lines.append(f"[{sec['name']}]")
            lines.extend(lyrics)
    return '\n'.join(lines)

def seed_for(track_id):
    return int(hashlib.sha256(('ToonSpectrum Original OST:'+track_id).encode()).hexdigest()[:8],16) & 0x7fffffff

def prompt_for(track):
    principles='; '.join(config['sonicIdentity']['principles'])
    base=(f"{track['direction']}; {principles}; ToonSpectrum original sonic identity; recurring four-note creation motif when musically appropriate; "
          "fully original melody and harmony; do not imitate any existing artist, song, franchise theme or identifiable voice; "
          "high-fidelity studio production, cinematic depth, clean midrange, natural transients, wide but mono-compatible stereo image, controlled sub bass")
    if track['primaryVariant']=='instrumental':
        base += '; strictly instrumental only, absolutely no singing, humming, chant, spoken word or vocal chops; complete long-form arc with intro, development, contrast, climax and resolved ending'
    else:
        base += '; clear natural Korean diction; expressive original lead vocal; strong verse-to-chorus lift; memorable non-derivative hook; sing only the supplied lyrics'
    return base

def wait_job(task_id, max_wait_seconds=900):
    last=None; started=time.time()
    while True:
        if time.time()-started > max_wait_seconds:
            raise TimeoutError(f'Generation exceeded {max_wait_seconds}s for task {task_id}; check the local server before retrying.')
        time.sleep(3)
        q=post('/query_result',{'task_id_list':[task_id]})
        item=q['data'][0]; status=item.get('status')
        raw=item.get('result') or '[]'
        try: parsed=json.loads(raw) if isinstance(raw,str) else raw
        except Exception: parsed=[]
        entry=parsed[0] if isinstance(parsed,list) and parsed else {}
        stage=entry.get('stage') or ''
        progress=entry.get('progress')
        marker=(stage, round(float(progress or 0),2))
        if marker != last and (not last or marker[1] >= (last[1] if last else 0)+0.05 or stage != (last[0] if last else '')):
            print(f"  {stage or 'working'} {float(progress or 0)*100:.0f}% ({time.time()-started:.0f}s)",flush=True); last=marker
        if status==1: return entry
        if status not in (0,None): raise RuntimeError(f"job failed status={status}: {item}")

def download_file(file_url,dest):
    url=file_url if file_url.startswith('http') else BASE+file_url
    with urllib.request.urlopen(url,timeout=180) as r:
        dest.write_bytes(r.read())

def run(cmd):
    return subprocess.check_output(cmd,text=True,stderr=subprocess.STDOUT)

def probe(path):
    data=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration,bit_rate:stream=codec_name,sample_rate,channels,channel_layout','-of','json',str(path)]))
    stream=data['streams'][0]; fmt=data['format']
    return {'codec':stream.get('codec_name'),'sampleRate':int(stream.get('sample_rate') or 0),'channels':int(stream.get('channels') or 0),'channelLayout':stream.get('channel_layout'),'durationSeconds':float(fmt.get('duration') or 0),'bitRate':int(fmt.get('bit_rate') or 0)}

def loudness(path):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-filter_complex','ebur128=peak=true','-f','null','-'],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=True)
    text=p.stdout
    # Use final summary occurrences.
    mi=list(re.finditer(r'\n\s*I:\s*(-?\d+(?:\.\d+)?) LUFS',text))
    mp=list(re.finditer(r'\n\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS',text))
    mlra=list(re.finditer(r'\n\s*LRA:\s*(\d+(?:\.\d+)?) LU',text))
    return {'integratedLufs':float(mi[-1].group(1)) if mi else None,'truePeakDbfs':float(mp[-1].group(1)) if mp else None,'loudnessRangeLu':float(mlra[-1].group(1)) if mlra else None}

def master(raw,out,track):
    bitrate=int(track.get('deliveryBitrateKbps',192))
    if bitrate not in (192,256,320): raise ValueError('Unsupported MP3 bitrate')
    target='loudnorm=I=-14:TP=-1.5:LRA=11'
    first=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(raw),'-af',target+':print_format=json','-f','null','-'],text=True,capture_output=True,check=True)
    blocks=re.findall(r'\{\s*"input_i".*?\}',first.stderr,re.S)
    if not blocks: raise RuntimeError('Missing first-pass loudness measurements')
    measured=json.loads(blocks[-1])
    for key in ['input_i','input_tp','input_lra','input_thresh','target_offset']:
        if not math.isfinite(float(measured[key])): raise RuntimeError('Silent or invalid source audio')
    filt=(target+f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
          +f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
          +f":offset={measured['target_offset']}:linear=true:print_format=json")
    cmd=['ffmpeg','-y','-hide_banner','-nostats','-i',str(raw),'-af',filt,
         '-ar','48000','-ac','2','-codec:a','libmp3lame','-b:a',f'{bitrate}k','-id3v2_version','3',
         '-metadata',f"title={track['title']}",'-metadata',f"artist={config['artist']}",'-metadata',f"album={config['collection']}",
         '-metadata','comment=Original ToonSpectrum soundtrack generated locally with ACE-Step 1.5; see provenance sidecar.',str(out)]
    encoded=subprocess.run(cmd,text=True,capture_output=True,check=True)
    final_blocks=re.findall(r'\{\s*"input_i".*?\}',encoded.stderr,re.S)
    normalized=json.loads(final_blocks[-1]) if final_blocks else {}
    return {'sourceFormat':'flac','deliveryFormat':f'mp3_48000_{bitrate}','targetIntegratedLufs':-14,
            'targetTruePeakDbfs':-1.5,'targetLoudnessRangeLu':11,'passes':2,
            'linearNormalizationRequested':True,'normalizationType':normalized.get('normalization_type','unknown'),
            'ffmpegFilter':filt,'firstPass':measured}

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''): h.update(b)
    return h.hexdigest()

def generate(track, force=False, approve=False, keep_source=False):
    variant=track['primaryVariant']; duration=track['durationMs']/1000; seed=seed_for(track['id'])
    raw=RAW/f"{track['id']}-{variant}.flac"; out=OUT/f"{track['id']}-{variant}.mp3"; side=OUT/f"{track['id']}-{variant}.json"
    if out.exists() and side.exists() and not force:
        print('SKIP',track['id'],'already exists',flush=True); return
    payload={'prompt':prompt_for(track),'lyrics':lyrics_for(track) if variant=='vocal' else '', 'thinking':False,'model':'acestep-v15-turbo',
             'bpm':track['bpm'],'key_scale':track.get('keyScale',''),'time_signature':'4','use_cot_caption':False,'use_cot_language':False,'vocal_language':track['language'] if variant=='vocal' else 'unknown','audio_duration':duration,
             'batch_size':1,'use_random_seed':False,'seed':seed,'inference_steps':8,'guidance_scale':1.0,'audio_format':'flac','task_type':'text2music','use_format':False}
    print(f"START {track['id']} {variant} {duration:.0f}s seed={seed}",flush=True)
    submit=post('/release_task',payload); task=submit['data']['task_id']
    entry=wait_job(task)
    file_url=entry.get('file')
    if not file_url: raise RuntimeError(f"missing file url: {entry}")
    download_file(file_url,raw)
    raw_sha=sha(raw)
    master_info=master(raw,out,track)
    info=probe(out); loud=loudness(out)
    target=duration
    qc=(info['codec']=='mp3' and info['sampleRate']==48000 and info['channels']==2 and abs(info['durationSeconds']-target)<=2.5 and
        info['bitRate']>=180000 and loud['integratedLufs'] is not None and -15.5<=loud['integratedLufs']<=-12.5 and
        loud['truePeakDbfs'] is not None and loud['truePeakDbfs']<=-0.5)
    if not qc: raise RuntimeError(f"QC failed for {track['id']}: {info} {loud}")
    meta={'schemaVersion':2,'trackId':track['id'],'variant':variant,'provider':'ace-step','model':'acestep-v15-turbo',
          'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'durationMs':track['durationMs'],'bpm':track['bpm'],'seed':seed,
          'sha256':sha(out),'sourceFlacSha256':raw_sha,'configSha256':config_sha,
          'generator':{'project':'ACE-Step 1.5','sourceRevision':PROV['sourceRevision'],'license':'MIT','sourceUrl':'https://github.com/ace-step/ACE-Step-1.5',
                       'ditSha256':PROV['ditSha256'],'vaeSha256':PROV['vaeSha256'],'embeddingSha256':PROV['embeddingSha256']},
          'mastering':master_info,
          'quality':{**info,**loud,'fileBytes':out.stat().st_size,'automatedQcPassed':True},
          'review':{'ownerReleaseRequested':approve,'creativeDirectionRecorded':True,'rightsPromptNonImitation':True,'subjectiveListeningReview':'not-performed-by-assistant','approvedForSite':approve}}
    side.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    if not keep_source: raw.unlink(missing_ok=True)
    else: print(f'LOSSLESS SOURCE {raw}',flush=True)
    print(f"DONE {track['id']} {info['durationSeconds']:.1f}s {loud['integratedLufs']:.1f} LUFS peak {loud['truePeakDbfs']:.1f} dBFS {meta['sha256'][:12]}",flush=True)

def main():
    parser=argparse.ArgumentParser(description='Generate ToonSpectrum OST masters with a local ACE-Step 1.5 API server.')
    parser.add_argument('--track', action='append', default=[], help='Track id to generate; repeat for multiple tracks.')
    parser.add_argument('--all', action='store_true', help='Generate all primary masters.')
    parser.add_argument('--keep-source', action='store_true', help='Keep the original 48 kHz FLAC outside the repository for archival and editing.')
    parser.add_argument('--force', action='store_true', help='Replace existing audio and sidecar files.')
    parser.add_argument('--approve-generated', action='store_true', help='Mark generated sidecars approved for site publication.')
    args=parser.parse_args()
    if args.all and args.track: parser.error('Use --all or --track, not both.')
    selected=config['tracks'] if args.all else [t for t in config['tracks'] if t['id'] in set(args.track)]
    if not selected: parser.error('Select --all or at least one valid --track id.')
    missing=set(args.track)-{t['id'] for t in selected}
    if missing: parser.error('Unknown track id(s): '+', '.join(sorted(missing)))
    for track in selected: generate(track, force=args.force, approve=args.approve_generated, keep_source=args.keep_source)
    print(f'Generated {len(selected)} primary master(s). Run the Node publisher after reviewing sidecars.', flush=True)

if __name__ == '__main__':
    main()
