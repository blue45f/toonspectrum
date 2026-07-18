import {
  DEFAULT_ISOMETRIC_ANGLE_DEG,
  DEFAULT_ISOMETRIC_CELL_SIZE,
  clampIsometricAngleDeg,
  clampIsometricCellSize,
  defaultIsometricOrigin,
} from "./studio-isometric-grid";

import type { VanishingPoint } from "./studio-perspective-guide";

/**
 * Page-owned drawing-assist state.
 *
 * The rendered guide handles are transient UI, but the artist's ruler setup is authored document
 * data: it must survive page switches, autosave/project export and shared-document reconciliation.
 * Keeping one small, versioned envelope also prevents perspective and isometric settings from
 * drifting into unrelated local preferences.
 */
export const STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION = 1 as const;
export const STUDIO_DRAWING_ASSIST_MAX_COORDINATE = 10_000_000;
export const STUDIO_DRAWING_ASSIST_MAX_VANISHING_POINTS = 3;
export const STUDIO_DRAWING_ASSIST_MAX_SERIALIZED_BYTES = 8 * 1_024;
const MAX_IDENTIFIER_LENGTH = 160;

const ROOT_KEYS = ["version", "perspective", "isometric"] as const;
const PERSPECTIVE_KEYS = ["active", "points"] as const;
const ISOMETRIC_KEYS = ["active", "angleDeg", "cellSize", "originX", "originY"] as const;
const VANISHING_POINT_KEYS = ["id", "x", "y"] as const;

export interface StudioPerspectiveAssistDocument {
  active: boolean;
  points: VanishingPoint[];
}

export interface StudioIsometricAssistDocument {
  active: boolean;
  angleDeg: number;
  cellSize: number;
  originX: number;
  originY: number;
}

export interface StudioDrawingAssistDocument {
  version: typeof STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION;
  perspective: StudioPerspectiveAssistDocument;
  isometric: StudioIsometricAssistDocument;
}

export interface StudioDrawingAssistViewport {
  canvasWidth: number;
  canvasHeight: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedCoordinate(value: unknown, fallback: number): number {
  return Math.min(
    STUDIO_DRAWING_ASSIST_MAX_COORDINATE,
    Math.max(-STUDIO_DRAWING_ASSIST_MAX_COORDINATE, finiteNumber(value, fallback))
  );
}

function validIdentifier(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) {
    return false;
  }
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strictDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    ) {
      return null;
    }
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function strictArrayValues(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const result: unknown[] = [];
  try {
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return null;
      result.push(descriptor.value);
    }
  } catch {
    return null;
  }
  return result;
}

function safeViewport(viewport: StudioDrawingAssistViewport): StudioDrawingAssistViewport {
  return {
    canvasWidth: Math.max(1, finiteNumber(viewport.canvasWidth, 800)),
    canvasHeight: Math.max(1, finiteNumber(viewport.canvasHeight, 1_200)),
  };
}

function normalizeVanishingPoints(value: unknown): VanishingPoint[] {
  if (!Array.isArray(value)) return [];
  const result: VanishingPoint[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (result.length >= STUDIO_DRAWING_ASSIST_MAX_VANISHING_POINTS) break;
    const record = recordOf(candidate);
    if (!validIdentifier(record.id) || ids.has(record.id)) continue;
    if (
      typeof record.x !== "number" || !Number.isFinite(record.x) ||
      typeof record.y !== "number" || !Number.isFinite(record.y)
    ) {
      continue;
    }
    ids.add(record.id);
    result.push({
      id: record.id,
      x: boundedCoordinate(record.x, 0),
      y: boundedCoordinate(record.y, 0),
    });
  }
  return result;
}

export function createDefaultStudioDrawingAssistDocument(
  viewport: StudioDrawingAssistViewport
): StudioDrawingAssistDocument {
  const safe = safeViewport(viewport);
  const origin = defaultIsometricOrigin(safe.canvasWidth, safe.canvasHeight);
  return {
    version: STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION,
    perspective: { active: false, points: [] },
    isometric: {
      active: false,
      angleDeg: DEFAULT_ISOMETRIC_ANGLE_DEG,
      cellSize: DEFAULT_ISOMETRIC_CELL_SIZE,
      originX: origin.x,
      originY: origin.y,
    },
  };
}

/**
 * Tolerant hydration for legacy/local data. When both rulers are marked active, perspective wins
 * deterministically; the drawing pipeline deliberately has one direction owner per stroke.
 */
export function normalizeStudioDrawingAssistDocument(
  value: unknown,
  viewport: StudioDrawingAssistViewport
): StudioDrawingAssistDocument {
  const fallback = createDefaultStudioDrawingAssistDocument(viewport);
  const source = recordOf(value);
  if (
    Object.prototype.hasOwnProperty.call(source, "version")
    && source.version !== STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION
  ) {
    return fallback;
  }
  const perspective = recordOf(source.perspective);
  const isometric = recordOf(source.isometric);
  const perspectiveActive = perspective.active === true;
  const isometricActive = !perspectiveActive && isometric.active === true;
  return {
    version: STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION,
    perspective: {
      active: perspectiveActive,
      points: normalizeVanishingPoints(perspective.points),
    },
    isometric: {
      active: isometricActive,
      angleDeg: clampIsometricAngleDeg(
        finiteNumber(isometric.angleDeg, fallback.isometric.angleDeg)
      ),
      cellSize: clampIsometricCellSize(
        finiteNumber(isometric.cellSize, fallback.isometric.cellSize)
      ),
      originX: boundedCoordinate(isometric.originX, fallback.isometric.originX),
      originY: boundedCoordinate(isometric.originY, fallback.isometric.originY),
    },
  };
}

