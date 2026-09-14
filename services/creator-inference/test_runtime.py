"""CPU tests cover contracts, authorization and durable job lifecycle, not model inference quality."""
import base64, hashlib, io, json, struct, time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import Runtime, create_app
from contracts import validate_job, validate_glb, validate_upload, decode_chunk, CHUNK_SIZE
TOKEN='a-secure-test-token-with-at-least-32-characters'
HEADERS={'authorization':'Bearer '+TOKEN,'x-creator-owner':'artist-one'}
CAPS={'enabled':True,'engines':{mode:{'configured':True,'validation':'TEST DOUBLE ONLY'} for mode in ['image-to-video','image-to-3d','model-to-2d']}}
def png():
    f=io.BytesIO();Image.new('RGBA',(32,32),(20,50,80,255)).save(f,'PNG');return f.getvalue()
def upload(client,headers=HEADERS):
    data=png();r=client.post('/uploads',json={'mime':'image/png','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},headers=headers);assert r.status_code==200,r.text;rid=r.json()['id']
    r=client.put(f'/uploads/{rid}/chunks/0',json={'data':base64.b64encode(data).decode()},headers=headers);assert r.status_code==200,r.text
    r=client.post(f'/uploads/{rid}/complete',headers=headers);assert r.status_code==200,r.text
    return rid
@pytest.fixture
def runtime(tmp_path):
    def runner(job,request):
        # Explicit test-only PNG. Production has no fake-success fallback or mock flag.
        (tmp_path/job/'test.png').write_bytes(png());return ['test.png']
    return Runtime(tmp_path,TOKEN,runner=runner,capability_reader=lambda:CAPS)
@pytest.fixture
def client(runtime):
    with TestClient(create_app(runtime)) as client:yield client

def body(asset):return {'mode':'image-to-video','assets':[asset],'prompt':'blink naturally'}
def submit(client,asset,key='idempotency-test-0001'):
    return client.post('/jobs',json=body(asset),headers=HEADERS|{'idempotency-key':key})
def wait_job(client,job):
    for _ in range(50):
        row=client.get('/jobs/'+job,headers=HEADERS).json()
        if row['state'] in {'succeeded','failed','cancelled','interrupted'}:return row
        time.sleep(.02)
    raise AssertionError('job did not terminate')

def test_auth_required(client):assert client.get('/jobs').status_code==401

def test_wrong_service_token(client):assert client.get('/capabilities',headers=HEADERS|{'authorization':'Bearer wrong'}).status_code==401

def test_upload_and_inference_lifecycle(client):
    asset=upload(client);r=submit(client,asset);assert r.status_code==202,r.text
    row=wait_job(client,r.json()['id']);assert row['state']=='succeeded';assert row['progress']==100
    artifact=row['artifacts'][0];data=client.get(f"/jobs/{row['id']}/artifacts/test.png/chunks/0",headers=HEADERS)
    assert data.status_code==200;assert hashlib.sha256(data.content).hexdigest()==artifact['sha256']
    assert client.get(f"/jobs/{row['id']}/artifacts/test.png/chunks/1",headers=HEADERS).status_code==404

def test_idempotency_same_request(client):
    asset=upload(client);a=submit(client,asset);b=submit(client,asset);assert a.json()['id']==b.json()['id']

def test_idempotency_different_request(client):
    asset=upload(client);submit(client,asset)
    assert client.post('/jobs',json=body(asset)|{'prompt':'different'},headers=HEADERS|{'idempotency-key':'idempotency-test-0001'}).status_code==409

def test_owner_isolation(client):
    asset=upload(client);job=submit(client,asset).json()['id'];wait_job(client,job)
    other=HEADERS|{'x-creator-owner':'artist-two'}
    assert client.get('/jobs/'+job,headers=other).status_code==404
    assert client.get(f'/jobs/{job}/artifacts/test.png',headers=other).status_code==404
    assert client.post(f'/uploads/{asset}/complete',headers=other).status_code==404
    assert client.get('/jobs',headers=other).json()=={'jobs':[]}

def test_hash_mismatch_rejected(client):
    data=png();rid=client.post('/uploads',json={'mime':'image/png','bytes':len(data),'sha256':'0'*64},headers=HEADERS).json()['id']
    client.put(f'/uploads/{rid}/chunks/0',json={'data':base64.b64encode(data).decode()},headers=HEADERS)
    assert client.post(f'/uploads/{rid}/complete',headers=HEADERS).status_code==400

def test_chunk_replay_and_conflict(client):
    data=png();rid=client.post('/uploads',json={'mime':'image/png','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},headers=HEADERS).json()['id']
    a={'data':base64.b64encode(data).decode()};url=f'/uploads/{rid}/chunks/0'
    assert client.put(url,json=a,headers=HEADERS).status_code==200
    assert client.put(url,json=a,headers=HEADERS).status_code==200
    assert client.put(url,json={'data':base64.b64encode(b'x'*len(data)).decode()},headers=HEADERS).status_code==409

def test_incomplete_upload_rejected(client):
    rid=client.post('/uploads',json={'mime':'image/png','bytes':10,'sha256':'0'*64},headers=HEADERS).json()['id']
    assert client.post(f'/uploads/{rid}/complete',headers=HEADERS).status_code==409
    assert submit(client,rid).status_code==400

def test_failed_worker_never_succeeds(tmp_path):
    def fail(*args):raise RuntimeError('no model')
    runtime=Runtime(tmp_path,TOKEN,runner=fail,capability_reader=lambda:CAPS)
    with TestClient(create_app(runtime)) as client:
        row=wait_job(client,submit(client,upload(client)).json()['id']);assert row['state']=='failed';assert row['artifacts']==[]

def test_cancel_running_job(tmp_path):
    holder={}
    def run(job,request):
        for _ in range(100):
            if holder['runtime'].cancelled(job):return []
            time.sleep(.02)
        raise RuntimeError('cancel was not observed')
    runtime=Runtime(tmp_path,TOKEN,runner=run,capability_reader=lambda:CAPS);holder['runtime']=runtime
    with TestClient(create_app(runtime)) as client:
        job=submit(client,upload(client)).json()['id'];client.post(f'/jobs/{job}/cancel',headers=HEADERS)
        row=wait_job(client,job);assert row['state']=='cancelled';assert row['artifacts']==[]

def test_restart_marks_inflight_interrupted(tmp_path):
    runtime=Runtime(tmp_path,TOKEN,capability_reader=lambda:CAPS)
    request=json.dumps(body('1'*32));now=time.time()
    runtime.db.execute('INSERT INTO jobs(id,owner,idem,fingerprint,request,state,created,updated) VALUES(?,?,?,?,?,?,?,?)',('2'*32,'artist-one','abcdefghijklmnop','x',request,'running',now,now));runtime.db.commit();runtime.close()
    recovered=Runtime(tmp_path,TOKEN,capability_reader=lambda:CAPS);row=recovered.row('jobs','2'*32,'artist-one');assert row['state']=='interrupted';recovered.close()

def test_unconfigured_engine_is_503(tmp_path):
    runtime=Runtime(tmp_path,TOKEN,capability_reader=lambda:{'enabled':False,'engines':{}})
    with TestClient(create_app(runtime)) as client:assert submit(client,upload(client)).status_code==503

def test_delete_owned_terminal_artifact(client):
    job=submit(client,upload(client)).json()['id'];wait_job(client,job)
    for _ in range(10):
        r=client.delete('/jobs/'+job,headers=HEADERS)
        if r.status_code==200:break
        time.sleep(.05)
    assert r.status_code==200;assert client.get('/jobs/'+job,headers=HEADERS).status_code==404

@pytest.mark.parametrize('change',[{'mode':'text-to-anything'},{'assets':['../../etc/passwd']},{'seed':True},{'seed':-1},{'steps':1000},{'frames':50},{'strength':0},{'yaw':float('nan')},{'url':'http://localhost/'},{'prompt':123},{'assets':[]},{'captions':['a','b']}])
def test_invalid_job_contract(change):
    with pytest.raises(ValueError):validate_job(body('1'*32)|change)

@pytest.mark.parametrize('value',[{'mime':'image/svg+xml','bytes':10,'sha256':'0'*64},{'mime':'image/png','bytes':True,'sha256':'0'*64},{'mime':'image/png','bytes':999999999,'sha256':'0'*64},{'mime':'image/png','bytes':1,'sha256':'bad'}])
def test_invalid_upload_contract(value):
    with pytest.raises(ValueError):validate_upload(value)

def make_glb(document):
    raw=json.dumps(document).encode();raw+=b' '*((-len(raw))%4);return struct.pack('<4sIIII',b'glTF',2,20+len(raw),len(raw),0x4e4f534a)+raw
@pytest.mark.parametrize('uri',['https://private/file','file:///etc/passwd','../../etc/passwd','data:text/html;base64,AA=='])
def test_glb_external_reference_rejected(tmp_path,uri):
    path=tmp_path/'bad.glb';path.write_bytes(make_glb({'asset':{'version':'2.0'},'meshes':[{}],'buffers':[{'uri':uri}]}))
    with pytest.raises(ValueError):validate_glb(path)

def test_glb_header_length_rejected(tmp_path):
    path=tmp_path/'bad.glb';path.write_bytes(make_glb({'asset':{'version':'2.0'},'meshes':[{}]})+b'extra')
    with pytest.raises(ValueError):validate_glb(path)

def test_authenticated_request_size_limit(client):
    assert client.put('/uploads/'+'1'*32+'/chunks/0',content=b'x'*(1536*1024+1),headers=HEADERS|{'content-type':'application/json'}).status_code==413


def delete_terminal(client, job):
    wait_job(client, job)
    for _ in range(50):
        response = client.delete('/jobs/' + job, headers=HEADERS)
        if response.status_code == 200:
            return
        assert response.status_code == 409, response.text
        time.sleep(.02)
    raise AssertionError('Worker did not release the terminal job')


def test_deleted_result_cannot_replay_generation(client):
    asset = upload(client)
    job = submit(client, asset).json()['id']
    delete_terminal(client, job)
    assert submit(client, asset).status_code == 410
    assert client.get('/jobs', headers=HEADERS).json() == {'jobs': []}
    assert client.get('/jobs/' + job, headers=HEADERS).status_code == 404


def test_deleted_key_still_rejects_other_payload(client):
    asset = upload(client)
    delete_terminal(client, submit(client, asset).json()['id'])
    response = client.post('/jobs', json=body(asset) | {'prompt': 'different'},
                           headers=HEADERS | {'idempotency-key': 'idempotency-test-0001'})
    assert response.status_code == 409


def test_deleting_result_does_not_reset_daily_quota(client, monkeypatch):
    monkeypatch.setenv('CREATOR_DAILY_JOB_LIMIT', '1')
    asset = upload(client)
    delete_terminal(client, submit(client, asset).json()['id'])
    assert submit(client, asset, key='idempotency-another-request').status_code == 429


def test_deleted_receipt_erases_private_payload_and_files(client, runtime):
    asset = upload(client)
    job = submit(client, asset).json()['id']
    delete_terminal(client, job)
    with runtime.lock:
        receipt = runtime.db.execute('SELECT * FROM jobs WHERE id=?', (job,)).fetchone()
    assert receipt['state'] == 'deleted'
    assert json.loads(receipt['request']) == {'mode': 'image-to-video', 'assets': []}
    assert receipt['artifacts'] == '[]'
    assert receipt['error'] is None
    assert not (runtime.root / job).exists()


@pytest.mark.parametrize(('manifest', 'package', 'patched', 'vulnerable'), [
    ('requirements-models.txt', 'diffusers', '0.38.0', '0.37.0'),
    ('requirements-models.txt', 'safetensors', '0.8.0', '0.7.0'),
    ('requirements-test.txt', 'pytest', '9.0.3', '9.0.2'),
])
def test_dependency_security_floor(manifest, package, patched, vulnerable):
    """Keep patched constraints without installing GPU packages or downloading models."""
    from packaging.requirements import Requirement

    requirements = [
        Requirement(line.strip())
        for line in Path(__file__).with_name(manifest).read_text().splitlines()
        if line.strip() and not line.lstrip().startswith(('#', '-'))
    ]
    matches = [requirement for requirement in requirements if requirement.name == package]
    assert len(matches) == 1, f'{manifest} must declare {package} exactly once'
    assert patched in matches[0].specifier
    assert vulnerable not in matches[0].specifier
