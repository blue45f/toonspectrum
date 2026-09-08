// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioHelpCenterHost } from "./StudioHelpCenterHost";
import { openStudioHelpHub } from "./studio-help-hub-channel";

afterEach(cleanup);

describe("StudioHelpCenterHost help hub integration", () => {
  it("opens the lazy task-oriented hub with current-tool context", async () => {
    render(<StudioHelpCenterHost />);
    await act(async () => {
      expect(openStudioHelpHub({ toolCommandId: "tool.pen" })).toBe(true);
    });

    const dialog = await screen.findByTestId("studio-help-hub", undefined, {
      timeout: 10_000,
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getAllByText("펜").length).toBeGreaterThan(0);
  });

  it("closes the hub through the shared host lifecycle", async () => {
    render(<StudioHelpCenterHost />);
    await act(async () => {
      openStudioHelpHub({ initialTab: "solve" });
    });
    await screen.findByTestId("studio-help-hub", undefined, { timeout: 10_000 });

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("studio-help-hub")).toBeNull();
  });
});
