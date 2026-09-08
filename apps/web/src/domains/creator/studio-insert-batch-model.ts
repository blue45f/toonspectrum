export const STUDIO_INSERT_BATCH_MAX_ITEMS = 24;
export const STUDIO_INSERT_BATCH_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const STUDIO_INSERT_BATCH_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const STUDIO_INSERT_BATCH_MAX_OPEN_RASTER_BYTES = 64 * 1024 * 1024;

export type StudioInsertBatchLayout = "grid" | "row" | "column" | "cascade";
export type StudioInsertBatchTargetMode = "page" | "selection";
export type StudioInsertBatchSpacing = "compact" | "comfortable" | "wide";

export interface StudioInsertBatchFileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified?: number;
}

export interface StudioInsertBatchFileRejection<TFile extends StudioInsertBatchFileLike> {
  readonly file: TFile;
  readonly code:
    | "duplicate"
    | "empty"
    | "unsupported"
    | "file-too-large"
    | "batch-too-large"
    | "too-many";
  readonly reason: string;
}

export interface StudioInsertBatchFileSelection<TFile extends StudioInsertBatchFileLike> {
  readonly accepted: readonly TFile[];
  readonly rejected: readonly StudioInsertBatchFileRejection<TFile>[];
}

export interface StudioInsertBatchRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioInsertBatchSource {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioInsertBatchPlacement extends StudioInsertBatchRect {
  readonly id: string;
}

export interface StudioInsertBatchPlacementOptions {
  readonly layout: StudioInsertBatchLayout;
  readonly spacing: StudioInsertBatchSpacing;
  readonly target: StudioInsertBatchRect;
}

export const STUDIO_INSERT_BATCH_LAYOUT_LABELS: Readonly<
  Record<StudioInsertBatchLayout, string>
> = Object.freeze({
  grid: "균형 그리드",
  row: "가로 스트립",
  column: "세로 스트립",
  cascade: "계단식",
});

export const STUDIO_INSERT_BATCH_TARGET_LABELS: Readonly<
  Record<StudioInsertBatchTargetMode, string>
> = Object.freeze({
  page: "현재 페이지",
  selection: "선택 영역",
});

export const STUDIO_INSERT_BATCH_SPACING_LABELS: Readonly<
  Record<StudioInsertBatchSpacing, string>
> = Object.freeze({
  compact: "촘촘하게",
  comfortable: "보통",
  wide: "넓게",
});

const OPEN_RASTER_EXTENSIONS = new Set([
  "bmp",
  "dib",
  "tga",
  "icb",
  "vda",
  "vst",
  "ppm",
  "pam",
  "qoi",
  "tif",
  "tiff",
]);

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
  "svg",
  ...OPEN_RASTER_EXTENSIONS,
]);

const OPEN_RASTER_MIME_TYPES = new Set([
  "image/bmp",
  "image/x-ms-bmp",
  "image/x-tga",
  "image/x-targa",
  "image/x-portable-pixmap",
  "image/x-portable-arbitrarymap",
  "image/qoi",
  "image/tiff",
  "image/x-tiff",
]);

const SPACING_GAPS: Readonly<Record<StudioInsertBatchSpacing, number>> =
  Object.freeze({
    compact: 8,
    comfortable: 20,
    wide: 36,
  });

function normalizedExtension(name: string): string {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  const separator = normalized.lastIndexOf(".");
  return separator < 0 ? "" : normalized.slice(separator + 1);
}

function isOpenRasterFile(file: StudioInsertBatchFileLike): boolean {
  return (
    OPEN_RASTER_EXTENSIONS.has(normalizedExtension(file.name)) ||
    OPEN_RASTER_MIME_TYPES.has(file.type.toLocaleLowerCase("en-US"))
  );
}

function isSupportedImageFile(file: StudioInsertBatchFileLike): boolean {
  const mime = file.type.trim().toLocaleLowerCase("en-US");
  return (
    mime.startsWith("image/") ||
    SUPPORTED_IMAGE_EXTENSIONS.has(normalizedExtension(file.name))
  );
}

function normalizedLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function safeFileSize(file: StudioInsertBatchFileLike): number {
  return Number.isSafeInteger(file.size) && file.size > 0 ? file.size : 0;
}

export function studioInsertBatchFileKey(
  file: StudioInsertBatchFileLike,
): string {
  const modified =
    Number.isSafeInteger(file.lastModified) && Number(file.lastModified) >= 0
      ? Number(file.lastModified)
      : 0;
  return [
    file.name.trim().toLocaleLowerCase("en-US"),
    file.type.trim().toLocaleLowerCase("en-US"),
    String(file.size),
    String(modified),
  ].join("\u0000");
}

export function formatStudioInsertBatchBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

export function selectStudioInsertBatchFiles<
  TFile extends StudioInsertBatchFileLike,
