import {
  STUDIO_REFERENCE_BOARD_MAX_ZOOM,
  STUDIO_REFERENCE_BOARD_MIN_ZOOM,
  type StudioReferenceBoardDocument,
} from "./studio-reference-board";

const BOARD_LEFT = 0.12;
const BOARD_TOP = 0.13;
const BOARD_WIDTH = 0.76;
const BOARD_HEIGHT = 0.72;
const MAX_BASE_FRAME = 0.54;
const CELL_FILL = 0.86;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Builds a calm, centered contact-sheet layout without changing reference identity or z-order.
 * The last row is centered so the result reads like a mood board instead of a spreadsheet.
 */
export function arrangeStudioReferenceCanvas(
  document: StudioReferenceBoardDocument,
): StudioReferenceBoardDocument {
  const count = document.items.length;
  if (count === 0) return document;

  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.15)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = BOARD_WIDTH / columns;
  const cellHeight = BOARD_HEIGHT / rows;
  const zoom = clamp(
    CELL_FILL * Math.min(cellWidth / MAX_BASE_FRAME, cellHeight / MAX_BASE_FRAME),
    STUDIO_REFERENCE_BOARD_MIN_ZOOM,
    Math.min(1, STUDIO_REFERENCE_BOARD_MAX_ZOOM),
  );

  let changed = false;
  const items = document.items.map((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowStartIndex = row * columns;
    const itemsInRow = Math.min(columns, count - rowStartIndex);
    const rowWidth = itemsInRow * cellWidth;
    const rowStartX = BOARD_LEFT + (BOARD_WIDTH - rowWidth) / 2;
    const centerX = rowStartX + (column + 0.5) * cellWidth;
    const centerY = BOARD_TOP + (row + 0.5) * cellHeight;
    const nextView = {
      ...item.view,
      centerX,
      centerY,
      zoom,
      rotationDeg: 0,
    };
    const itemChanged = item.view.centerX !== centerX
      || item.view.centerY !== centerY
      || item.view.zoom !== zoom
      || item.view.rotationDeg !== 0;
    if (itemChanged) changed = true;
    return itemChanged ? { ...item, view: nextView } : item;
  });

  return changed ? { ...document, items } : document;
}
