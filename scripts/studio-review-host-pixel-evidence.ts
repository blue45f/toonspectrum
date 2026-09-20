import assert from "node:assert/strict";

/** QA-only evidence for untransformed black freehand strokes authored by this verifier. */
export interface ReviewHostStroke {
  id: string; type: "draw"; points: number[]; stroke: string; strokeWidth: number;
}
export interface ReviewHostPage {
  id: string; bg: string; canvasH: number; elements: ReviewHostStroke[];
}
export interface ReviewHostImage {
  width: number; height: number; channels: number; data: ArrayLike<number>;
}

export function inspectReviewHostPixels(image: ReviewHostImage, source: ReviewHostPage, sourceWidth: number) {
  const scale = image.width / sourceWidth;
  assert.equal(scale, 2, "Preserve the real default 2x capture; do not resample evidence");
  assert.equal(image.height, source.canvasH * scale, "Export must retain the source aspect and height");
  assert(image.channels === 3 || image.channels === 4, "Require decoded RGB(A) evidence");
  assert.equal(image.data.length, image.width * image.height * image.channels);
  assert(/^#[\da-f]{6}$/iu.test(source.bg));
  const background = [1, 3, 5].map((offset) => Number.parseInt(source.bg.slice(offset, offset + 2), 16));
  const inkMask = new Uint8Array(image.width * image.height);
  let inkPixels = 0, backgroundPixels = 0;
  for (let index = 0; index < inkMask.length; index++) {
    const offset: number = index * image.channels;
    if (image.channels === 4) assert.equal(image.data[offset + 3], 255, "The opaque source must stay opaque");
    const rgb = [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!];
    if (rgb.every((value, channel) => value === background[channel])) backgroundPixels++;
    // The authored default pen is dark. Background changes alone never count as manuscript ink.
    if (rgb.every((value, channel) => background[channel]! - value >= 32)) {
      inkMask[index] = 1; inkPixels++;
    }
  }
  assert(backgroundPixels > inkMask.length * .8, "Retain the original page background and clear margins");
  assert(inkPixels >= 500, "A blank or near-empty capture is not authored manuscript evidence");
  assert(source.elements.length >= 3, "Require several actual authored strokes on each page");
  const strokes = source.elements.map((stroke) => {
    assert.equal(stroke.type, "draw");
    assert(stroke.points.length >= 8 && stroke.points.length % 2 === 0);
    assert(stroke.points.every(Number.isFinite));
    assert(stroke.strokeWidth > 0 && stroke.strokeWidth <= 24);
    const points = stroke.points.length / 2;
    const samples = Array.from({ length: 8 }, (_, index) => Math.round((points - 1) * (.15 + index * .1)));
    const radius = Math.ceil(stroke.strokeWidth * scale * .6);
    const hits = samples.map((sample) => {
      const x = Math.round(stroke.points[sample * 2]! * scale);
      const y = Math.round(stroke.points[sample * 2 + 1]! * scale);
      assert(x >= 0 && y >= 0 && x < image.width && y < image.height, "Saved points must be on this page");
      for (let yy = Math.max(0, y - radius); yy <= Math.min(image.height - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(image.width - 1, x + radius); xx++) {
          if (inkMask[yy * image.width + xx]) return true;
        }
      }
      return false;
    });
    assert(hits.filter(Boolean).length >= 7, `Saved stroke ${stroke.id} must visibly replay at its original coordinates`);
    return { id: stroke.id, points, strokeWidth: stroke.strokeWidth, sampleHits: hits.filter(Boolean).length, samples: hits.length };
  });
  return { sourcePageId: source.id, scale, inkPixels, backgroundPixels, strokes, inkMask };
}

export function assertReviewHostInkDiffers(first: Uint8Array, second: Uint8Array) {
  assert.equal(first.length, second.length);
  let differentInkPixels = 0;
  for (let index = 0; index < first.length; index++) if (first[index] !== second[index]) differentInkPixels++;
  assert(differentInkPixels >= 500, "Different backgrounds must not conceal duplicated manuscript ink");
  return differentInkPixels;
}
