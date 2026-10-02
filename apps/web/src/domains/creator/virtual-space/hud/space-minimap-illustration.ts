/**
 * 공간 지도 일러스트 합성기 (캔버스).
 *
 * 순수 계획 모듈 `studio-virtual-space-map-illustration`가 만든 합성 계획을
 * 오프스크린 캔버스에 실제 아트로 그려 데이터 URL로 돌려준다. 배경 아트와
 * 프롭은 실제 에셋을 실제 좌표에 얹으므로 결과는 게임 화면의 레이아웃과
 * 어긋나지 않는다. 합성 결과는 계획 키로 캐시해 미니맵·큰 지도가 공유한다.
 * 캔버스를 쓸 수 없는 환경(jsdom 등)에서는 null을 돌려주고, 호출부는
 * 기존 SVG 지도로 자연스럽게 폴백한다.
 */

import { useEffect, useState } from "react";

import {
  studioMapIllustrationRandom,
  studioMapIllustrationSeed,
  studioMapPropFootprint,
  type StudioMapIllustrationPlan,
  type StudioMapIllustrationRoom,
} from "../studio-virtual-space-map-illustration";

/** 합성 결과의 긴 변 상한(px). 미니맵 표시보다 넉넉해 큰 지도에서도 흐리지 않다. */
export const STUDIO_MAP_ILLUSTRATION_MAX_EDGE = 1600;

const IMAGE_LOAD_TIMEOUT_MS = 5000;

/** 로드된 이미지. 하니스·테스트가 구조만으로 주입할 수 있게 최소 형태로 둔다. */
export interface StudioMapIllustrationImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

