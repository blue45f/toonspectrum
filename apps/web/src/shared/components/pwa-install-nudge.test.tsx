// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_KEY = "toonstudio:pwa-install-nudge-dismissed";

function installBrowserStubs(): void {
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
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
}

function dispatchInstallability(): void {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.defineProperties(event, {
    prompt: { value: vi.fn().mockResolvedValue(undefined) },
    userChoice: {
      value: Promise.resolve({ outcome: "accepted", platform: "web" }),
    },
  });
  window.dispatchEvent(event);
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.resetModules();
  installBrowserStubs();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PwaInstallNudge", () => {
  it("shows only when installable and remembers a dismissal for the browser session", async () => {
    const { useI18n } = await import("@/shared/lib/i18n");
    useI18n.getState().setLang("ko");
    const { PwaInstallNudge } = await import("./pwa-install-nudge");

    render(<PwaInstallNudge />);
    expect(screen.queryByRole("status")).toBeNull();

    act(dispatchInstallability);
    const nudge = await screen.findByRole("status", {
      name: "툰스튜디오를 앱처럼 열어보세요",
    });
    fireEvent.click(screen.getByRole("button", { name: "설치 안내 닫기" }));
    expect(nudge).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");

    cleanup();
    vi.resetModules();
    installBrowserStubs();
    const { PwaInstallNudge: RemountedNudge } = await import("./pwa-install-nudge");
    render(<RemountedNudge />);
    act(dispatchInstallability);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
