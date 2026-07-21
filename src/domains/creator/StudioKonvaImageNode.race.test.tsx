// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioKonvaImageNode } from "./StudioKonvaImageNode";

import type { ImageEl } from "./studio-element-model";

interface WorkerRun {
  reject: (reason?: unknown) => void;
  request: { imageData: ImageData; el: ImageEl };
  signal?: AbortSignal;
  resolve: (value: {
    execution: "worker";
    imageData: { data: Uint8ClampedArray; height: number; width: number };
  }) => void;
}

const konvaCapture = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

const workerHarness = vi.hoisted(() => {
  const runs: WorkerRun[] = [];
  return {
    runs,
    run: vi.fn((
      request: WorkerRun["request"],
      options?: { signal?: AbortSignal },
    ) => new Promise((resolve, reject) => {
      runs.push({ reject, request, resolve, signal: options?.signal } as WorkerRun);
    })),
  };
});

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { createElement, forwardRef } = await import("react");
  return {
    Image: forwardRef<unknown, Record<string, unknown>>((props, _ref) => {
      konvaCapture.current = props;
      return createElement("div", { "data-testid": "konva-image" });
    }),
  };
});

vi.mock("./studio-konva-filters", () => ({
  buildImageFilters: (el: ImageEl) => ({
    attrs: { brightness: el.brightness ?? 0 },
    cachePad: 0,
    filters: [() => undefined],
  }),
  registerStudioKonvaFilters: vi.fn(),
}));

vi.mock("./studio-image-filter-worker-client", () => ({
  createStudioImageFilterWorkerSession: () => ({
    dispose: vi.fn(),
    run: workerHarness.run,
  }),
  runStudioImageFilterWorker: workerHarness.run,
}));

const imageHarness = {
  assigned: [] as ControlledImage[],
};

class ControlledImage {
  height = 32;
  naturalHeight = 32;
  naturalWidth = 64;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  private value = "";
  width = 64;
  handlersBeforeSrc = false;

  get src(): string {
    return this.value;
  }

  set src(value: string) {
    this.handlersBeforeSrc = typeof this.onload === "function" && typeof this.onerror === "function";
    this.value = value;
    imageHarness.assigned.push(this);
  }
}

const canvasHarness = {
  getImageDataCalls: 0,
  getImageDataError: null as Error | null,
};

function imageEl(overrides: Partial<ImageEl> = {}): ImageEl {
  return {
    height: 10.4,
    id: "image-1",
    rotation: 0,
    src: "a.png",
    type: "image",
    width: 20.4,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function node(el: ImageEl) {
  return (
    <StudioKonvaImageNode
      autoFitFrames={null}
      draggable={false}
      el={el}
      innerRef={vi.fn()}
      onChange={vi.fn()}
      onSelect={vi.fn()}
    />
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushWorkerDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80);
  });
  await flush();
}

async function load(image: ControlledImage): Promise<void> {
  await act(async () => {
    image.onload?.(new Event("load"));
    await Promise.resolve();
  });
  await flush();
}

