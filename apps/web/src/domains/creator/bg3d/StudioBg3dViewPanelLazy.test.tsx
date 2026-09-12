// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dViewPanel } from "./StudioBg3dViewPanelLazy";

import type { StudioBg3dViewPanelProps } from "./StudioBg3dViewPanelContent";

const { loaded } = vi.hoisted(() => ({ loaded: vi.fn() }));

vi.mock("./StudioBg3dViewPanel", async () => {
  const { useState } = await import("react");
  loaded();
  return {
    StudioBg3dViewPanel: function MockViewPanel({ hidden }: { hidden?: boolean }) {
      const [edits, setEdits] = useState(0);
      return (
        <section hidden={hidden} data-testid="deferred-view-panel">
          <button type="button" onClick={() => setEdits((value) => value + 1)}>
            View edits {edits}
          </button>
        </section>
      );
    },
  };
});

afterEach(cleanup);

describe("BG3D view panel activation boundary", () => {
  it("loads only on first activation and retains state when hidden and reopened", async () => {
    // The presentation module is mocked; only visibility is consumed by this boundary test.
    const props = (hidden: boolean) => ({ hidden, context: {} } as StudioBg3dViewPanelProps);
    const panel = (hidden: boolean) => (
      <StrictMode><StudioBg3dViewPanel {...props(hidden)} /></StrictMode>
    );
    const { rerender } = render(panel(true));
    await act(async () => {});
    expect(loaded).not.toHaveBeenCalled();
    expect(screen.queryByTestId("deferred-view-panel")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    rerender(panel(false));
    const button = await screen.findByRole("button", { name: "View edits 0" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "View edits 1" })).toBeTruthy();
    expect(loaded).toHaveBeenCalledTimes(1);

    rerender(panel(true));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("deferred-view-panel").hidden).toBe(true);

    rerender(panel(false));
    expect(screen.getByRole("button", { name: "View edits 1" })).toBeTruthy();
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
