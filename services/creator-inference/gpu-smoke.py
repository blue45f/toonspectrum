"""Explicit real-inference acceptance check; never runs in CPU CI or substitutes mocks."""
import argparse, base64, hashlib, json, os, subprocess, time, uuid
from pathlib import Path
import httpx

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--image',required=True,type=Path);p.add_argument('--url',default='http://127.0.0.1:8090');p.add_argument('--output',required=True,type=Path);p.add_argument('--allow-generation',action='store_true');a=p.parse_args()
 if not a.allow_generation:p.error('This runs three actual models and consumes GPU resources; use --allow-generation explicitly')
 token=os.environ.get('CREATOR_INFERENCE_TOKEN','')
 if len(token)<32:p.error('Set CREATOR_INFERENCE_TOKEN using the secret manager')
 a.output.mkdir(parents=True,exist_ok=False)
 checks=[]
 with httpx.Client(base_url=a.url,headers={'Authorization':'Bearer '+token,'x-creator-owner':'acceptance-'+uuid.uuid4().hex},timeout=30,follow_redirects=False) as client:
  def send(method,path,**kw):
   r=client.request(method,path,**kw);r.raise_for_status();return r
  caps=send('GET','/capabilities').json()
  if not caps['enabled'] or not all(caps['engines'][k]['configured'] for k in ['image-to-video','image-to-3d','model-to-2d']):raise RuntimeError('All three real engines must be configured and enabled')
  def upload(path,mime):
   data=path.read_bytes();u=send('POST','/uploads',json={'mime':mime,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}).json()
   for n in range(u['chunks']):send('PUT',f"/uploads/{u['id']}/chunks/{n}",json={'data':base64.b64encode(data[n*1048576:(n+1)*1048576]).decode()})
   send('POST',f"/uploads/{u['id']}/complete");return u['id']
  image=upload(a.image,'image/png')
  def generate(mode,asset):
   start=time.monotonic();job=send('POST','/jobs',headers={'Idempotency-Key':uuid.uuid4().hex},json={'mode':mode,'assets':[asset],'prompt':'Gentle natural movement, preserve character appearance. Clean Korean webtoon illustration.','frames':33,'steps':20,'seed':42}).json()
   while job['state'] in {'queued','running'}:
    if time.monotonic()-start>3900:send('POST',f"/jobs/{job['id']}/cancel");raise TimeoutError('Acceptance job exceeded deadline')
    time.sleep(3);job=send('GET',f"/jobs/{job['id']}").json()
   if job['state']!='succeeded':raise RuntimeError(f"{mode}: {job['state']} {job['error']}")
   directory=a.output/mode;directory.mkdir()
   for entry in job['artifacts']:
    data=send('GET',f"/jobs/{job['id']}/artifacts/{entry['name']}").content
    if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Actual output integrity failure')
    (directory/entry['name']).write_bytes(data)
   checks.append({'mode':mode,'seconds':time.monotonic()-start,'job':job,'source':'REAL INFERENCE, not a test double'})
   print(mode,'real outputs received',flush=True);return directory
  video=generate('image-to-video',image)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,width,height','-of','json',str(video/'animation.mp4')]))
  stream=probe['streams'][0]
  if int(stream['nb_read_frames'])!=33 or stream['width']!=832 or stream['height']!=480:raise RuntimeError('Unexpected generated video dimensions/frame count')
  checks[0]['ffprobe']=probe
  mesh=generate('image-to-3d',image)
  glb=upload(mesh/'character.glb','model/gltf-binary')
  generate('model-to-2d',glb)
 (a.output/'acceptance.json').write_text(json.dumps({'checks':checks,'visualQualityAccepted':False,'manualReviewRequired':['source identity','temporal consistency','hidden mesh surfaces','pose preservation','artifacts','latency/VRAM budgets']},indent=2))
 print('Three actual model paths completed. Human visual acceptance remains required; inspect acceptance.json and generated artifacts.')
if __name__=='__main__':main()
