import { describe, expect, it } from "vitest";

import { assertReviewHostInkDiffers, inspectReviewHostPixels, type ReviewHostPage } from "./studio-review-host-pixel-evidence";

function fixture() {
  const source: ReviewHostPage = { id: "page", bg: "#b9dce8", canvasH: 200,
    elements: [40, 80, 120].map((y, index) => ({ id: `stroke-${index}`, type: "draw", stroke: "#000000", strokeWidth: 4,
      points: Array.from({ length: 21 }, (_, point) => [20 + point * 4, y]).flat() })) };
  const image = { width: 240, height: 400, channels: 4, data: new Uint8Array(240 * 400 * 4) };
  for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([185, 220, 232, 255], offset);
  for (const stroke of source.elements) {
    for (let y = stroke.points[1]! * 2 - 3; y < stroke.points[1]! * 2 + 3; y++) {
      for (let x = 40; x <= 200; x++) image.data.set([0, 0, 0, 255], (y * image.width + x) * 4);
    }
  }
  return { source, image };
}

describe("Full Host authored capture pixel evidence", () => {
  it("accepts opaque 2x ink at every saved stroke and reports distinct manuscript masks", () => {
    const { source, image } = fixture();
    const result = inspectReviewHostPixels(image, source, 120);
    expect(result.strokes.map((stroke) => stroke.sampleHits)).toEqual([8, 8, 8]);
    expect(result.inkPixels).toBe(2898);
    expect(assertReviewHostInkDiffers(result.inkMask, new Uint8Array(result.inkMask.length))).toBe(2898);
  });
  it("rejects a blank page even when its background, dimensions and source pin are correct", () => {
    const { source, image } = fixture();
    for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([185, 220, 232, 255], offset);
    expect(() => inspectReviewHostPixels(image, source, 120)).toThrow("blank");
  });
  it("rejects missing individual strokes instead of accepting a nonempty export", () => {
    const { source, image } = fixture();
    source.elements[1]!.points = source.elements[1]!.points.map((value, index) => index % 2 ? value + 20 : value);
    expect(() => inspectReviewHostPixels(image, source, 120)).toThrow("stroke-1");
  });
  it("rejects swapped page geometry, altered backgrounds and wrong scale", () => {
    const { source, image } = fixture();
    const shifted = { ...source, elements: source.elements.map((stroke) => ({ ...stroke,
      points: stroke.points.map((value, index) => index % 2 ? value + 20 : value) })) };
    expect(() => inspectReviewHostPixels(image, shifted, 120)).toThrow("original coordinates");
    expect(() => inspectReviewHostPixels(image, { ...source, bg: "#f2c9ad" }, 120)).toThrow("background");
    expect(() => inspectReviewHostPixels(image, source, 240)).toThrow("2x");
  });
  it("rejects transparency and the same ink on differently colored pages", () => {
    const { source, image } = fixture();
    const { inkMask } = inspectReviewHostPixels(image, source, 120);
    expect(() => assertReviewHostInkDiffers(inkMask, inkMask)).toThrow("duplicated");
    image.data[3] = 0;
    expect(() => inspectReviewHostPixels(image, source, 120)).toThrow("opaque");
  });
});
