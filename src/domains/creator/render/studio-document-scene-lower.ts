import {
  polylineToPath,
  type ColorIR,
  type PathIR,
  type RenderNodeIR,
  type RenderSceneIR,
  type SceneNodeIR,
} from "@toonspectrum/studio-project-model";

import type { El } from "../studio-element-model";

/**
 * Lower the product element model into a V13 RenderSceneIR.
 *
 * Vello owns only path-heavy vector chrome (frames, focus/speed lines).
 * Freehand brushes stay on Konva / raster WebGPU — flattening them to a
 * single polyline would erase pressure, wash, stamp, and media appearance.
 */

export interface StudioDocumentLowerOptions {
  readonly width: number;
  readonly height: number;
  readonly background?: ColorIR;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function parseCssColorToIR(value: string | undefined, fallback: ColorIR): ColorIR {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : null;
  if (hex && /^[0-9a-fA-F]+$/u.test(hex)) {
    const digit = (index: number): number => Number.parseInt(hex[index] ?? "0", 16);
    const pair = (index: number): number => Number.parseInt(hex.slice(index, index + 2), 16);
    if (hex.length === 3) {
      return { r: (digit(0) * 17) / 255, g: (digit(1) * 17) / 255, b: (digit(2) * 17) / 255, a: 1 };
    }
    if (hex.length === 6) {
      return { r: pair(0) / 255, g: pair(2) / 255, b: pair(4) / 255, a: 1 };
    }
    if (hex.length === 8) {
      return { r: pair(0) / 255, g: pair(2) / 255, b: pair(4) / 255, a: pair(6) / 255 };
    }
  }
  const rgb = trimmed.match(/^rgba?\((.+)\)$/u);
  if (rgb?.[1]) {
    const parts = rgb[1].split(/[\s,/]+/u).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return {
        r: clamp01(parts[0]! / 255),
        g: clamp01(parts[1]! / 255),
        b: clamp01(parts[2]! / 255),
        a: parts[3] === undefined ? 1 : clamp01(parts[3]),
      };
    }
  }
  return fallback;
}

function pairs(points: readonly number[]): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    result.push([points[index]!, points[index + 1]!]);
  }
  return result;
}

function rectPath(x: number, y: number, width: number, height: number) {
  return polylineToPath(
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    true,
  );
}

function fillNode(
  id: string,
  path: PathIR,
  color: ColorIR,
  opacity: number,
): SceneNodeIR {
  return {
    id,
    kind: "fill-path",
    path,
    paint: { kind: "solid", color },
    fillRule: "nonzero",
    opacity,
    blend: "src-over",
  };
}

function strokeNode(
  id: string,
  path: PathIR,
  color: ColorIR,
  width: number,
  opacity: number,
): SceneNodeIR {
  return {
    id,
    kind: "stroke-path",
    path,
    paint: { kind: "solid", color },
    strokeWidth: Math.max(0.5, width),
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity,
    blend: "src-over",
  };
}

/**
 * True when the element is authored as a Vello-safe vector island.
 * Brush strokes, images, and lettering stay with Konva / raster providers.
 */
export function isStudioVelloDocumentVectorElement(element: El): boolean {
  return element.type === "frame"
    || element.type === "focusLines"
    || element.type === "speedLines";
}

/**
 * Hide the Konva document layer only when every visible painted object is a
 * Vello vector island. A single brush/image/text object keeps Konva visible.
 */
export function studioDocumentAllowsKonvaHide(
  elements: readonly El[],
  ownedDocumentIds: readonly string[],
): boolean {
  if (ownedDocumentIds.length === 0) return false;
  const owned = new Set(ownedDocumentIds);
  for (const element of elements) {
    if (element.hidden) continue;
    if (
      element.type === "draw"
      || element.type === "image"
      || element.type === "text"
      || element.type === "bubble"
      || element.type === "sticker"
    ) {
      return false;
    }
    if (isStudioVelloDocumentVectorElement(element) && !owned.has(element.id)) {
      return false;
    }
  }
  return true;
}

