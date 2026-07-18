import type { El, FrameEl } from "./studio-element-model";

export interface StudioElementBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 요소의 대략적 바운딩 박스(중심·크기 판정용).
export function elBounds(el: El): StudioElementBounds {
  if (el.type === "draw") {
    const x0 = el.points[0] ?? 0;
    const y0 = el.points[1] ?? 0;
    let minX = x0;
    let minY = y0;
    let maxX = x0;
    let maxY = y0;
    for (let i = 2; i < el.points.length; i += 2) {
      const x = el.points[i] ?? maxX;
      const y = el.points[i + 1] ?? maxY;
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (el.type === "text") {
    return { x: el.x, y: el.y, w: el.width, h: el.fontSize * 1.4 };
  }
  if (el.type === "sticker") {
    return { x: el.x, y: el.y, w: el.fontSize, h: el.fontSize };
  }
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

// 요소가 "들어가야 할" 패널(중심이 패널 안 + 패널보다 크게 넘치지 않음). 없으면 null.
// 전체 배경처럼 패널보다 훨씬 큰 요소는 제외해 백드롭이 한 칸에 갇히지 않게 한다.
export function containingPanel(el: El, all: readonly El[]): FrameEl | null {
  if (el.type === "frame") return null;
  const b = elBounds(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let best: FrameEl | null = null;
  let bestArea = Infinity;
  for (const f of all) {
    if (f.type !== "frame" || f.hidden) continue;
    if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) {
      continue;
    }
    if (b.w > f.width * 1.4 || b.h > f.height * 1.4) continue;
    const area = f.width * f.height;
    if (area < bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}
