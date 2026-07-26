import { describe, expect, it } from "vitest";

import { STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY } from "./studio-inspector-layout";
import {
  QUICK_ACTION_SLOTS,
  STUDIO_QUICK_ACTIONS_STORAGE_KEY,
} from "./studio-quick-actions";
import {
  DEFAULT_STUDIO_WORKSPACE_STATE,
  STUDIO_CLASSIC_WORKSPACE_IDS,
  STUDIO_DEFAULT_WORKSPACE_IDS,
  STUDIO_DEFAULT_WORKSPACES,
  STUDIO_LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY,
  STUDIO_LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY,
  STUDIO_PRO_COMIC_PALETTE_PRIORITY,
  STUDIO_WORKSPACE_LEFT_PANEL_WIDTH,
  STUDIO_WORKSPACE_MAX_CUSTOM,
  STUDIO_WORKSPACE_NAME_MAX_LENGTH,
  STUDIO_WORKSPACE_PAYLOAD_VERSION,
  STUDIO_WORKSPACE_RAW_MAX_BYTES,
  STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH,
  STUDIO_WORKSPACE_STATE_VERSION,
  STUDIO_WORKSPACE_STORAGE_KEY,
  areStudioWorkspaceLayoutsEqual,
  deleteStudioWorkspace,
  duplicateStudioWorkspace,
  isStudioWorkspaceDirty,
  listStudioWorkspaces,
  loadStudioWorkspacePersistence,
  loadStudioWorkspaceState,
  migrateLegacyStudioWorkspaceState,
  moveStudioWorkspace,
  normalizeStudioWorkspaceLayout,
  normalizeStudioWorkspaceState,
  overwriteStudioWorkspace,
  reloadStudioWorkspace,
  renameStudioWorkspace,
  reorderStudioWorkspace,
  resolveStudioWorkspace,
  saveStudioWorkspace,
  saveStudioWorkspaceState,
  studioWorkspaceOwnerScope,
  studioWorkspaceStorageKey,
  switchStudioWorkspace,
  updateStudioWorkspaceLiveLayout,
  updateStudioWorkspacePreferences,
  type StudioWorkspaceLayout,
  type StudioWorkspaceState,
  type StudioWorkspaceStorage,
} from "./studio-workspaces";

function memoryStorage(initial: Record<string, string> = {}): StudioWorkspaceStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function withInspector(
  layout: StudioWorkspaceLayout,
  primary: StudioWorkspaceLayout["inspector"]["primary"]
): StudioWorkspaceLayout {
  return normalizeStudioWorkspaceLayout({
    ...layout,
    inspector: { ...layout.inspector, primary },
  });
}

function withNorthAction(
  layout: StudioWorkspaceLayout,
  action: StudioWorkspaceLayout["quickActions"]["slots"]["north"]
): StudioWorkspaceLayout {
  return normalizeStudioWorkspaceLayout({
    ...layout,
    quickActions: {
      version: 1,
      slots: { ...layout.quickActions.slots, north: action },
    },
  });
}

function withLeftPanelWidth(
  layout: StudioWorkspaceLayout,
  leftPanelWidth: number
): StudioWorkspaceLayout {
  return normalizeStudioWorkspaceLayout({
    ...layout,
    desktop: { ...layout.desktop, leftPanelWidth },
  });
}

describe("built-in Studio workspaces", () => {
  it("preserves the six classic presets and adds one immutable professional comic preset", () => {
    expect(STUDIO_CLASSIC_WORKSPACE_IDS).toEqual([
      "storyboard",
      "lineart",
      "coloring",
      "lettering",
      "review",
      "publish",
    ]);
    expect(STUDIO_DEFAULT_WORKSPACES.map((workspace) => workspace.id)).toEqual(
      STUDIO_DEFAULT_WORKSPACE_IDS
    );
    expect(STUDIO_DEFAULT_WORKSPACE_IDS).toEqual([
      ...STUDIO_CLASSIC_WORKSPACE_IDS,
      "pro-comic",
    ]);
    expect(new Set(STUDIO_DEFAULT_WORKSPACES.map((workspace) => workspace.name)).size)
      .toBe(7);

    for (const workspace of STUDIO_DEFAULT_WORKSPACES) {
      expect(Object.isFrozen(workspace)).toBe(true);
      expect(Object.isFrozen(workspace.layout)).toBe(true);
      expect(Object.isFrozen(workspace.layout.inspector)).toBe(true);
      expect(Object.isFrozen(workspace.layout.desktop)).toBe(true);
      expect(Object.isFrozen(workspace.layout.quickActions.slots)).toBe(true);
      expect(Object.keys(workspace.layout.quickActions.slots)).toHaveLength(6);
      if (workspace.id !== "pro-comic") {
        expect(workspace.layout.desktop.leftPanelWidth).toBe(
          STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default
        );
        expect(workspace.layout.desktop.rightPanelWidth).toBe(
          STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default
        );
      }
    }

    const professional = STUDIO_DEFAULT_WORKSPACES.find(
      ({ id }) => id === "pro-comic"
    );
    expect(professional).toMatchObject({
      name: "프로 만화",
      layout: {
        inspector: {
          primary: "properties",
          image: "fill",
          document: "navigator",
        },
        desktop: {
          leftPanelOpen: true,
          rightPanelOpen: true,
          leftPanelWidth: 216,
          rightPanelWidth: 344,
        },
        quickActions: {
          version: 1,
          slots: {
            north: "undo",
            northEast: "redo",
            southEast: "pen",
            south: "advanced-fill",
            southWest: "add-bubble",
            northWest: "fit-width",
          },
        },
      },
    });
    expect(STUDIO_PRO_COMIC_PALETTE_PRIORITY).toEqual([
      "tool-properties",
      "layers",
      "pages",
      "materials-quick-access",
    ]);
  });

  it("keeps built-ins outside owner storage and lists custom workspaces after them", () => {
    const custom = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "내 선화 공간");
    const listed = listStudioWorkspaces(custom);

    expect(listed).toHaveLength(STUDIO_DEFAULT_WORKSPACES.length + 1);
    expect(
      listed.slice(0, STUDIO_DEFAULT_WORKSPACES.length).map((workspace) => workspace.id)
    ).toEqual(
      STUDIO_DEFAULT_WORKSPACE_IDS
    );
    expect(listed.at(-1)?.id).toBe("custom-1");
    expect(custom.customWorkspaces).toHaveLength(1);
  });
});

