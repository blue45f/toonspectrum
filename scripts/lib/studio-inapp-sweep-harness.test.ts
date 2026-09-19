import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dismissStudioInAppFirstRunSurfaces,
  installStudioInAppFirstRunState,
  installStudioInAppGuestBoundary,
  selectStudioInAppInactiveBrush,
} from "./studio-inapp-sweep-harness.mts";

import type { Locator, Page, Route } from "playwright";

function firstRunPage(options: {
  quickStart?: boolean;
  mobileHint?: boolean;
  readinessError?: Error;
  keepQuickStart?: boolean;
} = {}) {
  const events: string[] = [];
  let quickStartVisible = options.quickStart ?? false;
  let mobileHintVisible = options.mobileHint ?? false;
  const quickStartDismiss = {
    click: vi.fn(async () => {
      events.push("dismiss-quick-start");
      if (!options.keepQuickStart) quickStartVisible = false;
    }),
  };
  const quickStart = {
    isVisible: vi.fn(async () => {
      events.push("inspect-quick-start");
      return quickStartVisible;
    }),
    locator: vi.fn((selector: string) => {
      expect(selector).toBe('[data-studio-quickstart-dismiss="true"]');
      return quickStartDismiss;
    }),
    waitFor: vi.fn(async () => {
      events.push("quick-start-hidden");
      if (quickStartVisible) throw new Error("quick start remained visible");
    }),
  };
  const mobileHint = {
    isVisible: vi.fn(async () => {
      events.push("inspect-mobile-hint");
      return mobileHintVisible;
    }),
    click: vi.fn(async () => {
      events.push("dismiss-mobile-hint");
      mobileHintVisible = false;
    }),
    waitFor: vi.fn(async () => {
      events.push("mobile-hint-hidden");
      if (mobileHintVisible) throw new Error("mobile hint remained visible");
    }),
  };
  const dock = {
    waitFor: vi.fn(async () => {
      events.push("dock-ready");
      if (options.readinessError) throw options.readinessError;
    }),
  };
  const coach = {
    getByRole: vi.fn((role: string, name: unknown) => {
      expect(role).toBe("button");
      expect(name).toEqual({ name: "안내 닫기", exact: true });
      return mobileHint;
    }),
  };
  const page = {
    locator: vi.fn((selector: string) => {
      if (selector === '[data-studio-mobile-editing-dock="true"]') return dock;
      if (selector === '[data-studio-creative-starter="true"]') return quickStart;
      if (selector === '[data-studio-canvas-transient="coach"]') return coach;
      throw new Error(`unexpected selector: ${selector}`);
    }),
    waitForTimeout: vi.fn(),
    route: vi.fn(),
  };
  return {
    page: page as unknown as Page,
    events,
    dock,
    quickStart,
    quickStartDismiss,
    mobileHint,
    waitForTimeout: page.waitForTimeout,
    route: page.route,
  };
}

interface BrushState {
  id: string;
  active: boolean;
  visible: boolean;
}

