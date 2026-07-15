import {
  orderStudioGpuStrokes,
  studioGpuPressureRadius,
  type StudioGpuStroke,
} from "./studio-webgpu-engine";

export const STUDIO_GPU_TILE_SIZE = 512;
export const STUDIO_GPU_TILE_BLEED = 2;

export interface StudioGpuRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioGpuTile extends StudioGpuRect {
  readonly id: string;
  readonly column: number;
  readonly row: number;
}

export interface StudioGpuTileOperation {
  readonly id: string;
  /** Fast cache precheck only; exact equality must also compare `signature`. */
  readonly fingerprint: string;
  /** Collision-free length-prefixed semantic snapshot of every render-affecting stroke field. */
  readonly signature: string;
}

export interface StudioGpuTileState extends StudioGpuTile {
  readonly operations: readonly StudioGpuTileOperation[];
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly tileSize: number;
  readonly bleed: number;
}

export interface StudioGpuTilePlanOptions {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly tileSize?: number;
  /** Logical-pixel expansion that preserves anti-aliased edges at tile boundaries. */
  readonly bleed?: number;
}

export interface StudioGpuVisibleTileOptions extends StudioGpuTilePlanOptions {
  readonly viewBox: StudioGpuRect;
  readonly overscanRows?: number;
  readonly overscanColumns?: number;
}

export type StudioGpuTileUpdateMode = "clean" | "append" | "rebuild";

