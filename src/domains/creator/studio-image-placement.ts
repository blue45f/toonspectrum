export interface CanvasImageElement {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface CanvasImageElementInput {
  id: string;
  src: string;
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  horizontalInset?: number;
  minY?: number;
}

export function createCanvasImageElement({
  id,
  src,
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  horizontalInset = 120,
  minY = 40,
}: CanvasImageElementInput): CanvasImageElement {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const maxWidth = Math.max(1, canvasWidth - horizontalInset);
  const fit = Math.min(1, maxWidth / safeSourceWidth);
  const width = Math.round(safeSourceWidth * fit);
  const height = Math.round(safeSourceHeight * fit);

  return {
    id,
    type: "image",
    src,
    x: Math.round((canvasWidth - width) / 2),
    y: Math.max(minY, Math.round(canvasHeight / 2 - height / 2)),
    width,
    height,
    rotation: 0,
  };
}
