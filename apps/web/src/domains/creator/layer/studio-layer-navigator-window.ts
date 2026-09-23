import type { StudioLayerNavigatorNode } from "./studio-layer-navigator";

export const STUDIO_LAYER_NAVIGATOR_INITIAL_RENDER_LIMIT = 160;
export const STUDIO_LAYER_NAVIGATOR_RENDER_STEP = 160;
export const STUDIO_LAYER_NAVIGATOR_MAX_RENDER_LIMIT = 640;

export interface StudioLayerNavigatorRenderWindow {
  readonly nodes: readonly StudioLayerNavigatorNode[];
  readonly renderedItemCount: number;
  readonly availableItemCount: number;
  /** Mounted visual rows, including group headers. This is the actual DOM growth boundary. */
  readonly renderedRowCount: number;
  readonly availableRowCount: number;
}

export function windowStudioLayerNavigatorNodes(
  nodes: readonly StudioLayerNavigatorNode[],
  requestedLimit: number,
): StudioLayerNavigatorRenderWindow {
  let remainingRows = Math.max(1, Math.floor(requestedLimit));
  let renderedItemCount = 0;
  let availableItemCount = 0;
  let renderedRowCount = 0;
  let availableRowCount = 0;
  const rendered: StudioLayerNavigatorNode[] = [];

  for (const node of nodes) {
    if (node.kind === "item") {
      availableItemCount += 1;
      availableRowCount += 1;
      if (remainingRows <= 0) continue;
      rendered.push(node);
      renderedItemCount += 1;
      renderedRowCount += 1;
      remainingRows -= 1;
      continue;
    }

    // A group header is a real mounted row with controls and listeners. Count it against the same
    // budget as item rows; otherwise thousands of collapsed/empty groups bypass the long-session
    // guard even though their children are hidden.
    availableRowCount += 1;
    if (node.expanded && !node.empty) {
      availableItemCount += node.entries.length;
      availableRowCount += node.entries.length;
    }
    if (remainingRows <= 0) continue;

    if (!node.expanded || node.empty) {
      rendered.push(node);
      renderedRowCount += 1;
      remainingRows -= 1;
      continue;
    }

    const renderedEntries = node.entries.slice(0, Math.max(0, remainingRows - 1));
    rendered.push({ ...node, renderedEntries });
    renderedItemCount += renderedEntries.length;
    renderedRowCount += 1 + renderedEntries.length;
    remainingRows -= 1 + renderedEntries.length;
  }

  return {
    nodes: rendered,
    renderedItemCount,
    availableItemCount,
    renderedRowCount,
    availableRowCount,
  };
}