function brushLibrary(onClick?: (brush: BrushState, brushes: BrushState[]) => void) {
  const brushes: BrushState[] = [
    { id: "active-pen", active: true, visible: true },
    { id: "hidden-pen", active: false, visible: false },
    { id: "next-pen", active: false, visible: true },
    { id: "other-pen", active: false, visible: true },
  ];
  const inspected: string[] = [];
  const clicked: string[] = [];
  // Resolvers deliberately remain live, like Playwright locators. A :not([aria-pressed])
  // locator changes its target after selection, and a positional locator changes on reorder.
  const locator = (resolve: () => BrushState[]): Locator => ({
    count: async () => resolve().length,
    nth: (index: number) => locator(() => resolve().slice(index, index + 1)),
    isVisible: async () => resolve()[0]?.visible ?? false,
    getAttribute: async (name: string) => {
      const brush = resolve()[0];
      if (!brush) throw new Error("brush not found");
      inspected.push(`${brush.id}:${name}`);
      if (name === "data-studio-brush-select") return brush.id;
      if (name === "aria-pressed") return String(brush.active);
      throw new Error(`unexpected attribute: ${name}`);
    },
    click: async () => {
      const brush = resolve()[0];
      if (!brush) throw new Error("brush not found");
      clicked.push(brush.id);
      if (onClick) onClick(brush, brushes);
      else for (const item of brushes) item.active = item === brush;
    },
  }) as unknown as Locator;
  const library = {
    locator: (selector: string) => {
      if (selector === 'button[data-studio-brush-select]:not([aria-pressed="true"])') {
        return locator(() => brushes.filter((brush) => !brush.active));
      }
      const match = /^button\[data-studio-brush-select=(.+)\]$/u.exec(selector);
      if (!match) throw new Error(`unexpected selector: ${selector}`);
      const id: unknown = JSON.parse(match[1]);
      return locator(() => brushes.filter((brush) => brush.id === id));
    },
  } as unknown as Locator;
  const interaction = {
    click: vi.fn(async (selected: Locator) => { await selected.click(); }),
    settle: vi.fn(async () => undefined),
  };
  return { library, interaction, brushes, inspected, clicked };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("in-app first-run dismissal", () => {
  it("checks readiness before either surface and adds no waits when both are absent", async () => {
    const state = firstRunPage();
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.events).toEqual(["dock-ready", "inspect-quick-start", "inspect-mobile-hint"]);
    expect(state.dock.waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 25_000 });
    expect(state.quickStartDismiss.click).not.toHaveBeenCalled();
    expect(state.mobileHint.click).not.toHaveBeenCalled();
    expect(state.quickStart.waitFor).not.toHaveBeenCalled();
    expect(state.mobileHint.waitFor).not.toHaveBeenCalled();
    expect(state.waitForTimeout).not.toHaveBeenCalled();
    expect(state.route).not.toHaveBeenCalled();
  });

  it("never inspects or dismisses a surface before readiness succeeds", async () => {
    const state = firstRunPage({ quickStart: true, mobileHint: true, readinessError: new Error("not ready") });
    await expect(dismissStudioInAppFirstRunSurfaces(state.page)).rejects.toThrow("not ready");
    expect(state.events).toEqual(["dock-ready"]);
    expect(state.quickStart.isVisible).not.toHaveBeenCalled();
    expect(state.mobileHint.isVisible).not.toHaveBeenCalled();
  });

  it.each([
    { quickStart: true, mobileHint: false },
    { quickStart: false, mobileHint: true },
    { quickStart: true, mobileHint: true },
  ])("dismisses only the visible first-run controls: %j", async (options) => {
    const state = firstRunPage(options);
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.quickStartDismiss.click).toHaveBeenCalledTimes(Number(options.quickStart));
    expect(state.mobileHint.click).toHaveBeenCalledTimes(Number(options.mobileHint));
    if (options.quickStart) {
      expect(state.quickStartDismiss.click).toHaveBeenCalledWith({ timeout: 1_000 });
      expect(state.quickStart.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
    }
    if (options.mobileHint) {
      expect(state.mobileHint.click).toHaveBeenCalledWith({ timeout: 1_000 });
      expect(state.mobileHint.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
    }
    expect(state.events[0]).toBe("dock-ready");
    expect(state.waitForTimeout).not.toHaveBeenCalled();
  });

  it("fails if the visible first-run panel does not dismiss", async () => {
    const state = firstRunPage({ quickStart: true, keepQuickStart: true });
    await expect(dismissStudioInAppFirstRunSurfaces(state.page)).rejects.toThrow("quick start remained visible");
    expect(state.quickStart.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
  });

  it("still uses the visible fallback when private-mode storage rejects initialization", async () => {
    const setItem = vi.fn(() => { throw new Error("storage denied"); });
    vi.stubGlobal("window", { localStorage: { setItem } });
    const state = firstRunPage({ quickStart: true, mobileHint: true });
    Object.assign(state.page, {
      addInitScript: async (script: unknown) => {
        if (typeof script === "function") script();
      },
    });
    await installStudioInAppFirstRunState(state.page);
    expect(setItem).toHaveBeenCalled();
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.quickStartDismiss.click).toHaveBeenCalledOnce();
    expect(state.mobileHint.click).toHaveBeenCalledOnce();
  });

  it("keeps the guest boundary limited to auth GET and never fabricates health readiness", async () => {
    const handlers: { pattern: string; handler: (route: Route) => Promise<void> }[] = [];
    const page = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        handlers.push({ pattern, handler });
      },
    } as unknown as Page;
    await installStudioInAppGuestBoundary(page);
    expect(handlers.map(({ pattern }) => pattern)).toEqual(["**/api/auth/session"]);
    const fulfill = vi.fn();
    const fallback = vi.fn();
    await handlers[0].handler({ request: () => ({ method: () => "GET" }), fulfill, fallback } as unknown as Route);
    expect(fulfill).toHaveBeenCalledWith({
      body: JSON.stringify({ authenticated: false, user: null }),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
    fulfill.mockClear();
    await handlers[0].handler({ request: () => ({ method: () => "POST" }), fulfill, fallback } as unknown as Route);
    expect(fulfill).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });
});

describe("in-app brush selection transition", () => {
  it("skips the active and hidden brushes, then checks the clicked brush after selection and reorder", async () => {
    const state = brushLibrary((selected, brushes) => {
      for (const brush of brushes) brush.active = brush === selected;
      brushes.reverse();
    });
    await selectStudioInAppInactiveBrush(state.library, state.interaction);
    expect(state.clicked).toEqual(["next-pen"]);
    expect(state.inspected.filter((entry) => entry.endsWith(":aria-pressed")))
      .toEqual(["next-pen:aria-pressed", "next-pen:aria-pressed"]);
    expect(state.interaction.settle).toHaveBeenCalledOnce();
  });

  it("waits for the supplied settle callback before checking selection", async () => {
    const state = brushLibrary(() => undefined);
    state.interaction.settle.mockImplementation(async () => {
      for (const brush of state.brushes) brush.active = brush.id === "next-pen";
    });
    await selectStudioInAppInactiveBrush(state.library, state.interaction);
    expect(state.clicked).toEqual(["next-pen"]);
  });

  it.each(["unchanged", "wrong-brush"])("fails when a click leaves selection %s", async (result) => {
    const state = brushLibrary((_selected, brushes) => {
      if (result === "wrong-brush") for (const brush of brushes) brush.active = brush.id === "other-pen";
    });
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("selected brush did not become active");
    expect(state.clicked).toEqual(["next-pen"]);
  });

  it.each(["all-active", "all-hidden", "empty"])("fails without clicking when candidates are %s", async (kind) => {
    const state = brushLibrary();
    if (kind === "empty") state.brushes.length = 0;
    else for (const brush of state.brushes) {
      if (kind === "all-active") brush.active = true;
      else brush.visible = false;
    }
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("a visible non-active brush is required");
    expect(state.interaction.click).not.toHaveBeenCalled();
    expect(state.interaction.settle).not.toHaveBeenCalled();
  });

  it("preserves click failures instead of reporting a transition", async () => {
    const state = brushLibrary();
    state.interaction.click.mockRejectedValue(new Error("control click failed; hit-test=overlay"));
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("control click failed; hit-test=overlay");
    expect(state.interaction.settle).not.toHaveBeenCalled();
  });
});
