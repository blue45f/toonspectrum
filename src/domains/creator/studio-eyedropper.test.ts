import { describe, expect, it } from "vitest";

import { pickColorFromImageData } from "./studio-eyedropper";

function makeImageData(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return data;
}

describe("pickColorFromImageData", () => {
  it("returns the hex color of an opaque pixel", () => {
    const data = makeImageData(4, 4, [255, 0, 128, 255]);
    expect(pickColorFromImageData(data, 4, 4, 1, 1)).toBe("#ff0080");
  });

  it("floors fractional coordinates onto the containing pixel", () => {
    const data = makeImageData(4, 4, [10, 20, 30, 255]);
    expect(pickColorFromImageData(data, 4, 4, 1.9, 2.4)).toBe("#0a141e");
  });

  it("returns null for out-of-bounds coordinates", () => {
    const data = makeImageData(4, 4, [255, 255, 255, 255]);
    expect(pickColorFromImageData(data, 4, 4, -1, 0)).toBeNull();
    expect(pickColorFromImageData(data, 4, 4, 4, 0)).toBeNull();
    expect(pickColorFromImageData(data, 4, 4, 0, 4)).toBeNull();
  });

  it("returns null for a fully transparent pixel", () => {
    const data = makeImageData(4, 4, [255, 0, 0, 0]);
    expect(pickColorFromImageData(data, 4, 4, 0, 0)).toBeNull();
  });
});