/** 월드 크기 → 합성 캔버스 크기. 긴 변이 상한을 넘지 않게 균일 축소한다. */
export function studioMapIllustrationCanvasSize(
  worldWidth: number,
  worldHeight: number,
): { readonly width: number; readonly height: number; readonly scale: number } {
  const safeWidth = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 1;
  const safeHeight = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 1;
  const scale = Math.min(1, STUDIO_MAP_ILLUSTRATION_MAX_EDGE / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
}

type Ctx = CanvasRenderingContext2D;

function paintRoomPattern(ctx: Ctx, room: StudioMapIllustrationRoom): void {
  const { x, y, width, height, pattern } = room;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  if (pattern === "planks") {
    ctx.strokeStyle = "rgba(88, 58, 30, 0.20)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let lineY = y + 20; lineY < y + height; lineY += 20) {
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + width, lineY);
    }
    ctx.stroke();
  } else if (pattern === "tiles") {
    ctx.strokeStyle = "rgba(66, 76, 92, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let lineX = x + 26; lineX < x + width; lineX += 26) {
      ctx.moveTo(lineX, y);
      ctx.lineTo(lineX, y + height);
    }
    for (let lineY = y + 26; lineY < y + height; lineY += 26) {
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + width, lineY);
    }
    ctx.stroke();
  } else if (pattern === "carpet") {
    ctx.fillStyle = "rgba(255, 235, 240, 0.13)";
    for (let dotY = y + 8; dotY < y + height; dotY += 16) {
      for (let dotX = x + 8 + ((dotY / 16) % 2) * 8; dotX < x + width; dotX += 16) {
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === "speckle") {
    const random = studioMapIllustrationRandom(studioMapIllustrationSeed(`floor:${room.id}`));
    const count = Math.max(4, Math.round((width * height) / 9000));
    ctx.fillStyle = "rgba(110, 88, 44, 0.28)";
    for (let index = 0; index < count; index += 1) {
      ctx.beginPath();
      ctx.arc(x + random() * width, y + random() * height, 2 + random() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * 합성 계획을 캔버스에 그린다. 좌표계는 월드 픽셀 그대로이며,
 * 호출부가 ctx를 캔버스 크기에 맞게 scale한 상태를 전제한다.
 * 이미지가 없는 프롭·배경은 건너뛴다 (없는 것을 지어내지 않는다).
 */
export function paintStudioMapIllustration(
  ctx: Ctx,
  plan: StudioMapIllustrationPlan,
  images: ReadonlyMap<string, StudioMapIllustrationImage>,
): void {
  // 지면 베이스. 배경 아트가 덮지 않는 여백의 색이다.
  ctx.fillStyle = "#27313d";
  ctx.fillRect(0, 0, plan.worldWidth, plan.worldHeight);

  const background = images.get(plan.backgroundUrl);
  if (background) {
    ctx.drawImage(background.source, 0, 0, plan.worldWidth, plan.worldHeight);
  }

  // 지면 질감 (방 밖 여백만 — 계획이 보장한다).
  for (const speckle of plan.speckles) {
    ctx.fillStyle = speckle.kind === "tuft"
      ? "rgba(126, 184, 112, 0.55)"
      : speckle.kind === "pebble"
        ? "rgba(205, 208, 216, 0.5)"
        : "rgba(242, 172, 198, 0.6)";
    ctx.beginPath();
    ctx.arc(speckle.x, speckle.y, speckle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 방 바닥: 재질 색 + 패턴 + 경계.
  for (const room of plan.rooms) {
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = room.fill;
    ctx.fillRect(room.x, room.y, room.width, room.height);
    ctx.restore();
    paintRoomPattern(ctx, room);
    ctx.strokeStyle = "rgba(28, 24, 38, 0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(room.x, room.y, room.width, room.height);
  }

  // 길: 방 스폰에서 허브 스폰으로 이어지는 점선 산책로.
  for (const path of plan.paths) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(43, 32, 18, 0.28)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(path.from.x, path.from.y);
    ctx.quadraticCurveTo(path.control.x, path.control.y, path.to.x, path.to.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 246, 220, 0.6)";
    ctx.lineWidth = 5;
    ctx.setLineDash([0.1, 17]);
    ctx.beginPath();
    ctx.moveTo(path.from.x, path.from.y);
    ctx.quadraticCurveTo(path.control.x, path.control.y, path.to.x, path.to.y);
    ctx.stroke();
    ctx.restore();
  }

  // 프롭: 실제 스프라이트를 게임과 같은 원점 규칙으로 얹는다.
  for (const prop of plan.props) {
    const image = images.get(prop.url);
    if (!image) continue;
    const footprint = studioMapPropFootprint(prop, image.width, image.height);
    if (footprint.width <= 0 || footprint.height <= 0) continue;
    ctx.save();
    ctx.globalAlpha = prop.alpha * 0.95;
    ctx.drawImage(image.source, footprint.x, footprint.y, footprint.width, footprint.height);
    ctx.restore();
  }

  // 포털 글로우: 실제 포털 위치에 빛 번짐 + 코어.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const glow of plan.portalGlows) {
    const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.radius);
    gradient.addColorStop(0, "rgba(255, 208, 118, 0.5)");
    gradient.addColorStop(0.55, "rgba(178, 132, 255, 0.22)");
    gradient.addColorStop(1, "rgba(178, 132, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(glow.x, glow.y, glow.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 236, 190, 0.85)";
    ctx.beginPath();
    ctx.arc(glow.x, glow.y, Math.max(5, glow.radius * 0.16), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function loadIllustrationImage(url: string): Promise<StudioMapIllustrationImage | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = globalThis.setTimeout(() => resolve(null), IMAGE_LOAD_TIMEOUT_MS);
    image.onload = () => {
      globalThis.clearTimeout(timer);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      globalThis.clearTimeout(timer);
      resolve(null);
    };
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

async function renderUncached(plan: StudioMapIllustrationPlan): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("canvas");
  if (!probe.getContext("2d")) return null;

  const urls = [...new Set([plan.backgroundUrl, ...plan.props.map((prop) => prop.url)])];
  const loaded = await Promise.all(urls.map(async (url) => [url, await loadIllustrationImage(url)] as const));
  const images = new Map<string, StudioMapIllustrationImage>();
  for (const [url, image] of loaded) {
    if (image) images.set(url, image);
  }

  const { width, height, scale } = studioMapIllustrationCanvasSize(plan.worldWidth, plan.worldHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  paintStudioMapIllustration(ctx, plan, images);
  try {
    return canvas.toDataURL("image/webp", 0.85);
  } catch {
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
}

const illustrationCache = new Map<string, Promise<string | null>>();

/** 합성 계획 → 일러스트 데이터 URL. 같은 계획은 한 번만 합성한다. */
export function renderStudioMapIllustration(plan: StudioMapIllustrationPlan): Promise<string | null> {
  const hit = illustrationCache.get(plan.key);
  if (hit) return hit;
  const pending = renderUncached(plan).catch(() => null);
  illustrationCache.set(plan.key, pending);
  return pending;
}

/** 계획이 바뀌면 다시 합성하고, 준비 전에는 null(기존 SVG 지도 폴백)을 돌려준다. */
export function useStudioMapIllustration(plan: StudioMapIllustrationPlan | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!plan) {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    setUrl(null);
    void renderStudioMapIllustration(plan).then((result) => {
      if (alive) setUrl(result);
    });
    return () => {
      alive = false;
    };
  }, [plan]);
  return url;
}
