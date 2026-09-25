// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteStage } from "./route-stage";
import { hasMeaningfulRouteContent, inspectRouteContent, routeStageTimeoutMs } from "./route-stage-content";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("route stage semantic and recovery guarantees", () => {
  it("adds one visually hidden route heading only when the page omitted h1", async () => {
    const { rerender } = render(
      <RouteStage pathname="/studio/poser" search="" accessibleTitle="Studio">
        <div><p>Pose workspace loading</p></div>
      </RouteStage>,
    );
    await waitFor(() => expect(document.querySelector("h1[data-route-semantic-heading]")?.textContent).toBe("Studio"));
    expect(document.querySelectorAll("[data-route-semantic-heading]")).toHaveLength(2);

    rerender(
      <RouteStage pathname="/studio/poser" search="" accessibleTitle="Studio">
        <div><h1>Pose studio</h1></div>
      </RouteStage>,
    );
    await waitFor(() => expect(document.querySelector("[data-route-semantic-heading]")).toBeNull());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("publishes the shared theme, product, purpose and maturity contract", () => {
    render(
      <RouteStage pathname="/market/browse" search="?type=brush" accessibleTitle="Browse assets">
        <section data-route-ready=""><h1>Browse assets</h1></section>
      </RouteStage>,
    );
    const stage = document.querySelector("[data-route-stage-key]");
    expect(stage?.getAttribute("data-theme-contract")).toBe("unified");
    expect(stage?.getAttribute("data-route-product")).toBe("studio");
    expect(stage?.getAttribute("data-route-purpose")).toBe("create");
    expect(stage?.getAttribute("data-route-maturity")).toBe("stable");
  });

  it("publishes pending and ready route state for browser health checks", async () => {
    const { rerender } = render(
      <RouteStage pathname="/production" search="" accessibleTitle="Production">
        <div data-route-loading-fallback="">Loading</div>
      </RouteStage>,
    );
    expect(document.querySelector("[data-route-stage-key]")?.getAttribute("data-route-state"))
      .toBe("pending");

    rerender(
      <RouteStage pathname="/production" search="" accessibleTitle="Production">
        <section data-route-ready=""><h1>Production</h1></section>
      </RouteStage>,
    );
    await waitFor(() => {
      const stage = document.querySelector("[data-route-stage-key]");
      expect(stage?.getAttribute("data-route-state")).toBe("ready");
      expect(stage?.getAttribute("data-route-readiness-source")).toBe("explicit");
    });
  });


  it("preserves explicit degraded, blocked and error states instead of collapsing them into ready", async () => {
    const states = ["degraded", "blocked", "error"] as const;
    for (const state of states) {
      const attribute = `data-route-${state}`;
      const { unmount } = render(
        <RouteStage pathname="/production/projects/demo" search="" accessibleTitle="Production">
          <section {...{ [attribute]: "demo" }}><h1>Production</h1></section>
        </RouteStage>,
      );
      await waitFor(() => {
        const stage = document.querySelector("[data-route-stage-key]");
        expect(stage?.getAttribute("data-route-state")).toBe(state);
        expect(stage?.getAttribute("data-route-readiness-source")).toBe("explicit");
      });
      unmount();
    }
  });

  it("keeps explicit pending content pending even when loading copy is long", () => {
    const root = document.createElement("div");
    root.innerHTML = '<section data-route-pending="loader"><p>This loading explanation is intentionally longer than thirty two characters.</p><button>Cancel</button></section>';
    expect(inspectRouteContent(root)).toEqual({ state: "pending", source: "explicit" });
    expect(hasMeaningfulRouteContent(root)).toBe(false);
  });

  it("uses longer readiness budgets for production and heavyweight Studio surfaces", () => {
    expect(routeStageTimeoutMs("/market/browse")).toBe(8_000);
    expect(routeStageTimeoutMs("/production/projects/demo/overview")).toBe(10_000);
    expect(routeStageTimeoutMs("/studio/canvas")).toBe(15_000);
    expect(routeStageTimeoutMs("/studio/bg3d")).toBe(20_000);
  });

  it("shows an actionable recovery panel after an empty public route stalls", async () => {
    vi.useFakeTimers();
    render(<RouteStage pathname="/market/browse" search="?type=brush" accessibleTitle="Browse assets">{null}</RouteStage>);
    await act(async () => { await vi.advanceTimersByTimeAsync(8_100); });
    expect(document.querySelector("[data-route-recovery]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /전체 메뉴|Directory/u }).getAttribute("href")).toBe("/sitemap");
  });

  it("does not treat its own semantic heading or recovery UI as page content", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h1 data-route-semantic-heading>Fallback</h1><section data-route-recovery><h2>Recovery</h2><button>Retry</button></section><div data-route-loading-fallback><h2>Loading</h2></div>';
    expect(hasMeaningfulRouteContent(root)).toBe(false);
    root.insertAdjacentHTML("beforeend", "<canvas></canvas>");
    expect(hasMeaningfulRouteContent(root)).toBe(true);
  });
});
