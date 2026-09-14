// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openStudioCompanionSurfaceWindow, studioCompanionWindowName } from "./studio-tools-companion";

const session = "primary-tab-1234";
afterEach(() => { vi.restoreAllMocks(); });

describe("companion browser-tab opening", () => {
  it.each(["navigator", "review", "reference"] as const)("opens %s as a regular tab with a scoped URL", (surface) => {
    const candidate = { closed: false, opener: {}, focus: vi.fn() };
    const open = vi.fn(() => candidate as unknown as Window);
    const result = openStudioCompanionSurfaceWindow(session, surface, null, open, "work-123", "tab");
    expect(result).toBe(candidate);
    expect(open).toHaveBeenCalledOnce();
    const [href, name, features] = open.mock.calls[0] as unknown as [string, string, string];
    const url = new URL(href, window.location.origin);
    expect(url.pathname).toBe("/studio/tools-companion");
    expect(url.searchParams.get("session")).toBe(session);
    expect(url.searchParams.get("view")).toBe(surface);
    expect(url.searchParams.get("id")).toBe("work-123");
    expect(url.searchParams.get("display")).toBe("tab");
    expect(name).toBe(studioCompanionWindowName(session, surface));
    expect(features).toBe("");
    expect(candidate.opener).toBeNull();
  });
  it("reuses a matching tab without navigating or opening another editor", () => {
    const href = `${window.location.origin}/studio/tools-companion?session=${session}&view=review&id=work-123&display=tab`;
    const candidate = { closed: false, location: { href }, opener: {}, focus: vi.fn() };
    const open = vi.fn();
    const result = openStudioCompanionSurfaceWindow(session, "review", candidate as unknown as Window, open, "work-123", "tab");
    expect(result).toBe(candidate);
    expect(open).not.toHaveBeenCalled();
    expect(candidate.focus).toHaveBeenCalledOnce();
    expect(candidate.location.href).toBe(href);
  });
  it("does not reuse a window that navigated to another site", () => {
    const previous = { closed: false, location: { href: "https://elsewhere.test/" }, focus: vi.fn() };
    const open = vi.fn(() => null);
    expect(openStudioCompanionSurfaceWindow(session, "review", previous as unknown as Window, open, null, "tab")).toBeNull();
    expect(previous.focus).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
  });
  it("returns null for blocked or throwing open operations", () => {
    expect(openStudioCompanionSurfaceWindow(session, "review", null, () => null, null, "tab")).toBeNull();
    expect(openStudioCompanionSurfaceWindow(session, "review", null, () => { throw new Error("denied"); }, null, "tab")).toBeNull();
  });
  it("never opens a malformed session", () => {
    const open = vi.fn();
    expect(openStudioCompanionSurfaceWindow("invalid", "review", null, open, null, "tab")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
