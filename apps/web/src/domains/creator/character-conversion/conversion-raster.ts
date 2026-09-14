import type { StudioLift3dSourceImage } from "../lift3d/studio-lift3d-contract";

export interface SubjectBounds { x: number; y: number; width: number; height: number; opaque: boolean }
export function subjectBounds(source: StudioLift3dSourceImage): SubjectBounds {
  const { width, height, pixels } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2_560_000 || pixels.length !== width * height * 4) throw new Error("이미지 픽셀 크기가 올바르지 않습니다.");
  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let opaque = true;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const alpha = pixels[(y * width + x) * 4 + 3];
    if (alpha < 250) opaque = false;
    if (alpha <= 8) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) throw new Error("이미지가 완전히 투명합니다. 캐릭터가 보이는 원화를 넣어 주세요.");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, opaque };
}
export function fitSubject(bounds: SubjectBounds, size: number, padding = 0.1) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1) throw new Error("캐릭터 영역이 올바르지 않습니다.");
  if (![512, 768, 1024].includes(size) || !Number.isFinite(padding) || padding < 0.05 || padding > 0.25) throw new Error("입력 크기 또는 여백이 올바르지 않습니다.");
  const scale = size * (1 - padding * 2) / Math.max(bounds.width, bounds.height);
  const width = bounds.width * scale; const height = bounds.height * scale;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}
/** Local stylization, not AI. Depth is near-white linear camera distance. */
export function deriveCharacterPasses(color: Uint8ClampedArray, depth: Uint8ClampedArray, normal: Uint8ClampedArray, width: number, height: number) {
  const length = width * height * 4;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 1_048_576 || [color, depth, normal].some((pixels) => pixels.length !== length)) throw new Error("렌더 패스 크기가 일치하지 않습니다.");
  const lineart = new Uint8ClampedArray(length); const cel = new Uint8ClampedArray(length); const mask = new Uint8ClampedArray(length);
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const at = (y * width + x) * 4; const alpha = color[at + 3];
    let edge = 0;
    for (const [dx, dy] of neighbors) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) { edge = Math.max(edge, alpha / 255); continue; }
      const other = (ny * width + nx) * 4;
      edge = Math.max(edge, Math.abs(alpha - color[other + 3]) / 255);
      if (alpha > 8 && color[other + 3] > 8) {
        const contrast = Math.abs(color[at] - color[other]) * 0.2126 + Math.abs(color[at + 1] - color[other + 1]) * 0.7152 + Math.abs(color[at + 2] - color[other + 2]) * 0.0722;
        edge = Math.max(edge, Math.max(0, contrast - 18) / 65);
        edge = Math.max(edge, Math.abs(depth[at] - depth[other]) / 22);
        for (let channel = 0; channel < 3; channel += 1) edge = Math.max(edge, Math.abs(normal[at + channel] - normal[other + channel]) / 120);
      }
    }
    const ink = 1 - Math.min(1, edge);
    const luminance = Math.max(1, color[at] * 0.2126 + color[at + 1] * 0.7152 + color[at + 2] * 0.0722);
    const quantized = Math.max(20, Math.round(luminance / 51) * 51);
    for (let channel = 0; channel < 3; channel += 1) {
      lineart[at + channel] = 255 * ink;
      cel[at + channel] = color[at + channel] * (quantized / luminance) * (0.25 + ink * 0.75);
      mask[at + channel] = alpha;
    }
    lineart[at + 3] = alpha; cel[at + 3] = alpha; mask[at + 3] = 255;
  }
  return { lineart, cel, mask };
}
