export const STUDIO_PUBLICATION_COVER_VERSION = 1 as const;
export const STUDIO_PUBLICATION_COVER_ASPECT_RATIO = 3 / 4;
export const STUDIO_PUBLICATION_COVER_ASPECT_LABEL = "3:4" as const;

export interface StudioPublicationCoverMetadata {
  readonly version: typeof STUDIO_PUBLICATION_COVER_VERSION;
  readonly pageIndex: number;
  readonly focalX: number;
  readonly focalY: number;
  readonly aspectRatio: typeof STUDIO_PUBLICATION_COVER_ASPECT_LABEL;
}

export interface StudioPublicationCoverCropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioPublicationCoverRenderOptions {
  readonly focalX: number;
  readonly focalY: number;
  readonly targetWidth?: number;
  readonly targetAspectRatio?: number;
  readonly quality?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampUnit(value: unknown, fallback = 0.5): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

export function normalizeStudioPublicationCover(
  value: unknown,
): StudioPublicationCoverMetadata | null {
  if (!isRecord(value) || value.version !== STUDIO_PUBLICATION_COVER_VERSION) return null;
  const pageIndex = Number(value.pageIndex);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 39) return null;
  return Object.freeze({
    version: STUDIO_PUBLICATION_COVER_VERSION,
    pageIndex,
    focalX: clampUnit(value.focalX),
    focalY: clampUnit(value.focalY),
    aspectRatio: STUDIO_PUBLICATION_COVER_ASPECT_LABEL,
  });
}

export function readStudioPublicationCover(
  value: unknown,
): StudioPublicationCoverMetadata | null {
  return isRecord(value) ? normalizeStudioPublicationCover(value.publicationCover) : null;
}

export function writeStudioPublicationCover(
  document: unknown,
  metadata: StudioPublicationCoverMetadata | null,
): Record<string, unknown> {
  const next = isRecord(document) ? { ...document } : {};
  if (metadata) next.publicationCover = metadata;
  else delete next.publicationCover;
  return next;
}

export function resolveStudioPublicationCoverPageIndex(
  metadata: StudioPublicationCoverMetadata | null,
  pageCount: number,
): number | null {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) return null;
  return metadata && metadata.pageIndex < pageCount ? metadata.pageIndex : 0;
}

export function resolveStudioPublicationCoverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  focalX: number,
  focalY: number,
  targetAspectRatio = STUDIO_PUBLICATION_COVER_ASPECT_RATIO,
): StudioPublicationCoverCropRect {
  if (
    !Number.isFinite(sourceWidth)
    || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0
    || sourceHeight <= 0
    || !Number.isFinite(targetAspectRatio)
    || targetAspectRatio <= 0
  ) {
    throw new Error("표지 크롭 영역을 계산할 수 없습니다.");
  }
  const normalizedFocalX = clampUnit(focalX);
  const normalizedFocalY = clampUnit(focalY);
  const sourceAspectRatio = sourceWidth / sourceHeight;
  if (sourceAspectRatio > targetAspectRatio) {
    const width = sourceHeight * targetAspectRatio;
    return {
      x: Math.min(sourceWidth - width, Math.max(0, sourceWidth * normalizedFocalX - width / 2)),
      y: 0,
      width,
      height: sourceHeight,
    };
  }
  const height = sourceWidth / targetAspectRatio;
  return {
    x: 0,
    y: Math.min(sourceHeight - height, Math.max(0, sourceHeight * normalizedFocalY - height / 2)),
    width: sourceWidth,
    height,
  };
}

export function createStudioPublicationCoverDataUrl(
  dataUrl: string,
  options: StudioPublicationCoverRenderOptions,
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof document === "undefined" || typeof globalThis.Image !== "function") {
      resolve(dataUrl);
      return;
    }
    const image = new globalThis.Image();
    image.onerror = () => resolve(dataUrl);
    image.onload = () => {
      try {
        const targetWidth = Math.max(1, Math.round(options.targetWidth ?? 480));
        const targetAspectRatio = options.targetAspectRatio ?? STUDIO_PUBLICATION_COVER_ASPECT_RATIO;
        const targetHeight = Math.max(1, Math.round(targetWidth / targetAspectRatio));
        const crop = resolveStudioPublicationCoverCropRect(
          image.naturalWidth || image.width,
          image.naturalHeight || image.height,
          options.focalX,
          options.focalY,
          targetAspectRatio,
        );
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          targetWidth,
          targetHeight,
        );
        resolve(canvas.toDataURL("image/webp", Math.min(1, Math.max(0, options.quality ?? 0.82))));
      } catch {
        resolve(dataUrl);
      }
    };
    image.src = dataUrl;
  });
}
