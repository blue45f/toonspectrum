import { newDocument, parseDocument, openDrawingDatabase, listDocuments, saveDocument, MAX_POINTS, MAX_FILE_BYTES } from './model.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let doc = newDocument();
let database = null;
let activeLayer = doc.layers[0].id;
let tool = 'pen';
let drawing = null;
let pointerId = null;
let lastPenAt = 0;
let touched = false;
let dirty = false;
let editEpoch = 0;
let saving = null;
let saveTimer = 0;
let frame = 0;
let committed = [];
let background = null;
let rebuild = true;
let switching = false;
const message = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };
const safeStorage = {
  get: () => { try { return localStorage.getItem('toonstudio-local-active'); } catch { return null; } },
  set: id => { try { localStorage.setItem('toonstudio-local-active', id); } catch { /* Drawing/IDB never depends on localStorage. */ } },
};
function drawStroke(context, stroke) {
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.fillStyle = context.strokeStyle = stroke.color;
  context.lineCap = context.lineJoin = 'round';
  const [first, ...remaining] = stroke.points;
  if (!first) { context.restore(); return; }
  const radius = p => stroke.size * (0.2 + p[2] * 0.8) / 2;
  context.beginPath(); context.arc(first[0], first[1], radius(first), 0, Math.PI * 2); context.fill();
  let previous = first;
  for (const point of remaining) {
    context.lineWidth = radius(point) + radius(previous);
    context.beginPath(); context.moveTo(previous[0], previous[1]); context.lineTo(point[0], point[1]); context.stroke();
    previous = point;
  }
  context.restore();
}
function surface() { const target = document.createElement('canvas'); target.width = doc.width; target.height = doc.height; return target; }
function paint() {
  frame = 0;
  if (rebuild) {
    if (canvas.width !== doc.width || canvas.height !== doc.height) { canvas.width = doc.width; canvas.height = doc.height; canvas.style.aspectRatio = `${doc.width}/${doc.height}`; }
    committed = doc.layers.map(layer => {
      const target = surface();
      const context = target.getContext('2d');
      for (const stroke of doc.strokes.slice(0, doc.cursor)) if (stroke.layerId === layer.id) drawStroke(context, stroke);
      return target;
    });
    rebuild = false;
  }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, doc.width, doc.height);
  if (background) { const scale = Math.min(doc.width / background.width, doc.height / background.height); ctx.drawImage(background, (doc.width - background.width * scale) / 2, (doc.height - background.height * scale) / 2, background.width * scale, background.height * scale); }
  doc.layers.forEach((layer, index) => {
    if (!layer.visible) return;
    if (drawing?.layerId === layer.id) {
      const target = surface(); const context = target.getContext('2d');
      context.drawImage(committed[index], 0, 0); drawStroke(context, drawing); ctx.drawImage(target, 0, 0);
    } else ctx.drawImage(committed[index], 0, 0);
  });
  $('undo').disabled = doc.cursor === 0; $('redo').disabled = doc.cursor === doc.strokes.length;
}
function render(full = false) { rebuild ||= full; if (!frame) frame = requestAnimationFrame(paint); }
function renderLayers() {
  $('layers').replaceChildren(...doc.layers.map(layer => { const option = document.createElement('option'); option.value = layer.id; option.textContent = `${layer.visible ? '' : '숨김 · '}${layer.name}`; return option; }));
  $('layers').value = activeLayer;
}
async function refreshDocuments() {
  if (!database) return;
  const all = await listDocuments(database);
  $('documents').replaceChildren(...all.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} · ${new Date(item.updatedAt).toLocaleString()}`; return option; }));
  $('documents').value = doc.id;
}
function markChanged() {
  touched = true; dirty = true; editEpoch++; doc.updatedAt = Date.now();
  message(database ? '변경됨 · 이 기기에 자동 저장 중…' : '이 기기의 저장소를 사용할 수 없어요. 원고 파일로 백업해 주세요.', !database);
  clearTimeout(saveTimer); saveTimer = setTimeout(() => { void flush(); }, 300);
  render(true);
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving) { await saving; if (dirty && database) return flush(); return !dirty; }
  if (!dirty) return true;
  if (!database) { message('저장소를 사용할 수 없어요. 원고 파일 백업 또는 독립 실행 HTML을 저장해 주세요.', true); return false; }
  const snapshot = structuredClone(doc); const epoch = editEpoch;
  let succeeded = false;
  saving = (async () => {
    try {
      const result = await saveDocument(database, snapshot, snapshot.revision);
      if (doc.id === snapshot.id) {
        doc.id = result.document.id; doc.revision = result.document.revision;
        if (result.forked) { doc.title = result.document.title; $('title').value = doc.title; }
        if (editEpoch === epoch) dirty = false;
        safeStorage.set(doc.id);
      }
      succeeded = true;
      message(result.forked ? '다른 탭의 변경을 보호하기 위해 충돌 사본으로 저장했어요.' : dirty ? '다음 변경을 저장 중…' : `이 기기에 저장 완료 · ${new Date().toLocaleTimeString()}`);
      await refreshDocuments();
    } catch (error) { message(`로컬 저장 실패: ${error.message}. 원고 파일로 백업해 주세요.`, true); }
  })();
  await saving; saving = null;
  if (succeeded && dirty) return flush();
  return succeeded;
}
async function imageFrom(source) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('이미지를 읽지 못했어요.')); image.src = source; });
  if (image.width * image.height > 24000000) throw new Error('이미지는 최대 2,400만 화소까지 사용할 수 있어요.');
  return image;
}
async function replaceDocument(next) {
  if (switching || drawing) return false;
  switching = true;
  try {
    const validated = parseDocument(next);
    const nextBackground = validated.backgroundImage ? await imageFrom(validated.backgroundImage) : null;
    if (!await flush() && !confirm('현재 원고가 저장되지 않았어요. 파일 백업 없이 다른 원고를 열까요?')) return false;
    doc = validated; background = nextBackground; activeLayer = doc.layers[0].id; touched = true; dirty = false;
    $('title').value = doc.title; safeStorage.set(doc.id); renderLayers(); render(true); message('로컬 원고를 열었어요. 서버 원고에는 영향을 주지 않습니다.'); return true;
  } finally { switching = false; }
}
function position(event) {
  const rect = canvas.getBoundingClientRect(); const scale = Math.min(rect.width / doc.width, rect.height / doc.height);
  return [(event.clientX - rect.left - (rect.width - doc.width * scale) / 2) / scale, (event.clientY - rect.top - (rect.height - doc.height * scale) / 2) / scale, event.pointerType === 'pen' ? Math.max(.05, event.pressure || .05) : 1];
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || pointerId !== null || switching) return;
  if (event.pointerType === 'touch' && performance.now() - lastPenAt < 800) return;
  if (event.pointerType === 'pen') lastPenAt = performance.now();
  if (!doc.layers.find(layer => layer.id === activeLayer)?.visible) { message('숨겨진 레이어는 그릴 수 없어요. 표시 전환을 눌러주세요.', true); return; }
  if (doc.strokes.slice(0, doc.cursor).reduce((sum, stroke) => sum + stroke.points.length, 0) >= MAX_POINTS - 20000 || doc.cursor >= 5000) { message('원고가 커졌어요. 파일 백업 후 새 원고에서 이어 그려주세요.', true); return; }
  event.preventDefault(); touched = true; pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
  drawing = { layerId: activeLayer, tool, color: $('color').value, size: Number($('size').value), points: [position(event)] }; render();
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== pointerId || !drawing) return;
  event.preventDefault();
  for (const point of (event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event])) if (drawing.points.length < 20000) drawing.points.push(position(point));
  render();
});
function finishStroke(event) {
  if (!drawing || (event && event.pointerId !== pointerId)) return;
  doc.strokes = [...doc.strokes.slice(0, doc.cursor), drawing]; doc.cursor = doc.strokes.length;
  const old = pointerId; drawing = null; pointerId = null;
  if (canvas.hasPointerCapture(old)) canvas.releasePointerCapture(old);
  markChanged();
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, finishStroke);
function action(id, callback) { $(id).addEventListener('click', () => { Promise.resolve().then(callback).catch(error => message(error.message, true)); }); }
action('pen', () => { tool = 'pen'; $('pen').setAttribute('aria-pressed', 'true'); $('eraser').setAttribute('aria-pressed', 'false'); });
action('eraser', () => { tool = 'eraser'; $('eraser').setAttribute('aria-pressed', 'true'); $('pen').setAttribute('aria-pressed', 'false'); });
$('size').oninput = () => { $('size-value').value = $('size').value; };
$('title').oninput = () => { doc.title = $('title').value.trim().slice(0, 100) || '로컬 원고'; markChanged(); };
$('layers').onchange = () => { activeLayer = $('layers').value; };
action('undo', () => { if (doc.cursor && !drawing) { doc.cursor--; markChanged(); } });
action('redo', () => { if (doc.cursor < doc.strokes.length && !drawing) { doc.cursor++; markChanged(); } });
action('add-layer', () => { if (doc.layers.length >= 8) throw new Error('레이어는 최대 8개예요.'); activeLayer = crypto.randomUUID(); doc.layers.push({ id: activeLayer, name: `레이어 ${doc.layers.length + 1}`, visible: true }); renderLayers(); markChanged(); });
action('visibility', () => { const layer = doc.layers.find(item => item.id === activeLayer); layer.visible = !layer.visible; renderLayers(); markChanged(); });
action('save', () => { if (!dirty && doc.revision === 0) markChanged(); return flush(); });
action('new', async () => { await replaceDocument(newDocument()); });
action('open', async () => { if (!database) throw new Error('로컬 저장소를 사용할 수 없어요.'); const found = (await listDocuments(database)).find(item => item.id === $('documents').value); if (found) await replaceDocument(found); });
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const filename = () => doc.title.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 70) || 'toonstudio';
action('backup', () => { finishStroke(); download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), `${filename()}.toonlocal.json`); message('백업 다운로드를 요청했어요. 파일이 저장되었는지 확인해 주세요.'); });
action('png', () => { finishStroke(); paint(); canvas.toBlob(blob => { if (blob) download(blob, `${filename()}.png`); else message('PNG 생성에 실패했어요. 원고 파일 백업을 사용해 주세요.', true); }, 'image/png'); });
$('import').onchange = async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try { if (file.size > MAX_FILE_BYTES) throw new Error('원고 파일은 25MB 이하여야 해요.'); const next = parseDocument(JSON.parse(await file.text())); next.id = crypto.randomUUID(); next.revision = 0; if (await replaceDocument(next)) markChanged(); }
  catch (error) { message(error.message, true); }
};
$('image').onchange = async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  const owner = doc.id;
  try {
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('8MB 이하 PNG·JPEG·WebP 이미지를 사용해 주세요.');
    const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const image = await imageFrom(source); if (doc.id !== owner) return;
    background = image; doc.backgroundImage = source; markChanged();
  } catch (error) { message(error.message, true); }
};
action('persist', async () => { const granted = await navigator.storage?.persist?.(); message(granted ? '브라우저가 저장 유지 요청을 허용했어요. 파일 백업도 함께 해주세요.' : '브라우저가 저장 유지 요청을 허용하지 않았어요. 파일 백업을 사용해 주세요.', !granted); });
async function sourceText(path) {
  const cached = typeof caches !== 'undefined' ? await caches.match(path) : null;
  const response = cached ?? await fetch(path);
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('독립 실행 파일 준비에 필요한 코드가 없어요. 온라인에서 다시 준비해 주세요.');
  return response.text();
}
action('portable', async () => {
  finishStroke();
  const existing = $('local-runtime');
  const runtime = existing?.textContent || `${(await sourceText('/offline-drawing/model.js')).replace(/export /g, '')}\n${(await sourceText('/offline-drawing/app.js')).replace(/^import[^\n]+\n/, '')}`;
  const css = $('local-style')?.textContent || await sourceText('/offline-drawing/style.css');
  const copy = document.documentElement.cloneNode(true);
  copy.querySelectorAll('script,link[rel=stylesheet],style').forEach(node => node.remove());
  const style = document.createElement('style'); style.id = 'local-style'; style.textContent = css; copy.querySelector('head').append(style);
  const data = document.createElement('script'); data.type = 'application/json'; data.id = 'portable-document'; data.textContent = JSON.stringify(doc).replace(/</g, '\\u003c');
  const script = document.createElement('script'); script.type = 'module'; script.id = 'local-runtime'; script.textContent = runtime.replace(/<\/script/gi, '<\\/script');
  copy.querySelector('body').append(data, script);
  download(new Blob(['<!doctype html>\n', copy.outerHTML], { type: 'text/html' }), `${filename()}-offline.html`);
  message('서버에 처음 접속할 수 없어도 열 수 있는 독립 HTML 다운로드를 요청했어요. 파일을 열어 확인해 주세요.');
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $(event.shiftKey ? 'redo' : 'undo').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishStroke(); void flush(); } });
window.addEventListener('beforeunload', event => { if (dirty || drawing || saving) { event.preventDefault(); event.returnValue = ''; } });
async function activeWorkerSupportsRescue() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return false;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1200);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.type === 'toonstudio-local-drawing:ready' && event.data.ready === true); };
    worker.postMessage({ type: 'toonstudio-local-drawing:inspect' }, [channel.port2]);
  });
}
async function initialize() {
  renderLayers(); render(true); message('바로 그릴 수 있어요. 저장소 상태를 확인하고 있습니다.');
  // Drawing handlers and the first retained frame are live before storage/service-worker checks.
  // Keep this readiness signal shared with the portable and outage regression harnesses.
  document.documentElement.dataset.localDrawingReady = 'true';
  try {
    database = await openDrawingDatabase(); const all = await listDocuments(database);
    const portable = $('portable-document');
    if (!touched) {
      const stored = portable ? parseDocument(JSON.parse(portable.textContent)) : all.find(item => item.id === safeStorage.get());
      if (stored) { const candidate = parseDocument(stored); if (portable) { candidate.id = crypto.randomUUID(); candidate.revision = 0; } await replaceDocument(candidate); if (portable) markChanged(); }
    }
    await refreshDocuments();
    if (dirty) void flush(); else message('이 기기에 저장할 준비가 됐어요. 서버와 연결하지 않습니다.');
  } catch (error) {
    const portable = $('portable-document');
    if (portable && !touched) { try { await replaceDocument(parseDocument(JSON.parse(portable.textContent))); } catch { /* Existing canvas stays intact. */ } }
    message(`${error.message} 그리기는 계속 사용할 수 있으며 파일 백업이 필요합니다.`, true);
  }
  if (location.protocol === 'file:') { $('readiness').textContent = '독립 HTML · 서버 없이 실행 중 · 변경 내용은 새 HTML/원고 파일로 백업'; return; }
  try {
    if (!('serviceWorker' in navigator)) throw new Error('이 브라우저는 오프라인 재실행을 지원하지 않아요.');
    await navigator.serviceWorker.register('/sw.js');
    const paths = ['/offline-drawing', '/offline-drawing/app.js', '/offline-drawing/model.js', '/offline-drawing/style.css'];
    const deadline = Date.now() + 12000;
    let ready = false;
    do {
      ready = (await Promise.all(paths.map(async path => Boolean((await caches.match(path))?.ok)))).every(Boolean);
      if (ready) ready = await activeWorkerSupportsRescue();
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    } while (Date.now() < deadline);
    $('readiness').textContent = ready ? '오프라인 실행 파일 준비 완료 · 독립 HTML 백업도 권장' : '재접속용 캐시가 아직 준비되지 않았어요. 독립 HTML을 저장해 주세요.';
  } catch { $('readiness').textContent = '재접속용 캐시를 확인하지 못했어요. 독립 실행 HTML을 저장해 주세요.'; }
}
void initialize();
