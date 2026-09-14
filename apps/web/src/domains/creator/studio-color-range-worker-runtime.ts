import {
  applyColorRangeMaskToSelection,
  buildColorRangeMask,
  flipColorRangeMask,
} from "./studio-color-range";

import { executeStudioSelectionBorderWorkerRequest } from "./studio-selection-border-worker-runtime";

import type { StudioSelectionComputeWorkerRunRequest } from "./studio-color-range-worker-protocol";
import type { PixelSelection } from "./studio-selection-tools";

/**
 * Single semantic source for explicitly selected direct and module Worker execution.
 *
 * The complete expensive path lives here: RGB range scan, display-axis flip, intersect
 * point-in-selection filtering, connected-component labelling, and contour extraction.
 */
export function executeStudioColorRangeWorkerRequest(
  request: StudioSelectionComputeWorkerRunRequest,
): PixelSelection | null {
  if (request.kind === "selection-border") return executeStudioSelectionBorderWorkerRequest(request);
  const sourceMask = buildColorRangeMask(
    request.data,
    request.width,
    request.height,
    request.samples,
    request.fuzziness,
    { antiAlias: request.antiAlias },
  );
  const displayMask = flipColorRangeMask(
    sourceMask,
    request.flipX ?? false,
    request.flipY ?? false,
  );
  return applyColorRangeMaskToSelection(
    request.selection,
    displayMask,
    request.combineMode,
    { aspect: request.aspect },
  );
}
