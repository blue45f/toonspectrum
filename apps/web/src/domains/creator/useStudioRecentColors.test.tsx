// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUiPreferencesRepository } from "./studio-ui-preferences-sqlite";
import { useStudioRecentColors } from "./useStudioRecentColors";

import type { StudioAsyncKeyValueStore } from "./studio-local-database";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(initial = ["#112233"]) {
  const values = new Map([["recent-colors", JSON.stringify(initial)]]);
  const store: StudioAsyncKeyValueStore = {
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => { values.set(key, value); }),
    delete: vi.fn(async (key) => { values.delete(key); }),
  };
  const repository = createStudioUiPreferencesRepository(store);
  const unavailable = vi.fn();
  const acquireRepository = vi.fn(async () => repository);
  return { values, store, repository, unavailable, acquireRepository,
    render: () => renderHook(() => useStudioRecentColors({ acquireRepository, onPersistenceUnavailable: unavailable })) };
}

describe("SQLite recent-color owner", () => {
  it("merges a first remembered color with saved recents instead of overwriting an unhydrated store", async () => {
    const f = fixture(); const hook = f.render();
    act(() => hook.result.current.rememberColor("#ABC"));
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#aabbcc","#112233"]'));
    expect(hook.result.current.recentColors).toEqual(["#aabbcc", "#112233"]);
  });

  it("replays clear after a late hydration and never restores old colors", async () => {
    const f = fixture(); const loading = deferred<string | null>();
    vi.mocked(f.store.get).mockReturnValueOnce(loading.promise);
    const hook = f.render();
    act(() => {
      hook.result.current.ensureRecentColorsLoaded();
      hook.result.current.rememberColor("#abcdef");
      hook.result.current.clearRecentColors();
    });
    expect(hook.result.current.recentColors).toEqual([]);
    await act(async () => { loading.resolve('["#112233"]'); });
    await waitFor(() => expect(f.values.get("recent-colors")).toBe("[]"));
    expect(hook.result.current.recentColors).toEqual([]);
    expect(f.store.set).toHaveBeenCalledTimes(1);
  });

  it("an already-started old save cannot overtake clear, including after owner remount", async () => {
    const f = fixture(); const hook = f.render();
    act(() => hook.result.current.ensureRecentColorsLoaded());
    await waitFor(() => expect(hook.result.current.recentColors).toEqual(["#112233"]));
    const oldWrite = deferred<void>(); const writeStarted = deferred<void>();
    vi.mocked(f.store.set).mockImplementationOnce(async (key, value) => {
      writeStarted.resolve(); await oldWrite.promise; f.values.set(key, value);
    });
    act(() => hook.result.current.rememberColor("#abcdef"));
    await writeStarted.promise;
    act(() => hook.result.current.clearRecentColors());
    expect(hook.result.current.recentColors).toEqual([]);
    await act(async () => { oldWrite.resolve(); });
    await waitFor(() => expect(f.values.get("recent-colors")).toBe("[]"));
    hook.unmount(); const reopened = f.render();
    act(() => reopened.result.current.ensureRecentColorsLoaded());
    await waitFor(() => expect(f.store.get).toHaveBeenCalledTimes(2));
    expect(reopened.result.current.recentColors).toEqual([]);
  });

  it("clear then a new color stores only that new color even before initial hydration completes", async () => {
    const f = fixture(); const loading = deferred<string | null>();
    vi.mocked(f.store.get).mockReturnValueOnce(loading.promise);
    const hook = f.render();
    act(() => {
      hook.result.current.clearRecentColors();
      hook.result.current.rememberColor("#fedcba");
    });
    await act(async () => { loading.resolve('["#112233"]'); });
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#fedcba"]'));
    expect(hook.result.current.recentColors).toEqual(["#fedcba"]);
  });

  it("reports persistence failure, then lets a later clear recover on the same repository", async () => {
    const f = fixture(); vi.mocked(f.store.set).mockRejectedValueOnce(new Error("write failed"));
    const hook = f.render();
    act(() => hook.result.current.rememberColor("#abcdef"));
    await waitFor(() => expect(f.unavailable).toHaveBeenCalledOnce());
    act(() => hook.result.current.clearRecentColors());
    await waitFor(() => expect(f.values.get("recent-colors")).toBe("[]"));
    expect(hook.result.current.recentColors).toEqual([]);
  });

  it("does not write invalid colors and finishes an accepted write after unmount", async () => {
    const f = fixture(); const hook = f.render();
    act(() => hook.result.current.rememberColor("invalid"));
    expect(f.acquireRepository).not.toHaveBeenCalled();
    act(() => hook.result.current.rememberColor("#123456"));
    hook.unmount();
    await waitFor(() => expect(f.values.get("recent-colors")).toBe('["#123456","#112233"]'));
    expect(f.unavailable).not.toHaveBeenCalled();
  });
});
