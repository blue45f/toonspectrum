import os, shutil
"""Real Chromium regression: no application API, GPU or npm dependencies required."""
import functools, hashlib, http.server, json, pathlib, tempfile, threading, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'apps/web/public'
RESULTS = []
class Server(http.server.SimpleHTTPRequestHandler):
    status_mode = 'ok'
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def log_message(self, *args): pass
    def do_GET(self):
        # Production static hosting canonicalizes the physical HTML file to this clean URL.
        # Mirror that response directly so the worker can keep rejecting redirected payloads.
        if self.path.split('?', 1)[0] == '/offline-drawing':
            self.path = '/offline-drawing.html'
        if self.path.startswith('/studio'):
            if Server.status_mode == 'hang': time.sleep(8)
            code = 503 if Server.status_mode == '503' else 200
            self.send_response(code); self.send_header('Content-type', 'text/html'); self.end_headers()
            try: self.wfile.write(b'<html><body>studio shell</body></html>')
            except BrokenPipeError: pass
            return
        if self.path == '/sw.js' and (PUBLIC / '__test-sw.js').exists():
            self.path = '/__test-sw.js'
        return super().do_GET()
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Server)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
def record(name): RESULTS.append(name); print('PASS', name, flush=True)
def wait_ready(page): page.wait_for_selector('html[data-local-drawing-ready="true"]')
def wait_saved(page): page.wait_for_function("document.getElementById('save-status').textContent.includes('기기에 저장됨')")
def pixel_hash(page):
    return page.evaluate("async()=>{const c=document.getElementById('canvas');const b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).join(',')}")
def draw(page, tool='pen'):
    page.locator('[data-tool="'+tool+'"]').click()
    box=page.locator('#canvas').bounding_box()
    page.mouse.move(box['x']+70,box['y']+90); page.mouse.down()
    page.mouse.move(box['x']+210,box['y']+130,steps=20);page.mouse.up()
    wait_saved(page); page.wait_for_timeout(100)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or p.chromium.executable_path, headless=True, args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':1300,'height':850},accept_downloads=True)
        page=ctx.new_page(); errors=[]; page.on('pageerror',lambda err:errors.append(str(err)))
        page.goto(url+'/offline-draw/');wait_ready(page);wait_saved(page)
        blank=pixel_hash(page);draw(page);ink=pixel_hash(page);assert ink!=blank;record('pen produces pixels and commits IndexedDB')
        page.locator('#undo').click();wait_saved(page);assert pixel_hash(page)==blank;record('undo restores pixel-exact blank')
        page.locator('#redo').click();wait_saved(page);assert pixel_hash(page)==ink;record('redo reproduces deterministic stroke')
        page.reload();wait_ready(page);assert pixel_hash(page)==ink;record('reload restores exact pixels')
        for tool in ['pencil','marker']:
            draw(page,tool);before=pixel_hash(page);page.reload();wait_ready(page);assert pixel_hash(page)==before;record(tool+' replay is deterministic')
        before=pixel_hash(page);draw(page,'eraser');assert pixel_hash(page)!=before;record('eraser removes layer pixels')
        page.locator('#simple').click();page.locator('#add-layer').click();draw(page);assert page.locator('#layers .layer').count()==2;record('independent layer painting and autosave')
        with page.expect_download() as d:page.locator('#export-json').click()
        path=d.value.path();backup=json.loads(pathlib.Path(path).read_text());assert len(backup['layers'])==2;record('editable recovery file exports layers and strokes')
        with page.expect_download() as d:page.locator('#export-png').click()
        assert pathlib.Path(d.value.path()).read_bytes().startswith(b'\x89PNG\r\n\x1a\n');record('PNG export is a real PNG')
        assert page.evaluate("async()=>{await navigator.serviceWorker.ready;return !!(await caches.match('/offline-draw/ready-v2',{cacheName:'toonstudio-emergency-drawing-shell-v2'}))}")
        ctx.set_offline(True);page.reload();wait_ready(page);draw(page);offline_ink=pixel_hash(page)
        page.reload();wait_ready(page);assert pixel_hash(page)==offline_ink;record('offline navigation, drawing, save and second reload work')
        ctx.set_offline(False)
        second=ctx.new_page();second.goto(url+'/offline-draw/');wait_ready(second)
        draw(page);draw(second)
        assert '(충돌 복구 사본)' in second.locator('#title').input_value();record('concurrent-tab edit forks recovery copy rather than overwriting')
        # Bad file must not replace the current drawing.
        second.locator('#simple').click();before=pixel_hash(second)
        second.locator('#import').set_input_files({'name':'bad.toonlocal','mimeType':'application/json','buffer':b'{"format":"x"}'})
        second.wait_for_selector('#error:not([hidden])');assert pixel_hash(second)==before;record('invalid import preserves current pixels')
        # Root worker is the actual production entry compiled by compile-worker.mjs.
        if (PUBLIC / '__test-sw.js').exists():
            page.goto(url+'/studio')
            page.evaluate("async()=>{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready}")
            page.reload();page.wait_for_function('!!navigator.serviceWorker.controller')
            Server.status_mode='503';page.reload();wait_ready(page);record('actual root worker replaces HTTP 503 with local drawing')
            Server.status_mode='hang';start=time.monotonic();page.goto(url+'/studio/another');wait_ready(page)
            assert time.monotonic()-start<7;record('actual root worker deadline handles hanging origin')
            Server.status_mode='ok'
        assert not errors,errors;record('zero uncaught browser exceptions')
        # A restricted browser must retain basic drawing and file export without lying about save.
        denied=browser.new_context(viewport={'width':1300,'height':850},accept_downloads=True)
        denied.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('storage denied','SecurityError')}})")
        q=denied.new_page();q.goto(url+'/offline-draw/');wait_ready(q)
        b=pixel_hash(q);box=q.locator('#canvas').bounding_box();q.mouse.move(box['x']+70,box['y']+90);q.mouse.down();q.mouse.move(box['x']+120,box['y']+110,steps=5);q.mouse.up();q.wait_for_timeout(500)
        assert pixel_hash(q)!=b;assert '실패' in q.locator('#save-status').inner_text();record('storage denial retains drawing and reports unsaved state')
        with q.expect_download() as d:q.locator('#export-json').click()
        assert json.loads(pathlib.Path(d.value.path()).read_text())['layers'][0]['strokes'];record('storage denial still permits recovery download')
        (ROOT/'creator-runtime-results').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT/'creator-runtime-results/offline-desktop.png'),full_page=True)
        browser.close()
finally:
    server.shutdown()
    report=ROOT/'creator-offline-test-results.json';report.write_text(json.dumps({'passed':len(RESULTS),'checks':RESULTS},ensure_ascii=False,indent=2))
