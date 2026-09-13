export interface SpatialLayer { src: string; depth: number }
export interface SpatialPanel { id: string; title: string; caption: string; alt: string; src: string; seconds: number; layers: SpatialLayer[] }
export interface SpatialBook { format: "toonstudio-spatial-book"; version: 1; id: string; title: string; panels: SpatialPanel[]; audio?: string }
const object = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === "object" && !Array.isArray(x));
function text(value: unknown, max: number): string { if (typeof value !== "string" || value.length > max) throw new Error("공간 웹툰의 텍스트 형식이 올바르지 않아요."); return value; }
export function spatialRaster(value: unknown): string {
  if (typeof value !== "string" || value.length > 8_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error("공간 웹툰에는 내장된 PNG·JPEG·WebP 이미지만 사용할 수 있어요.");
  return value;
}
export function parseSpatialBook(value: unknown): SpatialBook {
  if (!object(value) || value.format !== "toonstudio-spatial-book" || value.version !== 1 || !Array.isArray(value.panels) || !value.panels.length || value.panels.length > 32) throw new Error("1~32컷의 공간 웹툰 파일을 사용해 주세요.");
  const ids = new Set<string>(); let total = 0;
  const panels = value.panels.map(item => {
    if (!object(item)) throw new Error("컷 정보가 올바르지 않아요.");
    const id = text(item.id,80); if (!id || ids.has(id)) throw new Error("컷 ID가 중복되었어요."); ids.add(id);
    const src = spatialRaster(item.src); total += src.length;
    const layers = item.layers ?? []; if (!Array.isArray(layers) || layers.length > 3) throw new Error("깊이 레이어는 컷마다 최대 3개예요.");
    const resultLayers = layers.map(layer => {
      if (!object(layer) || typeof layer.depth !== "number" || !Number.isFinite(layer.depth) || layer.depth < .02 || layer.depth > .6) throw new Error("깊이 레이어 값을 확인해 주세요.");
      const image = spatialRaster(layer.src); total += image.length; return { src: image, depth: layer.depth };
    });
    if (typeof item.seconds !== "number" || !Number.isFinite(item.seconds) || item.seconds < 2 || item.seconds > 60) throw new Error("컷 감상 시간은 2~60초예요.");
    return { id, title: text(item.title,120), caption: text(item.caption,2000), alt: text(item.alt,2000), src, layers: resultLayers, seconds: item.seconds };
  });
  const audio = value.audio;
  if (audio !== undefined && (typeof audio !== "string" || audio.length > 16_000_000 || !/^data:audio\/(mpeg|mp3|wav|ogg|webm|mp4);base64,[A-Za-z0-9+/]+={0,2}$/u.test(audio))) throw new Error("내장 오디오 파일이 올바르지 않아요.");
  if (total + (typeof audio === "string" ? audio.length : 0) > 80_000_000) throw new Error("공간 웹툰 파일은 80MB 이하여야 해요.");
  const bookId = text(value.id,80); if (!bookId) throw new Error("작품 ID가 비어 있어요.");
  return { format: "toonstudio-spatial-book", version: 1, id: bookId, title: text(value.title,160), panels, ...(audio ? { audio: String(audio) } : {}) };
}
export function nextSpatialPanel(index: number, delta: number, length: number): number { return Math.max(0,Math.min(Math.max(0,length-1), Math.trunc(index+delta))); }
export function visibleSpatialPanels(index: number, length: number): number[] { return Array.from({ length },(_,i)=>i).filter(i=>Math.abs(i-index)<=2); }
export async function localSpatialImage(file: File, maxSize = 1600): Promise<string> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("8MB 이하 PNG·JPEG·WebP 파일을 선택해 주세요.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 32_000_000) throw new Error("이미지가 너무 커요. 컷 단위로 나누어 주세요.");
    const scale = Math.min(1,maxSize/Math.max(image.width,image.height)); const canvas = document.createElement('canvas');
    canvas.width = Math.max(64,Math.round(image.width*scale)); canvas.height = Math.max(64,Math.round(image.height*scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("이미지 처리를 지원하지 않아요.");
    ctx.drawImage(image,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/png');
  } finally { image.close(); }
}
