import { describe, expect, it, vi } from "vitest";

import { snapshotStudioStagePointerBatchMapper } from "./studio-stage-pointer-coordinate";

function fakeStage(options: {
  rect?: Partial<DOMRect>;
  clientWidth?: number;
  clientHeight?: number;
  point?: (point: { x: number; y: number }) => { x: number; y: number };
} = {}) {
  const getBoundingClientRect = vi.fn(() => ({
    left: 100,
    top: 40,
    width: 800,
    height: 400,
    ...options.rect,
  }) as DOMRect);
  const point = vi.fn(options.point ?? ((value) => value));
  const invert = vi.fn(() => ({ point }));
  const copy = vi.fn(() => ({ invert }));
  const stage = {
    getContent: () => ({
      clientWidth: options.clientWidth ?? 400,
      clientHeight: options.clientHeight ?? 200,
      getBoundingClientRect,
    }),
    getAbsoluteTransform: () => ({ copy }),
  };
  return { copy, getBoundingClientRect, invert, point, stage };
}

describe("snapshotStudioStagePointerBatchMapper", () => {
  it("reuses one layout and inverse-transform snapshot for every coalesced sample", () => {
    const fixture = fakeStage({
      point: ({ x, y }) => ({ x: x - 12, y: 300 - y }),
    });
    const mapper = snapshotStudioStagePointerBatchMapper(fixture.stage as never);

    expect(mapper.pointFor({ clientX: 300, clientY: 140 })).toEqual({ x: 88, y: 250 });
    expect(mapper.pointFor({ clientX: 500, clientY: 240 })).toEqual({ x: 188, y: 200 });
    expect(mapper.pointFor({ clientX: 700, clientY: 340 })).toEqual({ x: 288, y: 150 });
    expect(fixture.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(fixture.copy).toHaveBeenCalledTimes(1);
    expect(fixture.invert).toHaveBeenCalledTimes(1);
    expect(fixture.point).toHaveBeenCalledTimes(3);
  });

  it("falls back to unit CSS scale when layout dimensions are unavailable", () => {
    const fixture = fakeStage({
      clientWidth: 0,
      clientHeight: 0,
      rect: { left: 10, top: 20, width: 0, height: 0 },
    });
    const mapper = snapshotStudioStagePointerBatchMapper(fixture.stage as never);

    expect(mapper.pointFor({ clientX: 35, clientY: 55 })).toEqual({ x: 25, y: 35 });
  });

  it("fails closed for malformed browser or transform coordinates", () => {
    const fixture = fakeStage({ point: () => ({ x: Number.NaN, y: 1 }) });
    const mapper = snapshotStudioStagePointerBatchMapper(fixture.stage as never);

    expect(mapper.pointFor({ clientX: Number.POSITIVE_INFINITY, clientY: 10 })).toBeNull();
    expect(mapper.pointFor({ clientX: 10, clientY: 10 })).toBeNull();
  });
});
