// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { dismissBrowserCompatibility, hasDismissedBrowserCompatibility } from "./public-site-storage";

afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("storage-restricted public browsers", () => {
  it("remembers a successful dismissal", () => {
    expect(hasDismissedBrowserCompatibility()).toBe(false);
    dismissBrowserCompatibility();
    expect(hasDismissedBrowserCompatibility()).toBe(true);
  });

  it("does not crash when storage access itself is denied", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    expect(hasDismissedBrowserCompatibility()).toBe(false);
    expect(() => dismissBrowserCompatibility()).not.toThrow();
  });

  it("does not crash when the storage quota is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    expect(() => dismissBrowserCompatibility()).not.toThrow();
  });
});
