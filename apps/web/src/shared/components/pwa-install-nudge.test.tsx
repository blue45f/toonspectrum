// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

    render(
      <MemoryRouter initialEntries={["/discover"]}>
        <PwaInstallNudge />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    act(dispatchInstallability);
    const nudge = await screen.findByRole("status", {
      name: "툰스튜디오를 앱처럼 열어보세요",
    });
    expect(nudge.getAttribute("data-pwa-install-nudge")).toBe("true");
    expect(nudge.getAttribute("aria-describedby")).toBe("pwa-install-nudge-description");
    expect(screen.getByRole("button", { name: "설치" })).not.toBeNull();
    expect(screen.getByText("홈 화면과 앱 목록에서 더 빠르게 창작을 시작할 수 있습니다.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "설치 안내 닫기" }));
    expect(nudge.isConnected).toBe(false);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");

    cleanup();
    vi.resetModules();
    installBrowserStubs();
    const { PwaInstallNudge: RemountedNudge } = await import("./pwa-install-nudge");
    render(
      <MemoryRouter initialEntries={["/discover"]}>
        <RemountedNudge />
      </MemoryRouter>,
    );
    act(dispatchInstallability);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the home prompt and marks it for mobile bottom-safe positioning", async () => {
    const { useI18n } = await import("@/shared/lib/i18n");
    useI18n.getState().setLang("ko");
    const { PwaInstallNudge } = await import("./pwa-install-nudge");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <PwaInstallNudge />
      </MemoryRouter>,
    );
    act(dispatchInstallability);
    const nudge = await screen.findByRole("status", {
      name: "툰스튜디오를 앱처럼 열어보세요",
    });
    expect(nudge.getAttribute("data-surface")).toBe("home");
    expect(screen.getByText("툰스튜디오 앱 열기")).not.toBeNull();
  });

  it.each(["/market", "/market/assets"])(
    "hides on market route %s even when installable",
    async (path) => {
      const { useI18n } = await import("@/shared/lib/i18n");
      useI18n.getState().setLang("ko");
      const { PwaInstallNudge } = await import("./pwa-install-nudge");

      render(
        <MemoryRouter initialEntries={[path]}>
          <PwaInstallNudge />
        </MemoryRouter>,
      );
      act(dispatchInstallability);
      expect(screen.queryByRole("status")).toBeNull();
    },
  );
});
