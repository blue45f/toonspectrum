// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeStudioBrowserWorkspace, defaultStudioBrowserWorkspace, encodeStudioBrowserWorkspace,
  loadStudioBrowserWorkspace, saveStudioBrowserWorkspace, studioBrowserWorkspaceEditorHref,
  STUDIO_BROWSER_WORKSPACE_MAX_BYTES,
} from "./studio-companion-browser-workspace";
import { studioCanvasPathname } from "./studio-workspace-route";

afterEach(() => { vi.restoreAllMocks(); });

describe("browser workspace portable profile", () => {
  it("round trips mode and ordered pins, without caller metadata", () => {
    const profile = { ...defaultStudioBrowserWorkspace(), openMode: "tab" as const,
      pinnedSurfaces: ["reference", "navigator"] as const, secret: "never-export" };
    const encoded = encodeStudioBrowserWorkspace(profile);
    expect(encoded).not.toContain("secret");
    expect(encoded).not.toContain("never-export");
    expect(decodeStudioBrowserWorkspace(encoded)).toEqual({ ...defaultStudioBrowserWorkspace(),
      openMode: "tab", pinnedSurfaces: ["reference", "navigator"] });
  });
  it.each([null, [], 1, "profile", { version: 2 }, { openMode: "iframe" },
    { pinnedSurfaces: ["reference", "reference"] }, { pinnedSurfaces: ["unknown"] },
    { pinnedSurfaces: "reference" }, { pinnedSurfaces: [1] }, { session: "do-not-import" },
  ])("rejects malformed or foreign configuration %j", (patch) => {
    const value = patch && typeof patch === "object" && !Array.isArray(patch)
      ? { ...defaultStudioBrowserWorkspace(), ...patch } : patch;
    expect(decodeStudioBrowserWorkspace(JSON.stringify(value))).toBeNull();
  });
  it("bounds input and rejects invalid JSON", () => {
    expect(decodeStudioBrowserWorkspace("{" )).toBeNull();
    expect(decodeStudioBrowserWorkspace(" ".repeat(STUDIO_BROWSER_WORKSPACE_MAX_BYTES + 1))).toBeNull();
    expect(decodeStudioBrowserWorkspace("{}")).toBeNull();
  });
  it("persists using the database and ignores corrupt profiles", async () => {
    let value: string | null = null;
    const store = { get: async () => value, set: async (_key: string, text: string) => { value = text; } };
    const profile = { ...defaultStudioBrowserWorkspace(), openMode: "tab" as const };
    expect(await saveStudioBrowserWorkspace(profile, store)).toBe(true);
    expect((await loadStudioBrowserWorkspace(store)).profile).toEqual(profile);
    value = "corrupt";
    expect((await loadStudioBrowserWorkspace(store)).profile).toEqual(defaultStudioBrowserWorkspace());
  });
  it("survives unavailable storage without throwing", async () => {
    const store = { get: async (): Promise<null> => { throw new Error("denied"); },
      set: async (): Promise<void> => { throw new Error("quota"); } };
    expect(await loadStudioBrowserWorkspace(store)).toEqual({ profile: defaultStudioBrowserWorkspace(), persistent: false });
    expect(await saveStudioBrowserWorkspace(defaultStudioBrowserWorkspace(), store)).toBe(false);
  });
  it("creates a work-only URL without credentials, query or fragment", () => {
    const href = studioBrowserWorkspaceEditorHref("work-123", "https://user:pass@example.test/path?session=secret#token");
    expect(href).toBe(`https://example.test${studioCanvasPathname("work-123")}`);
  });
  it.each([null, "", " leading", "trailing "])("does not transfer a draft or invalid work %j", (work) => {
    expect(studioBrowserWorkspaceEditorHref(work, "https://example.test")).toBeNull();
  });
  it.each(["../elsewhere", "a?session=secret"])("encodes reserved characters in work identity %s", (work) => {
    const href = studioBrowserWorkspaceEditorHref(work, "https://example.test");
    const url = new URL(href!);
    expect(url.origin).toBe("https://example.test");
    expect(url.pathname).toBe(`/studio/work/${encodeURIComponent(work)}/canvas`);
    expect(url.search).toBe("");
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "file:///tmp/work", "invalid"])("rejects unsafe origin %s", (origin) => {
    expect(studioBrowserWorkspaceEditorHref("work-123", origin)).toBeNull();
  });
});