describe("Studio workspace normalization boundaries", () => {
  it("fails closed for malformed, cyclic, oversized, and unknown-version roots", () => {
    const cyclic: Record<string, unknown> = { version: 1 };
    cyclic.self = cyclic;
    const oversized = JSON.stringify({
      version: 1,
      padding: "가".repeat(STUDIO_WORKSPACE_RAW_MAX_BYTES),
    });

    for (const raw of [null, [], "{bad json", cyclic, oversized, { version: 999 }]) {
      expect(normalizeStudioWorkspaceState(raw)).toEqual(DEFAULT_STUDIO_WORKSPACE_STATE);
    }
  });

  it("migrates v1 layouts and clamps finite desktop widths to the supported pixel bounds", () => {
    const v1 = normalizeStudioWorkspaceState({
      ...DEFAULT_STUDIO_WORKSPACE_STATE,
      version: 1,
      liveLayout: {
        ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
        desktop: {
          leftPanelOpen: false,
          rightPanelOpen: true,
        },
      },
    });
    const clamped = normalizeStudioWorkspaceLayout({
      ...v1.liveLayout,
      desktop: {
        leftPanelOpen: true,
        rightPanelOpen: false,
        leftPanelWidth: -500.4,
        rightPanelWidth: 9_999.8,
      },
    });
    const malformed = normalizeStudioWorkspaceLayout({
      ...v1.liveLayout,
      desktop: {
        leftPanelOpen: true,
        rightPanelOpen: true,
        leftPanelWidth: Number.NaN,
        rightPanelWidth: Number.POSITIVE_INFINITY,
      },
    });

    expect(v1.version).toBe(STUDIO_WORKSPACE_STATE_VERSION);
    expect(v1.liveLayout.desktop.leftPanelWidth).toBe(
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default
    );
    expect(v1.liveLayout.desktop.rightPanelWidth).toBe(
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default
    );
    expect(clamped.desktop.leftPanelWidth).toBe(STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum);
    expect(clamped.desktop.rightPanelWidth).toBe(
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum
    );
    expect(malformed.desktop.leftPanelWidth).toBe(
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default
    );
    expect(malformed.desktop.rightPanelWidth).toBe(
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default
    );
  });

  it("recovers known v1 fields, strips unrelated payloads, and caps custom entries", () => {
    const customWorkspaces: Array<Record<string, unknown>> = Array.from(
      { length: STUDIO_WORKSPACE_MAX_CUSTOM + 4 },
      (_, index) => ({
        id: `saved-${index}`,
        name: `작업공간 ${index}`,
        layout: {
          ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
          unrelatedLayoutMarker: `layout-${index}`,
        },
        unrelatedWorkspaceMarker: `workspace-${index}`,
      })
    );
    customWorkspaces.splice(2, 0, {
      id: "saved-0",
      name: "중복 ID",
      layout: DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      unrelatedWorkspaceMarker: "duplicate",
    });

    const normalized = normalizeStudioWorkspaceState({
      ...DEFAULT_STUDIO_WORKSPACE_STATE,
      activeWorkspaceId: "saved-3",
      customWorkspaces,
      unrelatedRootMarker: "must-not-persist",
      documentPayload: { pages: ["must-not-persist"] },
      providerConfiguration: { marker: "must-not-persist" },
    });
    const serialized = JSON.stringify(normalized);

    expect(normalized.customWorkspaces).toHaveLength(STUDIO_WORKSPACE_MAX_CUSTOM);
    expect(new Set(normalized.customWorkspaces.map((workspace) => workspace.id)).size).toBe(
      STUDIO_WORKSPACE_MAX_CUSTOM
    );
    expect(normalized.activeWorkspaceId).toBe("saved-3");
    expect(serialized).not.toContain("unrelatedRootMarker");
    expect(serialized).not.toContain("unrelatedWorkspaceMarker");
    expect(serialized).not.toContain("unrelatedLayoutMarker");
    expect(serialized).not.toContain("documentPayload");
    expect(serialized).not.toContain("providerConfiguration");
  });

  it("drops unsafe custom identifiers and invalid names without corrupting valid entries", () => {
    const valid = {
      id: "valid.custom-1",
      name: "  나의   작업공간  ",
      layout: DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    };
    const normalized = normalizeStudioWorkspaceState({
      ...DEFAULT_STUDIO_WORKSPACE_STATE,
      activeWorkspaceId: "missing",
      customWorkspaces: [
        valid,
        { ...valid, id: "storyboard" },
        { ...valid, id: "has/slash" },
        { ...valid, id: "valid-2", name: "" },
        { ...valid, id: "valid-3", name: "x".repeat(STUDIO_WORKSPACE_NAME_MAX_LENGTH + 1) },
        { ...valid, id: "valid-4", name: "control\u0000name" },
      ],
    });

    expect(normalized.activeWorkspaceId).toBe("storyboard");
    expect(normalized.customWorkspaces).toEqual([
      expect.objectContaining({ id: "valid.custom-1", name: "나의 작업공간" }),
    ]);
  });

  it("returns independent deeply frozen defaults", () => {
    const first = normalizeStudioWorkspaceState(null);
    const second = normalizeStudioWorkspaceState(null);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.liveLayout).not.toBe(second.liveLayout);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.liveLayout.quickActions.slots)).toBe(true);
  });
});

