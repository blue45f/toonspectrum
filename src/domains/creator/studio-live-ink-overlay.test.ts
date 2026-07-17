import { describe, expect, it, vi } from "vitest";

import {
  StudioLiveInkOverlayRenderer,
  type StudioLiveInkStrokeStyle,
  type StudioLiveInkSurface,
} from "./studio-live-ink-overlay";

interface RecordedSegment {
  readonly from: readonly [number, number];
  readonly control: readonly [number, number];
  readonly to: readonly [number, number];
  readonly width: number;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

/** Canvas 픽셀 대신 중점 이차곡선 조각과 clear 호출을 기록한다. */
function recordingCanvas() {
  const segments: RecordedSegment[] = [];
  const clearRect = vi.fn();
  let from: [number, number] | null = null;
  let control: [number, number] | null = null;
  let to: [number, number] | null = null;
  let lineWidth = 1;
  const context = {
    save: () => undefined,
    restore: () => undefined,
    setTransform: () => undefined,
    clearRect,
    beginPath: () => {
      from = null;
      control = null;
      to = null;
    },
    moveTo: (x: number, y: number) => {
      from = [x, y];
    },
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => {
      control = [cx, cy];
      to = [x, y];
    },
    stroke: () => {
      if (!from || !control || !to) return;
      segments.push({
        from: [rounded(from[0]), rounded(from[1])],
        control: [rounded(control[0]), rounded(control[1])],
        to: [rounded(to[0]), rounded(to[1])],
        width: rounded(lineWidth),
      });
    },
    arc: () => undefined,
    fill: () => undefined,
    set lineWidth(value: number) {
      lineWidth = value;
    },
    get lineWidth() {
      return lineWidth;
    },
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "#000000",
    fillStyle: "#000000",
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, clearRect, segments };
}

const SURFACE: StudioLiveInkSurface = {
  left: 0,
  top: 0,
  width: 100,
  height: 80,
  documentScale: 1,
  documentWidth: 100,
  flipX: false,
};

const STYLE: StudioLiveInkStrokeStyle = {
  color: "#24180f",
  strokeWidthDoc: 10,
  opacity: 1,
  minDistanceDoc: 0,
};

function setup(style: StudioLiveInkStrokeStyle = STYLE) {
  const recording = recordingCanvas();
  const renderer = new StudioLiveInkOverlayRenderer();
  renderer.attach(recording.canvas);
  renderer.setSurface(SURFACE);
  expect(renderer.begin(style, 0, 0, 0.25)).toBe(true);
  return { renderer, ...recording };
}

describe("StudioLiveInkOverlayRenderer", () => {
  it("appends only one new causal segment without clearing or repainting its finalized prefix", () => {
    const { renderer, clearRect, segments } = setup();
    renderer.appendFrom([0, 0, 10, 0, 20, 10], [0.25, 0.5, 0.75]);
    const finalizedPrefix = segments.map((segment) => ({ ...segment }));
    const clearsBeforeAppend = clearRect.mock.calls.length;

    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );

    expect(clearRect).toHaveBeenCalledTimes(clearsBeforeAppend);
    expect(segments.slice(0, finalizedPrefix.length)).toEqual(finalizedPrefix);
    expect(segments.slice(finalizedPrefix.length)).toEqual([{
      from: [15, 5],
      control: [20, 10],
      to: [25, 10],
      width: 17,
    }]);

    const segmentCount = segments.length;
    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );
    expect(segments).toHaveLength(segmentCount);
  });

  it("synchronously seals the terminal half-segment at the raw pointerup endpoint", () => {
    const { renderer, clearRect, segments } = setup({ ...STYLE, minDistanceDoc: 5 });
    // 12px 끝점은 직전 kept 점에서 2px뿐이라 라이브 thinning 에서는 일단 생략된다.
    renderer.appendFrom([0, 0, 10, 0, 12, 0], [0.25, 0.5, 1]);
    const prefixBeforeEnd = segments.map((segment) => ({ ...segment }));

    renderer.end();

    expect(clearRect).not.toHaveBeenCalled();
    expect(segments.slice(0, prefixBeforeEnd.length)).toEqual(prefixBeforeEnd);
    expect(segments.slice(prefixBeforeEnd.length)).toEqual([
      {
        from: [5, 0],
        control: [10, 0],
        to: [11, 0],
        width: 17,
      },
      {
        from: [11, 0],
        control: [12, 0],
        to: [12, 0],
        width: 17,
      },
    ]);
    expect(segments.at(-1)?.to).toEqual([12, 0]);
    expect(renderer.isActive).toBe(false);
    expect(renderer.hasSettledStrokes).toBe(true);

    const sealedCount = segments.length;
    renderer.end();
    expect(segments).toHaveLength(sealedCount);
  });

  it("replays a settled stroke with the exact incremental-plus-terminal segment sequence", () => {
    const { renderer, clearRect, segments } = setup();
    renderer.appendFrom(
      [0, 0, 10, 0, 20, 10, 30, 10],
      [0.25, 0.5, 0.75, 1]
    );
    renderer.end();
    const finalized = segments.map((segment) => ({ ...segment }));
    expect(finalized.at(-1)?.to).toEqual([30, 10]);

    segments.splice(0);
    clearRect.mockClear();
    renderer.setSurface({ ...SURFACE, width: 120 });

    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(segments).toEqual(finalized);
  });
});
