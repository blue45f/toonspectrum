/** Pure editorial settings. Never persist room poses, camera frames, or image URLs. */
export type SpatialReaderLayout = "focus" | "arc" | "wall";
export type SpatialReaderDirection = "ltr" | "rtl";
export type SpatialReaderTheme = "night" | "paper" | "sepia";
export type SpatialReaderQuality = "battery" | "balanced" | "sharp";
export interface SpatialReaderSettings {
  layout: SpatialReaderLayout; direction: SpatialReaderDirection;
  theme: SpatialReaderTheme; quality: SpatialReaderQuality;
  distance: number; scale: number; segments: boolean; dwell: boolean;
}
export interface SpatialReaderCursor { page: number; segment: number }
export interface SpatialImageSize { width: number; height: number }
export interface SpatialReaderCrop { y: number; height: number; width: number }
export type SpatialReaderCommand = "previous" | "next" | "first" | "last" | "nearer" | "farther" | "smaller" | "larger" | "recenter" | "exit";
export const SPATIAL_READER_DEFAULTS: Readonly<SpatialReaderSettings> = Object.freeze({
  layout: "focus", direction: "ltr", theme: "night", quality: "balanced",
  distance: 2, scale: 1, segments: true, dwell: false,
});
export const SPATIAL_READER_QUALITY = Object.freeze({
  battery: { textureEdge: 1024, framebufferScale: 0.8 },
  balanced: { textureEdge: 1536, framebufferScale: 1 },
  sharp: { textureEdge: 2048, framebufferScale: 1.2 },
});
export const SPATIAL_READER_STORAGE_KEY = "toonstudio.spatial-reader.v1";
export const SPATIAL_READER_MAX_LOCAL_FILES = 64;
export const SPATIAL_READER_MAX_LOCAL_BYTES = 64 * 1024 * 1024;
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeSpatialReaderSettings(value: unknown): SpatialReaderSettings {
  const s = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    layout: s.layout === "arc" || s.layout === "wall" ? s.layout : "focus",
    direction: s.direction === "rtl" ? "rtl" : "ltr",
    theme: s.theme === "paper" || s.theme === "sepia" ? s.theme : "night",
    quality: s.quality === "battery" || s.quality === "sharp" ? s.quality : "balanced",
    distance: finite(s.distance, 2, 1, 5), scale: finite(s.scale, 1, 0.5, 1.8),
    segments: typeof s.segments === "boolean" ? s.segments : true,
    dwell: s.dwell === true,
  };
}
/** Overlapping reading windows, not AI panel detection; every source row remains reachable. */
export function spatialReaderCrops(size: SpatialImageSize | undefined, split: boolean): SpatialReaderCrop[] {
  const width = Math.round(finite(size?.width, 800, 1, 65536));
  const height = Math.round(finite(size?.height, 1120, 1, 65536));
  const cropHeight = split ? Math.min(height, Math.max(1, Math.round(width * 1.4), Math.ceil(height / (1 + 255 * 0.92)))) : height;
  if (cropHeight >= height) return [{ y: 0, height, width }];
  const count = Math.min(256, Math.ceil((height - cropHeight) / Math.max(1, cropHeight * 0.92)) + 1);
  return Array.from({ length: count }, (_, i) => ({ y: Math.round(i * (height - cropHeight) / (count - 1)), height: cropHeight, width }));
}
export function resolveSpatialReaderCursor(cursor: SpatialReaderCursor, pageCount: number, sizes: Readonly<Record<number, SpatialImageSize>>, split: boolean): SpatialReaderCursor {
  const page = Math.floor(finite(cursor.page, 0, 0, Math.max(0, Math.floor(finite(pageCount, 0, 0, 100001)) - 1)));
  const count = spatialReaderCrops(sizes[page], split).length;
  return { page, segment: Math.floor(finite(cursor.segment, 0, 0, count - 1)) };
}
export function moveSpatialReaderCursor(cursor: SpatialReaderCursor, command: "previous" | "next" | "first" | "last", pageCount: number, sizes: Readonly<Record<number, SpatialImageSize>>, split: boolean): SpatialReaderCursor {
  const current = resolveSpatialReaderCursor(cursor, pageCount, sizes, split);
  const count = spatialReaderCrops(sizes[current.page], split).length;
  switch (command) {
    case "first": return { page: 0, segment: 0 };
    case "last": return { page: Math.max(0, Math.floor(finite(pageCount, 0, 0, 100001)) - 1), segment: Number.MAX_SAFE_INTEGER };
    case "next": return current.segment < count - 1 ? { ...current, segment: current.segment + 1 } : current.page < pageCount - 1 ? { page: current.page + 1, segment: 0 } : current;
    case "previous": return current.segment > 0 ? { ...current, segment: current.segment - 1 } : current.page > 0 ? { page: current.page - 1, segment: Number.MAX_SAFE_INTEGER } : current;
  }
}
export function spatialReaderKeyCommand(key: string, direction: SpatialReaderDirection): SpatialReaderCommand | null {
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "ArrowDown" || key === "PageDown") return "next";
  if (key === "ArrowUp" || key === "PageUp") return "previous";
  if (key === "ArrowRight") return direction === "rtl" ? "previous" : "next";
  if (key === "ArrowLeft") return direction === "rtl" ? "next" : "previous";
  return null;
}
export function spatialReaderTextureSize(crop: SpatialReaderCrop, maxEdge: number): SpatialImageSize {
  const factor = Math.min(1, finite(maxEdge, 1536, 256, 2048) / Math.max(crop.width, crop.height));
  return { width: Math.max(1, Math.round(crop.width * factor)), height: Math.max(1, Math.round(crop.height * factor)) };
}
/** Return the validated URL itself so DOM sinks never receive the unchecked input. */
export function resolveSpatialReaderImageSource(value: string | undefined, base: string): string | null {
  if (!value || value.length > 32 * 1024 * 1024) return null;
  if (/^data:image\/(?:png|jpeg|webp|avif|gif);base64,[a-z\d+/=\r\n]+$/iu.test(value)) return value;
  try {
    const url = new URL(value, base);
    const origin = new URL(base).origin;
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return url.href;
    if (url.protocol === "http:" && url.origin === origin) return url.href;
    if (url.protocol === "blob:" && url.origin === origin) return url.href;
    return null;
  } catch { return null; }
}
export function isSpatialReaderImageSource(value: string, base: string): boolean {
  return resolveSpatialReaderImageSource(value, base) !== null;
}
export function validateSpatialReaderFiles(files: readonly Pick<File, "name" | "type" | "size">[]): string | null {
  if (files.length === 0) return "PNG·JPEG·WebP·AVIF·GIF 원고 이미지를 선택해 주세요.";
  if (files.length > SPATIAL_READER_MAX_LOCAL_FILES) return "한 번에 최대 64개 이미지를 열 수 있습니다.";
  if (files.some((f) => !/^image\/(png|jpeg|webp|avif|gif)$/u.test(f.type))) return "지원하지 않는 파일이 포함돼 있습니다. SVG·문서·압축 파일은 받지 않습니다.";
  if (files.some((f) => f.size <= 0 || f.size > 16 * 1024 * 1024)) return "이미지는 각각 0바이트 초과, 16MB 이하여야 합니다.";
  if (files.reduce((sum, f) => sum + f.size, 0) > SPATIAL_READER_MAX_LOCAL_BYTES) return "이미지 전체 용량은 64MB 이하여야 합니다.";
  return null;
}
interface StoredReaderState { settings: SpatialReaderSettings; progress: { id: string; page: number; segment: number }[] }
function readStored(storage: Pick<Storage, "getItem">): StoredReaderState {
  try {
    const raw = storage.getItem(SPATIAL_READER_STORAGE_KEY);
    if (!raw || raw.length > 32768) throw new Error("Invalid stored reader state");
    const record = JSON.parse(raw) as Record<string, unknown>;
    if (record.version !== 1) throw new Error("Unknown reader version");
    const progress = Array.isArray(record.progress) ? record.progress.slice(-64).flatMap((p: unknown) => {
      if (!p || typeof p !== "object") return [];
      const item = p as Record<string, unknown>;
      if (typeof item.id !== "string" || item.id.length > 160) return [];
      return [{ id: item.id, page: Math.floor(finite(item.page, 0, 0, 100000)), segment: Math.floor(finite(item.segment, 0, 0, 255)) }];
    }) : [];
    return { settings: normalizeSpatialReaderSettings(record.settings), progress };
  } catch { return { settings: { ...SPATIAL_READER_DEFAULTS }, progress: [] }; }
}
export function loadSpatialReaderPreferences(storage: Pick<Storage, "getItem">, id: string) {
  const stored = readStored(storage); const match = stored.progress.find((p) => p.id === id.slice(0, 160));
  return { settings: stored.settings, cursor: { page: match?.page ?? 0, segment: match?.segment ?? 0 } };
}
export function saveSpatialReaderPreferences(storage: Pick<Storage, "getItem" | "setItem">, id: string, settings: SpatialReaderSettings, cursor: SpatialReaderCursor): boolean {
  try {
    const key = id.slice(0, 160); const stored = readStored(storage);
    // Local files leave no durable per-document reading trace.
    const progress = key.startsWith("local:") ? stored.progress : [
      ...stored.progress.filter((p) => p.id !== key),
      { id: key, page: Math.floor(finite(cursor.page, 0, 0, 100000)), segment: Math.floor(finite(cursor.segment, 0, 0, 255)) },
    ].slice(-64);
    storage.setItem(SPATIAL_READER_STORAGE_KEY, JSON.stringify({ version: 1, settings: normalizeSpatialReaderSettings(settings), progress }));
    return true;
  } catch { return false; }
}
/** Neutral-to-deflected latch: a held stick cannot fly through a chapter. */
export function spatialReaderStickStep(axis: number, latched: boolean): { command: "next" | "previous" | null; latched: boolean } {
  if (!Number.isFinite(axis) || Math.abs(axis) < 0.25) return { command: null, latched: false };
  if (latched || Math.abs(axis) < 0.7) return { command: null, latched };
  return { command: axis > 0 ? "next" : "previous", latched: true };
}
