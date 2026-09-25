// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_OFFLINE_AUTOMATION_EVENT } from "./studio-offline-automation";
import { StudioOfflineRuntime } from "./StudioOfflineRuntime";

const runtime = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  startConnectivity: vi.fn(),
  stopConnectivity: vi.fn(),
}));

vi.mock("./studio-offline-client", () => ({
  inspectStudioOfflineDevice: runtime.inspect,
  prepareLoadedStudioOfflineResources: runtime.prepare,
}));
vi.mock("./studio-connectivity", () => ({
  startStudioConnectivityRuntime: runtime.startConnectivity,
}));

const listeners = new Map<string, EventListener>();
const device = {
  online: true,
  navigationFallback: false,
  supported: true,
  controlled: true,
  offlineReady: false,
  buildId: "build-1",
  persisted: false,
  usage: 100,
  quota: 1_000,
};
async function flushAutomation(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  listeners.clear();
  runtime.startConnectivity.mockReturnValue(runtime.stopConnectivity);
  runtime.inspect.mockResolvedValue(device);
  runtime.prepare.mockResolvedValue({
    schema: 1,
    buildId: "build-1",
    checked: 8,
    cached: 8,
    downloadedBytes: 128,
    missing: [],
    complete: true,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: { saveData: false },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    },
  });
  Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(window, "cancelIdleCallback");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "connection");
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("StudioOfflineRuntime", () => {
  it("prepares the Studio pack automatically without rendering settings", async () => {
    const phases: string[] = [];
    const onStatus = (event: Event): void => {
      phases.push((event as CustomEvent<{ phase: string }>).detail.phase);
    };
    window.addEventListener(STUDIO_OFFLINE_AUTOMATION_EVENT, onStatus);
    const view = render(<StudioOfflineRuntime />);
    await flushAutomation();

    expect(view.container.childElementCount).toBe(0);
    expect(runtime.startConnectivity).toHaveBeenCalledTimes(1);
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(expect.arrayContaining(["preparing", "ready"]));
    window.removeEventListener(STUDIO_OFFLINE_AUTOMATION_EVENT, onStatus);
  });

  it("respects browser data-saver without requiring a user setting", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    render(<StudioOfflineRuntime />);
    await flushAutomation();

    expect(runtime.prepare).not.toHaveBeenCalled();
  });

  it("does not auto-download while local storage is under pressure", async () => {
    runtime.inspect.mockResolvedValue({ ...device, usage: 950 });
    render(<StudioOfflineRuntime />);
    await flushAutomation();

    expect(runtime.prepare).not.toHaveBeenCalled();
  });

  it("pauses a pending download while hidden and resumes when visible", async () => {
    render(<StudioOfflineRuntime />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(runtime.prepare).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAutomation();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
  });

  it("rechecks the current build after the service worker changes", async () => {
    render(<StudioOfflineRuntime />);
    await flushAutomation();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);

    const controllerChange = listeners.get("controllerchange");
    expect(controllerChange).toBeTypeOf("function");
    controllerChange?.(new Event("controllerchange"));
    await flushAutomation();

    expect(runtime.prepare).toHaveBeenCalledTimes(2);
  });

  it("stops connectivity monitoring when leaving Studio", async () => {
    const view = render(<StudioOfflineRuntime />);
    await flushAutomation();
    view.unmount();

    expect(runtime.stopConnectivity).toHaveBeenCalledTimes(1);
  });
});