function resolveRun(run: WorkerRun): void {
  const { width, height } = run.request.imageData;
  run.resolve({
    execution: "worker",
    imageData: { data: new Uint8ClampedArray(width * height * 4), height, width },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  konvaCapture.current = null;
  workerHarness.runs.length = 0;
  workerHarness.run.mockClear();
  imageHarness.assigned.length = 0;
  canvasHarness.getImageDataCalls = 0;
  canvasHarness.getImageDataError = null;
  vi.stubGlobal("Image", ControlledImage);
  vi.stubGlobal("ImageData", class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        canvasHarness.getImageDataCalls += 1;
        if (canvasHarness.getImageDataError) throw canvasHarness.getImageDataError;
        return {
          data: new Uint8ClampedArray(this.width * this.height * 4),
          height: this.height,
          width: this.width,
        } as ImageData;
      }),
      putImageData: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudioKonvaImageNode async identity", () => {
  it("never displays a stale src and fails closed when the current src errors", async () => {
    const view = render(node(imageEl()));
    const first = imageHarness.assigned[0]!;
    const staleLoad = first.onload;
    expect(first.handlersBeforeSrc).toBe(true);
    await load(first);
    expect(konvaCapture.current?.image).toBe(first);

    view.rerender(node(imageEl({ src: "b.png" })));
    expect(view.queryByTestId("konva-image")).toBeNull();
    await act(async () => staleLoad?.(new Event("load")));
    expect(view.queryByTestId("konva-image")).toBeNull();

    const second = imageHarness.assigned[1]!;
    await act(async () => second.onerror?.(new Event("error")));
    expect(view.queryByTestId("konva-image")).toBeNull();
  });

  it("rejects stale Worker canvases by src, filter key, and rounded size", async () => {
    const view = render(node(imageEl({ brightness: 0.2 })));
    const first = imageHarness.assigned[0]!;
    await load(first);
    await flushWorkerDebounce();
    expect(workerHarness.runs).toHaveLength(1);
    const staleRun = workerHarness.runs[0]!;

    view.rerender(node(imageEl({ brightness: 0.2, src: "b.png" })));
    expect(staleRun.signal?.aborted).toBe(true);
    expect(view.queryByTestId("konva-image")).toBeNull();
    const second = imageHarness.assigned[1]!;
    await load(second);
    await flushWorkerDebounce();
    expect(workerHarness.runs).toHaveLength(2);
    const currentRun = workerHarness.runs[1]!;

    await act(async () => resolveRun(staleRun));
    expect(konvaCapture.current?.image).toBe(second);
    await act(async () => resolveRun(currentRun));
    const currentCanvas = konvaCapture.current?.image;
    expect(currentCanvas).toBeInstanceOf(HTMLCanvasElement);

    view.rerender(node(imageEl({ brightness: 0.4, src: "b.png" })));
    expect(konvaCapture.current?.image).toBe(second);
    await flushWorkerDebounce();
    expect(workerHarness.runs).toHaveLength(3);

    await act(async () => resolveRun(workerHarness.runs[2]!));
    expect(konvaCapture.current?.image).toBeInstanceOf(HTMLCanvasElement);
    view.rerender(node(imageEl({ brightness: 0.4, src: "b.png", width: 21.2 })));
    expect(konvaCapture.current?.image).toBe(second);
    await flushWorkerDebounce();
    expect(workerHarness.runs[3]!.request.imageData.width).toBe(21);
  });

  it("falls back to the current source without retaining a canvas after a security error", async () => {
    const view = render(node(imageEl({ brightness: 0.2 })));
    const image = imageHarness.assigned[0]!;
    await load(image);
    await flushWorkerDebounce();
    await act(async () => resolveRun(workerHarness.runs[0]!));
    expect(konvaCapture.current?.image).toBeInstanceOf(HTMLCanvasElement);

    canvasHarness.getImageDataError = new DOMException("tainted", "SecurityError");
    view.rerender(node(imageEl({ brightness: 0.4, src: "b.png" })));
    const nextImage = imageHarness.assigned[1]!;
    await load(nextImage);
    await flushWorkerDebounce();

    expect(konvaCapture.current?.image).toBe(nextImage);
    expect(workerHarness.runs).toHaveLength(1);
  });

  it("reuses one source pixel snapshot across parameter-only slider ticks", async () => {
    const view = render(node(imageEl({ brightness: 0.2 })));
    await load(imageHarness.assigned[0]!);
    await flushWorkerDebounce();
    await act(async () => resolveRun(workerHarness.runs[0]!));

    view.rerender(node(imageEl({ brightness: 0.4 })));
    await flushWorkerDebounce();

    expect(workerHarness.runs).toHaveLength(2);
    expect(canvasHarness.getImageDataCalls).toBe(1);
  });

  it("rejects oversized interactive filter surfaces before canvas allocation", async () => {
    render(node(imageEl({ brightness: 0.2, width: 5_000, height: 5_000 })));
    await load(imageHarness.assigned[0]!);
    await flushWorkerDebounce();

    expect(workerHarness.runs).toHaveLength(0);
    expect(canvasHarness.getImageDataCalls).toBe(0);
    expect(konvaCapture.current?.filters).toBeUndefined();
  });
});
