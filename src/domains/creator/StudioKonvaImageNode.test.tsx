// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioKonvaImageNode } from "./StudioKonvaImageNode";

import type { FrameEl, ImageEl } from "./studio-element-model";

type DragEndEventStub = {
  target: {
    x: () => number;
    y: () => number;
  };
};

type CapturedImageProps = {
  filters?: unknown[];
  image?: CanvasImageSource;
  onDragEnd?: (event: DragEndEventStub) => void;
  outlineWorkerRevision?: string;
  x?: number;
};

type CanvasContextCapture = {
  drawImage: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
};

class TestImage {
  height = 48;
  naturalHeight = 48;
  naturalWidth = 64;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = "";
  width = 64;
}

const konvaCapture = vi.hoisted(() => {
  const layer = { batchDraw: vi.fn() };
  return {
    layer,
    node: {
      cache: vi.fn(),
      clearCache: vi.fn(),
      getLayer: vi.fn(() => layer),
    },
    currentProps: null as Record<string, unknown> | null,
    props: [] as Record<string, unknown>[],
  };
});

const filterCapture = vi.hoisted(() => ({
  build: vi.fn(),
  cachePad: 0,
  filter: vi.fn(),
  register: vi.fn(),
  runWorker: vi.fn(() => new Promise<never>(() => undefined)),
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  const Image = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    useImperativeHandle(ref, () => konvaCapture.node);
    useEffect(() => {
      konvaCapture.currentProps = props;
      return () => {
        if (konvaCapture.currentProps === props) konvaCapture.currentProps = null;
      };
    }, [props]);
    konvaCapture.props.push(props);
    return null;
  });
  Image.displayName = "TestKonvaImage";
  return { Image };
});

vi.mock("./studio-konva-runtime", () => ({
  studioKonvaRuntime: { Filters: {} },
}));

vi.mock("./studio-konva-filters", () => ({
  buildImageFilters: filterCapture.build,
  registerStudioKonvaFilters: filterCapture.register,
}));

vi.mock("./studio-image-filter-worker-client", () => ({
  runStudioImageFilterWorker: filterCapture.runWorker,
  studioImageFilterRequiresWorker: () => false,
}));

const imageCapture = {
  instances: [] as TestImage[],
};

const canvasCapture = {
  contexts: [] as CanvasContextCapture[],
};

const animationFrames = {
  cancel: vi.fn(),
  nextId: 1,
  pending: new Map<number, FrameRequestCallback>(),
  request: vi.fn(),
};

