// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioDrawingPracticeDocument } from "../studio-drawing-practice-document";
import { StudioDrawingPracticeGuide } from "./StudioDrawingPracticeGuide";

import type { ReactNode } from "react";

const capture = vi.hoisted(() => ({
  images: [] as Record<string, unknown>[],
  transformers: [] as Record<string, unknown>[],
}));

vi.mock("../render/studio-konva-runtime", () => ({
  studioKonvaRuntime: { Filters: { Grayscale: vi.fn() } },
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const React = await import("react");
  const node = {
    cache: vi.fn(),
    clearCache: vi.fn(),
    getLayer: vi.fn(() => ({ batchDraw: vi.fn() })),
    height: vi.fn(() => 300),
    offsetX: vi.fn(),
    offsetY: vi.fn(),
    rotation: vi.fn(() => 0),
    scaleX: vi.fn(() => 1),
    scaleY: vi.fn(() => 1),
    width: vi.fn(() => 400),
    x: vi.fn(() => 200),
    y: vi.fn(() => 300),
  };
  const transformerNode = {
    getLayer: vi.fn(() => ({ batchDraw: vi.fn() })),
    nodes: vi.fn(),
  };
  const Image = React.forwardRef((props: Record<string, unknown>, ref) => {
    capture.images.push(props);
    React.useImperativeHandle(ref, () => node);
    return null;
  });
  const Transformer = React.forwardRef((props: Record<string, unknown>, ref) => {
    capture.transformers.push(props);
    React.useImperativeHandle(ref, () => transformerNode);
    return React.createElement(React.Fragment, null, props.children as ReactNode);
  });
  return { Image, Transformer };
});

class ImmediateImage {
  decoding = "auto";
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  capture.images.length = 0;
  capture.transformers.length = 0;
  vi.stubGlobal("Image", ImmediateImage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const locked = createStudioDrawingPracticeDocument({
  attemptId: "attempt-a",
  source: {
    sha256: `sha256:${"a".repeat(64)}`,
    width: 400,
    height: 300,
  },
  viewport: { canvasWidth: 800, canvasHeight: 1_200 },
});

describe("StudioDrawingPracticeGuide", () => {
  it("keeps a locked guide non-listening so pen input passes through", async () => {
    render(
      <StudioDrawingPracticeGuide
        document={locked}
        sourceDataUrl="data:image/png;base64,reference"
        effectiveScale={1}
        interactionBlocked={false}
        onCommitView={vi.fn()}
      />,
    );
    await waitFor(() => expect(capture.images).toHaveLength(1));
    expect(capture.images[0]).toMatchObject({
      listening: false,
      draggable: false,
      name: "studio-drawing-practice-guide",
    });
    expect(capture.transformers).toHaveLength(0);
  });

  it("enables drag and transform controls only while placement is unlocked", async () => {
    render(
      <StudioDrawingPracticeGuide
        document={{ ...locked, view: { ...locked.view, locked: false } }}
        sourceDataUrl="data:image/png;base64,reference"
        effectiveScale={2}
        interactionBlocked={false}
        onCommitView={vi.fn()}
      />,
    );
    await waitFor(() => expect(capture.images).toHaveLength(1));
    expect(capture.images[0]).toMatchObject({ listening: true, draggable: true });
    expect(capture.transformers).toHaveLength(1);
  });
});
