import { describe, expect, it } from "vitest";

import { createCanvasImageElement } from "./studio-image-placement";

describe("createCanvasImageElement", () => {
  it("centers and scales a wide render inside the studio canvas", () => {
    const element = createCanvasImageElement({
      id: "asset-1",
      src: "data:image/png;base64,asset",
      canvasWidth: 720,
      canvasHeight: 1080,
      sourceWidth: 1200,
      sourceHeight: 900,
      horizontalInset: 120,
    });

    expect(element).toEqual({
      id: "asset-1",
      type: "image",
      src: "data:image/png;base64,asset",
      x: 60,
      y: 315,
      width: 600,
      height: 450,
      rotation: 0,
    });
  });

  it("keeps smaller renders at native size and clamps top placement", () => {
    const element = createCanvasImageElement({
      id: "asset-2",
      src: "data:image/png;base64,tall",
      canvasWidth: 720,
      canvasHeight: 520,
      sourceWidth: 240,
      sourceHeight: 900,
      horizontalInset: 120,
      minY: 40,
    });

    expect(element.width).toBe(240);
    expect(element.height).toBe(900);
    expect(element.x).toBe(240);
    expect(element.y).toBe(40);
  });
});
