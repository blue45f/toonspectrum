// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioLiveTransformDraftStore } from "./studio-live-transform-draft-store";
import { StudioLiveTransformDraftNode } from "./StudioLiveTransformDraftNode";

import type { DrawEl } from "./studio-element-model";

const harness = vi.hoisted(() => ({ drawProps: null as Record<string, unknown> | null }));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const React = await import("react");
  return {
    Group: ({ children, name }: { children?: React.ReactNode; name?: string }) =>
      React.createElement("div", { "data-testid": name ?? "group" }, children),
  };
});

vi.mock("./brush/StudioDrawNode", async () => {
  const React = await import("react");
  return {
    StudioDrawNode: (props: Record<string, unknown>) => {
      harness.drawProps = props;
      return React.createElement("div", { "data-testid": "transform-draft-draw" });
    },
  };
});

afterEach(() => {
  cleanup();
  harness.drawProps = null;
});

describe("StudioLiveTransformDraftNode", () => {
  it("keeps a pixel-empty root mounted and renders candidates with settled, identity-free semantics", () => {
    const store = createStudioLiveTransformDraftStore();
    const scope = "page:page-1";
    render(<StudioLiveTransformDraftNode store={store} scope={scope} />);
    expect(screen.getByTestId("studio-live-transform-draft-root")).not.toBeNull();
    expect(screen.queryByTestId("transform-draft-draw")).toBeNull();

    const element = {
      id: "stroke",
      type: "draw",
      kind: "line",
      points: [0, 0, 20, 10],
      stroke: "#000",
      strokeWidth: 4,
    } as DrawEl;
    const claim = store.claim(scope, element.id);
    act(() => {
      claim?.present({
        element,
        clip: { x: 1, y: 2, width: 30, height: 40 },
      });
    });

    expect(screen.getByTestId("transform-draft-draw")).not.toBeNull();
    expect(harness.drawProps).toMatchObject({
      el: element,
      exposeSceneIdentity: false,
      renderPurpose: "transform-draft",
    });

    act(() => claim?.release());
    expect(screen.getByTestId("studio-live-transform-draft-root")).not.toBeNull();
    expect(screen.queryByTestId("transform-draft-draw")).toBeNull();
  });

  it("renders no stale draft when the page/master scope changes", () => {
    const store = createStudioLiveTransformDraftStore();
    const firstScope = "page:page-1";
    const element = {
      id: "stroke",
      type: "draw",
      kind: "line",
      points: [0, 0, 20, 10],
      stroke: "#000",
      strokeWidth: 4,
    } as DrawEl;
    const view = render(<StudioLiveTransformDraftNode store={store} scope={firstScope} />);
    const claim = store.claim(firstScope, element.id);
    act(() => claim?.present({ element, clip: null }));
    expect(screen.queryByTestId("transform-draft-draw")).not.toBeNull();

    view.rerender(<StudioLiveTransformDraftNode store={store} scope="page:page-2" />);
    expect(screen.queryByTestId("transform-draft-draw")).toBeNull();
  });
});