function imageEl(overrides: Partial<ImageEl> = {}): ImageEl {
  return {
    height: 200,
    id: "image-1",
    rotation: 0,
    src: "data:image/png;base64,test",
    type: "image",
    width: 200,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function latestImageProps(): CapturedImageProps {
  const props = konvaCapture.currentProps;
  if (!props) throw new Error("Konva Image was not rendered");
  return props as CapturedImageProps;
}

async function resolveLatestImage(): Promise<TestImage> {
  const image = imageCapture.instances.at(-1);
  if (!image) throw new Error("Image loader was not created");
  await act(async () => {
    image.onload?.();
    await Promise.resolve();
  });
  return image;
}

function fireNextAnimationFrame(now: number): number {
  const next = animationFrames.pending.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!next) throw new Error("No animation frame is pending");
  const [id, callback] = next;
  animationFrames.pending.delete(id);
  act(() => callback(now));
  return id;
}

beforeEach(() => {
  vi.clearAllMocks();
  konvaCapture.props.length = 0;
  konvaCapture.currentProps = null;
  imageCapture.instances.length = 0;
  canvasCapture.contexts.length = 0;
  animationFrames.nextId = 1;
  animationFrames.pending.clear();
  filterCapture.cachePad = 0;
  filterCapture.build.mockImplementation(() => ({
    attrs: { brightness: 0.25 },
    cachePad: filterCapture.cachePad,
    filters: [filterCapture.filter],
  }));

  class CapturedImage extends TestImage {
    constructor() {
      super();
      imageCapture.instances.push(this);
    }
  }
  vi.stubGlobal("Image", CapturedImage);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((
    ((contextId: string) => {
      if (contextId !== "2d") return null;
      const context: CanvasContextCapture = {
        drawImage: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
      };
      canvasCapture.contexts.push(context);
      return context as unknown as CanvasRenderingContext2D;
    }) as typeof HTMLCanvasElement.prototype.getContext
  ));

  animationFrames.request.mockImplementation((callback: FrameRequestCallback) => {
    const id = animationFrames.nextId++;
    animationFrames.pending.set(id, callback);
    return id;
  });
  animationFrames.cancel.mockImplementation((id: number) => {
    animationFrames.pending.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", animationFrames.request);
  vi.stubGlobal("cancelAnimationFrame", animationFrames.cancel);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StudioKonvaImageNode image lifecycle", () => {
  it.each([
    ["horizontal", { flipped: true }, [64, 0], [-1, 1]],
    ["vertical", { flippedY: true }, [0, 48], [1, -1]],
    ["both axes", { flipped: true, flippedY: true }, [64, 48], [-1, -1]],
  ])("bakes the %s flip into a canvas", async (_label, overrides, translate, scale) => {
    render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl(overrides)}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const image = await resolveLatestImage();
    const context = canvasCapture.contexts.at(-1);
    expect(context).toBeDefined();
    expect(context!.translate).toHaveBeenCalledWith(...translate);
    expect(context!.scale).toHaveBeenCalledWith(...scale);
    expect(context!.drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(latestImageProps().image).toBeInstanceOf(HTMLCanvasElement);
  });

  it("keeps an animated GIF live and bypasses flip baking", async () => {
    render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl({ flipped: true, flippedY: true, isAnimatedGif: true })}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const image = await resolveLatestImage();
    expect(latestImageProps().image).toBe(image);
    expect(canvasCapture.contexts).toHaveLength(0);
  });

  it("reuses the filter build, clears stale node cache, and applies cachePad", async () => {
    filterCapture.cachePad = 7;
    const filtered = imageEl({
      outline: { color: "#ffffff", opacity: 100, width: 7 },
    });
    const view = render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={filtered}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await resolveLatestImage();

    await waitFor(() => {
      expect(konvaCapture.node.cache).toHaveBeenCalledWith({ offset: 7 });
    });
    expect(konvaCapture.node.clearCache).toHaveBeenCalled();
    expect(filterCapture.build).toHaveBeenCalledTimes(1);
    expect(latestImageProps().filters).toEqual([filterCapture.filter]);
    expect(latestImageProps().outlineWorkerRevision).toBeTypeOf("string");

    view.rerender(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={{ ...filtered, x: 99 }}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(filterCapture.build).toHaveBeenCalledTimes(1);
    expect(latestImageProps().x).toBe(99);

    const clearCount = konvaCapture.node.clearCache.mock.calls.length;
    view.rerender(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl({ x: 99 })}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(konvaCapture.node.clearCache.mock.calls.length).toBeGreaterThan(clearCount);
    expect(latestImageProps().filters).toEqual([]);
    expect(latestImageProps().outlineWorkerRevision).toBeUndefined();
  });

});

describe("StudioKonvaImageNode animated GIF scheduling", () => {
  it("throttles redraws, yields to live ink, resumes, and cancels on unmount", async () => {
    const liveStrokeRef = { current: null as unknown };
    const view = render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl({ isAnimatedGif: true })}
        innerRef={vi.fn()}
        liveStrokeRef={liveStrokeRef}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await resolveLatestImage();
    expect(animationFrames.pending).toHaveLength(1);
    konvaCapture.layer.batchDraw.mockClear();

    fireNextAnimationFrame(79);
    expect(konvaCapture.layer.batchDraw).not.toHaveBeenCalled();
    fireNextAnimationFrame(80);
    expect(konvaCapture.layer.batchDraw).toHaveBeenCalledTimes(1);

    liveStrokeRef.current = { active: true };
    fireNextAnimationFrame(160);
    expect(konvaCapture.layer.batchDraw).toHaveBeenCalledTimes(1);
    liveStrokeRef.current = null;
    fireNextAnimationFrame(161);
    expect(konvaCapture.layer.batchDraw).toHaveBeenCalledTimes(2);

    const pendingId = animationFrames.pending.keys().next().value as number;
    view.unmount();
    expect(animationFrames.cancel).toHaveBeenLastCalledWith(pendingId);
  });

  it("does not start the GIF redraw loop when multi-frame cells own playback", async () => {
    render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl({
          frames: [
            { id: "frame-1", src: "frame-1.png" },
            { id: "frame-2", src: "frame-2.png" },
          ],
          isAnimatedGif: true,
        })}
        innerRef={vi.fn()}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await resolveLatestImage();

    expect(animationFrames.request).not.toHaveBeenCalled();
    expect(animationFrames.pending).toHaveLength(0);
  });
});

describe("StudioKonvaImageNode interaction lifecycle", () => {
  const frame: FrameEl = {
    height: 300,
    id: "frame-1",
    type: "frame",
    width: 400,
    x: 100,
    y: 200,
  };

  it("auto-fits on drag end, releases the interaction, and clears innerRef on unmount", async () => {
    const innerRef = vi.fn();
    const onChange = vi.fn();
    const onInteractionEnd = vi.fn();
    const view = render(
      <StudioKonvaImageNode
        autoFitFrames={[frame]}
        draggable
        el={imageEl()}
        innerRef={innerRef}
        onChange={onChange}
        onInteractionEnd={onInteractionEnd}
        onSelect={vi.fn()}
      />,
    );
    await resolveLatestImage();
    expect(innerRef).toHaveBeenLastCalledWith(konvaCapture.node);

    act(() => {
      latestImageProps().onDragEnd?.({
        target: { x: () => 150, y: () => 250 },
      });
    });
    expect(onChange).toHaveBeenCalledWith({
      height: 400,
      width: 400,
      x: 100,
      y: 150,
    });
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(innerRef).toHaveBeenLastCalledWith(null);
  });

  it("releases the interaction even when the drag commit throws", async () => {
    const error = new Error("commit failed");
    const onChange = vi.fn(() => {
      throw error;
    });
    const onInteractionEnd = vi.fn();
    render(
      <StudioKonvaImageNode
        autoFitFrames={null}
        draggable
        el={imageEl()}
        innerRef={vi.fn()}
        onChange={onChange}
        onInteractionEnd={onInteractionEnd}
        onSelect={vi.fn()}
      />,
    );
    await resolveLatestImage();

    expect(() => {
      act(() => {
        latestImageProps().onDragEnd?.({
          target: { x: () => 30, y: () => 40 },
        });
      });
    }).toThrow(error);
    expect(onChange).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
  });
});