describe("Studio workspace owner-scoped persistence", () => {
  it("uses a stable opaque key namespace without leaking raw or encoded owner identifiers", () => {
    const guest = studioWorkspaceStorageKey(null);
    const namedGuest = studioWorkspaceStorageKey("guest");
    const email = "artist+studio@example.com";
    const emailKey = studioWorkspaceStorageKey(email);
    const longPrefix = "account-".repeat(30);
    const firstLong = studioWorkspaceStorageKey(`${longPrefix}a`);
    const secondLong = studioWorkspaceStorageKey(`${longPrefix}b`);

    expect(studioWorkspaceStorageKey("")).toBe(guest);
    expect(namedGuest).not.toBe(guest);
    expect(guest.startsWith(STUDIO_WORKSPACE_STORAGE_KEY)).toBe(true);
    expect(emailKey).not.toContain(email);
    expect(emailKey).not.toContain(encodeURIComponent(email));
    expect(emailKey).not.toMatch(/:v\d+/u);
    expect(studioWorkspaceOwnerScope(email)).toMatch(/^owner-[a-f0-9]{16}$/u);
    expect(studioWorkspaceStorageKey("user-a")).not.toBe(
      studioWorkspaceStorageKey("user-b")
    );
    expect(firstLong).not.toBe(secondLong);
    expect(Math.max(guest.length, namedGuest.length, firstLong.length, secondLong.length)).toBeLessThanOrEqual(
      160
    );
  });

  it("round-trips a verified v2 envelope and isolates owners", () => {
    const storage = memoryStorage();
    const state = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "내 작업공간");
    const saved = saveStudioWorkspaceState(storage, "owner-a", state);
    const loaded = loadStudioWorkspacePersistence(storage, "owner-a");
    const envelope = JSON.parse(
      storage.values.get(studioWorkspaceStorageKey("owner-a")) ?? "null"
    ) as Record<string, unknown>;

    expect(saved.status).toBe("persisted");
    expect(saved.failure).toBeNull();
    expect(loaded).toMatchObject({
      state: saved.state,
      source: "current",
      status: "persisted",
      failure: null,
      ownerScope: studioWorkspaceOwnerScope("owner-a"),
    });
    expect(loadStudioWorkspaceState(storage, "owner-a")).toEqual(saved.state);
    expect(loadStudioWorkspaceState(storage, "owner-b")).toEqual(
      DEFAULT_STUDIO_WORKSPACE_STATE
    );
    expect(envelope.payloadVersion).toBe(STUDIO_WORKSPACE_PAYLOAD_VERSION);
    expect(envelope.ownerScope).toBe(studioWorkspaceOwnerScope("owner-a"));
    expect(JSON.stringify(envelope)).not.toContain("owner-a");
  });

  it("round-trips the professional comic widths, open state, quick order, and mobile fallback", () => {
    const storage = memoryStorage();
    const owner = "professional-comic-owner";
    const configured = updateStudioWorkspacePreferences(
      switchStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "pro-comic"),
      { mobileControlSide: "left" }
    );
    const saved = saveStudioWorkspaceState(storage, owner, configured);
    const loaded = loadStudioWorkspacePersistence(storage, owner);

    expect(saved).toMatchObject({ status: "persisted", failure: null });
    expect(loaded.state.activeWorkspaceId).toBe("pro-comic");
    expect(loaded.state.mobileControlSide).toBe("left");
    expect(loaded.state.liveLayout).toEqual(
      resolveStudioWorkspace(loaded.state, "pro-comic")?.layout
    );
    expect(loaded.state.liveLayout.desktop).toEqual({
      leftPanelOpen: true,
      rightPanelOpen: true,
      leftPanelWidth: 216,
      rightPanelWidth: 344,
    });
    expect(
      QUICK_ACTION_SLOTS.map(
        (slot) => loaded.state.liveLayout.quickActions.slots[slot]
      )
    ).toEqual([
      "undo",
      "redo",
      "pen",
      "advanced-fill",
      "add-bubble",
      "fit-width",
    ]);
  });

  it("reports storage absence, quota errors, silent writes, and verification reads truthfully", () => {
    const state = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "세션 작업공간");
    const noStorage = saveStudioWorkspaceState(null, "owner-a", state);
    const throwingWrite: StudioWorkspaceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const ignoredWrite: StudioWorkspaceStorage = {
      getItem: () => null,
      setItem: () => undefined,
    };
    const throwingVerify: StudioWorkspaceStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };

    expect(noStorage).toMatchObject({
      state,
      status: "session-only",
      failure: "storage-unavailable",
    });
    expect(saveStudioWorkspaceState(throwingWrite, "owner-a", state)).toMatchObject({
      status: "session-only",
      failure: "write-failed",
    });
    expect(saveStudioWorkspaceState(ignoredWrite, "owner-a", state)).toMatchObject({
      status: "session-only",
      failure: "verification-failed",
    });
    expect(saveStudioWorkspaceState(throwingVerify, "owner-a", state)).toMatchObject({
      status: "session-only",
      failure: "verification-failed",
    });

    const unavailable = loadStudioWorkspacePersistence(null, "owner-a");
    const blockedRead = loadStudioWorkspacePersistence(
      {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => undefined,
      },
      "owner-a"
    );
    expect(unavailable).toMatchObject({
      source: "default",
      status: "session-only",
      failure: "storage-unavailable",
    });
    expect(blockedRead).toMatchObject({
      source: "default",
      status: "session-only",
      failure: "read-failed",
    });
  });

  it("blocks guest state from crossing into an authenticated owner after an auth transition", () => {
    const storage = memoryStorage();
    const guestLoad = loadStudioWorkspacePersistence(storage, null);
    const guestEdit = saveStudioWorkspace(guestLoad.state, "게스트 작업공간");
    const crossOwner = saveStudioWorkspaceState(storage, "artist@example.com", guestEdit);
    const attemptedOverride = saveStudioWorkspaceState(
      storage,
      "artist@example.com",
      guestEdit,
      { sourceOwnerScope: studioWorkspaceOwnerScope("artist@example.com") }
    );

    expect(crossOwner).toMatchObject({
      status: "session-only",
      failure: "owner-mismatch",
      ownerScope: studioWorkspaceOwnerScope("artist@example.com"),
    });
    expect(attemptedOverride.failure).toBe("owner-mismatch");
    expect(storage.values.has(studioWorkspaceStorageKey("artist@example.com"))).toBe(false);

    const userLoad = loadStudioWorkspacePersistence(storage, "artist@example.com");
    const userEdit = saveStudioWorkspace(userLoad.state, "로그인 작업공간");
    expect(
      saveStudioWorkspaceState(storage, "artist@example.com", userEdit, {
        sourceOwnerScope: userLoad.ownerScope,
      }).status
    ).toBe("persisted");
  });

  it("rejects an envelope whose embedded owner does not match its opaque key", () => {
    const userId = "owner-a";
    const key = studioWorkspaceStorageKey(userId);
    const storage = memoryStorage({
      [key]: JSON.stringify({
        kind: "toonspectrum.studio-workspaces",
        payloadVersion: STUDIO_WORKSPACE_PAYLOAD_VERSION,
        ownerScope: studioWorkspaceOwnerScope("owner-b"),
        state: DEFAULT_STUDIO_WORKSPACE_STATE,
      }),
    });

    expect(loadStudioWorkspacePersistence(storage, userId)).toMatchObject({
      state: DEFAULT_STUDIO_WORKSPACE_STATE,
      source: "default",
      status: "session-only",
      failure: "owner-mismatch",
    });
  });

  it("migrates a prior owner-scoped v1 key and deletes it only after verified v2 write", () => {
    const userId = "legacy-owner@example.com";
    const currentKey = studioWorkspaceStorageKey(userId);
    const legacyState = {
      ...DEFAULT_STUDIO_WORKSPACE_STATE,
      version: 1,
      liveLayout: {
        ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
        desktop: { leftPanelOpen: false, rightPanelOpen: true },
      },
    };
    const values = new Map<string, string>();
    const removed: string[] = [];
    let requestedLegacyKey = "";
    const storage: StudioWorkspaceStorage = {
      getItem: (key) => {
        if (values.has(key)) return values.get(key) ?? null;
        if (key.startsWith("toonspectrum-studio-workspaces:v1:user:")) {
          requestedLegacyKey = key;
          return JSON.stringify(legacyState);
        }
        return null;
      },
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => {
        removed.push(key);
      },
    };

    const loaded = loadStudioWorkspacePersistence(storage, userId);
    const persistedEnvelope = JSON.parse(values.get(currentKey) ?? "null") as {
      payloadVersion?: unknown;
    };

    expect(loaded).toMatchObject({
      source: "legacy-v1",
      status: "persisted",
      failure: null,
    });
    expect(loaded.state.version).toBe(STUDIO_WORKSPACE_STATE_VERSION);
    expect(loaded.state.liveLayout.desktop.leftPanelWidth).toBe(
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default
    );
    expect(persistedEnvelope.payloadVersion).toBe(STUDIO_WORKSPACE_PAYLOAD_VERSION);
    expect(requestedLegacyKey).not.toBe("");
    expect(removed).toEqual([requestedLegacyKey]);
  });

  it("falls back to the matching v1 key when the stable guest payload is malformed", () => {
    const legacyKey = "toonspectrum-studio-workspaces:v1:guest";
    const storage = memoryStorage({
      [studioWorkspaceStorageKey(null)]: "{interrupted-write",
      [legacyKey]: JSON.stringify({
        ...DEFAULT_STUDIO_WORKSPACE_STATE,
        version: 1,
        mobileControlSide: "left",
      }),
    });

    const loaded = loadStudioWorkspacePersistence(storage, null);

    expect(loaded).toMatchObject({
      source: "legacy-v1",
      status: "persisted",
      failure: null,
    });
    expect(loaded.state.mobileControlSide).toBe("left");
    expect(storage.values.has(legacyKey)).toBe(false);
  });

  it("retains legacy keys when quota or silent-write verification prevents migration", () => {
    const legacyKey = "toonspectrum-studio-workspaces:v1:guest";
    const removed: string[] = [];
    const storage: StudioWorkspaceStorage = {
      getItem: (key) =>
        key === legacyKey
          ? JSON.stringify({ ...DEFAULT_STUDIO_WORKSPACE_STATE, version: 1 })
          : null,
      setItem: () => undefined,
      removeItem: (key) => {
        removed.push(key);
      },
    };

    expect(loadStudioWorkspacePersistence(storage, null)).toMatchObject({
      source: "legacy-v1",
      status: "session-only",
      failure: "verification-failed",
    });
    expect(removed).toEqual([]);
  });

  it("migrates real legacy JSON preference strings and clamped resize widths for guests only", () => {
    const quickActions = {
      version: 1,
      slots: {
        north: "delete",
        northEast: "redo",
        southEast: "select",
        south: "pen",
        southWest: "eraser",
        northWest: "eyedropper",
      },
    };
    const initial = {
      [STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY]: JSON.stringify({
        primary: "layers",
        image: "mask",
        document: "grade",
      }),
      [STUDIO_QUICK_ACTIONS_STORAGE_KEY]: JSON.stringify(quickActions),
      [STUDIO_LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY]: "44",
      [STUDIO_LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY]: "9999",
    };
    const guestStorage = memoryStorage(initial);
    const guest = loadStudioWorkspacePersistence(guestStorage, null);

    expect(guest).toMatchObject({
      source: "legacy-preferences",
      status: "persisted",
      failure: null,
    });
    expect(guest.state.liveLayout.inspector).toEqual({
      primary: "layers",
      image: "mask",
      document: "grade",
    });
    expect(guest.state.liveLayout.quickActions.slots.north).toBe("delete");
    expect(guest.state.liveLayout.desktop.leftPanelWidth).toBe(
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum
    );
    expect(guest.state.liveLayout.desktop.rightPanelWidth).toBe(
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum
    );
    for (const key of Object.keys(initial)) expect(guestStorage.values.has(key)).toBe(false);

    const userStorage = memoryStorage(initial);
    const user = loadStudioWorkspacePersistence(userStorage, "authenticated-owner");
    expect(user.source).toBe("default");
    for (const key of Object.keys(initial)) expect(userStorage.values.has(key)).toBe(true);
  });

  it("migrates a stable v1 envelope in place and fails closed for malformed current data", () => {
    const userId = "owner-a";
    const key = studioWorkspaceStorageKey(userId);
    const storage = memoryStorage({
      [key]: JSON.stringify({
        kind: "toonspectrum.studio-workspaces",
        payloadVersion: 1,
        ownerScope: studioWorkspaceOwnerScope(userId),
        state: { ...DEFAULT_STUDIO_WORKSPACE_STATE, version: 1 },
      }),
    });
    const migrated = loadStudioWorkspacePersistence(storage, userId);
    const rewritten = JSON.parse(storage.values.get(key) ?? "null") as {
      payloadVersion?: unknown;
    };

    expect(migrated).toMatchObject({ source: "legacy-v1", status: "persisted" });
    expect(rewritten.payloadVersion).toBe(STUDIO_WORKSPACE_PAYLOAD_VERSION);

    storage.values.set(key, "{malformed");
    expect(loadStudioWorkspacePersistence(storage, userId)).toMatchObject({
      state: DEFAULT_STUDIO_WORKSPACE_STATE,
      source: "default",
      status: "session-only",
      failure: "invalid-payload",
    });
  });
});

