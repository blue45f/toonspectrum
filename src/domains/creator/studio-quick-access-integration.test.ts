import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_QUICK_ACCESS_STATE,
  addStudioQuickAccessCommand,
} from "./studio-quick-access";
import {
  STUDIO_QUICK_ACCESS_COMMAND_IDS,
  buildStudioQuickAccessCommandCatalog,
  loadStudioQuickAccessState,
  resolveStudioQuickAccessExecutionIntent,
  saveStudioQuickAccessState,
  type StudioQuickAccessStorage,
} from "./studio-quick-access-integration";

function memoryStorage(): StudioQuickAccessStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("studio quick access live command registry", () => {
  it("publishes only registered editor commands and fails omitted availability closed", () => {
    const catalog = buildStudioQuickAccessCommandCatalog({
      undo: true,
      pen: true,
    });

    expect(catalog.map(({ id }) => id)).toEqual([
      ...STUDIO_QUICK_ACCESS_COMMAND_IDS,
    ]);
    expect(catalog.find(({ id }) => id === "undo")?.available).toBe(true);
    expect(catalog.find(({ id }) => id === "pen")?.available).toBe(true);
    expect(catalog.find(({ id }) => id === "save")?.available).toBe(false);
    expect(catalog.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("maps every registered command to a trusted intent and rejects unknown IDs", () => {
    for (const commandId of STUDIO_QUICK_ACCESS_COMMAND_IDS) {
      expect(resolveStudioQuickAccessExecutionIntent(commandId)).not.toBeNull();
    }
    expect(resolveStudioQuickAccessExecutionIntent("future-command")).toBeNull();
    expect(resolveStudioQuickAccessExecutionIntent("__proto__")).toBeNull();
    expect(resolveStudioQuickAccessExecutionIntent("")).toBeNull();
  });
});

describe("studio quick access owner-scoped persistence", () => {
  it("round-trips the exact local model without crossing owner scopes", () => {
    const storage = memoryStorage();
    const customized = addStudioQuickAccessCommand(
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
      DEFAULT_STUDIO_QUICK_ACCESS_STATE.activeSetId,
      "add-bubble",
    );

    expect(saveStudioQuickAccessState(
      storage,
      "owner-0123456789abcdef",
      customized,
    )).toBe("persisted");
    expect(loadStudioQuickAccessState(
      storage,
      "owner-0123456789abcdef",
    )).toEqual(customized);
    expect(loadStudioQuickAccessState(
      storage,
      "owner-fedcba9876543210",
    )).toEqual(DEFAULT_STUDIO_QUICK_ACCESS_STATE);
  });

  it("fails closed for invalid owners, malformed payloads, and storage failures", () => {
    const storage = memoryStorage();
    storage.values.set(
      "toonspectrum-studio-quick-access:v1:guest",
      "{bad json",
    );
    expect(loadStudioQuickAccessState(storage, "guest")).toEqual(
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
    );
    expect(saveStudioQuickAccessState(
      storage,
      "../../other-user",
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
    )).toBe("invalid-owner");
    expect(storage.values.size).toBe(1);

    const throwingStorage: StudioQuickAccessStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadStudioQuickAccessState(throwingStorage, "guest")).toEqual(
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
    );
    expect(saveStudioQuickAccessState(
      throwingStorage,
      "guest",
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
    )).toBe("write-failed");
  });

  it("reports verification failures without throwing", () => {
    expect(saveStudioQuickAccessState(
      {
        getItem: () => "different",
        setItem: () => undefined,
      },
      "guest",
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
    )).toBe("verification-failed");
  });
});
