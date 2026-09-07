import { describe, expect, it } from "vitest";

import {
  activateStudioTransientCanvas,
  configureStudioTransientCanvas,
  releaseStudioTransientCanvas,
} from "./studio-transient-canvas";

describe("transient overlay canvas allocation", () => {
  it("allocates only during presentation and restores full DPR on the next frame", () => {
    const canvas = { width: 300, height: 150 } as HTMLCanvasElement;
    configureStudioTransientCanvas(canvas, 1572, 1085);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    activateStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([1572, 1085]);
    configureStudioTransientCanvas(canvas, 1500, 1000);
    expect([canvas.width, canvas.height]).toEqual([1500, 1000]);
    releaseStudioTransientCanvas(canvas);
    configureStudioTransientCanvas(canvas, 1600, 1100);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    activateStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([1600, 1100]);
  });

  it("leaves independently owned canvas dimensions alone", () => {
    const canvas = { width: 120, height: 80 } as HTMLCanvasElement;
    activateStudioTransientCanvas(canvas);
    releaseStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([120, 80]);
  });
});
