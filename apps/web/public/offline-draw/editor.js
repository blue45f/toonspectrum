import { LIMITS, clamp, uid, makeLayer, makeDocument, validateDocument, documentPointCount, drawStroke } from './model.js';
import { LocalStore, LocalConflict } from './storage.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), context = canvas.getContext('2d', { alpha: false });
const store = new LocalStore();
let drawing = makeDocument(), activeLayer = drawing.layers[0].id, revision = 0;
let dirty = false, changeNumber = 0, saveTimer = 0, saving = null, renderFrame = 0;
let activeStroke = null, pointerId = null, tool = 'pen', previous = [], future = [], pointCount = 0;
let cache = new Map(), rasters = new Map();
const scratch = document.createElement('canvas');
const preview = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d'), previewCtx = preview.getContext('2d');
let initializationComplete = false;

function showError(error) {
  $('error').textContent = error instanceof Error ? error.message : String(error);
  $('error').hidden = false;
}
$('error').addEventListener('click', () => { $('error').hidden = true; });
function status(message, detail = '이 기기에만 저장합니다. 서버를 사용하지 않습니다.') {
  $('save-status').textContent = message; $('save-detail').textContent = detail;
}
function layer() { return drawing.layers.find((entry) => entry.id === activeLayer) ?? drawing.layers[0]; }
function surface() { const c = document.createElement('canvas'); c.width = drawing.width; c.height = drawing.height; return c; }
function paintStroke(ctx, stroke) {
  if (stroke.tool !== 'marker') { drawStroke(ctx, stroke); return; }
  scratchCtx.clearRect(0, 0, scratch.width, scratch.height); drawStroke(scratchCtx, stroke);
  ctx.save(); ctx.globalAlpha = .35; ctx.drawImage(scratch, 0, 0); ctx.restore();
}
function layerCanvas(entry) {
  if (cache.has(entry.id)) return cache.get(entry.id);
  const c = surface(), ctx = c.getContext('2d');
  const image = rasters.get(entry.raster);
  if (image) {
    const scale = Math.min(c.width / image.width, c.height / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }
  for (const stroke of entry.strokes) paintStroke(ctx, stroke);
  cache.set(entry.id, c); return c;
}
function render(target = context, includeStroke = true) {
  target.save(); target.globalCompositeOperation = 'source-over'; target.globalAlpha = 1;
  target.fillStyle = drawing.background; target.fillRect(0, 0, drawing.width, drawing.height);
  for (const entry of drawing.layers) {
    if (!entry.visible) continue;
    let c = layerCanvas(entry);
    if (includeStroke && entry.id === activeLayer && activeStroke) {
      previewCtx.clearRect(0, 0, drawing.width, drawing.height); previewCtx.drawImage(c, 0, 0);
      paintStroke(previewCtx, activeStroke); c = preview;
    }
    target.globalAlpha = entry.opacity; target.drawImage(c, 0, 0);
  }
  target.restore();
}
function scheduleRender() {
  if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
}
function updateHistory() { $('undo').disabled = !previous.length; $('redo').disabled = !future.length; }
function changed() {
  dirty = true; changeNumber++; drawing.updatedAt = Date.now();
  status('저장하지 않은 변경 사항', '자동 저장 대기 중 · 중요한 작업은 복구 파일도 보관하세요.');
  clearTimeout(saveTimer); saveTimer = setTimeout(() => { void flush(); }, 300);
  updateHistory(); scheduleRender();
}
function applyCommand(command) {
  command.redo(); previous.push(command); if (previous.length > 40) previous.shift(); future = [];
  pointCount = documentPointCount(drawing); changed();
}
function undo() {
  finishStroke(); const command = previous.pop(); if (!command) return;
  command.undo(); future.push(command); cache.clear(); pointCount = documentPointCount(drawing); refreshLayers(); changed();
}
function redo() {
  finishStroke(); const command = future.pop(); if (!command) return;
  command.redo(); previous.push(command); cache.clear(); pointCount = documentPointCount(drawing); refreshLayers(); changed();
}
async function refreshDocuments() {
  try {
    const rows = await store.list();
    $('documents').replaceChildren(new Option('작업 선택', ''));
    for (const row of rows) $('documents').add(new Option(row.document.title, row.id));
    $('documents').value = drawing.id;
  } catch { /* Failure is already visible in save status. Drawing remains available. */ }
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving) { await saving; return !dirty; }
  if (!dirty) return true;
  saving = (async () => {
    try {
      while (dirty) {
        const generation = changeNumber;
        const snapshot = validateDocument(structuredClone(drawing));
        status('기기에 저장 중…');
        try { revision = await store.save(snapshot, revision); }
        catch (error) {
          if (!(error instanceof LocalConflict)) throw error;
          drawing.id = uid(); drawing.title = `${drawing.title.slice(0, 95)} (충돌 복구 사본)`; revision = 0;
          $('title').value = drawing.title; changeNumber++;
          showError('다른 탭의 변경을 보존하기 위해 새 복구 사본으로 저장합니다. 원래 문서는 덮어쓰지 않았습니다.');
          continue;
        }
        dirty = changeNumber !== generation;
      }
      try { localStorage.setItem('toonstudio-local-last-document', drawing.id); } catch { /* Storage may be denied. */ }
      status('기기에 저장됨', `${new Date(drawing.updatedAt).toLocaleTimeString()} · 클라우드에는 업로드하지 않았습니다.`);
      await refreshDocuments();
    } catch (error) {
      dirty = true;
      status('로컬 저장 실패 — 복구 파일을 내려받으세요', '현재 화면의 그림은 유지됩니다. 브라우저를 닫지 말고 파일로 보관하세요.');
      showError(error);
    }
  })().finally(() => { saving = null; });
  await saving; return !dirty;
}
function refreshLayers() {
  $('layers').replaceChildren();
  for (const entry of [...drawing.layers].reverse()) {
    const row = document.createElement('div'); row.className = `layer${entry.id === activeLayer ? ' active' : ''}`;
    const heading = document.createElement('div'); heading.className = 'layer-row';
    const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = entry.visible;
    visible.setAttribute('aria-label', `${entry.name} 표시`);
    visible.addEventListener('change', () => { finishStroke(); const old = entry.visible, value = visible.checked; applyCommand({ redo: () => { entry.visible = value; }, undo: () => { entry.visible = old; } }); refreshLayers(); });
    const choose = document.createElement('button'); choose.textContent = entry.name;
    choose.setAttribute('aria-pressed', String(entry.id === activeLayer));
    choose.addEventListener('click', () => { finishStroke(); activeLayer = entry.id; refreshLayers(); });
    const opacity = document.createElement('input'); opacity.type = 'range'; opacity.min = '0'; opacity.max = '100'; opacity.value = String(entry.opacity * 100);
    opacity.setAttribute('aria-label', `${entry.name} 불투명도`);
    opacity.addEventListener('change', () => { finishStroke(); const old = entry.opacity, value = Number(opacity.value) / 100; applyCommand({ redo: () => { entry.opacity = value; }, undo: () => { entry.opacity = old; } }); });
    heading.append(visible, choose); row.append(heading, opacity); $('layers').append(row);
  }
  $('add-layer').disabled = drawing.layers.length >= LIMITS.layers;
  canvas.dataset.locked = String(!layer().visible || layer().opacity === 0);
}
function updateScale(fit = false) {
  if (fit) {
    const view = $('viewport');
    const value = Math.min((view.clientWidth - 48) / drawing.width, (view.clientHeight - 48) / drawing.height) * 100;
    $('zoom').value = String(clamp(value, 20, 250));
  }
  const scale = Number($('zoom').value) / 100;
  canvas.style.width = `${drawing.width * scale}px`; canvas.style.height = `${drawing.height * scale}px`;
  $('zoom-value').textContent = `${Math.round(scale * 100)}%`;
}
async function decodeRaster(data) {
  if (rasters.has(data)) return;
  const image = new Image(); image.src = data; await image.decode();
  if (image.naturalWidth * image.naturalHeight > 33554432) throw new Error('이미지가 너무 큽니다. 3,200만 픽셀 이하로 줄여 주세요.');
  rasters.set(data, image);
}
async function openDocument(documentData, savedRevision = 0) {
  const candidate = validateDocument(documentData);
  const nextRasters = candidate.layers.filter((entry) => entry.raster).map((entry) => entry.raster);
  // Decode before replacing the current document, so a corrupt backup cannot destroy it.
  await Promise.all(nextRasters.map(decodeRaster));
  finishStroke();
  if (saving) await saving;
  drawing = candidate; revision = savedRevision; activeLayer = candidate.layers[0].id;
  dirty = false; changeNumber++; pointCount = documentPointCount(drawing); previous = []; future = []; cache.clear();
  for (const key of rasters.keys()) if (!nextRasters.includes(key)) rasters.delete(key);
  canvas.width = scratch.width = preview.width = drawing.width;
  canvas.height = scratch.height = preview.height = drawing.height;
  $('title').value = drawing.title; $('dimensions').textContent = `${drawing.width} × ${drawing.height}`;
  refreshLayers(); updateHistory(); updateScale(true); render();
  if (!savedRevision) changed(); else status('기기에 저장된 작업을 복구했습니다');
}
function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) * drawing.width / rect.width, 0, drawing.width), y: clamp((event.clientY - rect.top) * drawing.height / rect.height, 0, drawing.height), p: event.pointerType === 'pen' ? clamp(event.pressure || .08, .02, 1) : .75 };
}
function finishStroke() {
  if (!activeStroke) return;
  const stroke = activeStroke, targetLayer = layer(); activeStroke = null; pointerId = null;
  const cached = layerCanvas(targetLayer); paintStroke(cached.getContext('2d'), stroke);
  applyCommand({ redo: () => { targetLayer.strokes.push(stroke); }, undo: () => { targetLayer.strokes.pop(); cache.delete(targetLayer.id); } });
}
canvas.addEventListener('pointerdown', (event) => {
  if (!initializationComplete || pointerId !== null || event.button !== 0) return;
  if (!layer().visible || layer().opacity === 0) { showError('선택한 레이어가 숨겨져 있습니다. 고급 모드에서 레이어를 표시해 주세요.'); return; }
  if (pointCount >= LIMITS.points || drawing.layers.reduce((n, entry) => n + entry.strokes.length, 0) >= LIMITS.strokes) { showError('작업 크기 제한에 도달했습니다. 파일로 보관한 뒤 새 드로잉을 시작해 주세요.'); return; }
  event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointerId = event.pointerId;
  activeStroke = { tool, color: $('color').value, size: Number($('size').value), points: [eventPoint(event)] }; scheduleRender();
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerId || !activeStroke) return;
  event.preventDefault();
  const samples = event.getCoalescedEvents?.() ?? [event];
  for (const sample of samples.length ? samples : [event]) {
    if (pointCount + activeStroke.points.length >= LIMITS.points || activeStroke.points.length >= 4096) { finishStroke(); showError('긴 획을 저장했습니다. 펜을 떼고 다음 획을 이어 그려 주세요.'); break; }
    const p = eventPoint(sample), last = activeStroke.points.at(-1);
    if (Math.hypot(p.x - last.x, p.y - last.y) >= .35 || Math.abs(p.p - last.p) > .03) activeStroke.points.push(p);
  }
  scheduleRender();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, (event) => { if (event.pointerId === pointerId) finishStroke(); });
