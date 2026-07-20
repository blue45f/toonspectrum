import { describe, expect, it } from "vitest";

import {
  resolveStudioBg3dFrameLoop,
  type StudioBg3dRenderActivity,
} from "./studio-bg3d-render-policy";

const STATIC_ACTIVITY: StudioBg3dRenderActivity = Object.freeze({
  modelAnimationPlaying: false,
  physicsPlaying: false,
  transforming: false,
  capturing: false,
  batchRendering: false,
});

describe("Studio BG3D render policy", () => {
  it("uses event-driven frames for a static scene", () => {
    expect(resolveStudioBg3dFrameLoop(STATIC_ACTIVITY)).toBe("demand");
  });

  it.each(Object.keys(STATIC_ACTIVITY) as Array<keyof StudioBg3dRenderActivity>)(
    "keeps continuous frames while %s is active",
    (flag) => {
      expect(resolveStudioBg3dFrameLoop({ ...STATIC_ACTIVITY, [flag]: true })).toBe("always");
    },
  );
});