export interface StudioGpuTileUpdate {
  readonly tile: StudioGpuTile;
  readonly mode: StudioGpuTileUpdateMode;
  /** Full sequence for rebuilds, immutable suffix for appends, empty for clean tiles. */
  readonly operations: readonly StudioGpuTileOperation[];
  readonly previousOperationCount: number;
  readonly nextOperationCount: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(finiteOr(value, fallback)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function tileId(column: number, row: number): string {
  return `${column}:${row}`;
}

function normalizeDimensions(options: StudioGpuTilePlanOptions) {
  return {
    logicalWidth: positiveOr(options.logicalWidth, 1),
    logicalHeight: positiveOr(options.logicalHeight, 1),
    tileSize: positiveOr(options.tileSize, STUDIO_GPU_TILE_SIZE),
    bleed: Math.max(0, finiteOr(options.bleed, STUDIO_GPU_TILE_BLEED)),
  };
}

function tileAt(
  column: number,
  row: number,
  logicalWidth: number,
  logicalHeight: number,
  tileSize: number
): StudioGpuTile {
  const x = column * tileSize;
  const y = row * tileSize;
  return {
    id: tileId(column, row),
    column,
    row,
    x,
    y,
    width: Math.min(tileSize, logicalWidth - x),
    height: Math.min(tileSize, logicalHeight - y),
  };
}

function stableNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "+Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function fnv1a(value: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function semanticToken(value: string | number | undefined): string {
  if (value === undefined) return "u0:";
  const payload = typeof value === "number" ? stableNumber(value) : value;
  const type = typeof value === "number" ? "n" : "s";
  return `${type}${payload.length}:${payload}`;
}

/** Exact, immutable operation snapshot. Length prefixes make adjacent fields unambiguous. */
export function signatureStudioGpuStroke(stroke: StudioGpuStroke): string {
  const tokens: string[] = [];
  const write = (value: string | number | undefined) => tokens.push(semanticToken(value));
  write(stroke.id);
  write(stroke.color);
  write(stroke.size);
  write(stroke.opacity);
  write(stroke.composite);
  write(stroke.orderKey);
  write(stroke.points.length);
  for (const point of stroke.points) write(point);
  write(stroke.pressures?.length);
  for (const pressure of stroke.pressures ?? []) write(pressure);
  return tokens.join("");
}

/** Stable, locale-independent precheck; callers must retain the exact signature beside it. */
export function fingerprintStudioGpuStroke(stroke: StudioGpuStroke): string {
  let hash = fnv1a(stroke.id);
  const write = (value: string | number | undefined) => {
    const token = typeof value === "number" ? stableNumber(value) : value ?? "<undefined>";
    hash = fnv1a(`\u0000${token}`, hash);
  };
  write(stroke.color);
  write(stroke.size);
  write(stroke.opacity);
  write(stroke.composite);
  write(stroke.orderKey);
  write(stroke.points.length);
  for (const point of stroke.points) write(point);
  write(stroke.pressures?.length);
  for (const pressure of stroke.pressures ?? []) write(pressure);
  return `${stroke.id}:${hash.toString(16).padStart(8, "0")}`;
}

/** Conservative bounds for every round dab generated along a pressure-interpolated stroke. */
export function boundsForStudioGpuStroke(
  stroke: StudioGpuStroke,
  bleed = STUDIO_GPU_TILE_BLEED
): StudioGpuRect | null {
  const pointCount = Math.floor(stroke.points.length / 2);
  if (pointCount < 1) return null;
  const size = positiveOr(stroke.size, 1);
  const edgeBleed = Math.max(0, finiteOr(bleed, STUDIO_GPU_TILE_BLEED));
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < pointCount; index += 1) {
    const x = stroke.points[index * 2];
    const y = stroke.points[index * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const rawPressure = finiteOr(stroke.pressures?.[index], 1);
    const radius = studioGpuPressureRadius(size, clamp(rawPressure, 0, 1)) + edgeBleed;
    minimumX = Math.min(minimumX, x! - radius);
    minimumY = Math.min(minimumY, y! - radius);
    maximumX = Math.max(maximumX, x! + radius);
    maximumY = Math.max(maximumY, y! + radius);
  }

  if (![minimumX, minimumY, maximumX, maximumY].every(Number.isFinite)) return null;
  return {
    x: minimumX,
    y: minimumY,
    width: Math.max(0, maximumX - minimumX),
    height: Math.max(0, maximumY - minimumY),
  };
}

function tileRangeForRect(rect: StudioGpuRect, options: StudioGpuTilePlanOptions) {
  const dimensions = normalizeDimensions(options);
  const columnCount = Math.ceil(dimensions.logicalWidth / dimensions.tileSize);
  const rowCount = Math.ceil(dimensions.logicalHeight / dimensions.tileSize);
  const right = rect.x + Math.max(0, rect.width);
  const bottom = rect.y + Math.max(0, rect.height);
  if (right < 0 || bottom < 0 || rect.x > dimensions.logicalWidth || rect.y > dimensions.logicalHeight) {
    return null;
  }
  return {
    ...dimensions,
    columnCount,
    rowCount,
    minimumColumn: clamp(Math.floor(rect.x / dimensions.tileSize), 0, columnCount - 1),
    maximumColumn: clamp(Math.floor(right / dimensions.tileSize), 0, columnCount - 1),
    minimumRow: clamp(Math.floor(rect.y / dimensions.tileSize), 0, rowCount - 1),
    maximumRow: clamp(Math.floor(bottom / dimensions.tileSize), 0, rowCount - 1),
  };
}

/** Builds ordered per-tile operation logs without allocating any GPU resources. */
export function planStudioGpuTileStates(
  strokes: readonly StudioGpuStroke[],
  options: StudioGpuTilePlanOptions
): readonly StudioGpuTileState[] {
  const dimensions = normalizeDimensions(options);
  const operationsByTile = new Map<string, StudioGpuTileOperation[]>();

  for (const stroke of orderStudioGpuStrokes(strokes)) {
    const bounds = boundsForStudioGpuStroke(stroke, dimensions.bleed);
    if (!bounds) continue;
    const range = tileRangeForRect(bounds, dimensions);
    if (!range) continue;
    const signature = signatureStudioGpuStroke(stroke);
    const operation = {
      id: stroke.id,
      fingerprint: fingerprintStudioGpuStroke(stroke),
      signature,
    };
    for (let row = range.minimumRow; row <= range.maximumRow; row += 1) {
      for (let column = range.minimumColumn; column <= range.maximumColumn; column += 1) {
        const id = tileId(column, row);
        const operations = operationsByTile.get(id) ?? [];
        operations.push(operation);
        operationsByTile.set(id, operations);
      }
    }
  }

  return [...operationsByTile.entries()]
    .map(([id, operations]) => {
      const [columnToken, rowToken] = id.split(":");
      const column = Number(columnToken);
      const row = Number(rowToken);
      return {
        ...tileAt(
          column,
          row,
          dimensions.logicalWidth,
          dimensions.logicalHeight,
          dimensions.tileSize
        ),
        operations,
        logicalWidth: dimensions.logicalWidth,
        logicalHeight: dimensions.logicalHeight,
        tileSize: dimensions.tileSize,
        bleed: dimensions.bleed,
      };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
}

/** Returns only viewport tiles plus bounded overscan, keeping tall documents texture-size agnostic. */
export function planVisibleStudioGpuTiles(
  options: StudioGpuVisibleTileOptions
): readonly StudioGpuTile[] {
  const dimensions = normalizeDimensions(options);
  if (options.viewBox.width <= 0 || options.viewBox.height <= 0) return [];
  const baseRange = tileRangeForRect(options.viewBox, dimensions);
  if (!baseRange) return [];
  const overscanRows = nonNegativeInteger(options.overscanRows, 1);
  const overscanColumns = nonNegativeInteger(options.overscanColumns, 1);
  const minimumRow = Math.max(0, baseRange.minimumRow - overscanRows);
  const maximumRow = Math.min(baseRange.rowCount - 1, baseRange.maximumRow + overscanRows);
  const minimumColumn = Math.max(0, baseRange.minimumColumn - overscanColumns);
  const maximumColumn = Math.min(
    baseRange.columnCount - 1,
    baseRange.maximumColumn + overscanColumns
  );
  const tiles: StudioGpuTile[] = [];
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      tiles.push(tileAt(
        column,
        row,
        dimensions.logicalWidth,
        dimensions.logicalHeight,
        dimensions.tileSize
      ));
    }
  }
  return tiles;
}

function sameOperation(left: StudioGpuTileOperation, right: StudioGpuTileOperation): boolean {
  return left.id === right.id
    && left.fingerprint === right.fingerprint
    && left.signature === right.signature;
}

function sameSequence(
  left: readonly StudioGpuTileOperation[],
  right: readonly StudioGpuTileOperation[]
): boolean {
  return left.length === right.length && left.every((operation, index) => (
    sameOperation(operation, right[index]!)
  ));
}

function isStrictSequencePrefix(
  prefix: readonly StudioGpuTileOperation[],
  sequence: readonly StudioGpuTileOperation[]
): boolean {
  return prefix.length < sequence.length && prefix.every((operation, index) => (
    sameOperation(operation, sequence[index]!)
  ));
}

function sameTileContract(left: StudioGpuTileState, right: StudioGpuTileState): boolean {
  return left.id === right.id
    && left.column === right.column
    && left.row === right.row
    && Object.is(left.x, right.x)
    && Object.is(left.y, right.y)
    && Object.is(left.width, right.width)
    && Object.is(left.height, right.height)
    && Object.is(left.logicalWidth, right.logicalWidth)
    && Object.is(left.logicalHeight, right.logicalHeight)
    && Object.is(left.tileSize, right.tileSize)
    && Object.is(left.bleed, right.bleed);
}

/**
 * Exact tile logs stay clean, immutable suffixes append, and edits/deletes/reorders rebuild only
 * the old/new coverage union. This is the retained-texture contract used by the tiled compositor.
 */
export function diffStudioGpuTileStates(
  previousStates: readonly StudioGpuTileState[],
  nextStates: readonly StudioGpuTileState[]
): readonly StudioGpuTileUpdate[] {
  const previousById = new Map(previousStates.map((state) => [state.id, state]));
  const nextById = new Map(nextStates.map((state) => [state.id, state]));
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);
  return [...ids]
    .map((id): StudioGpuTileUpdate => {
      const previous = previousById.get(id);
      const next = nextById.get(id);
      const previousOperations = previous?.operations ?? [];
      const nextOperations = next?.operations ?? [];
      const tile = next ?? previous;
      if (!tile) throw new Error(`Missing tile state for ${id}`);
      const contractMatches = Boolean(previous && next && sameTileContract(previous, next));
      if (contractMatches && sameSequence(previousOperations, nextOperations)) {
        return {
          tile,
          mode: "clean",
          operations: [],
          previousOperationCount: previousOperations.length,
          nextOperationCount: nextOperations.length,
        };
      }
      if (
        (contractMatches || (!previous && Boolean(next)))
        && isStrictSequencePrefix(previousOperations, nextOperations)
      ) {
        return {
          tile,
          mode: "append",
          operations: nextOperations.slice(previousOperations.length),
          previousOperationCount: previousOperations.length,
          nextOperationCount: nextOperations.length,
        };
      }
      return {
        tile,
        mode: "rebuild",
        operations: nextOperations,
        previousOperationCount: previousOperations.length,
        nextOperationCount: nextOperations.length,
      };
    })
    .sort((left, right) => left.tile.row - right.tile.row || left.tile.column - right.tile.column);
}
