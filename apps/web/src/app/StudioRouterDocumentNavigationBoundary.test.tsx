// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Link, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioRouterDocumentNavigationBoundary } from "./StudioRouterDocumentNavigationBoundary";
import { installStudioDocumentNavigationBridge } from "./studio-document-navigation";

const removeBridges: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const remove of removeBridges.splice(0)) remove();
});
beforeEach(() => window.history.replaceState(null, "", "/market"));

function Controls({ to, replace = false, guarded = false, state, target }: {
  to: string;
  replace?: boolean;
  guarded?: boolean;
  state?: Record<string, string>;
  target?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <Link to={to} replace={replace} state={state} target={target} onClick={(event) => {
        if (guarded) event.preventDefault();
      }}>Destination</Link>
      <button type="button" onClick={() => navigate(to, { replace, state })}>Navigate</button>
      <output aria-label="route">{location.pathname}</output>
      <output aria-label="state">{JSON.stringify(location.state)}</output>
    </>
  );
}

function mount(from: string, props: Parameters<typeof Controls>[0]) {
  window.history.replaceState(null, "", from);
  const location = {
    get href() { return window.location.href; },
    assign: vi.fn(),
    replace: vi.fn(),
  };
  removeBridges.push(installStudioDocumentNavigationBridge(document, location));
  render(
    <BrowserRouter>
      <StudioRouterDocumentNavigationBoundary location={location}>
        <Controls {...props} />
      </StudioRouterDocumentNavigationBoundary>
    </BrowserRouter>,
  );
  return location;
}

describe("Studio Router document navigation boundary", () => {
  it.each([
    ["/market", "/studio/work/work-1/canvas?tool=pen#canvas", false],
    ["/studio/work/work-1/canvas", "/community", false],
    ["/market", "/studio", true],
  ] as const)("handles an actual Link from %s to %s without an intermediate SPA transition (replace: %s)", (from, to, replace) => {
    const location = mount(from, { to, replace });
    fireEvent.click(screen.getByRole("link", { name: "Destination" }));
    expect(replace ? location.replace : location.assign).toHaveBeenCalledExactlyOnceWith(new URL(to, location.href).href);
    expect(replace ? location.assign : location.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("route").textContent).toBe(from);
    expect(window.location.pathname).toBe(from);
  });

  it("honors a component click guard without bypassing it or changing the route", () => {
    const location = mount("/market", { to: "/studio", guarded: true });
    fireEvent.click(screen.getByRole("link", { name: "Destination" }));
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("route").textContent).toBe("/market");
  });

  it.each([
    ["/market", "/community"],
    ["/studio/work/work-1/canvas", "/studio/work/work-2/canvas"],
  ])("preserves same-boundary SPA navigation from %s to %s", async (from, to) => {
    const location = mount(from, { to });
    fireEvent.click(screen.getByRole("link", { name: "Destination" }));
    await waitFor(() => expect(screen.getByLabelText("route").textContent).toBe(to));
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each([false, true])("handles programmatic stateless navigation (replace: %s)", (replace) => {
    const location = mount("/market", { to: "/studio", replace });
    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect(replace ? location.replace : location.assign).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("route").textContent).toBe("/market");
  });

  it("retains Router state for the existing isolation-gate fallback instead of discarding it", async () => {
    const location = mount("/market", { to: "/studio", state: { selectedAsset: "asset-1" } });
    fireEvent.click(screen.getByRole("link", { name: "Destination" }));
    await waitFor(() => expect(screen.getByLabelText("route").textContent).toBe("/studio"));
    expect(screen.getByLabelText("state").textContent).toBe(JSON.stringify({ selectedAsset: "asset-1" }));
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each(["meta", "control", "middle", "new-tab"])("does not hijack a %s Link click", (kind) => {
    const location = mount("/market", { to: "/studio", target: kind === "new-tab" ? "_blank" : undefined });
    // Cancel only native jsdom navigation, after both Router and bridge handlers.
    const preventNativeNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", preventNativeNavigation);
    try {
      fireEvent.click(screen.getByRole("link", { name: "Destination" }), {
        metaKey: kind === "meta", ctrlKey: kind === "control", button: kind === "middle" ? 1 : 0,
      });
    } finally {
      document.removeEventListener("click", preventNativeNavigation);
    }
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("route").textContent).toBe("/market");
  });
});
