import hashlib
from pathlib import Path

root = Path('src/domains/creator/hybrid-dcc')
path = root / 'useStudioHybridDccViewportPreferences.ts'
data = path.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == '5388d4c993e2c847f539c9d27b872b540f5bc573', 'Review changed DCC hook before applying'
store = root / 'viewport-preferences-store.ts'
test = root / 'useStudioHybridDccViewportPreferences.persistence.test.tsx'
assert not store.exists() and not test.exists()
store.write_text('''import { STUDIO_UI_PREFERENCES_SQLITE_NAMESPACE } from "../studio-ui-preferences-sqlite";

import {
  normalizeStudioHybridDccViewportPreferences,
  parseStudioHybridDccViewportPreferences,
  STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY,
  type StudioHybridDccViewportPreferences,
} from "./studio-hybrid-dcc-viewport-interaction";

// The app owns the database. This adapter opens no extra file and never reads or writes
// a legacy browser-KV backend. A rejected acquire is not cached and remains retryable.
async function acquireStore() {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  return database.asAsyncKeyValueStore(STUDIO_UI_PREFERENCES_SQLITE_NAMESPACE);
}
let writeTail: Promise<void> = Promise.resolve();

export async function loadHybridDccViewportPreferences(): Promise<StudioHybridDccViewportPreferences> {
  await writeTail;
  const store = await acquireStore();
  return parseStudioHybridDccViewportPreferences(await store.get(STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY));
}

export function saveHybridDccViewportPreferences(preferences: StudioHybridDccViewportPreferences): Promise<void> {
  const serialized = JSON.stringify(normalizeStudioHybridDccViewportPreferences(preferences));
  const operation = writeTail.then(async () => {
    const store = await acquireStore();
    await store.set(STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY, serialized);
  });
  writeTail = operation.catch(() => undefined);
  return operation;
}
''')
path.write_text('''import { useCallback, useEffect, useReducer, useState, type SetStateAction } from "react";

import {
  normalizeStudioHybridDccViewportPreferences,
  STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS,
  type StudioHybridDccViewportPreferences,
} from "./studio-hybrid-dcc-viewport-interaction";
import { loadHybridDccViewportPreferences, saveHybridDccViewportPreferences } from "./viewport-preferences-store";

type Preferences = StudioHybridDccViewportPreferences;
type State = {
  preferences: Preferences;
  pending: Partial<Preferences>;
  loaded: boolean;
  revision: number;
};
type Action =
  | { type: "load"; preferences: Preferences }
  | { type: "patch"; patch: Partial<Preferences> }
  | { type: "replace"; value: SetStateAction<Preferences> };

function reducePreferences(state: State, action: Action): State {
  if (action.type === "load") {
    return {
      ...state,
      preferences: normalizeStudioHybridDccViewportPreferences({ ...action.preferences, ...state.pending, version: 1 }),
      pending: {},
      loaded: true,
    };
  }
  const patch = action.type === "patch" ? action.patch
    : typeof action.value === "function" ? action.value(state.preferences) : action.value;
  return {
    ...state,
    preferences: normalizeStudioHybridDccViewportPreferences({ ...state.preferences, ...patch, version: 1 }),
    pending: state.loaded ? {} : { ...state.pending, ...patch },
    revision: state.revision + 1,
  };
}

/** Session controls stay usable; only restored, authored preferences enter shared SQLite. */
export function useStudioHybridDccViewportPreferences() {
  const [state, dispatch] = useReducer(reducePreferences, {
    preferences: { ...STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS }, pending: {}, loaded: false, revision: 0,
  });
  const [persistenceState, setPersistenceState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  useEffect(() => {
    let active = true;
    void loadHybridDccViewportPreferences().then((preferences) => {
      if (!active) return;
      dispatch({ type: "load", preferences });
      setPersistenceState("ready");
    }).catch(() => {
      if (active) setPersistenceState("error");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!state.loaded || state.revision === 0) return;
    let active = true;
    setPersistenceState("saving");
    void saveHybridDccViewportPreferences(state.preferences).then(() => {
      if (active) setPersistenceState("ready");
    }).catch(() => {
      if (active) setPersistenceState("error");
    });
    return () => { active = false; };
  }, [state.loaded, state.preferences, state.revision]);
  const patchPreferences = useCallback((patch: Partial<Preferences>) => dispatch({ type: "patch", patch }), []);
  const setPreferences = useCallback((value: SetStateAction<Preferences>) => dispatch({ type: "replace", value }), []);
  return { preferences: state.preferences, patchPreferences, setPreferences, persistenceState };
}
''')
test.write_text('''// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS, STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY } from "./studio-hybrid-dcc-viewport-interaction";
import { useStudioHybridDccViewportPreferences } from "./useStudioHybridDccViewportPreferences";

const db = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), acquire: vi.fn(), asAsyncKeyValueStore: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: db.acquire }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { resolve, promise };
}

describe("DCC viewport shared SQLite preference authority", () => {
  beforeEach(() => {
    db.get.mockReset().mockResolvedValue(null);
    db.set.mockReset().mockResolvedValue(undefined);
    db.asAsyncKeyValueStore.mockReset().mockReturnValue(db);
    db.acquire.mockReset().mockResolvedValue(db);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("restores the app's preference namespace without writing defaults or touching browser KV", async () => {
    const localRead = vi.spyOn(Storage.prototype, "getItem");
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    db.get.mockResolvedValue(JSON.stringify({ ...STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS, showGrid: false }));
    const { result } = renderHook(useStudioHybridDccViewportPreferences);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    expect(result.current.preferences.showGrid).toBe(false);
    expect(db.asAsyncKeyValueStore).toHaveBeenCalledWith("studio-ui-preferences-v1");
    expect(db.set).not.toHaveBeenCalled();
    expect(localRead).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });

  it("preserves edits made during restoration and restores other stored fields", async () => {
    const read = deferred<string>();
    db.get.mockReturnValue(read.promise);
    const { result } = renderHook(useStudioHybridDccViewportPreferences);
    act(() => result.current.patchPreferences({ showGrid: false }));
    expect(db.set).not.toHaveBeenCalled();
    await act(async () => read.resolve(JSON.stringify({ ...STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS, translationStep: 2 })));
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    expect(result.current.preferences).toMatchObject({ showGrid: false, translationStep: 2 });
    await waitFor(() => expect(db.set).toHaveBeenCalledTimes(1));
    expect(JSON.parse(db.set.mock.calls[0][1])).toMatchObject({ showGrid: false, translationStep: 2 });
  });

  it("serializes complete preference writes so an older gesture cannot win", async () => {
    const write = deferred<void>();
    db.set.mockImplementationOnce(() => write.promise);
    const { result } = renderHook(useStudioHybridDccViewportPreferences);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    act(() => result.current.patchPreferences({ translationStep: 2 }));
    await waitFor(() => expect(db.set).toHaveBeenCalledTimes(1));
    act(() => result.current.setPreferences((value) => ({ ...value, translationStep: 3 })));
    expect(db.set).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve());
    await waitFor(() => expect(db.set).toHaveBeenCalledTimes(2));
    expect(db.set.mock.calls[1][0]).toBe(STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY);
    expect(JSON.parse(db.set.mock.calls[1][1]).translationStep).toBe(3);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
  });

  it("retains session editing and reports unavailable storage without a fallback write", async () => {
    db.acquire.mockRejectedValue(new Error("OPFS unavailable"));
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(useStudioHybridDccViewportPreferences);
    await waitFor(() => expect(result.current.persistenceState).toBe("error"));
    act(() => result.current.patchPreferences({ showAxes: false }));
    expect(result.current.preferences.showAxes).toBe(false);
    expect(db.set).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a failed save as durable and recovers on the next authored edit", async () => {
    db.set.mockRejectedValueOnce(new Error("quota"));
    const { result } = renderHook(useStudioHybridDccViewportPreferences);
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    act(() => result.current.patchPreferences({ showAxes: false }));
    await waitFor(() => expect(result.current.persistenceState).toBe("error"));
    expect(result.current.preferences.showAxes).toBe(false);
    act(() => result.current.patchPreferences({ showGround: false }));
    await waitFor(() => expect(result.current.persistenceState).toBe("ready"));
    expect(JSON.parse(db.set.mock.calls[1][1])).toMatchObject({ showAxes: false, showGround: false });
  });
});
''')
print('DCC viewport preferences use shared SQLite; browser-KV boundary remains unchanged.')
