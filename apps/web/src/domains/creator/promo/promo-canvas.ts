import { PROMO_DEFAULT_PRESENTATION, PROMO_FPS, promoFrameCount, promoMotionAt, promoCameraAt, promoTimeline } from "./promo-model";

import type { PromoProject, PromoScene } from "./promo-model";

export type PromoImages = ReadonlyMap<string, HTMLImageElement>;
const PALETTES = {
  cinematic: ["#0b1120", "#182b47", "#94b8ff"], romance: ["#251320", "#582b42", "#ffb3d1"],
  action: ["#16121a", "#43251c", "#ffc16f"], mystery: ["#0d1820", "#193c45", "#9be0df"],
} as const;

type FrameCaption = { text: string; progress: number };

function promoFrameCaption(
  project: PromoProject,
  frame: number,
  fallback: string,
  fallbackProgress: number,
): FrameCaption {
  const studio = project.voiceStudio;
  if (!studio || studio.captionMode === "scene") {
    return { text: fallback, progress: fallbackProgress };
  }
  if (studio.captionMode === "none") return { text: "", progress: 1 };
  const active = [...studio.clips]
    .sort((left, right) => left.startSec - right.startSec || left.id.localeCompare(right.id))
    .find((clip) => {
      const from = Math.round(clip.startSec * PROMO_FPS);
      const end = Math.round((clip.startSec + clip.durationSec) * PROMO_FPS);
      return frame >= from && frame < end;
    });
  if (!active) return { text: "", progress: 1 };
  const speaker = studio.speakers.find((candidate) => candidate.id === active.speakerId);
  const multipleSpeakers = new Set(studio.clips.map((clip) => clip.speakerId)).size > 1;
  const prefix = multipleSpeakers && speaker ? `${speaker.name}: ` : "";
  const from = Math.round(active.startSec * PROMO_FPS);
  const duration = Math.max(1, Math.round(active.durationSec * PROMO_FPS));
  const progress = Math.max(0, Math.min(1, (frame - from + 1) / duration));
  if (studio.captionMode !== "karaoke") return { text: `${prefix}${active.text}`, progress };
  const words = active.text.trim().split(/\s+/u).filter(Boolean);
  const visible = Math.max(1, Math.ceil(words.length * progress));
  return { text: `${prefix}${words.slice(0, visible).join(" ")}`, progress: 1 };
}

function lines(ctx: CanvasRenderingContext2D, value: string, width: number, maxLines: number): string[] {
  const result: string[] = [];
  let line = "";
  const characters = Array.from(value.replace(/[\r\n]+/gu, " "));
  for (let i = 0; i < characters.length; i += 1) {
    const character = characters[i] ?? "";
    if (line && ctx.measureText(line + character).width > width) {
      result.push(line);
      line = "";
      if (result.length === maxLines) {
        let last = result[maxLines - 1] ?? "";
        while (last && ctx.measureText(`${last}…`).width > width) last = Array.from(last).slice(0, -1).join("");
        result[maxLines - 1] = `${last}…`;
        return result;
      }
    }
    line += character;
  }
  if (line) result.push(line);
  return result;
}
interface PromoTextCacheEntry {
  readonly rows: readonly string[];
  readonly canvas: HTMLCanvasElement | null;
  readonly pixels: number;
}
interface PromoTextCache { entries: Map<string, PromoTextCacheEntry>; pixels: number }
// Opaque canvases can use platform LCD text antialiasing. Rasterizing that text through a
// transparent tile changes its pixels on Linux, so those canvases cache layout only and still call
// fillText directly. Alpha canvases retain the bounded raster-tile fast path.
const textCaches = new WeakMap<CanvasRenderingContext2D, PromoTextCache>();
const TEXT_CACHE_PIXELS = 2_000_000;
const TEXT_CACHE_ENTRIES = 16;

