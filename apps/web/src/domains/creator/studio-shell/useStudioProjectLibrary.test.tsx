// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioProject, renameStudioProject, STUDIO_PROJECT_LIBRARY_STORAGE_KEY, STUDIO_PROJECT_LIBRARY_UPDATED_EVENT } from "../studio-project-library-store";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";

vi.mock("@/shared/lib/i18n", () => {
  const translate = (value: string) => value;
  return { useT: () => translate };
});
const create = (id: string) => createStudioProject(window.localStorage, { id, title: `작품 ${id}`, kind: "webtoon" });
const signal = (key: string | null, storageArea: Storage = window.localStorage) =>
  window.dispatchEvent(new StorageEvent("storage", { key, storageArea }));
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("project library browser lifecycle", () => {
  it("refreshes real canonical writes without trusting event snapshots", () => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko", "active"));
    act(() => { renameStudioProject(window.localStorage, "original", "새 제목", { target: window }); });
    expect(result.current.projects[0]?.title).toBe("새 제목");
    act(() => window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, {
      detail: { schemaVersion: 1, projects: [{ id: "forged", status: "active" }] },
    })));
    expect(result.current.projects.map((project) => project.id)).toEqual(["original"]);
  });
  it.each([null, STUDIO_PROJECT_LIBRARY_STORAGE_KEY])("detects a removed library through storage event %s", (key) => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko", "active"));
    expect(result.current.projects).toHaveLength(1);
    act(() => { window.localStorage.clear(); signal(key); });
    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBeNull();
  });
  it("ignores unrelated keys and session storage", () => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko"));
    window.localStorage.clear();
    act(() => { signal("unrelated"); signal(null, window.sessionStorage); });
    expect(result.current.projects).toHaveLength(1);
    act(() => signal(null));
    expect(result.current.projects).toEqual([]);
  });
  it.each(["focus", "pageshow"])("rechecks persisted work on %s after a missed event", (name) => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko"));
    create("newer");
    act(() => { window.dispatchEvent(new Event(name)); });
    expect(result.current.projects.map((project) => project.id)).toEqual(expect.arrayContaining(["original", "newer"]));
  });
  it("refreshes when the document becomes visible, not while hidden", () => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    window.localStorage.clear();
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.projects).toHaveLength(1);
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.projects).toEqual([]);
  });
  it("exposes storage revocation as a recoverable error rather than an uncaught exception", () => {
    create("original");
    const { result } = renderHook(() => useStudioProjectLibrary("ko"));
    const storage = window.localStorage;
    const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("storage revoked"); });
    act(() => signal(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, storage));
    expect(result.current.error).toContain("저장 공간");
    getter.mockRestore();
    act(() => result.current.reload());
    expect(result.current.error).toBeNull();
    expect(result.current.projects).toHaveLength(1);
  });
  it("removes all observers after unmount", () => {
    create("original");
    const { unmount } = renderHook(() => useStudioProjectLibrary("ko"));
    unmount();
    const reads = vi.spyOn(Storage.prototype, "getItem");
    act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange")); signal(null);
      window.dispatchEvent(new Event(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT)); });
    expect(reads).not.toHaveBeenCalled();
  });
});
