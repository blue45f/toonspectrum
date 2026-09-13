// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PwaInstallNudgeHost } from "./pwa-install-nudge-host";

const fixture = vi.hoisted(() => ({
  snapshot: { status: "unavailable" },
  loadUi: vi.fn(),
}));
vi.mock("../lib/pwa-install-store", () => ({
  subscribePwaInstall: () => () => {},
  getPwaInstallSnapshot: () => fixture.snapshot,
  getPwaInstallServerSnapshot: () => fixture.snapshot,
}));
vi.mock("./pwa-install-nudge", () => {
  fixture.loadUi();
  return { PwaInstallNudge: () => <aside>Installation is available</aside> };
});
afterEach(cleanup);

describe("install UI download boundary", () => {
  it("does not import install UI while a prompt is unavailable", () => {
    fixture.snapshot = { status: "unavailable" };
    const { container } = render(<PwaInstallNudgeHost />);
    expect(container.innerHTML).toBe("");
    expect(fixture.loadUi).not.toHaveBeenCalled();
  });

  it("loads when a prompt becomes available and removes the UI when it is consumed", async () => {
    fixture.snapshot = { status: "unavailable" };
    const view = render(<PwaInstallNudgeHost />);
    fixture.snapshot = { status: "available" };
    view.rerender(<PwaInstallNudgeHost />);
    expect(await screen.findByText("Installation is available")).toBeTruthy();
    expect(fixture.loadUi).toHaveBeenCalledTimes(1);
    fixture.snapshot = { status: "installed" };
    view.rerender(<PwaInstallNudgeHost />);
    expect(view.container.innerHTML).toBe("");
  });
});
