import { studioSelectionBorderFromMask } from "./studio-selection-border";
import { buildSelectionMaskPlan, paintSelectionMaskSteps } from "./studio-selection-tools";

import type { ColorRangeMask } from "./studio-color-range";
import { assertStudioSelectionBorderWorkerRequest, type StudioSelectionBorderWorkerRunRequest } from "./studio-color-range-worker-protocol";

/** Render exactly the canonical add/subtract/invert mask, without applying feather twice. */
function readBorderSourceMask(request: StudioSelectionBorderWorkerRunRequest): ColorRangeMask {
  if (typeof OffscreenCanvas !== "function") {
    throw new Error("선택 테두리 계산에 필요한 오프스크린 캔버스를 사용할 수 없습니다.");
  }
  const canvas = new OffscreenCanvas(request.width, request.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("선택 테두리 마스크를 준비하지 못했습니다.");
  try {
    const plan = buildSelectionMaskPlan({ ...request.selection, featherPx: 0 }, request.width, request.height);
    if (plan) paintSelectionMaskSteps(context, plan);
    const data = context.getImageData(0, 0, request.width, request.height).data;
    const alpha = new Uint8ClampedArray(request.width * request.height);
    for (let index = 0; index < alpha.length; index += 1) {
      alpha[index] = request.selection.invert ? 255 - data[index * 4 + 3]! : data[index * 4 + 3]!;
    }
    return { width: request.width, height: request.height, alpha };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export function executeStudioSelectionBorderWorkerRequest(
  request: StudioSelectionBorderWorkerRunRequest,
  readMask: (request: StudioSelectionBorderWorkerRunRequest) => ColorRangeMask = readBorderSourceMask,
) {
  assertStudioSelectionBorderWorkerRequest(request);
  return studioSelectionBorderFromMask(readMask(request), request.selection, request);
}
