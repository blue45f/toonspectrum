// @vitest-environment jsdom

import { act, cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDraftPreviewStore } from "./studio-draft-preview-store";
import { resolveStudioDraftPreviewActiveLane } from "./studio-draw-rendering";
import { StudioDraftPreviewLayers } from "./StudioDraftPreviewLayers";

import type { StudioDraftPreviewSource } from "./studio-draft-preview-store";
import type { DrawEl } from "./studio-element-model";
import type { ReactNode } from "react";

const layerHarness = vi.hoisted(() => ({
  drawSceneByName: new Map<string, () => void>(),
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import("react");
  const Layer = forwardRef<
    { drawScene: () => void },
    { children?: ReactNode; listening?: boolean; name?: string }
  >(function MockLayer({ children, listening, name = "unnamed" }, ref) {
    let drawScene = layerHarness.drawSceneByName.get(name);
    if (!drawScene) {
      drawScene = vi.fn();
      layerHarness.drawSceneByName.set(name, drawScene);
    }
    useImperativeHandle(ref, () => ({ drawScene }), [drawScene]);
    return createElement(
      "section",
      {
        "data-layer-role": name,
        "data-listening": String(listening),
        "data-testid": "draft-layer",
      },
      children,
    );
  });
  return {
    Layer,
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

afterEach(() => {
  cleanup();
  layerHarness.drawSceneByName.clear();
});

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

  it("keeps a canonical-drawn prefix in accounting while removing it from presentation", () => {
    const store = new StudioDraftPreviewStore();
    store.settle(draw("canonical"));
    store.settle(draw("pending"));
    const view = render(<StudioDraftPreviewLayers store={store} />);

    act(() => {
      store.suppressSettledPrefix(1);
    });

    expect(store.getSnapshot().settled.map((element) => element.id)).toEqual([
      "canonical",
      "pending",
    ]);
    expect(view.getAllByTestId("draw-node").map((node) => node.dataset.id)).toEqual([
      "pending",
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

  it("keeps settled pixels idle while a source-over fixed FX draft advances", () => {
    const store = new StudioDraftPreviewStore();
    store.settle(draw("first"));
    store.settle(draw("second"));
    const view = render(<StudioDraftPreviewLayers store={store} />);
    const normalDrawScene = layerHarness.drawSceneByName.get(
      "studio-draft-preview-normal",
    );

    expect(normalDrawScene).toBeDefined();
    expect(normalDrawScene).not.toHaveBeenCalled();

    for (const sampleCount of [4, 10, 20, 40]) {
      const points = Array.from({ length: sampleCount }, (_, index) => [index, index % 7]).flat();
      act(() => {
        store.setActive(draw("active-soft-glow", {
          brush: "soft-glow",
          points,
        }));
      });
    }

    const layers = view.getAllByTestId("draft-layer");
    const fixedFxDrawScene = layerHarness.drawSceneByName.get(
      "studio-draft-preview-fixed-fx",
    );
    expect(layers.map((layer) => layer.dataset.layerRole)).toEqual([
      "studio-draft-preview-normal",
      "studio-draft-preview-fixed-fx",
    ]);
    expect(layers.every((layer) => layer.dataset.listening === "false")).toBe(true);
    expect(within(layers[0]!).getAllByTestId("draw-node").map((node) => node.dataset.id)).toEqual([
      "first",
      "second",
    ]);
    expect(within(layers[1]!).getByTestId("draw-node").dataset).toMatchObject({
      activeDraft: "true",
      id: "active-soft-glow",
    });
    expect(normalDrawScene).not.toHaveBeenCalled();
    expect(fixedFxDrawScene).toHaveBeenCalledTimes(4);
    expect(layerHarness.drawSceneByName.get("studio-draft-preview-dynamic")).toBeUndefined();

    act(() => {
      store.settle(draw("active-soft-glow", { brush: "soft-glow" }));
    });

    expect(view.getAllByTestId("draft-layer")).toHaveLength(1);
    expect(view.getAllByTestId("draw-node").map((node) => ({
      activeDraft: node.dataset.activeDraft,
      id: node.dataset.id,
    }))).toEqual([
      { activeDraft: "false", id: "first" },
      { activeDraft: "false", id: "second" },
      { activeDraft: "false", id: "active-soft-glow" },
    ]);
  });

  it("routes only source-over luminous freehand FX away from the settled layer", () => {
    for (const brush of ["neon", "glow", "soft-glow", "glitter", "star-dust"]) {
      expect(resolveStudioDraftPreviewActiveLane(draw(brush, { brush }))).toBe("fixed-fx");
    }
    expect(resolveStudioDraftPreviewActiveLane(draw("highlighter", {
      brush: "highlighter",
    }))).toBe("normal");
    expect(resolveStudioDraftPreviewActiveLane(draw("oil", { brush: "oil" }))).toBe("normal");
    expect(resolveStudioDraftPreviewActiveLane(draw("dynamic", {
      brush: "ink-particle",
    }))).toBe("dynamic");
    expect(resolveStudioDraftPreviewActiveLane(draw("eraser", {
      mode: "eraser",
    }))).toBeNull();
    expect(resolveStudioDraftPreviewActiveLane(draw("filled-glow", {
      brush: "glow",
      fill: "#ffffff",
    }))).toBe("normal");
  });

  it("reacts through the narrow external-store source and unsubscribes on unmount", () => {
    const store = new StudioDraftPreviewStore();
    const unsubscribe = vi.fn();
    const source: StudioDraftPreviewSource = {
      getSnapshot: store.getSnapshot,
      get visibleSettled() {
        return store.visibleSettled;
      },
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