>(
  existing: readonly TFile[],
  incoming: readonly TFile[],
  options: {
    readonly maxItems?: number;
    readonly maxTotalBytes?: number;
  } = {},
): StudioInsertBatchFileSelection<TFile> {
  const maxItems = normalizedLimit(
    options.maxItems,
    STUDIO_INSERT_BATCH_MAX_ITEMS,
  );
  const maxTotalBytes = normalizedLimit(
    options.maxTotalBytes,
    STUDIO_INSERT_BATCH_MAX_TOTAL_BYTES,
  );
  const accepted: TFile[] = [];
  const rejected: StudioInsertBatchFileRejection<TFile>[] = [];
  const knownKeys = new Set(existing.map(studioInsertBatchFileKey));
  let itemCount = existing.length;
  let totalBytes = existing.reduce(
    (sum, file) => sum + safeFileSize(file),
    0,
  );

  for (const file of incoming) {
    const key = studioInsertBatchFileKey(file);
    if (knownKeys.has(key)) {
      rejected.push({
        file,
        code: "duplicate",
        reason: "이미 준비 목록에 있는 동일한 파일입니다.",
      });
      continue;
    }
    if (!isSupportedImageFile(file)) {
      rejected.push({
        file,
        code: "unsupported",
        reason: "지원하는 이미지 파일 형식이 아닙니다.",
      });
      continue;
    }
    const size = safeFileSize(file);
    if (size === 0) {
      rejected.push({
        file,
        code: "empty",
        reason: "비어 있거나 크기를 확인할 수 없는 파일입니다.",
      });
      continue;
    }
    const fileLimit = isOpenRasterFile(file)
      ? STUDIO_INSERT_BATCH_MAX_OPEN_RASTER_BYTES
      : STUDIO_INSERT_BATCH_MAX_IMAGE_BYTES;
    if (size > fileLimit) {
      rejected.push({
        file,
        code: "file-too-large",
        reason: `${isOpenRasterFile(file) ? "고급 래스터" : "이미지"} 원본은 ${formatStudioInsertBatchBytes(fileLimit)} 이하여야 합니다.`,
      });
      continue;
    }
    if (itemCount >= maxItems) {
      rejected.push({
        file,
        code: "too-many",
        reason: `한 번에 최대 ${maxItems}개까지 준비할 수 있습니다.`,
      });
      continue;
    }
    if (totalBytes + size > maxTotalBytes) {
      rejected.push({
        file,
        code: "batch-too-large",
        reason: `준비 목록의 원본 합계는 ${formatStudioInsertBatchBytes(maxTotalBytes)} 이하여야 합니다.`,
      });
      continue;
    }

    knownKeys.add(key);
    accepted.push(file);
    itemCount += 1;
    totalBytes += size;
  }

  return { accepted, rejected };
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
}

function assertPlacementInputs(
  sources: readonly StudioInsertBatchSource[],
  target: StudioInsertBatchRect,
): void {
  if (sources.length > STUDIO_INSERT_BATCH_MAX_ITEMS) {
    throw new Error(
      `한 번에 배치할 수 있는 이미지는 최대 ${STUDIO_INSERT_BATCH_MAX_ITEMS}개입니다.`,
    );
  }
  assertFinitePositive(target.width, "배치 영역 너비");
  assertFinitePositive(target.height, "배치 영역 높이");
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    throw new Error("배치 영역 좌표가 올바르지 않습니다.");
  }
  for (const source of sources) {
    if (!source.id.trim()) {
      throw new Error("배치할 이미지 식별자가 비어 있습니다.");
    }
    assertFinitePositive(source.width, "이미지 너비");
    assertFinitePositive(source.height, "이미지 높이");
  }
}

function clampGap(
  requested: number,
  target: StudioInsertBatchRect,
  count: number,
): number {
  if (count <= 1) return 0;
  const smallest = Math.min(target.width, target.height);
  return Math.max(0, Math.min(requested, smallest / (count + 1)));
}

function insetTarget(target: StudioInsertBatchRect): StudioInsertBatchRect {
  const shortest = Math.min(target.width, target.height);
  const inset = Math.min(48, Math.max(8, shortest * 0.025));
  if (target.width <= inset * 2 || target.height <= inset * 2) return target;
  return {
    x: target.x + inset,
    y: target.y + inset,
    width: target.width - inset * 2,
    height: target.height - inset * 2,
  };
}

function geometricMeanAspect(
  sources: readonly StudioInsertBatchSource[],
): number {
  if (sources.length === 0) return 1;
  const total = sources.reduce((sum, source) => {
    const aspect = Math.min(12, Math.max(1 / 12, source.width / source.height));
    return sum + Math.log(aspect);
  }, 0);
  return Math.exp(total / sources.length);
}

