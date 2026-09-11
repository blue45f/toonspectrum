import { describe, expect, it } from "vitest";

import {
  activateStudioTransientCanvas,
  configureStudioTransientCanvas,
  releaseStudioTransientCanvas,
} from "./studio-transient-canvas";

function createCanvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    dataset: {},
    style: { visibility: "" },
  } as unknown as HTMLCanvasElement;
}

describe("transient overlay canvas allocation", () => {
  it("hides the idle 1×1 backing store and reveals full DPR pixels only during presentation", () => {
    const canvas = createCanvas(300, 150);

    configureStudioTransientCanvas(canvas, 1572, 1085);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(canvas.dataset.studioTransientCanvasState).toBe("idle");
    expect(canvas.style.visibility).toBe("hidden");

    activateStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([1572, 1085]);
    expect(canvas.dataset.studioTransientCanvasState).toBe("active");
    expect(canvas.style.visibility).toBe("");

    configureStudioTransientCanvas(canvas, 1500, 1000);
    expect([canvas.width, canvas.height]).toEqual([1500, 1000]);
    expect(canvas.dataset.studioTransientCanvasState).toBe("active");
    expect(canvas.style.visibility).toBe("");

    releaseStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(canvas.dataset.studioTransientCanvasState).toBe("idle");
    expect(canvas.style.visibility).toBe("hidden");

    configureStudioTransientCanvas(canvas, 1600, 1100);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(canvas.style.visibility).toBe("hidden");

    activateStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([1600, 1100]);
    expect(canvas.style.visibility).toBe("");
  });

  it("leaves independently owned canvas dimensions and visibility alone", () => {
    const canvas = { width: 120, height: 80 } as HTMLCanvasElement;
    activateStudioTransientCanvas(canvas);
    releaseStudioTransientCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([120, 80]);
  });
});
