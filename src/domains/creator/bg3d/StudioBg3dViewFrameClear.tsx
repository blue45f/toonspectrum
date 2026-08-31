import { useFrame } from "@react-three/fiber";

import {
  clearStudioBg3dViewFrame,
  STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY,
} from "./studio-bg3d-view-frame-clear";

export function StudioBg3dViewFrameClear() {
  useFrame(({ gl }) => {
    clearStudioBg3dViewFrame(gl);
  }, STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY);

  return null;
}