export function releasePromoTextCache(ctx: CanvasRenderingContext2D): void {
  const cache = textCaches.get(ctx);
  if (!cache) return;
  for (const { canvas } of cache.entries.values()) {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
  textCaches.delete(ctx);
}

function paintTextRows(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  x: number,
  y: number,
  fontSize: number,
): void {
  rows.forEach((line, index) => ctx.fillText(line, x, y + index * fontSize * 1.4));
}

function admitPromoTextCacheEntry(
  cache: PromoTextCache,
  key: string,
  entry: PromoTextCacheEntry,
): void {
  while (
    cache.entries.size >= TEXT_CACHE_ENTRIES
    || cache.pixels + entry.pixels > TEXT_CACHE_PIXELS
  ) {
    const oldestKey = cache.entries.keys().next().value;
    if (oldestKey === undefined) break;
    const expired = cache.entries.get(oldestKey)!;
    cache.pixels -= expired.pixels;
    if (expired.canvas) { expired.canvas.width = 0; expired.canvas.height = 0; }
    cache.entries.delete(oldestKey);
  }
  cache.entries.set(key, entry);
  cache.pixels += entry.pixels;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  maxLines: number,
): void {
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const owner = ctx.canvas?.ownerDocument;
  if (!owner || typeof ctx.fillStyle !== "string") {
    paintTextRows(ctx, lines(ctx, value, width, maxLines), x, y, fontSize);
    return;
  }
  const padding = Math.ceil(fontSize + ctx.shadowBlur * 3);
  const left = Math.floor(x - width / 2 - padding);
  const top = Math.floor(y - padding);
  const key = JSON.stringify([
    value, width, fontSize, maxLines, x - left, y - top, ctx.font, ctx.fillStyle,
    ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY, ctx.direction,
  ]);
  let cache = textCaches.get(ctx);
  if (!cache) { cache = { entries: new Map(), pixels: 0 }; textCaches.set(ctx, cache); }
  const cached = cache.entries.get(key);
  if (cached) {
    cache.entries.delete(key);
    cache.entries.set(key, cached);
    if (cached.canvas) paintTextTile(ctx, cached.canvas, left, top);
    else paintTextRows(ctx, cached.rows, x, y, fontSize);
    return;
  }
  const rows = lines(ctx, value, width, maxLines);
  const opaque = typeof ctx.getContextAttributes === "function"
    && ctx.getContextAttributes().alpha === false;
  if (opaque) {
    admitPromoTextCacheEntry(cache, key, { rows, canvas: null, pixels: 0 });
    paintTextRows(ctx, rows, x, y, fontSize);
    return;
  }
  const canvas = owner.createElement("canvas");
  canvas.width = Math.ceil(width + padding * 2 + 1);
  canvas.height = Math.ceil(
    padding * 2 + Math.max(0, rows.length - 1) * fontSize * 1.4 + 1,
  );
  const tile = canvas.getContext("2d");
  const pixels = canvas.width * canvas.height;
  if (!tile || pixels > TEXT_CACHE_PIXELS) {
    canvas.width = 0;
    canvas.height = 0;
    admitPromoTextCacheEntry(cache, key, { rows, canvas: null, pixels: 0 });
    paintTextRows(ctx, rows, x, y, fontSize);
    return;
  }
  tile.font = ctx.font;
  tile.textAlign = "center";
  tile.textBaseline = "middle";
  tile.direction = ctx.direction;
  tile.fillStyle = ctx.fillStyle;
  tile.shadowColor = ctx.shadowColor;
  tile.shadowBlur = ctx.shadowBlur;
  tile.shadowOffsetX = ctx.shadowOffsetX;
  tile.shadowOffsetY = ctx.shadowOffsetY;
  paintTextRows(tile, rows, x - left, y - top, fontSize);
  admitPromoTextCacheEntry(cache, key, { rows, canvas, pixels });
  paintTextTile(ctx, canvas, left, top);
}

function paintTextTile(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  left: number,
  top: number,
): void {
  ctx.save();
  // The shadow is already in the tile; do not apply it twice on compositing.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(canvas, left, top);
  ctx.restore();
}
/** No randomness, timers, fonts from the network, or platform-specific drawing dependencies. */
export function drawPromoFrame(ctx: CanvasRenderingContext2D, project: PromoProject, images: PromoImages, inputFrame: number, width: number, height: number): void {
  const frame = Math.max(0, Math.min(promoFrameCount(project) - 1, Math.floor(inputFrame)));
  const palette = PALETTES[project.style];
  const unit = Math.min(width, height);
  ctx.save();
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, palette[0]);
  background.addColorStop(1, palette[1]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const presentation = { ...PROMO_DEFAULT_PRESENTATION, ...project.presentation };
  const accent = project.presentation?.brandColor ?? palette[2];
  const timeline = promoTimeline(project);
  const sceneIndex = timeline.findIndex((item) => frame >= item.from && frame < item.from + item.duration);
  const scene = timeline[sceneIndex];
  if (scene) {
    const local = frame - scene.from;
    const transition = presentation.reducedMotion ? "cut" : scene.panel.transition ?? "fade";
    const transitionFrames = Math.min(12, Math.floor(scene.duration / 3));
    const mix = Math.min(1, (local + 1) / Math.max(1, transitionFrames));
    const previous = timeline[sceneIndex - 1];
    if (previous && mix < 1 && (transition === "dissolve" || transition === "wipe")) {
      drawSceneArtwork(ctx, previous, previous.duration - 1, project, images, width, height);
    }
    ctx.save();
    if (transition === "fade") ctx.globalAlpha = Math.min(1, (local + 1) / 8, (scene.duration - local) / 8);
    if (transition === "dissolve") ctx.globalAlpha = mix;
    if (transition === "wipe") { ctx.beginPath(); ctx.rect(0, 0, width * mix, height); ctx.clip(); }
    drawSceneArtwork(ctx, scene, local, project, images, width, height);
    ctx.restore();
    if (!presentation.reducedMotion) drawAtmosphere(ctx, scene.panel.effect ?? "none", frame, width, height, scene.panel.intensity ?? 1);
    const shade = ctx.createLinearGradient(0, height * 0.55, 0, height);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.88)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, width, unit * 0.14);
    ctx.fillStyle = "#ffffff";
    drawText(ctx, project.title, width / 2, unit * 0.065, width * 0.84, unit * 0.037, 1);
    const safe = presentation.safeArea && project.ratio === "9:16";
    const textX = width * (safe ? 0.46 : 0.5);
    const textWidth = width * (safe ? 0.7 : 0.8);
    const textY = height * (presentation.captionPosition === "top" ? 0.21 : presentation.captionPosition === "center" ? 0.46 : safe ? 0.7 : 0.77);
    const fallbackCaptionProgress = Math.min(
      1,
      (local + 1) / Math.max(1, Math.min(PROMO_FPS * 1.5, scene.duration * 0.4)),
    );
    const frameCaption = promoFrameCaption(
      project,
      frame,
      scene.panel.caption,
      fallbackCaptionProgress,
    );
    if (frameCaption.text) {
      const fontSize = unit * 0.051;
      const caption = presentation.captionStyle === "typewriter" && !presentation.reducedMotion
        ? Array.from(frameCaption.text).slice(
          0,
          Math.ceil(frameCaption.progress * Array.from(frameCaption.text).length),
        ).join("")
        : frameCaption.text;
      if (presentation.captionStyle === "boxed" || presentation.captionPosition !== "bottom") {
        ctx.fillStyle = "rgba(0,0,0,0.76)";
        ctx.font = `700 ${fontSize}px sans-serif`;
        const count = lines(ctx, frameCaption.text, textWidth, 3).length;
        ctx.fillRect(textX - textWidth / 2 - unit * 0.02, textY - fontSize * 0.8, textWidth + unit * 0.04, fontSize * (count * 1.4 + 0.2));
      }
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = unit * 0.008;
      drawText(ctx, caption, textX, textY, textWidth, fontSize, 3);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = accent;
    ctx.fillRect(width * 0.1, height * (safe ? 0.9 : 0.94), width * 0.8 * (frame + 1) / promoFrameCount(project), Math.max(2, unit * 0.004));
  } else {
    const endingFrame = frame - (promoFrameCount(project) - 2 * PROMO_FPS);
    ctx.globalAlpha = project.panels.length ? Math.max(0, Math.min(1, (endingFrame + 1) / 12)) : 1;
    ctx.fillStyle = accent;
    drawText(ctx, presentation.brandText, width / 2, height * 0.3, width * 0.8, unit * 0.025, 1);
    ctx.fillStyle = "#ffffff";
    drawText(ctx, project.title || "당신의 이야기가 움직이는 순간", width / 2, height * 0.41, width * 0.82, unit * 0.075, 3);
    ctx.fillStyle = accent;
    drawText(ctx, project.panels.length ? project.cta : "웹툰 컷을 추가해 홍보영상을 만들어보세요", width / 2, height * 0.73, width * 0.8, unit * 0.041, 2);
  }
  ctx.restore();
}
export async function loadPromoImages(project: Pick<PromoProject, "panels">, signal?: AbortSignal): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  let pixels = 0;
  // Decode sequentially: an imported project must not inflate twelve huge rasters at once.
  const decoded = new Map<string, HTMLImageElement>();
  const sources = project.panels.flatMap((panel) => [{ id: panel.id, src: panel.src }, ...(panel.foregroundSrc ? [{ id: `${panel.id}:foreground`, src: panel.foregroundSrc }] : [])]);
  for (const panel of sources) {
    if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
    const cached = decoded.get(panel.src);
    if (cached) { images.set(panel.id, cached); continue; }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const clean = () => { signal?.removeEventListener("abort", abort); image.onload = null; image.onerror = null; };
      const abort = () => { clean(); image.src = ""; reject(new DOMException("취소했어요.", "AbortError")); };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      image.onload = () => {
        clean();
        pixels += image.naturalWidth * image.naturalHeight;
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000 || pixels > 52_000_000) {
          image.src = "";
          reject(new Error("이미지 크기가 허용 범위를 벗어났어요. 컷을 작게 나누어 주세요.")); return;
        }
        resolve(image);
      };
      image.onerror = () => { clean(); reject(new Error("컷 이미지를 읽을 수 없어요. 다른 이미지로 교체해 주세요.")); };
      image.src = panel.src;
    });
    images.set(panel.id, image);
    decoded.set(panel.src, image);
  }
  return images;
}