function selectTool(value) {
  finishStroke(); tool = value;
  document.querySelectorAll('[data-tool]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
}
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.tool)));
$('size').addEventListener('input', () => { $('size-value').value = $('size').value; });
$('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
$('zoom').addEventListener('input', () => updateScale()); $('fit').addEventListener('click', () => updateScale(true));
$('simple').addEventListener('click', () => { const simple = !$('advanced').hidden; $('advanced').hidden = simple; $('simple').setAttribute('aria-pressed', String(simple)); $('simple').textContent = simple ? '심플 모드' : '고급 모드'; });
$('title').addEventListener('change', () => { drawing.title = $('title').value.trim().slice(0, 120) || '새 로컬 드로잉'; $('title').value = drawing.title; changed(); });
$('save').addEventListener('click', () => { finishStroke(); void flush(); });
$('add-layer').addEventListener('click', () => {
  finishStroke(); if (drawing.layers.length >= LIMITS.layers) return;
  const entry = makeLayer(`레이어 ${drawing.layers.length + 1}`), old = activeLayer;
  applyCommand({ redo: () => { drawing.layers.push(entry); activeLayer = entry.id; }, undo: () => { drawing.layers.pop(); activeLayer = old; } }); refreshLayers();
});
$('clear-layer').addEventListener('click', () => {
  finishStroke(); const entry = layer(); if (!entry.strokes.length && !entry.raster) return;
  if (!confirm('선택 레이어를 비울까요? 실행 취소로 되돌릴 수 있습니다.')) return;
  const strokes = entry.strokes, raster = entry.raster;
  applyCommand({ redo: () => { entry.strokes = []; entry.raster = null; cache.delete(entry.id); }, undo: () => { entry.strokes = strokes; entry.raster = raster; cache.delete(entry.id); } });
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function filename(extension) {
  const title = Array.from(drawing.title, (character) =>
    character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? '_' : character,
  ).join('').slice(0, 90);
  return `${title}.${extension}`;
}
$('export-json').addEventListener('click', () => {
  try { finishStroke(); download(new Blob([JSON.stringify(validateDocument(drawing))], { type: 'application/json' }), filename('toonlocal')); } catch (error) { showError(error); }
});
$('export-png').addEventListener('click', () => {
  finishStroke(); const c = surface(); render(c.getContext('2d'), false);
  c.toBlob((blob) => { if (blob) download(blob, filename('png')); else showError('PNG를 만들지 못했습니다. 복구 파일로 저장해 주세요.'); }, 'image/png');
});
async function confirmReplacement() {
  finishStroke(); if (await flush()) return true;
  return confirm('로컬 자동 저장에 실패했습니다. 필요한 복구 파일을 별도로 저장했으며 현재 그림을 교체할까요?');
}
$('new').addEventListener('click', async () => { try { if (await confirmReplacement()) await openDocument(makeDocument()); } catch (error) { showError(error); } });
$('documents').addEventListener('change', async () => {
  const id = $('documents').value; if (!id || id === drawing.id) return;
  finishStroke(); if (!(await flush())) return;
  try { const row = await store.get(id); if (row) await openDocument(row.document, row.revision); } catch (error) { showError(error); }
});
$('import').addEventListener('change', async () => {
  const file = $('import').files?.[0]; $('import').value = ''; if (!file) return;
  if (!(await confirmReplacement())) return;
  try {
    if (file.size > LIMITS.fileBytes) throw new Error('16MB 이하의 파일만 열 수 있습니다.');
    if (/\.(json|toonlocal)$/i.test(file.name)) {
      const next = validateDocument(JSON.parse(await file.text())); next.id = uid(); next.title = `${next.title.slice(0, 100)} (가져온 사본)`; await openDocument(next);
    } else {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG/JPEG/WebP 또는 로컬 복구 파일을 선택하세요.');
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      await decodeRaster(data); const next = makeDocument(); next.title = file.name.slice(0, 120);
      next.layers[0].name = '가져온 이미지'; next.layers[0].raster = data; next.layers.push(makeLayer('드로잉'));
      await openDocument(next); activeLayer = next.layers[1].id; refreshLayers();
    }
  } catch (error) { showError(error); }
});
$('persist').addEventListener('click', async () => {
  try { const granted = await navigator.storage?.persist?.(); showError(granted ? '기기 보관 요청이 승인되었습니다. 브라우저 데이터 삭제까지 막는 것은 아니므로 파일 백업도 유지하세요.' : '브라우저가 기기 보관을 승인하지 않았습니다. 복구 파일을 별도로 보관해 주세요.'); } catch (error) { showError(error); }
});
$('history').addEventListener('click', async () => {
  finishStroke(); if (!(await flush())) return;
  try {
    const rows = await store.history(drawing.id); $('history-list').replaceChildren();
    for (const row of rows) {
      const b = document.createElement('button'); b.textContent = `${new Date(row.document.updatedAt).toLocaleString()} · 저장본 ${row.revision}`;
      b.addEventListener('click', async () => {
        try {
          if (!(await flush())) return;
          const next = structuredClone(row.document); next.id = uid(); next.title = `${next.title.slice(0, 96)} (이전 저장 복구)`;
          await openDocument(next); $('history-dialog').close();
        } catch (error) { showError(error); }
      }); $('history-list').append(b);
    }
    $('history-dialog').showModal();
  } catch (error) { showError(error); }
});
$('close-history').addEventListener('click', () => $('history-dialog').close());
document.addEventListener('keydown', (event) => {
  if (event.isComposing || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.target?.isContentEditable || $('history-dialog').open) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  else if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); finishStroke(); void flush(); }
  else if (!event.ctrlKey && !event.metaKey && !event.altKey) { if (key === 'b') selectTool('pen'); if (key === 'e') selectTool('eraser'); }
});
window.addEventListener('beforeunload', (event) => { if (dirty || activeStroke || saving) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishStroke(); void flush(); } });
window.addEventListener('pagehide', () => { finishStroke(); void flush(); });
async function initialize() {
  scratch.width = preview.width = canvas.width; scratch.height = preview.height = canvas.height;
  refreshLayers(); updateScale(true); render();
  try {
    const rows = await store.list();
    let id; try { id = localStorage.getItem('toonstudio-local-last-document'); } catch { /* Drawing works without preferences. */ }
    const summary = rows.find((entry) => entry.id === id) ?? rows[0];
    const row = summary ? await store.get(summary.id) : null;
    if (row) await openDocument(row.document, row.revision); else changed();
    await refreshDocuments();
  } catch (error) { dirty = true; status('로컬 저장소 사용 불가 — 파일 저장을 사용하세요'); showError(error); }
  initializationComplete = true;
  document.documentElement.dataset.localDrawingReady = 'true';
  if (location.protocol === 'file:') { $('offline-state').textContent = '휴대용 파일 · 네트워크 없이 실행'; return; }
  try {
    if (!('serviceWorker' in navigator)) throw new Error('서비스 워커 미지원');
    await navigator.serviceWorker.register('/offline-draw/sw.js', { scope: '/offline-draw/' });
    const check = async () => {
      const ready = await caches.match('/offline-draw/ready-v2', { cacheName: 'toonstudio-emergency-drawing-shell-v2' });
      $('offline-state').textContent = ready ? '로컬 드로잉 실행 파일 보관됨' : '오프라인 실행 파일 준비 중 · 완료 전 창을 닫지 마세요';
      return Boolean(ready);
    };
    for (let i = 0; i < 12; i++) { if (await check()) break; await new Promise((resolve) => setTimeout(resolve, 500)); }
  } catch { $('offline-state').textContent = '오프라인 재실행 준비를 확인하지 못했습니다. 파일 백업을 보관하세요.'; }
}
void initialize().catch(showError);
