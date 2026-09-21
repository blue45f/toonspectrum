// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureSharedStudioRecentColorsLoaded,
  getStudioRecentColorsSnapshot,
  getStudioRecentColorsStatus,
  retrySharedStudioRecentColorsPersistence,
  rememberSharedStudioRecentColor,
  resetStudioRecentColorsBridgeForTests,
} from "./studio-recent-colors-bridge";
import { createStudioUiPreferencesRepository } from "./studio-ui-preferences-sqlite";
import { useStudioRecentColors } from "./useStudioRecentColors";

import type { StudioAsyncKeyValueStore } from "./studio-local-database";

afterEach(() => {
  cleanup();
  resetStudioRecentColorsBridgeForTests();
});

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

  it("replays an inspector hydration request emitted before the page owner mounts", async () => {
    const f = fixture();
    ensureSharedStudioRecentColorsLoaded();
    const hook = f.render();
    await waitFor(() => expect(hook.result.current.recentColors).toEqual(["#112233"]));
    expect(f.store.get).toHaveBeenCalledTimes(1);
  });

  it("ignores hydration that resolves after its owner was replaced", async () => {
    const staleLoad = deferred<string[]>();
    const staleRepository = {
      loadRecentColors: vi.fn(() => staleLoad.promise),
      saveRecentColors: vi.fn(async () => undefined),
    };
    const staleOwner = renderHook(() => useStudioRecentColors({
      acquireRepository: async () => staleRepository,
      onPersistenceUnavailable: vi.fn(),
    }));
    act(() => staleOwner.result.current.ensureRecentColorsLoaded());
    staleOwner.unmount();

    const currentRepository = {
      loadRecentColors: vi.fn(async () => ["#445566"]),
      saveRecentColors: vi.fn(async () => undefined),
    };
    const currentOwner = renderHook(() => useStudioRecentColors({
      acquireRepository: async () => currentRepository,
      onPersistenceUnavailable: vi.fn(),
    }));
    act(() => currentOwner.result.current.ensureRecentColorsLoaded());
    await waitFor(() =>
      expect(currentOwner.result.current.recentColors).toEqual(["#445566"]),
    );

    await act(async () => { staleLoad.resolve(["#112233"]); });

    expect(currentOwner.result.current.recentColors).toEqual(["#445566"]);
    expect(getStudioRecentColorsSnapshot()).toEqual(["#445566"]);
    expect(staleRepository.saveRecentColors).not.toHaveBeenCalled();
  });

  it("persists colour intents emitted by a prop-drill-free inspector consumer", async () => {
    const f = fixture(); const hook = f.render();
    act(() => rememberSharedStudioRecentColor("#445566"));
    await waitFor(() =>
      expect(f.values.get("recent-colors")).toBe('["#445566","#112233"]'),
    );
    expect(hook.result.current.recentColors).toEqual(["#445566", "#112233"]);
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

  it("waits for an in-flight previous-owner save before replacement hydration", async () => {
    const f = fixture();
    const previousOwner = f.render();
    act(() => previousOwner.result.current.ensureRecentColorsLoaded());
    await waitFor(() => expect(previousOwner.result.current.recentColors).toEqual(["#112233"]));

    const previousWrite = deferred<void>();
    const previousWriteStarted = deferred<void>();
    vi.mocked(f.store.set).mockImplementationOnce(async (key, value) => {
      previousWriteStarted.resolve();
      await previousWrite.promise;
      f.values.set(key, value);
    });
    act(() => previousOwner.result.current.rememberColor("#abcdef"));
    await previousWriteStarted.promise;
    previousOwner.unmount();

    const replacementOwner = f.render();
    act(() => replacementOwner.result.current.ensureRecentColorsLoaded());
    await Promise.resolve();
    expect(f.store.get).toHaveBeenCalledTimes(1);

    await act(async () => { previousWrite.resolve(); });
    await waitFor(() =>
      expect(replacementOwner.result.current.recentColors).toEqual(["#abcdef", "#112233"]),
    );
    expect(f.store.get).toHaveBeenCalledTimes(2);
  });

  it("serializes an in-flight stale-owner save before replacement-owner persistence", async () => {
    const f = fixture();
    const staleOwner = f.render();
    act(() => staleOwner.result.current.ensureRecentColorsLoaded());
    await waitFor(() => expect(staleOwner.result.current.recentColors).toEqual(["#112233"]));

    const staleWrite = deferred<void>();
    const staleWriteStarted = deferred<void>();
    vi.mocked(f.store.set).mockImplementationOnce(async (key, value) => {
      staleWriteStarted.resolve();
      await staleWrite.promise;
      f.values.set(key, value);
    });
    act(() => staleOwner.result.current.rememberColor("#abcdef"));
    await staleWriteStarted.promise;
    staleOwner.unmount();

    const currentOwner = f.render();
    act(() => {
      currentOwner.result.current.ensureRecentColorsLoaded();
      currentOwner.result.current.rememberColor("#fedcba");
    });
    expect(currentOwner.result.current.recentColors).toEqual(["#fedcba"]);

    await act(async () => { staleWrite.resolve(); });
    await waitFor(() =>
      expect(f.values.get("recent-colors")).toBe('["#fedcba","#abcdef","#112233"]'),
    );
    expect(getStudioRecentColorsSnapshot()).toEqual([
      "#fedcba",
      "#abcdef",
      "#112233",
    ]);
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

  it("does not write invalid colours or persist a deferred stale owner", async () => {
    const f = fixture();
    const loading = deferred<string | null>();
    vi.mocked(f.store.get).mockReturnValueOnce(loading.promise);
    const hook = f.render();

    act(() => hook.result.current.rememberColor("invalid"));
    expect(f.acquireRepository).not.toHaveBeenCalled();

    act(() => hook.result.current.rememberColor("#123456"));
    hook.unmount();
    await act(async () => { loading.resolve('["#112233"]'); });
    await Promise.resolve();

    expect(f.store.set).not.toHaveBeenCalled();
    expect(f.values.get("recent-colors")).toBe('["#112233"]');
    expect(f.unavailable).not.toHaveBeenCalled();
  });
});


it("switches owner scopes without accepting a late load or a stale callback", async () => {
  const late = deferred<string[]>();
  const save = vi.fn(async () => undefined);
  const repository = { loadRecentColors: vi.fn((scope?: string) => scope === "user-a" ? late.promise : Promise.resolve(["#445566"])), saveRecentColors: save };
  const { result, rerender } = renderHook(({ ownerScope }) => useStudioRecentColors({ ownerScope,
    acquireRepository: async () => repository, onPersistenceUnavailable: vi.fn() }), { initialProps: { ownerScope: "user-a" } });
  act(() => result.current.ensureRecentColorsLoaded());
  await waitFor(() => expect(repository.loadRecentColors).toHaveBeenCalledWith("user-a"));
  const old = result.current;
  rerender({ ownerScope: "user-b" });
  act(() => result.current.ensureRecentColorsLoaded());
  await waitFor(() => expect(result.current.recentColors).toEqual(["#445566"]));
  await act(async () => { late.resolve(["#ff0000"]); await late.promise; });
  act(() => old.rememberColor("#abcdef"));
  expect(result.current.recentColors).toEqual(["#445566"]);
  expect(save).not.toHaveBeenCalled();
  act(() => result.current.rememberColor("#123456"));
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith(["#123456", "#445566"], "user-b"));
});

it("reports a failed write as session-only and retries through the current owner", async () => {
  const failure = vi.fn();
  const save = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValue(undefined);
  const repository = { loadRecentColors: vi.fn(async () => []), saveRecentColors: save };
  const { result } = renderHook(() => useStudioRecentColors({ ownerScope: "artist", acquireRepository: async () => repository, onPersistenceUnavailable: failure }));
  act(() => result.current.rememberColor("#abc"));
  await waitFor(() => expect(getStudioRecentColorsStatus()).toBe("session-only"));
  expect(result.current.recentColors).toEqual(["#aabbcc"]);
  act(() => retrySharedStudioRecentColorsPersistence());
  await waitFor(() => expect(getStudioRecentColorsStatus()).toBe("saved"));
  expect(save).toHaveBeenLastCalledWith(["#aabbcc"], "artist"); expect(failure).toHaveBeenCalledOnce();
});