describe("Studio custom workspace lifecycle", () => {
  it("saves, renames, overwrites, reloads, and deletes without mutating prior states", () => {
    const initial = DEFAULT_STUDIO_WORKSPACE_STATE;
    const saved = saveStudioWorkspace(initial, "  채색   집중  ");
    const id = saved.activeWorkspaceId;
    const renamed = renameStudioWorkspace(saved, id, "야간 채색");
    const changedLayout = withInspector(renamed.liveLayout, "publish");
    const edited = updateStudioWorkspaceLiveLayout(renamed, changedLayout);
    const overwritten = overwriteStudioWorkspace(edited, id);
    const dirtyAgain = updateStudioWorkspaceLiveLayout(
      overwritten,
      withInspector(overwritten.liveLayout, "layers")
    );
    const reloaded = reloadStudioWorkspace(dirtyAgain);
    const deleted = deleteStudioWorkspace(reloaded, id);

    expect(initial.customWorkspaces).toHaveLength(0);
    expect(saved.customWorkspaces[0]?.name).toBe("채색 집중");
    expect(renamed.customWorkspaces[0]?.name).toBe("야간 채색");
    expect(isStudioWorkspaceDirty(edited)).toBe(true);
    expect(isStudioWorkspaceDirty(overwritten)).toBe(false);
    expect(isStudioWorkspaceDirty(dirtyAgain)).toBe(true);
    expect(reloaded.liveLayout.inspector.primary).toBe("publish");
    expect(isStudioWorkspaceDirty(reloaded)).toBe(false);
    expect(deleted.customWorkspaces).toHaveLength(0);
    expect(deleted.activeWorkspaceId).toBe("storyboard");
    expect(isStudioWorkspaceDirty(deleted)).toBe(false);
  });

  it("never permits built-ins to be overwritten, renamed, or deleted", () => {
    expect(() => overwriteStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "lineart")).toThrow(
      TypeError
    );
    expect(() => renameStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "review", "새 이름")).toThrow(
      TypeError
    );
    expect(() => deleteStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "publish")).toThrow(
      TypeError
    );
    expect(resolveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "lineart")?.id).toBe(
      "lineart"
    );
  });

  it("enforces the 48-character name and 24-custom-workspace limits", () => {
    const exactName = "가".repeat(STUDIO_WORKSPACE_NAME_MAX_LENGTH);
    const exact = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, exactName);
    expect(exact.customWorkspaces[0]?.name).toBe(exactName);
    expect(() => saveStudioWorkspace(exact, `${exactName}가`)).toThrow(TypeError);
    expect(() => saveStudioWorkspace(exact, "   ")).toThrow(TypeError);
    expect(() => saveStudioWorkspace(exact, "bad\u0000name")).toThrow(TypeError);
    expect(() => saveStudioWorkspace(exact, "bad\nname")).toThrow(TypeError);

    let full: StudioWorkspaceState = DEFAULT_STUDIO_WORKSPACE_STATE;
    for (let index = 0; index < STUDIO_WORKSPACE_MAX_CUSTOM; index += 1) {
      full = saveStudioWorkspace(full, `사용자 공간 ${index + 1}`);
    }
    expect(full.customWorkspaces).toHaveLength(STUDIO_WORKSPACE_MAX_CUSTOM);
    expect(() => saveStudioWorkspace(full, "한 개 더")).toThrow(RangeError);
  });

  it("throws for unknown custom workspaces instead of silently changing another one", () => {
    expect(() => renameStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404", "없음")).toThrow(
      RangeError
    );
    expect(() => overwriteStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404")).toThrow(
      RangeError
    );
    expect(() => deleteStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404")).toThrow(
      RangeError
    );
    expect(() => switchStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404")).toThrow(
      RangeError
    );
  });

  it("duplicates a saved custom snapshot beside its source without changing active dirty work", () => {
    const first = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "선화 집중");
    const firstId = first.activeWorkspaceId;
    const second = saveStudioWorkspace(first, "채색 집중");
    const dirty = updateStudioWorkspaceLiveLayout(
      second,
      withInspector(second.liveLayout, "publish")
    );
    const sourceBefore = JSON.stringify(dirty);
    const sourceWorkspace = resolveStudioWorkspace(dirty, firstId);
    const duplicated = duplicateStudioWorkspace(dirty, firstId);
    const duplicate = duplicated.customWorkspaces[1];

    expect(duplicated.customWorkspaces.map((workspace) => workspace.id)).toEqual([
      firstId,
      duplicate?.id,
      second.activeWorkspaceId,
    ]);
    expect(duplicate).toMatchObject({ name: "선화 집중 복사본" });
    expect(duplicate?.layout).toEqual(sourceWorkspace?.layout);
    expect(duplicate?.layout).not.toBe(sourceWorkspace?.layout);
    expect(duplicated.activeWorkspaceId).toBe(dirty.activeWorkspaceId);
    expect(duplicated.liveLayout).toEqual(dirty.liveLayout);
    expect(isStudioWorkspaceDirty(duplicated)).toBe(true);
    expect(JSON.stringify(dirty)).toBe(sourceBefore);
    expect(Object.isFrozen(duplicated)).toBe(true);
    expect(Object.isFrozen(duplicated.customWorkspaces)).toBe(true);
    expect(Object.isFrozen(duplicate)).toBe(true);
    expect(Object.isFrozen(duplicate?.layout)).toBe(true);
  });

  it("creates collision-free, grapheme-safe duplicate names within the 48-code-point limit", () => {
    const artistEmoji = "🧑🏽‍🎨";
    const longName = artistEmoji.repeat(12);
    const source = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, longName);
    const sourceId = source.activeWorkspaceId;
    const firstCopy = duplicateStudioWorkspace(source, sourceId);
    const firstCopyId = firstCopy.customWorkspaces.find(
      (workspace) => workspace.id !== sourceId
    )?.id;
    const secondCopy = duplicateStudioWorkspace(firstCopy, sourceId);
    const firstCopyName = secondCopy.customWorkspaces.find(
      (workspace) => workspace.id === firstCopyId
    )?.name;
    const secondCopyName = secondCopy.customWorkspaces.find(
      (workspace) => workspace.id !== sourceId && workspace.id !== firstCopyId
    )?.name;

    expect(firstCopyName?.endsWith(" 복사본")).toBe(true);
    expect(secondCopyName?.endsWith(" 복사본 2")).toBe(true);
    expect(firstCopyName).not.toBe(secondCopyName);
    expect(Array.from(firstCopyName ?? "")).toHaveLength(
      STUDIO_WORKSPACE_NAME_MAX_LENGTH
    );
    expect(Array.from(secondCopyName ?? "").length).toBeLessThanOrEqual(
      STUDIO_WORKSPACE_NAME_MAX_LENGTH
    );
    expect(firstCopyName?.match(new RegExp(artistEmoji, "gu"))?.length).toBe(11);
    expect(secondCopyName?.match(new RegExp(artistEmoji, "gu"))?.length).toBe(10);
    expect(firstCopyName).not.toContain("\uFFFD");
    expect(secondCopyName).not.toContain("\uFFFD");
  });

  it("rejects duplicate and reorder operations for built-ins, unknown ids, invalid targets, and capacity", () => {
    expect(() => duplicateStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "lineart")).toThrow(
      TypeError
    );
    expect(() => duplicateStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404")).toThrow(
      RangeError
    );
    expect(() => reorderStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "review", 0)).toThrow(
      TypeError
    );
    expect(() => moveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "custom-404", "up")).toThrow(
      RangeError
    );

    const one = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "하나");
    expect(() => reorderStudioWorkspace(one, one.activeWorkspaceId, -1)).toThrow(RangeError);
    expect(() => reorderStudioWorkspace(one, one.activeWorkspaceId, 1)).toThrow(RangeError);
    expect(() => reorderStudioWorkspace(one, one.activeWorkspaceId, 0.5)).toThrow(TypeError);
    expect(() =>
      moveStudioWorkspace(one, one.activeWorkspaceId, "sideways" as "up")
    ).toThrow(TypeError);

    let full: StudioWorkspaceState = DEFAULT_STUDIO_WORKSPACE_STATE;
    for (let index = 0; index < STUDIO_WORKSPACE_MAX_CUSTOM; index += 1) {
      full = saveStudioWorkspace(full, `가득 찬 공간 ${index + 1}`);
    }
    const fullBefore = JSON.stringify(full);
    expect(() => duplicateStudioWorkspace(full, full.customWorkspaces[0]!.id)).toThrow(
      RangeError
    );
    expect(JSON.stringify(full)).toBe(fullBefore);
  });

  it("reorders custom workspaces deterministically while preserving active/live state", () => {
    const first = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "첫째");
    const firstId = first.activeWorkspaceId;
    const second = saveStudioWorkspace(first, "둘째");
    const secondId = second.activeWorkspaceId;
    const third = saveStudioWorkspace(second, "셋째");
    const thirdId = third.activeWorkspaceId;
    const dirtyActive = updateStudioWorkspaceLiveLayout(
      third,
      withLeftPanelWidth(third.liveLayout, 300)
    );
    const reordered = reorderStudioWorkspace(dirtyActive, thirdId, 0);
    const movedDown = moveStudioWorkspace(reordered, thirdId, "down");
    const movedBackUp = moveStudioWorkspace(movedDown, thirdId, "up");
    const firstBoundary = moveStudioWorkspace(movedBackUp, thirdId, "up");
    const lastBoundary = moveStudioWorkspace(reordered, secondId, "down");
    const sameTarget = reorderStudioWorkspace(reordered, firstId, 1);

    expect(reordered.customWorkspaces.map((workspace) => workspace.id)).toEqual([
      thirdId,
      firstId,
      secondId,
    ]);
    expect(movedDown.customWorkspaces.map((workspace) => workspace.id)).toEqual([
      firstId,
      thirdId,
      secondId,
    ]);
    expect(movedBackUp.customWorkspaces.map((workspace) => workspace.id)).toEqual([
      thirdId,
      firstId,
      secondId,
    ]);
    expect(firstBoundary).toEqual(movedBackUp);
    expect(lastBoundary).toEqual(reordered);
    expect(sameTarget).toEqual(reordered);
    for (const result of [reordered, movedDown, movedBackUp, firstBoundary, lastBoundary]) {
      expect(result.activeWorkspaceId).toBe(thirdId);
      expect(result.liveLayout).toEqual(dirtyActive.liveLayout);
      expect(isStudioWorkspaceDirty(result)).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.customWorkspaces)).toBe(true);
    }
  });

  it("preserves owner provenance and the v2 envelope across duplicate and reorder saves", () => {
    const storage = memoryStorage();
    const ownerId = "workspace-manager-owner";
    const loaded = loadStudioWorkspacePersistence(storage, ownerId);
    const first = saveStudioWorkspace(loaded.state, "원본");
    const duplicated = duplicateStudioWorkspace(first, first.activeWorkspaceId);
    const copyId = duplicated.customWorkspaces.find(
      (workspace) => workspace.id !== first.activeWorkspaceId
    )!.id;
    const reordered = reorderStudioWorkspace(duplicated, copyId, 0);
    const saved = saveStudioWorkspaceState(storage, ownerId, reordered, {
      sourceOwnerScope: loaded.ownerScope,
    });
    const persisted = loadStudioWorkspacePersistence(storage, ownerId);
    const envelope = JSON.parse(
      storage.values.get(studioWorkspaceStorageKey(ownerId)) ?? "null"
    ) as { payloadVersion?: unknown };

    expect(saved).toMatchObject({ status: "persisted", failure: null });
    expect(persisted.state.customWorkspaces.map((workspace) => workspace.id)).toEqual([
      copyId,
      first.activeWorkspaceId,
    ]);
    expect(persisted.state.activeWorkspaceId).toBe(first.activeWorkspaceId);
    expect(envelope.payloadVersion).toBe(STUDIO_WORKSPACE_PAYLOAD_VERSION);
  });
});

