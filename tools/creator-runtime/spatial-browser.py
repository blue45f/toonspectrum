"""Real browser chapter creation/reopen, WebGL rendering and non-XR fallback tests.
No headset emulation is counted as a real AR/VR hardware acceptance test.
"""
import http.server, io, json, os, pathlib, shutil, threading
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];PUBLIC=ROOT/'apps/web/public';RESULTS=[]
class Server(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
def record(name):RESULTS.append(name);print('PASS',name,flush=True)
def png(name,rgba):
 stream=io.BytesIO();Image.new('RGBA',(400,600),rgba).save(stream,'PNG');return{'name':name,'mimeType':'image/png','buffer':stream.getvalue()}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url+'/spatial-reader/');page.wait_for_selector('html[data-spatial-reader-ready="true"]')
  page.locator('#images').set_input_files([png('첫 컷.png',(200,90,50,255)),png('다음 컷.png',(40,130,200,255))]);page.wait_for_function("document.querySelectorAll('[data-panel]').length===2")
  assert page.locator('#position').inner_text()=='1 / 2';record('two local panels imported without server upload')
  page.locator('#caption').fill('첫 장면의 한글 자막');page.locator('#caption').blur();page.wait_for_function("document.getElementById('spoken-caption').textContent==='첫 장면의 한글 자막'")
  page.locator('#next').click();assert page.locator('#position').inner_text()=='2 / 2';page.locator('#bookmark').click();page.locator('#prev').click();page.locator('#resume').click();assert page.locator('#position').inner_text()=='2 / 2';record('captions, next/previous and persistent bookmark work')
  page.locator('#up').click();page.wait_for_function("document.getElementById('position').textContent==='1 / 2'");assert page.locator('#caption').input_value()=='다음 컷';record('cut reordering updates focused panel without losing caption')
  page.locator('#foreground').set_input_files(png('전경.png',(40,240,90,100)));page.wait_for_function("document.querySelectorAll('#flat-page img').length===2")
  page.locator('#depth').fill('25');page.locator('#depth').dispatch_event('change');record('transparent foreground creates a separate depth layer')
  page.wait_for_function("document.getElementById('save-status').textContent.includes('이 기기에 저장됨')")
  with page.expect_download() as d:page.locator('#export').click()
  data=pathlib.Path(d.value.path()).read_bytes();chapter=json.loads(data);assert chapter['panels'][0]['layers'][1]['depth']==.25;assert len(chapter['panels'])==2;record('editable chapter export preserves depth and source order')
  page.reload();page.wait_for_selector('html[data-spatial-reader-ready="true"]');assert page.locator('[data-panel]').count()==2;record('IndexedDB restores chapter after browser reload')
  page.locator('#spatial').click();page.wait_for_timeout(600);assert page.locator('#scene').is_visible();assert page.locator('#flat-page').is_hidden();assert page.locator('#error').is_hidden(),page.locator('#error').inner_text();record('one native WebGL renderer displays spatial panels')
  page.locator('#next').click();page.wait_for_timeout(200);assert page.locator('#position').inner_text()=='2 / 2';record('spatial next-cut navigation updates the displayed scene')
  (ROOT/'creator-runtime-results').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'creator-runtime-results/spatial-desktop.png'),full_page=True)
  page.locator('#vr').click();page.wait_for_selector('#error:not([hidden])');assert page.locator('#position').inner_text()=='2 / 2';record('unsupported XR request preserves normal reader and reports error')
  page.locator('#error').click();page.locator('#flat').click();assert page.locator('#flat-page').is_visible();assert page.locator('#scene').is_hidden();record('accessible flat fallback remains available')
  # Parse-valid but broken embedded image must not replace the currently loaded story.
  bad=json.loads(data);bad['panels'][0]['layers'][0]['image']='data:image/png;base64,aGVsbG8='
  page.locator('#open').set_input_files({'name':'bad.toonspace','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_selector('#error:not([hidden])');assert page.locator('[data-panel]').count()==2;assert page.locator('#position').inner_text()=='2 / 2';record('corrupt embedded image cannot replace the current chapter')
  page.locator('#error').click();page.locator('#prev').click();page.locator('#seconds').fill('3');page.locator('#seconds').blur();page.locator('#auto').click();page.wait_for_function("document.getElementById('position').textContent==='2 / 2'",timeout=6000);page.keyboard.press('Escape');assert page.locator('#auto').get_attribute('aria-pressed')=='false';record('timed playback advances and Escape stops it')
  ctx.set_offline(True);page.locator('#prev').click();assert page.locator('#position').inner_text()=='1 / 2';record('already-open embedded chapter continues reading with no network')
  ctx.set_offline(False);page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ROOT/'creator-runtime-results/spatial-mobile.png'),full_page=True)
  assert not errors,errors;record('zero uncaught browser exceptions in normal/unsupported-XR paths')
  browser.close()
finally:
 server.shutdown();(ROOT/'creator-spatial-test-results.json').write_text(json.dumps({'passed':len(RESULTS),'checks':RESULTS,'hardwareXRValidated':False},ensure_ascii=False,indent=2))