function lowerElement(element: El): RenderNodeIR[] {
  if (element.hidden) return [];
  const opacity = clamp01(element.opacity ?? 1);
  if (opacity <= 0) return [];

  switch (element.type) {
    case "frame": {
      const path = element.points && element.points.length >= 6
        ? polylineToPath(pairs(element.points).map(([x, y]) => [element.x + x, element.y + y]), true)
        : rectPath(element.x, element.y, element.width, element.height);
      const nodes: RenderNodeIR[] = [];
      const fill = parseCssColorToIR(element.bgColor ?? element.bg, { r: 1, g: 1, b: 1, a: 1 });
      if (fill.a > 0) nodes.push(fillNode(`${element.id}:fill`, path, fill, opacity));
      const stroke = parseCssColorToIR(element.stroke, { r: 0, g: 0, b: 0, a: 0 });
      if (stroke.a > 0 && (element.strokeWidth ?? 0) > 0) {
        nodes.push(strokeNode(`${element.id}:stroke`, path, stroke, element.strokeWidth ?? 2, opacity));
      }
      return nodes;
    }
    case "draw":
      // Brush/media strokes and even geometric draw-nodes keep Konva appearance
      // (pressure, wash, stamp, sketch, gradient, pattern). Do not polyline them.
      return [];
    case "focusLines": {
      const cx = element.x + element.width * (element.centerXRatio ?? 0.5);
      const cy = element.y + element.height * (element.centerYRatio ?? 0.5);
      const color = parseCssColorToIR(element.stroke, { r: 0, g: 0, b: 0, a: 1 });
      const nodes: RenderNodeIR[] = [];
      for (let index = 0; index < element.lineCount; index += 1) {
        const angle = (Math.PI * 2 * index) / element.lineCount + (element.rotation * Math.PI) / 180;
        const inner = element.innerRadius;
        const outer = element.outerRadius;
        const jitter = (element.noise ?? 0) * ((index % 5) - 2) * 0.4;
        nodes.push(strokeNode(
          `${element.id}:${index}`,
          polylineToPath([
            [cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner],
            [cx + Math.cos(angle) * (outer + jitter), cy + Math.sin(angle) * (outer + jitter)],
          ]),
          color,
          element.strokeWidth,
          opacity,
        ));
      }
      return nodes;
    }
    case "speedLines": {
      const color = parseCssColorToIR(element.stroke, { r: 0, g: 0, b: 0, a: 1 });
      const nodes: RenderNodeIR[] = [];
      for (let index = 0; index < element.lineCount; index += 1) {
        const t = element.lineCount <= 1 ? 0.5 : index / (element.lineCount - 1);
        if (element.direction === "horizontal") {
          const y = element.y + t * element.height;
          nodes.push(strokeNode(
            `${element.id}:${index}`,
            polylineToPath([[element.x, y], [element.x + element.width, y]]),
            color,
            element.strokeWidth,
            opacity,
          ));
        } else {
          const x = element.x + t * element.width;
          nodes.push(strokeNode(
            `${element.id}:${index}`,
            polylineToPath([[x, element.y], [x, element.y + element.height]]),
            color,
            element.strokeWidth,
            opacity,
          ));
        }
      }
      return nodes;
    }
    case "text":
    case "sticker":
      return [{
        id: element.id,
        kind: "text",
        x: element.x,
        y: element.y + (element.type === "text" ? element.fontSize : element.fontSize),
        text: element.text,
        fontSizePx: element.fontSize,
        color: parseCssColorToIR(
          element.type === "text" ? element.fill : "#111111",
          { r: 0.1, g: 0.1, b: 0.1, a: 1 },
        ),
        fontFamily: element.type === "text" ? (element.font ?? "sans-serif") : "sans-serif",
        opacity,
        blend: "src-over",
      }];
    case "bubble": {
      const path = element.customShapePoints && element.customShapePoints.length >= 6
        ? polylineToPath(
          pairs(element.customShapePoints).map(([x, y]) => [element.x + x, element.y + y]),
          true,
        )
        : rectPath(element.x, element.y, element.width, element.height);
      const nodes: RenderNodeIR[] = [
        fillNode(
          `${element.id}:fill`,
          path,
          parseCssColorToIR(element.fill, { r: 1, g: 1, b: 1, a: 1 }),
          opacity,
        ),
      ];
      const stroke = parseCssColorToIR(element.stroke, { r: 0, g: 0, b: 0, a: 1 });
      if ((element.strokeWidth ?? 2) > 0) {
        nodes.push(strokeNode(
          `${element.id}:stroke`,
          path,
          stroke,
          element.strokeWidth ?? 2,
          opacity,
        ));
      }
      if (element.text.trim().length > 0) {
        nodes.push({
          id: `${element.id}:text`,
          kind: "text",
          x: element.x + 12,
          y: element.y + (element.fontSize ?? 24),
          text: element.text,
          fontSizePx: element.fontSize ?? 24,
          color: parseCssColorToIR(element.textFill, { r: 0.1, g: 0.1, b: 0.1, a: 1 }),
          fontFamily: element.font ?? "sans-serif",
          opacity,
          blend: "src-over",
        });
      }
      return nodes;
    }
    case "image": {
      const hasFilter = Boolean(
        element.blur
        || element.smartFilters?.entries.length
        || element.filterMaskSrc
        || element.lensBlur
        || element.lineart
        || element.screentone,
      );
      const image: RenderNodeIR = {
        id: element.id,
        kind: "image",
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        src: element.src,
        opacity,
        blend: "src-over",
        rotationDeg: element.rotation,
        flipX: Boolean(element.flipped),
        flipY: Boolean(element.flippedY),
      };
      if (!hasFilter) return [image];
      return [{
        id: `${element.id}:filter`,
        kind: "filter-group",
        opacity,
        blend: "src-over",
        graph: {
          nodes: [{ id: "fx", op: "core.image-filter", params: {}, inputs: ["source"], colorSpace: "srgb" }],
          output: "fx",
        },
        children: [image],
      }];
    }
    default:
      return [];
  }
}

export function lowerStudioElementsToRenderScene(
  elements: readonly El[],
  options: StudioDocumentLowerOptions,
): RenderSceneIR {
  const nodes: RenderNodeIR[] = [];
  for (const element of elements) {
    nodes.push(...lowerElement(element));
  }
  return {
    version: 13,
    width: Math.max(1, Math.round(options.width)),
    height: Math.max(1, Math.round(options.height)),
    background: options.background ?? { r: 0, g: 0, b: 0, a: 0 },
    nodes,
  };
}

export function documentIdsOwnedByVectorIslands(scene: RenderSceneIR): string[] {
  const ids: string[] = [];
  for (const node of scene.nodes) {
    if (node.kind === "fill-path" || node.kind === "stroke-path") {
      ids.push(node.id.split(":")[0] ?? node.id);
    }
  }
  return [...new Set(ids)];
}
