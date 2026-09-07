// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHUNK_RELOAD_FLAG } from "../shared/lib/chunk-load-recovery";
import { consumeStudioProgrammaticReloadAllowance } from "../shared/lib/programmatic-reload";

import { ErrorBoundary } from "./error-boundary";

function FailedChunk(): never {
  throw new TypeError("Failed to fetch dynamically imported module");
}

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // Keep real React/DOM lifecycle behavior while intercepting jsdom's non-configurable navigation.
  const browserWindow = window;
  vi.stubGlobal("window", new Proxy(browserWindow, {
    get(target, key) {
      return key === "location" ? { reload } : Reflect.get(target, key, target);
    },
  }));
});

afterEach(() => {
  cleanup();
  consumeStudioProgrammaticReloadAllowance();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderFailedChunk() {
  return render(<ErrorBoundary><FailedChunk /></ErrorBoundary>);
}

describe("ErrorBoundary chunk recovery with durable reload guards", () => {
  it("preserves recovery controls across repeated mounts when storage is readable but full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });

    for (let mount = 0; mount < 3; mount += 1) {
      const view = renderFailedChunk();
      expect(screen.getByRole("alert").textContent).toContain("자동으로 복구하지 못했어요");
      expect(screen.getByRole("button", { name: "새로고침" })).toBeDefined();
      expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
      expect(screen.queryByRole("status")).toBeNull();
      expect(sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      expect(consumeStudioProgrammaticReloadAllowance()).toBe(false);
      view.unmount();
    }
  });

  it("still allows the user's explicit reload when guard storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    renderFailedChunk();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    expect(reload).toHaveBeenCalledOnce();
    expect(consumeStudioProgrammaticReloadAllowance()).toBe(true);
    expect(sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBeNull();
  });

  it("reloads once after recording the guard and shows recovery controls on the next mount", () => {
    const first = renderFailedChunk();
    expect(sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBe("1");
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("새로고침하는 중");
    expect(consumeStudioProgrammaticReloadAllowance()).toBe(true);
    first.unmount();

    renderFailedChunk();
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeDefined();
    expect(reload).toHaveBeenCalledOnce();
    expect(consumeStudioProgrammaticReloadAllowance()).toBe(false);
  });

  it("does not reload if ownership is stored but writing the global guard fails", () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === CHUNK_RELOAD_FLAG) throw new DOMException("Storage is full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    renderFailedChunk();

    expect(screen.getByRole("alert")).toBeDefined();
    expect(reload).not.toHaveBeenCalled();
    expect(consumeStudioProgrammaticReloadAllowance()).toBe(false);
  });
});