describe("workspace switching and dirty comparison", () => {
  it("keeps dirty edits when the current workspace is selected and discards them only on reload", () => {
    const edited = updateStudioWorkspaceLiveLayout(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      withLeftPanelWidth(DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout, 240)
    );
    const selectedAgain = switchStudioWorkspace(edited, edited.activeWorkspaceId);
    const reloaded = reloadStudioWorkspace(selectedAgain);

    expect(isStudioWorkspaceDirty(edited)).toBe(true);
    expect(selectedAgain.liveLayout.desktop.leftPanelWidth).toBe(240);
    expect(isStudioWorkspaceDirty(selectedAgain)).toBe(true);
    expect(reloaded.liveLayout.desktop.leftPanelWidth).toBe(
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default
    );
    expect(isStudioWorkspaceDirty(reloaded)).toBe(false);
  });

  it("switches inspector, desktop panels, and quick actions when enabled", () => {
    const switched = switchStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "coloring");
    const target = resolveStudioWorkspace(switched, "coloring");

    expect(target).not.toBeNull();
    expect(switched.activeWorkspaceId).toBe("coloring");
    expect(switched.liveLayout).toEqual(target?.layout);
    expect(isStudioWorkspaceDirty(switched)).toBe(false);
  });

  it("preserves radial quick actions on switch and ignores them for dirty state when disabled", () => {
    const customQuickActions = withNorthAction(
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      "delete"
    );
    const edited = updateStudioWorkspaceLiveLayout(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      customQuickActions
    );
    const preferences = updateStudioWorkspacePreferences(edited, {
      mobileControlSide: "left",
      applyQuickActionsOnSwitch: false,
    });
    const switched = switchStudioWorkspace(preferences, "coloring");
    const target = resolveStudioWorkspace(switched, "coloring");

    expect(switched.mobileControlSide).toBe("left");
    expect(switched.liveLayout.inspector).toEqual(target?.layout.inspector);
    expect(switched.liveLayout.desktop).toEqual(target?.layout.desktop);
    expect(switched.liveLayout.quickActions.slots.north).toBe("delete");
    expect(target?.layout.quickActions.slots.north).toBe("undo");
    expect(isStudioWorkspaceDirty(switched)).toBe(false);
    expect(
      areStudioWorkspaceLayoutsEqual(switched.liveLayout, target!.layout, true)
    ).toBe(false);
    expect(
      areStudioWorkspaceLayoutsEqual(switched.liveLayout, target!.layout, false)
    ).toBe(true);
  });

  it("reloads structural changes while preserving live quick actions when configured", () => {
    const noQuickSwitch = updateStudioWorkspacePreferences(
      DEFAULT_STUDIO_WORKSPACE_STATE,
      { applyQuickActionsOnSwitch: false }
    );
    const editedLayout = withNorthAction(
      withInspector(noQuickSwitch.liveLayout, "layers"),
      "delete"
    );
    const edited = updateStudioWorkspaceLiveLayout(noQuickSwitch, editedLayout);
    const reloaded = reloadStudioWorkspace(edited);

    expect(reloaded.liveLayout.inspector).toEqual(
      DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.inspector
    );
    expect(reloaded.liveLayout.quickActions.slots.north).toBe("delete");
    expect(isStudioWorkspaceDirty(reloaded)).toBe(false);
  });
});

