export interface StudioColorViewport { width: number; height: number; left?: number; top?: number }
export interface StudioColorAnchor { left: number; right: number; top: number; bottom: number }

/** Pure visual-viewport geometry shared by pointer and keyboard layouts. */
export function resolveStudioColorSurfacePosition(anchor: StudioColorAnchor, viewport: StudioColorViewport, naturalHeight = 560) {
  const margin = 8;
  const x = viewport.left ?? 0;
  const y = viewport.top ?? 0;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const sheet = width <= 640;
  const available = Math.max(1, height - margin * 2);
  const panelWidth = Math.max(1, Math.min(sheet ? width - margin * 2 : 352, width - margin * 2));
  const above = Math.max(1, anchor.top - y - margin - 6);
  const below = Math.max(1, y + height - anchor.bottom - margin - 6);
  const down = below >= Math.min(naturalHeight, 320) || below >= above;
  const maxHeight = sheet ? Math.min(640, available, Math.max(1, height * 0.88))
    : Math.min(640, available, down ? below : above);
  const measured = sheet ? maxHeight : Math.min(maxHeight, Math.max(1, naturalHeight));
  const left = sheet ? x + margin : Math.max(x + margin, Math.min(anchor.left, x + width - panelWidth - margin));
  const top = sheet ? y + height - margin - measured
    : Math.max(y + margin, Math.min(down ? anchor.bottom + 6 : anchor.top - 6 - measured, y + height - margin - measured));
  return { left, top, width: panelWidth, maxHeight, sheet, compact: height < 440 };
}