function resolveGridDimensions(
  sources: readonly StudioInsertBatchSource[],
  target: StudioInsertBatchRect,
  gap: number,
): { readonly columns: number; readonly rows: number } {
  const count = sources.length;
  const averageAspect = geometricMeanAspect(sources);
  let bestColumns = 1;
  let bestRows = count;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (target.width - gap * (columns - 1)) / columns;
    const cellHeight = (target.height - gap * (rows - 1)) / rows;
    if (cellWidth <= 0 || cellHeight <= 0) continue;
    const cellAspect = cellWidth / cellHeight;
    const emptyCells = columns * rows - count;
    const aspectPenalty = Math.abs(Math.log(cellAspect / averageAspect));
    const emptyPenalty = emptyCells / count;
    const score = aspectPenalty + emptyPenalty * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestColumns = columns;
      bestRows = rows;
    }
  }

  return { columns: bestColumns, rows: bestRows };
}

function containInCell(
  source: StudioInsertBatchSource,
  cell: StudioInsertBatchRect,
): StudioInsertBatchPlacement {
  const scale = Math.min(
    1,
    cell.width / source.width,
    cell.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    id: source.id,
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  };
}

function roundPlacement(
  placement: StudioInsertBatchPlacement,
): StudioInsertBatchPlacement {
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    id: placement.id,
    x: round(placement.x),
    y: round(placement.y),
    width: round(placement.width),
    height: round(placement.height),
  };
}

function gridPlacements(
  sources: readonly StudioInsertBatchSource[],
  target: StudioInsertBatchRect,
  gap: number,
): readonly StudioInsertBatchPlacement[] {
  const { columns, rows } = resolveGridDimensions(sources, target, gap);
  const cellWidth = (target.width - gap * (columns - 1)) / columns;
  const cellHeight = (target.height - gap * (rows - 1)) / rows;
  return sources.map((source, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return containInCell(source, {
      x: target.x + column * (cellWidth + gap),
      y: target.y + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    });
  });
}

function stripPlacements(
  sources: readonly StudioInsertBatchSource[],
  target: StudioInsertBatchRect,
  gap: number,
  direction: "row" | "column",
): readonly StudioInsertBatchPlacement[] {
  const count = sources.length;
  const horizontal = direction === "row";
  const cellWidth = horizontal
    ? (target.width - gap * (count - 1)) / count
    : target.width;
  const cellHeight = horizontal
    ? target.height
    : (target.height - gap * (count - 1)) / count;
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error("선택한 간격으로 이미지를 배치할 공간이 부족합니다.");
  }
  return sources.map((source, index) =>
    containInCell(source, {
      x: target.x + (horizontal ? index * (cellWidth + gap) : 0),
      y: target.y + (horizontal ? 0 : index * (cellHeight + gap)),
      width: cellWidth,
      height: cellHeight,
    }),
  );
}

function cascadePlacements(
  sources: readonly StudioInsertBatchSource[],
  target: StudioInsertBatchRect,
  gap: number,
): readonly StudioInsertBatchPlacement[] {
  const stepCount = Math.max(0, sources.length - 1);
  const maximumOffsetX =
    stepCount === 0 ? 0 : (target.width * 0.22) / stepCount;
  const maximumOffsetY =
    stepCount === 0 ? 0 : (target.height * 0.22) / stepCount;
  const offset = Math.min(Math.max(10, gap), maximumOffsetX, maximumOffsetY);
  const cellWidth = target.width - offset * stepCount;
  const cellHeight = target.height - offset * stepCount;
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error("계단식 배치를 만들 공간이 부족합니다.");
  }
  return sources.map((source, index) =>
    containInCell(source, {
      x: target.x + index * offset,
      y: target.y + index * offset,
      width: cellWidth,
      height: cellHeight,
    }),
  );
}

export function computeStudioInsertBatchPlacements(
  sources: readonly StudioInsertBatchSource[],
  options: StudioInsertBatchPlacementOptions,
): readonly StudioInsertBatchPlacement[] {
  assertPlacementInputs(sources, options.target);
  if (sources.length === 0) return [];

  const target = insetTarget(options.target);
  const requestedGap = SPACING_GAPS[options.spacing];
  const gap = clampGap(requestedGap, target, sources.length);
  let placements: readonly StudioInsertBatchPlacement[];

  switch (options.layout) {
    case "grid":
      placements = gridPlacements(sources, target, gap);
      break;
    case "row":
      placements = stripPlacements(sources, target, gap, "row");
      break;
    case "column":
      placements = stripPlacements(sources, target, gap, "column");
      break;
    case "cascade":
      placements = cascadePlacements(sources, target, gap);
      break;
    default: {
      const neverLayout: never = options.layout;
      throw new Error(`지원하지 않는 다중 배치 방식입니다: ${neverLayout}`);
    }
  }

  return placements.map(roundPlacement);
}
