"""Single-worker durable inference gateway. Never substitute a mock for real inference.
Run one uvicorn process per DATA_DIR. Worker/model network access is not required after setup.
"""
from __future__ import annotations
import asyncio, fcntl, hashlib, hmac, json, math, os, re, shutil, signal, sqlite3, subprocess, sys, threading, time, uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import urlsplit
from fastapi.responses import FileResponse, JSONResponse, Response
from contracts import CHUNK_SIZE, MAX_UPLOAD, identifier, validate_upload, decode_chunk, validate_job, validate_glb, normalize_image, fingerprint

TERMINAL = {'succeeded', 'failed', 'cancelled', 'interrupted'}
MIME = {'.mp4':'video/mp4', '.glb':'model/gltf-binary', '.png':'image/png', '.json':'application/json', '.srt':'application/x-subrip'}
class Runtime:
    def __init__(self, directory: Path, token: str, runner=None, capability_reader=None):
        if len(token) < 32: raise ValueError('CREATOR_INFERENCE_TOKEN must have at least 32 characters')
        self.root = directory.resolve(); self.root.mkdir(parents=True, exist_ok=True)
        self.lease = (self.root / '.worker.lock').open('a')
        try:fcntl.flock(self.lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:self.lease.close();raise RuntimeError('Another inference runtime owns this data directory')
        self.active_job = None
        self.token = token; self.lock = threading.RLock(); self.wake = threading.Event(); self.stopping = threading.Event(); self.thread = None
        self.runner = runner or self.run_process; self.capability_reader = capability_reader
        self.db = sqlite3.connect(self.root / 'jobs.sqlite3', check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,spec TEXT NOT NULL,state TEXT NOT NULL,created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,idem TEXT NOT NULL,fingerprint TEXT NOT NULL,request TEXT NOT NULL,state TEXT NOT NULL,created REAL NOT NULL,updated REAL NOT NULL,progress INTEGER NOT NULL DEFAULT 0,stage TEXT NOT NULL DEFAULT 'queued',error TEXT,artifacts TEXT NOT NULL DEFAULT '[]',UNIQUE(owner,idem));''')
        self.db.execute("UPDATE jobs SET state='interrupted',stage='interrupted',error='Worker restarted. Submit a new job explicitly.',updated=? WHERE state='running'", (time.time(),)); self.db.commit()
    def capabilities(self):
        if self.capability_reader: return self.capability_reader()
        from engines import capabilities
        return capabilities()
    def authenticate(self, request):
        supplied=request.headers.get('authorization','')
        if not hmac.compare_digest(supplied, 'Bearer '+self.token): raise HTTPException(401, 'Unauthorized')
        owner=request.headers.get('x-creator-owner','')
        if not re.fullmatch(r'[A-Za-z0-9_:@.\-]{1,128}',owner): raise HTTPException(400,'Invalid owner')
        return owner
    def row(self, table, resource, owner):
        identifier(resource)
        with self.lock: row=self.db.execute(f'SELECT * FROM {table} WHERE id=? AND owner=?',(resource,owner)).fetchone()
        if not row or (table=='jobs' and row['state']=='deleted'): raise HTTPException(404,'Resource not found')
        return dict(row)
    def public(self, row):
        return {key:row[key] for key in ['id','state','created','updated','progress','stage','error']} | {'mode':json.loads(row['request'])['mode'], 'artifacts':json.loads(row['artifacts'])}
    def update(self, job, **fields):
        if set(fields)-{'state','progress','stage','error','artifacts'}: raise ValueError('Invalid update')
        with self.lock:
            self.db.execute('UPDATE jobs SET '+','.join(key+'=?' for key in fields)+',updated=? WHERE id=?',(*fields.values(),time.time(),job));self.db.commit()
    def cancelled(self, job):
        with self.lock: row=self.db.execute('SELECT state FROM jobs WHERE id=?',(job,)).fetchone()
        return self.stopping.is_set() or not row or row['state']=='cancelled'
    def create_upload(self, owner, spec):
        spec=validate_upload(spec)
        with self.lock:
            pending=self.db.execute("SELECT COUNT(*) FROM uploads WHERE owner=? AND state='uploading'",(owner,)).fetchone()[0]
            if pending>=16: raise HTTPException(429,'Too many incomplete uploads; delete unused uploads')
            total=sum(json.loads(row[0])['bytes'] for row in self.db.execute('SELECT spec FROM uploads WHERE owner=?',(owner,)).fetchall())
            if total+spec['bytes']>256*CHUNK_SIZE:raise HTTPException(429,'Upload quota exceeded; delete unused uploads')
            if shutil.disk_usage(self.root).free < 2*1024**3: raise HTTPException(507,'Insufficient worker storage')
            resource=uuid.uuid4().hex;(self.root/resource).mkdir()
            self.db.execute('INSERT INTO uploads VALUES(?,?,?,?,?)',(resource,owner,json.dumps(spec),'uploading',time.time()));self.db.commit()
        return {'id':resource,'chunkBytes':CHUNK_SIZE,'chunks':math.ceil(spec['bytes']/CHUNK_SIZE)}
    def chunk(self, owner, resource, index, body):
        data=decode_chunk(body)
        with self.lock:
            row=self.row('uploads',resource,owner);spec=json.loads(row['spec']);count=math.ceil(spec['bytes']/CHUNK_SIZE)
            if row['state']!='uploading' or not 0<=index<count: raise HTTPException(409,'Upload is not writable')
            expected=min(CHUNK_SIZE,spec['bytes']-index*CHUNK_SIZE)
            if len(data)!=expected: raise ValueError('Chunk length does not match upload')
            path=self.root/resource/f'{index}.part'
            if path.exists():
                if path.read_bytes()!=data: raise HTTPException(409,'Chunk already exists with different content')
                return {'ok':True}
            tmp=path.with_suffix('.tmp');tmp.write_bytes(data);tmp.replace(path)
        return {'ok':True}
    def complete_upload(self, owner, resource):
        with self.lock:
            row=self.row('uploads',resource,owner);spec=json.loads(row['spec']);directory=self.root/resource
            if row['state']=='ready': return {'id':resource,'state':'ready'}
            digest=hashlib.sha256();target=directory/'input.tmp'
            with target.open('wb') as output:
                for i in range(math.ceil(spec['bytes']/CHUNK_SIZE)):
                    part=directory/f'{i}.part'
                    if not part.exists(): raise HTTPException(409,'Upload is incomplete')
                    data=part.read_bytes();digest.update(data);output.write(data)
            if target.stat().st_size!=spec['bytes'] or digest.hexdigest()!=spec['sha256']: target.unlink(missing_ok=True);raise ValueError('Upload integrity check failed')
            if spec['mime']=='model/gltf-binary': validate_glb(target);target.replace(directory/'input.glb')
            else: normalize_image(target,directory/'input.png');target.unlink(missing_ok=True)
            for part in directory.glob('*.part'): part.unlink()
            self.db.execute("UPDATE uploads SET state='ready' WHERE id=?",(resource,));self.db.commit()
        return {'id':resource,'state':'ready'}
    def submit(self, owner, idem, body):
        request=validate_job(body);digest=fingerprint(request)
        if not isinstance(idem,str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}',idem): raise ValueError('A stable idempotency key is required')
        with self.lock:
            old=self.db.execute('SELECT * FROM jobs WHERE owner=? AND idem=?',(owner,idem)).fetchone()
            if old:
                if old['fingerprint']!=digest: raise HTTPException(409,'Idempotency key reused with another request')
                if old['state']=='deleted': raise HTTPException(410,'This request was deleted; it will not be generated again')
                return self.public(dict(old))
            caps=self.capabilities();engine=caps['engines'].get(request['mode'],{})
            if not engine.get('configured') or not caps.get('enabled'): raise HTTPException(503,'Inference engine is not configured and enabled')
            for resource in request['assets']:
                row=self.row('uploads',resource,owner);spec=json.loads(row['spec'])
                expected=request['mode']=='model-to-2d'
                if row['state']!='ready' or expected!=(spec['mime']=='model/gltf-binary'): raise ValueError('Input does not match inference mode')
            active=self.db.execute("SELECT COUNT(*) FROM jobs WHERE owner=? AND state IN ('queued','running')",(owner,)).fetchone()[0]
            queued=self.db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
            daily=self.db.execute('SELECT COUNT(*) FROM jobs WHERE owner=? AND created>?',(owner,time.time()-86400)).fetchone()[0]
            if active>=2 or queued>=12 or daily>=int(os.environ.get('CREATOR_DAILY_JOB_LIMIT','12')): raise HTTPException(429,'Inference queue or daily limit reached')
            job=uuid.uuid4().hex;now=time.time();(self.root/job).mkdir()
            self.db.execute('INSERT INTO jobs(id,owner,idem,fingerprint,request,state,created,updated) VALUES(?,?,?,?,?,?,?,?)',(job,owner,idem,digest,json.dumps(request),'queued',now,now));self.db.commit();self.wake.set()
            return self.public(self.row('jobs',job,owner))
    def cancel(self, owner, job):
        with self.lock:
            row=self.row('jobs',job,owner)
            if row['state'] not in TERMINAL:self.update(job,state='cancelled',stage='cancelled',error='Cancelled by owner')
        return self.public(self.row('jobs',job,owner))
    def delete(self, owner, resource, table):
        with self.lock:
            row=self.row(table,resource,owner)
            if table=='jobs' and (row['state'] not in TERMINAL or self.active_job==resource): raise HTTPException(409,'Cancel the job before deletion')
            if table=='uploads':
                if self.active_job:
                    active=self.db.execute('SELECT request FROM jobs WHERE id=?',(self.active_job,)).fetchone()
                    if active and resource in json.loads(active['request'])['assets']:raise HTTPException(409,'Worker is releasing this upload')
                jobs=self.db.execute("SELECT request FROM jobs WHERE owner=? AND state IN ('queued','running')",(owner,)).fetchall()
                if any(resource in json.loads(job['request'])['assets'] for job in jobs):raise HTTPException(409,'Upload is used by an active job')
            if table=='jobs':
                # Keep only a receipt for idempotency/quota; erase prompts, input references,
                # result metadata and files. Deletion must not grant more GPU jobs.
                minimal=json.dumps({'mode':json.loads(row['request'])['mode'],'assets':[]})
                self.db.execute("UPDATE jobs SET state='deleted',stage='deleted',request=?,artifacts='[]',error=NULL,progress=0,updated=? WHERE id=?",(minimal,time.time(),resource))
            else:self.db.execute('DELETE FROM uploads WHERE id=?',(resource,))
            self.db.commit();shutil.rmtree(self.root/resource,ignore_errors=True)
        return {'deleted':True}
    def cleanup_uploads(self, owner):
        # Explicit owner action. Protect active inputs, including a cancelling subprocess.
        deleted=0
        with self.lock:
            rows=self.db.execute('SELECT id FROM uploads WHERE owner=?',(owner,)).fetchall()
            for row in rows:
                try:self.delete(owner,row['id'],'uploads');deleted+=1
                except HTTPException as error:
                    if error.status_code!=409:raise
        return {'deleted':deleted}
    def start(self):
        if self.thread:return
        self.thread=threading.Thread(target=self.loop,daemon=True);self.thread.start()
    def close(self):
        self.stopping.set();self.wake.set()
        if self.thread:self.thread.join(timeout=15)
        if self.thread and self.thread.is_alive():raise RuntimeError('Inference worker did not stop')
        self.db.close();fcntl.flock(self.lease,fcntl.LOCK_UN);self.lease.close()
    def loop(self):
        while not self.stopping.is_set():
            with self.lock:
                row=self.db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1").fetchone()
                if row:
                    self.active_job=row['id'];self.update(row['id'],state='running',stage='loading',progress=1)
            if not row:self.wake.wait(1);self.wake.clear();continue
            job=row['id'];request=json.loads(row['request'])
            try:
                result=self.runner(job,request)
                if self.cancelled(job):continue
                artifacts=[]
                for name in result:
                    if not re.fullmatch(r'[a-z0-9_-]+\.(mp4|glb|png|json|srt)',name):raise ValueError('Invalid artifact name')
                    path=self.root/job/name
                    if not path.is_file() or path.is_symlink() or not 0<path.stat().st_size<=256*CHUNK_SIZE:raise ValueError('Invalid output artifact')
                    if path.suffix=='.glb':validate_glb(path)
                    if path.suffix=='.png':
                        from PIL import Image
                        with Image.open(path) as image:image.verify()
                    if path.suffix=='.mp4' and path.read_bytes()[4:8]!=b'ftyp':raise ValueError('Invalid MP4 output')
                    artifacts.append({'name':name,'bytes':path.stat().st_size,'mime':MIME[path.suffix],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
                if not artifacts:raise ValueError('Inference produced no output')
                with self.lock:
                    if not self.cancelled(job):self.update(job,state='succeeded',stage='complete',progress=100,artifacts=json.dumps(artifacts))
            except Exception as error:
                if not self.cancelled(job):self.update(job,state='failed',stage='failed',error=f'{type(error).__name__}: inference failed; inspect restricted worker logs')
                # Do not copy prompts, filenames, provider credentials or tracebacks into public errors.
                print(f'inference job {job}: {type(error).__name__}: {str(error)[:200]}',file=sys.stderr,flush=True)
            finally:
                with self.lock:self.active_job=None
    def run_process(self, job, request):
        directory=self.root/job
        inputs=[str(self.root/resource/('input.glb' if request['mode']=='model-to-2d' else 'input.png')) for resource in request['assets']]
        (directory/'request.json').write_text(json.dumps(request|{'inputs':inputs}),encoding='utf8')
        # Explicit env allowlist: never pass gateway tokens or app/database credentials to ML/Blender.
        allowed={'PATH','HOME','LD_LIBRARY_PATH','CUDA_VISIBLE_DEVICES','HF_HOME','TRANSFORMERS_CACHE','CREATOR_MODEL_ROOT','CREATOR_TRIPOSR_CODE','CREATOR_BLENDER','CREATOR_TORCH_DEVICE'}
        env={key:value for key,value in os.environ.items() if key in allowed};env.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','PYTHONUNBUFFERED':'1'})
        with (directory/'worker.log').open('wb') as log:
            process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('engines.py')),str(directory)],stdout=log,stderr=subprocess.STDOUT,env=env,start_new_session=True)
            started=time.monotonic()
            try:
                while process.poll() is None:
                    if self.cancelled(job) or time.monotonic()-started>int(os.environ.get('CREATOR_JOB_TIMEOUT_SECONDS','3600')):raise TimeoutError('Cancelled or inference deadline exceeded')
                    progress=directory/'progress.json'
                    if progress.exists():
                        try:
                            p=json.loads(progress.read_text());percent=max(1,min(95,int(p['progress'])));stage=str(p['stage'])[:80]
                            with self.lock:
                                if not self.cancelled(job):self.update(job,progress=percent,stage=stage)
                        except (ValueError,KeyError,OSError):pass
                    self.stopping.wait(.5)
                if process.returncode:raise RuntimeError(f'Model process exited {process.returncode}')
            finally:
                if process.poll() is None:
                    os.killpg(process.pid,signal.SIGTERM)
                    try:process.wait(timeout=5)
                    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
        return json.loads((directory/'result.json').read_text())['artifacts']

def create_app(runtime: Runtime):
    @asynccontextmanager
    async def lifespan(_app):
        runtime.start();yield;runtime.close()
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    origins = [entry.strip() for entry in os.environ.get('CREATOR_BROWSER_ORIGINS', '').split(',') if entry.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme not in {'https', 'http'} or not parsed.netloc or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or '*' in origin:
            raise ValueError('CREATOR_BROWSER_ORIGINS requires exact browser origins')
        if parsed.scheme == 'http' and parsed.hostname not in {'localhost', '127.0.0.1', '::1'}:
            raise ValueError('Non-local browser origins require HTTPS')
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
        allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
        allow_headers=['Authorization', 'Content-Type', 'X-Creator-Owner', 'Idempotency-Key'],
        expose_headers=['X-Content-SHA256', 'Content-Length'])
    @app.exception_handler(ValueError)
    async def invalid(_request,error):return JSONResponse({'detail':str(error)},status_code=400)
    @app.middleware('http')
    async def bounds(request,call_next):
        # Every browser upload is chunked. Read at most 1.5 MiB, even if Content-Length is absent.
        if request.method in {'POST','PUT'}:
            data=bytearray()
            async for part in request.stream():
                data.extend(part)
                if len(data)>1536*1024:return JSONResponse({'detail':'Body too large'},status_code=413)
            request._body=bytes(data)
        response=await call_next(request);response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff';return response
    @app.get('/health/live')
    def health():return {'status':'ok'}
    @app.get('/capabilities')
    def capabilities(request:Request):runtime.authenticate(request);return runtime.capabilities()
    @app.post('/uploads')
    async def upload(request:Request):return runtime.create_upload(runtime.authenticate(request),await request.json())
    @app.put('/uploads/{resource}/chunks/{index}')
    async def chunk(request:Request,resource:str,index:int):return runtime.chunk(runtime.authenticate(request),resource,index,await request.json())
    @app.post('/uploads/cleanup')
    def cleanup_uploads(request:Request):return runtime.cleanup_uploads(runtime.authenticate(request))
    @app.post('/uploads/{resource}/complete')
    def complete(request:Request,resource:str):return runtime.complete_upload(runtime.authenticate(request),resource)
    @app.delete('/uploads/{resource}')
    def delete_upload(request:Request,resource:str):return runtime.delete(runtime.authenticate(request),resource,'uploads')
    @app.post('/jobs',status_code=202)
    async def submit(request:Request):return runtime.submit(runtime.authenticate(request),request.headers.get('idempotency-key'),await request.json())
    @app.get('/jobs')
    def jobs(request:Request):
        owner=runtime.authenticate(request)
        with runtime.lock:rows=runtime.db.execute("SELECT * FROM jobs WHERE owner=? AND state!='deleted' ORDER BY created DESC LIMIT 40",(owner,)).fetchall()
        return {'jobs':[runtime.public(dict(row)) for row in rows]}
    @app.get('/jobs/{job}')
    def get_job(request:Request,job:str):return runtime.public(runtime.row('jobs',job,runtime.authenticate(request)))
    @app.post('/jobs/{job}/cancel')
    def cancel(request:Request,job:str):return runtime.cancel(runtime.authenticate(request),job)
    @app.delete('/jobs/{job}')
    def delete_job(request:Request,job:str):return runtime.delete(runtime.authenticate(request),job,'jobs')
    @app.get('/jobs/{job}/artifacts/{name}')
    def artifact(request:Request,job:str,name:str):
        row=runtime.row('jobs',job,runtime.authenticate(request));artifacts=json.loads(row['artifacts'])
        entry=next((v for v in artifacts if v['name']==name),None)
        if row['state']!='succeeded' or not entry:raise HTTPException(404,'Artifact not found')
        path=runtime.root/job/name
        if not path.is_file() or path.stat().st_size!=entry['bytes']:raise HTTPException(410,'Artifact unavailable')
        return FileResponse(path,media_type=entry['mime'],filename=name,headers={'X-Content-SHA256':entry['sha256'],'Cache-Control':'no-store'})
    @app.get('/jobs/{job}/artifacts/{name}/chunks/{index}')
    def artifact_chunk(request:Request,job:str,name:str,index:int):
        row=runtime.row('jobs',job,runtime.authenticate(request));entry=next((v for v in json.loads(row['artifacts']) if v['name']==name),None)
        if row['state']!='succeeded' or not entry or not 0<=index<math.ceil(entry['bytes']/CHUNK_SIZE):raise HTTPException(404,'Artifact chunk not found')
        path=runtime.root/job/name
        if not path.is_file() or path.stat().st_size!=entry['bytes']:raise HTTPException(410,'Artifact unavailable')
        with path.open('rb') as source:source.seek(index*CHUNK_SIZE);data=source.read(CHUNK_SIZE)
        return Response(data,media_type='application/octet-stream',headers={'X-Content-SHA256':entry['sha256'],'Cache-Control':'no-store'})
    return app

def application():
    return create_app(Runtime(Path(os.environ.get('CREATOR_DATA_DIR','./creator-data')),os.environ.get('CREATOR_INFERENCE_TOKEN','')))
