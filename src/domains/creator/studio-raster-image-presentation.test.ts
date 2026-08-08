// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  acknowledgeStudioRasterImagePresentation,
  expectStudioRasterImagePresentation,
  expectedStudioRasterImagePresentation,
  STUDIO_RASTER_IMAGE_PRESENTATION_PROBE_VERSION,
} from "./studio-raster-image-presentation";

function armProbe(): void {
  window.__studioRasterImagePresentationProbe = {
    version: STUDIO_RASTER_IMAGE_PRESENTATION_PROBE_VERSION,
    expectationEpoch: 0,
    expected: null,
    receiptEpoch: 0,
    receipt: null,
  };
}

afterEach(() => {
  delete window.__studioHotPathRenderCounters;
  delete window.__studioRasterImagePresentationProbe;
});

describe("studio raster image presentation probe", () => {
  it("has no receipt work when the browser verifier is not armed", () => {
    expect(expectStudioRasterImagePresentation({ elementId: "image-1", src: "src-a" }))
      .toBeNull();
    expect(expectedStudioRasterImagePresentation({ elementId: "image-1", src: "src-a" }))
      .toBeNull();
  });

  it("rejects stale identities and receipts the exact current epoch with render counters", () => {
    armProbe();
    window.__studioHotPathRenderCounters = { "studio:canvas": 7, "studio:editor": 9 };
    const first = expectStudioRasterImagePresentation({ elementId: "image-1", src: "src-a" });
    const second = expectStudioRasterImagePresentation({ elementId: "image-1", src: "src-b" });

    expect(first?.epoch).toBe(1);
    expect(second?.epoch).toBe(2);
    expect(expectedStudioRasterImagePresentation({ elementId: "image-1", src: "src-a" }))
      .toBeNull();
    expect(acknowledgeStudioRasterImagePresentation(first!)).toBeNull();

    const receipt = acknowledgeStudioRasterImagePresentation(second!);
    expect(receipt).toMatchObject({
      elementId: "image-1",
      expectationEpoch: 2,
      receiptEpoch: 1,
      renderCounters: { "studio:canvas": 7, "studio:editor": 9 },
      src: "src-b",
    });
    expect(receipt?.presentedAt).toEqual(expect.any(Number));
    expect(receipt?.presentedWallClockMs).toEqual(expect.any(Number));
    expect(acknowledgeStudioRasterImagePresentation(second!)).toBe(receipt);
  });
});
