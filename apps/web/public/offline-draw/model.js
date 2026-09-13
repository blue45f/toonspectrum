/** Server-independent drawing document. Never reads or mutates Studio's OPFS. */
export const DOCUMENT_VERSION = 1;
export const LIMITS = Object.freeze({ layers: 8, points: 120000, strokes: 10000, side: 4096, pixels: 8388608, fileBytes: 16777216 });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function makeLayer(name = '레이어 1') {
  return { id: uid(), name, visible: true, opacity: 1, strokes: [], raster: null };
}
export function makeDocument() {
  return { format: 'toonstudio-local-drawing', version: DOCUMENT_VERSION, id: uid(), title: '새 로컬 드로잉', width: 1280, height: 960, background: '#ffffff', layers: [makeLayer()], updatedAt: Date.now() };
}
function finite(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} 값이 올바르지 않습니다.`);
  return value;
}
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} 값이 올바르지 않습니다.`);
  return value;
}
function color(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('색상 값이 올바르지 않습니다.');
  return value;
}
/** Whitelist each field; do not merge untrusted backup objects into app state. */
export function validateDocument(input) {
  if (!input || input.format !== 'toonstudio-local-drawing' || input.version !== 1) throw new Error('지원하지 않는 로컬 드로잉 파일입니다.');
  const width = finite(input.width, 64, LIMITS.side, '너비');
  const height = finite(input.height, 64, LIMITS.side, '높이');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > LIMITS.pixels) throw new Error('캔버스 크기 제한을 초과했습니다.');
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > LIMITS.layers) throw new Error('레이어 수 제한을 초과했습니다.');
  let count = 0, strokeCount = 0;
  const ids = new Set();
  const layers = input.layers.map((layer) => {
    if (!layer || !Array.isArray(layer.strokes)) throw new Error('레이어가 손상되었습니다.');
    const id = text(layer.id, 100, '레이어 ID');
    if (ids.has(id)) throw new Error('레이어 ID가 중복되었습니다.');
    ids.add(id);
    if (typeof layer.visible !== 'boolean') throw new Error('레이어 표시 값이 올바르지 않습니다.');
    let raster = null;
    if (layer.raster != null) {
      if (typeof layer.raster !== 'string' || layer.raster.length > LIMITS.fileBytes || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(layer.raster)) throw new Error('지원하지 않는 이미지입니다. PNG/JPEG/WebP만 허용됩니다.');
      raster = layer.raster;
    }
    const strokes = layer.strokes.map((stroke) => {
      if (!stroke || !['pen', 'pencil', 'marker', 'eraser'].includes(stroke.tool)) throw new Error('브러시 정보가 올바르지 않습니다.');
      if (!Array.isArray(stroke.points) || !stroke.points.length) throw new Error('빈 획은 불러올 수 없습니다.');
      count += stroke.points.length; strokeCount++;
      if (count > LIMITS.points || strokeCount > LIMITS.strokes) throw new Error('드로잉 파일 크기 제한을 초과했습니다.');
      return { tool: stroke.tool, color: color(stroke.color), size: finite(stroke.size, 1, 128, '브러시 크기'), points: stroke.points.map((p) => ({ x: finite(p.x, 0, width, 'X'), y: finite(p.y, 0, height, 'Y'), p: finite(p.p, 0, 1, '필압') })) };
    });
    return { id, name: text(layer.name, 100, '레이어 이름'), visible: layer.visible, opacity: finite(layer.opacity, 0, 1, '불투명도'), strokes, raster };
  });
  return { format: input.format, version: 1, id: text(input.id, 100, '문서 ID'), title: text(input.title, 120, '제목'), width, height, background: color(input.background), layers, updatedAt: finite(input.updatedAt, 0, Number.MAX_SAFE_INTEGER, '수정 시간') };
}
export function documentPointCount(doc) {
  return doc.layers.reduce((sum, layer) => sum + layer.strokes.reduce((n, stroke) => n + stroke.points.length, 0), 0);
}
/** Deterministic texture: replay, undo and reload produce identical pixels. */
export function drawStroke(ctx, stroke) {
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.fillStyle = stroke.color; ctx.strokeStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const points = stroke.points;
  const width = (p) => Math.max(.5, stroke.size * (.15 + .85 * p));
  const dab = (p, index) => {
    const r = width(p.p) / 2;
    if (stroke.tool === 'pencil') {
      let seed = (Math.round(p.x * 17) ^ Math.round(p.y * 131) ^ (index * 2654435761)) >>> 0;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      ctx.globalAlpha = .18 + .55 * p.p;
      for (let k = 0; k < Math.max(4, r * 3); k++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * r;
        ctx.fillRect(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, .5 + random(), .5 + random());
      }
    } else {
      ctx.beginPath();
      if (stroke.tool === 'marker') ctx.ellipse(p.x, p.y, Math.max(1, r * .45), Math.max(1, r), -.4, 0, Math.PI * 2);
      else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  dab(points[0], 0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.min(8192, Math.max(1, Math.ceil(distance / Math.max(.7, Math.min(width(a.p), width(b.p)) * .18))));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      dab({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t }, i * 8192 + j);
    }
  }
  ctx.restore();
}
