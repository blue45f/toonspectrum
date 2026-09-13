import { describe, expect, it, vi } from "vitest";

import { dismissBrowserCompat, isBrowserCompatDismissed } from "./browser-compat-dismissal";

describe("compatibility notice in restricted browsers", () => {
  it("reads and writes a session dismissal", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(isBrowserCompatDismissed(() => storage)).toBe(false);
    dismissBrowserCompat(() => storage);
    expect(isBrowserCompatDismissed(() => storage)).toBe(true);
  });
  it("survives a blocked sessionStorage getter", () => {
    const blocked = () => { throw new Error("SecurityError"); };
    expect(isBrowserCompatDismissed(blocked)).toBe(false);
    expect(() => dismissBrowserCompat(blocked)).not.toThrow();
  });
  it("survives failed reads and quota-limited writes", () => {
    const storage = { getItem: vi.fn(() => { throw new Error("SecurityError"); }), setItem: vi.fn(() => { throw new Error("QuotaExceededError"); }) };
    expect(isBrowserCompatDismissed(() => storage)).toBe(false);
    expect(() => dismissBrowserCompat(() => storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
});
