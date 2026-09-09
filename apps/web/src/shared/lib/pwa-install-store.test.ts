// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  document.documentElement.removeAttribute("data-studio-sw-update");
});

describe("PWA install store", () => {
  it("captures the deferred install prompt and resolves an accepted choice", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: "(display-mode: standalone)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    document.documentElement.setAttribute("data-studio-sw-update", "active");

    const store = await import("./pwa-install-store");
    store.initializePwaInstallCapture();
    expect(store.getPwaInstallSnapshot()).toMatchObject({
      status: "idle",
      online: true,
      serviceWorkerStatus: "active",
    });

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: "accepted", platform: "web" }) },
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.getPwaInstallSnapshot().status).toBe("available");
    await expect(store.requestPwaInstall()).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
    expect(store.getPwaInstallSnapshot().status).toBe("accepted");
  });

  it("tracks connection and service-worker updates without exposing a prompt", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: "(display-mode: standalone)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });

    const store = await import("./pwa-install-store");
    store.initializePwaInstallCapture();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new CustomEvent("toonspectrum:service-worker", {
      detail: { status: "update-waiting" },
    }));

    expect(store.getPwaInstallSnapshot()).toMatchObject({
      online: false,
      serviceWorkerStatus: "update-waiting",
    });
  });
});
