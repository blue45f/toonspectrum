// @vitest-environment jsdom

import { act, cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDraftPreviewStore } from "./studio-draft-preview-store";
import { StudioDraftPreviewLayers } from "./StudioDraftPreviewLayers";

import type { StudioDraftPreviewSource } from "./studio-draft-preview-store";
import type { DrawEl } from "./studio-element-model";
import type { ReactNode } from "react";

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { createElement } = await import("react");
  return {
    Layer: ({ children, listening }: { children?: ReactNode; listening?: boolean }) => createElement(
      "section",
      { "data-listening": String(listening), "data-testid": "draft-layer" },
      children,
    ),
  };
});

vi.mock("./StudioDrawNode", async () => {
  const { createElement } = await import("react");
  return {
    StudioDrawNode: ({ activeDraft, el }: { activeDraft?: boolean; el: DrawEl }) => createElement(
      "div",
      {
        "data-active-draft": activeDraft ? "true" : "false",
        "data-id": el.id,
        "data-testid": "draw-node",
      },
    ),
  };
});

function draw(id: string, overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id,
    mode: "pen",
    points: [0, 0, 10, 10],
    stroke: "#111111",
    strokeWidth: 4,
    type: "draw",
    ...overrides,
  };
}

afterEach(cleanup);

describe("StudioDraftPreviewLayers", () => {
  it("renders neither a layer nor a node for empty and eraser-only previews", () => {
    const store = new StudioDraftPreviewStore();
    const view = render(<StudioDraftPreviewLayers store={store} />);

    expect(view.queryByTestId("draft-layer")).toBeNull();
    act(() => store.setActive(draw("eraser", { mode: "eraser" })));
    expect(view.queryByTestId("draft-layer")).toBeNull();
    expect(view.queryByTestId("draw-node")).toBeNull();
  });

  it("keeps settled drafts in FIFO order and marks only a normal active draft as active", () => {
    const store = new StudioDraftPreviewStore();
    store.settle(draw("first"));
    store.settle(draw("second"));
    store.setActive(draw("active", { brush: "watercolor" }));

    const view = render(<StudioDraftPreviewLayers store={store} />);
    const layers = view.getAllByTestId("draft-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]?.getAttribute("data-listening")).toBe("false");
    expect(within(layers[0]!).getAllByTestId("draw-node").map((node) => ({
      activeDraft: node.getAttribute("data-active-draft"),
      id: node.getAttribute("data-id"),
    }))).toEqual([
      { activeDraft: "false", id: "first" },
      { activeDraft: "false", id: "second" },
      { activeDraft: "true", id: "active" },
    ]);
  });

  it("isolates a live dynamics brush and applies the active-draft render budget", () => {
    const store = new StudioDraftPreviewStore();
    store.settle(draw("settled"));
    store.setActive(draw("dynamic", { brush: "ink-particle" }));

    const view = render(<StudioDraftPreviewLayers store={store} />);
    const layers = view.getAllByTestId("draft-layer");
    expect(layers).toHaveLength(2);
    expect(within(layers[0]!).getByTestId("draw-node").dataset).toMatchObject({
      id: "settled",
    });
    expect(within(layers[1]!).getByTestId("draw-node").dataset).toMatchObject({
      activeDraft: "true",
      id: "dynamic",
    });
  });

  it("reacts through the narrow external-store source and unsubscribes on unmount", () => {
    const store = new StudioDraftPreviewStore();
    const unsubscribe = vi.fn();
    const source: StudioDraftPreviewSource = {
      getSnapshot: store.getSnapshot,
      subscribe: vi.fn((listener) => {
        const stop = store.subscribe(listener);
        return () => {
          unsubscribe();
          stop();
        };
      }),
    };
    const view = render(<StudioDraftPreviewLayers store={source} />);

    act(() => store.setActive(draw("external")));
    expect(view.getByTestId("draw-node").getAttribute("data-id")).toBe("external");
    expect(source.subscribe).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    act(() => store.setActive(draw("after-unmount")));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