/** Strict boundary used by imported projects and shared page payloads. */
export function parseStudioDrawingAssistDocument(
  value: unknown
): StudioDrawingAssistDocument | null {
  const source = strictDataRecord(value, ROOT_KEYS);
  if (!source) return null;
  if (source.version !== STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION) return null;
  const perspective = strictDataRecord(source.perspective, PERSPECTIVE_KEYS);
  const isometric = strictDataRecord(source.isometric, ISOMETRIC_KEYS);
  if (!perspective || !isometric) return null;
  const pointValues = strictArrayValues(perspective.points);
  if (
    typeof perspective.active !== "boolean" ||
    typeof isometric.active !== "boolean" ||
    (perspective.active && isometric.active) ||
    !pointValues ||
    pointValues.length > STUDIO_DRAWING_ASSIST_MAX_VANISHING_POINTS
  ) {
    return null;
  }
  const pointIds = new Set<string>();
  const points: VanishingPoint[] = [];
  for (const value of pointValues) {
    const point = strictDataRecord(value, VANISHING_POINT_KEYS);
    if (
      !point ||
      !validIdentifier(point.id) ||
      pointIds.has(point.id) ||
      typeof point.x !== "number" || !Number.isFinite(point.x) ||
      Math.abs(point.x) > STUDIO_DRAWING_ASSIST_MAX_COORDINATE ||
      typeof point.y !== "number" || !Number.isFinite(point.y) ||
      Math.abs(point.y) > STUDIO_DRAWING_ASSIST_MAX_COORDINATE
    ) {
      return null;
    }
    pointIds.add(point.id);
    points.push({ id: point.id, x: point.x, y: point.y });
  }
  if (
    typeof isometric.angleDeg !== "number" || !Number.isFinite(isometric.angleDeg) ||
    clampIsometricAngleDeg(isometric.angleDeg) !== isometric.angleDeg ||
    typeof isometric.cellSize !== "number" || !Number.isFinite(isometric.cellSize) ||
    clampIsometricCellSize(isometric.cellSize) !== isometric.cellSize ||
    typeof isometric.originX !== "number" || !Number.isFinite(isometric.originX) ||
    Math.abs(isometric.originX) > STUDIO_DRAWING_ASSIST_MAX_COORDINATE ||
    typeof isometric.originY !== "number" || !Number.isFinite(isometric.originY) ||
    Math.abs(isometric.originY) > STUDIO_DRAWING_ASSIST_MAX_COORDINATE
  ) {
    return null;
  }
  const parsed: StudioDrawingAssistDocument = {
    version: STUDIO_DRAWING_ASSIST_DOCUMENT_VERSION,
    perspective: { active: perspective.active, points },
    isometric: {
      active: isometric.active,
      angleDeg: isometric.angleDeg,
      cellSize: isometric.cellSize,
      originX: isometric.originX,
      originY: isometric.originY,
    },
  };
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > STUDIO_DRAWING_ASSIST_MAX_SERIALIZED_BYTES) {
    return null;
  }
  return parsed;
}

export function studioDrawingAssistHasContent(
  value: unknown,
  viewport: StudioDrawingAssistViewport
): boolean {
  if (!value || typeof value !== "object") return false;
  const normalized = normalizeStudioDrawingAssistDocument(value, viewport);
  const fallback = createDefaultStudioDrawingAssistDocument(viewport);
  return !areStudioDrawingAssistDocumentsEqual(normalized, fallback);
}

export function mirrorStudioDrawingAssistDocument(
  document: StudioDrawingAssistDocument,
  canvasWidth: number
): StudioDrawingAssistDocument {
  const safeCanvasWidth = boundedCoordinate(canvasWidth, 0);
  return {
    ...document,
    perspective: {
      ...document.perspective,
      points: document.perspective.points.map((point) => ({
        ...point,
        x: boundedCoordinate(safeCanvasWidth - point.x, point.x),
      })),
    },
    isometric: {
      ...document.isometric,
      originX: boundedCoordinate(safeCanvasWidth - document.isometric.originX, document.isometric.originX),
    },
  };
}

export function areStudioDrawingAssistDocumentsEqual(
  left: StudioDrawingAssistDocument,
  right: StudioDrawingAssistDocument
): boolean {
  if (
    left.version !== right.version ||
    left.perspective.active !== right.perspective.active ||
    left.isometric.active !== right.isometric.active ||
    left.isometric.angleDeg !== right.isometric.angleDeg ||
    left.isometric.cellSize !== right.isometric.cellSize ||
    left.isometric.originX !== right.isometric.originX ||
    left.isometric.originY !== right.isometric.originY ||
    left.perspective.points.length !== right.perspective.points.length
  ) {
    return false;
  }
  return left.perspective.points.every((point, index) => {
    const other = right.perspective.points[index];
    return other?.id === point.id && other.x === point.x && other.y === point.y;
  });
}