describe("legacy Studio preference migration", () => {
  it("migrates existing inspector, panel, and quick-action values without document data", () => {
    const quickActions = {
      version: 1,
      slots: {
        north: "delete",
        northEast: "redo",
        southEast: "select",
        south: "pen",
        southWest: "eraser",
        northWest: "eyedropper",
      },
    };
    const migrated = migrateLegacyStudioWorkspaceState({
      inspector: JSON.stringify({ primary: "layers", image: "mask", document: "grade" }),
      quickActions: JSON.stringify(quickActions),
      leftPanelOpen: false,
      rightPanelOpen: true,
      leftPanelWidth: 220.4,
      rightPanelWidth: 560.6,
      mobileControlSide: "left",
      applyQuickActionsOnSwitch: false,
      documentData: { marker: "not accepted by the type" },
    } as Parameters<typeof migrateLegacyStudioWorkspaceState>[0]);
    const serialized = JSON.stringify(migrated);

    expect(migrated.activeWorkspaceId).toBe("lineart");
    expect(migrated.liveLayout.inspector).toEqual({
      primary: "layers",
      image: "mask",
      document: "grade",
    });
    expect(migrated.liveLayout.desktop).toEqual({
      leftPanelOpen: false,
      rightPanelOpen: true,
      leftPanelWidth: 220,
      rightPanelWidth: 561,
    });
    expect(migrated.liveLayout.quickActions.slots.north).toBe("delete");
    expect(migrated.mobileControlSide).toBe("left");
    expect(migrated.applyQuickActionsOnSwitch).toBe(false);
    expect(serialized).not.toContain("documentData");
    expect(serialized).not.toContain("not accepted by the type");
  });

  it("normalizes malformed legacy values to safe UI defaults", () => {
    const migrated = migrateLegacyStudioWorkspaceState({
      inspector: { primary: "unknown" },
      quickActions: "{bad json",
      leftPanelOpen: "yes",
      rightPanelOpen: null,
      leftPanelWidth: Number.NaN,
      rightPanelWidth: "wide",
      mobileControlSide: "center",
      applyQuickActionsOnSwitch: "yes",
    });

    expect(migrated.liveLayout.inspector).toEqual({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });
    expect(migrated.liveLayout.desktop).toEqual({
      leftPanelOpen: true,
      rightPanelOpen: true,
      leftPanelWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default,
      rightPanelWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default,
    });
    expect(migrated.mobileControlSide).toBe("right");
    expect(migrated.applyQuickActionsOnSwitch).toBe(true);
  });
});
