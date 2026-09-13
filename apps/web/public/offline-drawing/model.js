/** Server-independent drawing format. Deliberately does not read or mutate cloud/Studio stores. */
export const FORMAT = 'toonstudio-local-drawing';
export const MAX_POINTS = 300000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export function newDocument() {
  return { format: FORMAT, version: 1, id: crypto.randomUUID(), title: '로컬 원고', width: 1600, height: 1200,
    revision: 0, updatedAt: Date.now(), layers: [{ id: 'ink', name: '선화', visible: true }], strokes: [], cursor: 0, backgroundImage: null };
}
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
export function parseDocument(input) {
  const bad = () => { throw new Error('지원하지 않거나 손상된 로컬 원고 파일이에요. 기존 원고는 유지됩니다.'); };
  if (!input || input.format !== FORMAT || input.version !== 1 || !text(input.id, 80) || !text(input.title, 100)) bad();
  if (![input.width, input.height].every(n => Number.isInteger(n) && finite(n, 64, 4096))) bad();
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > 8) bad();
  const ids = new Set();
  const layers = input.layers.map(layer => {
    if (!layer || !text(layer.id, 80) || ids.has(layer.id) || !text(layer.name, 80) || typeof layer.visible !== 'boolean') bad();
    ids.add(layer.id); return { id: layer.id, name: layer.name, visible: layer.visible };
  });
  if (!Array.isArray(input.strokes) || input.strokes.length > 5000 || !Number.isInteger(input.cursor) || !finite(input.cursor, 0, input.strokes.length)) bad();
  let count = 0;
  const strokes = input.strokes.map(stroke => {
    if (!stroke || !ids.has(stroke.layerId) || !['pen', 'eraser'].includes(stroke.tool) || !/^#[0-9a-f]{6}$/i.test(stroke.color) || !finite(stroke.size, 1, 120)) bad();
    if (!Array.isArray(stroke.points) || !stroke.points.length || (count += stroke.points.length) > MAX_POINTS) bad();
    const points = stroke.points.map(p => {
      if (!Array.isArray(p) || p.length !== 3 || !finite(p[0], -4096, 8192) || !finite(p[1], -4096, 8192) || !finite(p[2], 0, 1)) bad();
      return [...p];
    });
    return { layerId: stroke.layerId, tool: stroke.tool, size: stroke.size, color: stroke.color, points };
  });
  const backgroundImage = input.backgroundImage ?? null;
  if (backgroundImage !== null && (typeof backgroundImage !== 'string' || backgroundImage.length > 12000000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(backgroundImage))) bad();
  return { format: FORMAT, version: 1, id: input.id, title: input.title, width: input.width, height: input.height,
    revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    updatedAt: finite(input.updatedAt, 0, Number.MAX_SAFE_INTEGER) ? input.updatedAt : Date.now(), layers, strokes, cursor: input.cursor, backgroundImage };
}
export function openDrawingDatabase(factory = indexedDB) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('로컬 저장소가 응답하지 않아요. 파일 백업을 사용해 주세요.')); }, 2500);
    const request = factory.open('toonstudio-emergency-drawing-v1', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents', { keyPath: 'id' }); };
    request.onerror = () => { clearTimeout(timer); settled = true; reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error('다른 탭이 저장소를 사용하고 있어요. 파일 백업을 사용해 주세요.')); };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      clearTimeout(timer); settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export function listDocuments(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const request = tx.objectStore('documents').getAll();
    tx.oncomplete = () => resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('로컬 원고 목록을 읽지 못했어요.'));
  });
}
/** Compare-and-swap and fork are in ONE IDB transaction: concurrent tabs cannot overwrite work. */
export function saveDocument(db, input, expectedRevision) {
  const snapshot = parseDocument(input);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.get(snapshot.id);
    let result;
    request.onsuccess = () => {
      const current = request.result;
      const conflict = current ? current.revision !== expectedRevision : expectedRevision !== 0;
      result = { ...snapshot, id: conflict ? crypto.randomUUID() : snapshot.id,
        title: conflict ? `${snapshot.title.slice(0, 85)} (충돌 사본)` : snapshot.title,
        revision: conflict ? 1 : (current?.revision ?? 0) + 1, updatedAt: Date.now() };
      store.put(result);
    };
    tx.oncomplete = () => resolve({ document: result, forked: result.id !== snapshot.id });
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('저장에 실패했어요. 원고 파일을 백업해 주세요.'));
  });
}