function drawSceneArtwork(ctx: CanvasRenderingContext2D, scene: PromoScene, local: number, project: PromoProject, images: PromoImages, width: number, height: number): void {
  const image = images.get(scene.panel.id);
  if (!image) return;
  const reduced = project.presentation?.reducedMotion;
  const intensity = reduced ? 0 : scene.panel.intensity ?? 1;
  const progress = local / Math.max(1, scene.duration - 1);
  const camera = scene.panel.camera ? promoCameraAt(scene.panel.camera, progress, reduced) : undefined;
  const motion = camera ? { scale: camera.zoom, x: 0, y: 0 } : promoMotionAt(reduced ? "still" : scene.panel.motion, progress);
  const fit = scene.panel.fit === "cover" ? Math.max(width / image.naturalWidth, height / image.naturalHeight) : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const scale = camera?.zoom ?? 1 + (motion.scale - 1) * intensity;
  const iw = image.naturalWidth * fit * scale;
  const ih = image.naturalHeight * fit * scale;
  const focusX = camera?.x ?? (scene.panel.fit === "cover" ? scene.panel.focusX ?? 0.5 : 0.5);
  const focusY = camera?.y ?? (scene.panel.fit === "cover" ? scene.panel.focusY ?? 0.5 : 0.5);
  const clamp = (value: number, extent: number, viewport: number) => extent >= viewport ? Math.max(viewport - extent, Math.min(0, value)) : value;
  ctx.drawImage(image, clamp((width - iw) * focusX + width * motion.x * intensity, iw, width), clamp((height - ih) * focusY + height * motion.y * intensity, ih, height), iw, ih);
  const foreground = images.get(`${scene.panel.id}:foreground`);
  if (foreground) {
    const foregroundFit = Math.min(width / foreground.naturalWidth, height / foreground.naturalHeight);
    const fw = foreground.naturalWidth * foregroundFit * (1 + (scale - 1) * 1.8);
    const fh = foreground.naturalHeight * foregroundFit * (1 + (scale - 1) * 1.8);
    const float = reduced ? 0 : Math.sin(local / PROMO_FPS * 1.5) * height * 0.006 * intensity;
    ctx.drawImage(foreground, (width - fw) * (camera?.x ?? 0.5) - width * motion.x * 1.8 * intensity, (height - fh) * (camera?.y ?? 0.5) - height * motion.y * 1.8 * intensity + float, fw, fh);
  }
}
/** Deterministic analytic particles; seek/export never depend on previously rendered frames. */
function drawAtmosphere(ctx: CanvasRenderingContext2D, effect: string, frame: number, width: number, height: number, intensity: number): void {
  if (effect === "none" || intensity <= 0) return;
  const time = frame / PROMO_FPS;
  const unit = Math.min(width, height);
  ctx.save();
  ctx.globalAlpha *= Math.min(0.6, intensity * 0.35);
  ctx.strokeStyle = effect === "embers" ? "#ffb56c" : "#ffffff";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1, unit * 0.002);
  for (let index = 0; index < 36; index += 1) {
    const seedX = ((index * 73 + 17) % 101) / 101;
    const seedY = ((index * 47 + 31) % 103) / 103;
    const speed = 0.08 + (index % 5) * 0.025;
    const x = ((seedX + Math.sin(time * 0.7 + index) * 0.02 + 1) % 1) * width;
    const y = ((seedY + time * speed * (effect === "embers" ? -1 : 1)) % 1 + 1) % 1 * height;
    ctx.beginPath();
    if (effect === "speedlines") {
      const angle = index * Math.PI * 2 / 36;
      const radius = 0.38 + 0.025 * Math.sin(time * 4 + index);
      ctx.moveTo(width / 2 + Math.cos(angle) * width * radius, height / 2 + Math.sin(angle) * height * radius);
      ctx.lineTo(width / 2 + Math.cos(angle) * width * 0.8, height / 2 + Math.sin(angle) * height * 0.8);
      ctx.stroke();
    } else if (effect === "rain") {
      ctx.moveTo(x, y); ctx.lineTo(x - unit * 0.01, y + unit * 0.055); ctx.stroke();
    } else { ctx.arc(x, y, unit * (0.002 + (index % 3) * 0.001), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
