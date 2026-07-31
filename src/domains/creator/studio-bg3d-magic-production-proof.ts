/**
 * Production-only Magic Layer verification facade.
 *
 * This module must stay behind the explicit diagnostic query boundary in `src/app/main.tsx`.
 * It deliberately re-exports the exact product helpers instead of copying their implementation,
 * so the production-preview verifier exercises the same code used by BG3D capture and LT insert.
 */
export {
  applyStudioBg3dCaptureFrameViewOffset,
} from "./studio-bg3d-capture-frame-view-offset";
export {
  encodeStudioBg3dLtLayers,
} from "./studio-bg3d-lt-layer-encoder";
