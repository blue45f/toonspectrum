import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_DATA_RESET_CONFIRMATION_PHRASE,
  STUDIO_INDEXED_DB_DATABASES,
  STUDIO_LOCAL_STORAGE_EXACT_KEYS,
  STUDIO_LOCAL_STORAGE_PREFIXES,
  STUDIO_OPFS_ROOTS,
  StudioDataDestructionRefusedError,
  authorizeStudioDataDestruction,
  executeStudioDataDestruction,
  planStudioDataDestruction,
} from "./studio-data-destruction";

import type { StudioDataDestructionAdapter } from "./studio-data-destruction";

/** V11.1 §12.5 gate: 3중 플래그가 전부 정확해야만 파괴가 실행된다. */

const DEPLOYMENT = "toonstudio-prod-render";

const VALID_FLAGS = {
  RESET_EXISTING_STUDIO_DATA: "YES",
  RESET_TARGET: DEPLOYMENT,
  RESET_CONFIRMATION: STUDIO_DATA_RESET_CONFIRMATION_PHRASE,
};

function recordingAdapter(): StudioDataDestructionAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    removeOpfsRoot: (name) => {
      calls.push(`opfs:${name}`);
      return Promise.resolve();
    },
    deleteIndexedDb: (name) => {
      calls.push(`idb:${name}`);
      return Promise.resolve();
    },
    removeLocalStorageByPrefix: (prefix) => {
      calls.push(`ls:${prefix}`);
      return Promise.resolve(2);
    },
    removeLocalStorageKey: (key) => {
      calls.push(`ls-key:${key}`);
      return Promise.resolve(1);
    },
  };
}

describe("authorizeStudioDataDestruction", () => {
  it("refuses when any of the three flags is missing or wrong", () => {
    const badCases = [
      {},
      { ...VALID_FLAGS, RESET_EXISTING_STUDIO_DATA: "yes" },
      { ...VALID_FLAGS, RESET_TARGET: "some-other-deployment" },
      { ...VALID_FLAGS, RESET_CONFIRMATION: "REPLACE_CURRENT_TOONSTUDIO_IN_PLACE" },
    ];
    for (const flags of badCases) {
      const result = authorizeStudioDataDestruction(flags, DEPLOYMENT);
      expect(result.authorized).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  it("refuses an empty verified deployment id even with matching flags", () => {
    const result = authorizeStudioDataDestruction(
      { ...VALID_FLAGS, RESET_TARGET: "" },
      "",
    );
    expect(result.authorized).toBe(false);
  });

  it("authorizes only the exact triple", () => {
    expect(authorizeStudioDataDestruction(VALID_FLAGS, DEPLOYMENT)).toEqual({
      authorized: true,
      reasons: [],
    });
  });
});

describe("executeStudioDataDestruction", () => {
  it("throws without touching storage when refused", async () => {
    const adapter = recordingAdapter();
    await expect(
      executeStudioDataDestruction({}, DEPLOYMENT, adapter),
    ).rejects.toBeInstanceOf(StudioDataDestructionRefusedError);
    expect(adapter.calls).toEqual([]);
  });

  it("destroys every planned target exactly once when authorized", async () => {
    const adapter = recordingAdapter();
    const report = await executeStudioDataDestruction(VALID_FLAGS, DEPLOYMENT, adapter);
    expect(report.destroyed).toHaveLength(planStudioDataDestruction().length);
    for (const root of STUDIO_OPFS_ROOTS) {
      expect(adapter.calls).toContain(`opfs:${root}`);
    }
    for (const db of STUDIO_INDEXED_DB_DATABASES) {
      expect(adapter.calls).toContain(`idb:${db}`);
    }
    expect(report.localStorageKeysRemoved).toBe(
      2 * STUDIO_LOCAL_STORAGE_PREFIXES.length + STUDIO_LOCAL_STORAGE_EXACT_KEYS.length,
    );
    for (const key of STUDIO_LOCAL_STORAGE_EXACT_KEYS) {
      expect(adapter.calls).toContain(`ls-key:${key}`);
    }
  });
});

describe("inventory stays in sync with the owning modules (drift contract)", () => {
  const read = (relative: string): string =>
    readFileSync(new URL(relative, import.meta.url), "utf8");

  it("OPFS roots match the storage modules", () => {
    expect(read("./studio-autosave-opfs-session.ts")).toContain(
      '"toonstudio-studio-autosave-v3"',
    );
    expect(read("./render/studio-engine-tile-storage-opfs-v2-backend.ts")).toContain(
      '"toonstudio-studio-engine-storage-v2"',
    );
    expect(read("./hybrid-dcc/studio-hybrid-dcc-workspace-persistence.ts")).toContain(
      'STUDIO_HYBRID_DCC_WORKSPACE_PERSISTENCE_ROOT = "dcc-workspaces"',
    );
    expect(
      read("../../../../../packages/studio-project-model/src/browser/opfs-journal-store.ts"),
    ).toContain('"toonstudio-studio-projects"');
    expect(read("./studio-local-database.ts")).toContain(
      'STUDIO_SQLITE_OPFS_DIRECTORY = "toonstudio-studio-sqlite"',
    );
    expect(read("./studio-local-database.ts")).toContain(
      'STUDIO_SQLITE_OPFS_RECOVERY_DIRECTORY = "toonstudio-studio-sqlite-r1"',
    );
    expect(STUDIO_OPFS_ROOTS).toContain("toonstudio-studio-sqlite");
    expect(STUDIO_OPFS_ROOTS).toContain("toonstudio-studio-sqlite-r1");
    expect(read("./studio-opfs-filesystem.ts")).toContain(
      'rootName = "toonstudio-studio-assets"',
    );
    expect(read("./studio-opfs-sync-access-store.ts")).toContain(
      '"toonstudio-studio-large-documents"',
    );
    expect(read("./studio-pages-history-durable-runtime.ts")).toContain(
      'rootName: "toonstudio-studio-history-recovery"',
    );
    expect(read("./vrm/studio-vrm-asset-sqlite-opfs-repository.ts")).toContain(
      'STUDIO_VRM_ASSET_OPFS_ROOT = "toonstudio-studio-vrm-assets-v12"',
    );
    expect(read("./bg3d/studio-bg3d-libraries-sqlite-opfs-authority.ts")).toContain(
      '"toonstudio-studio-bg3d-libraries-v12"',
    );
    expect(read("./studio-storage-recovery-runtime.ts")).toContain(
      'rootName: "studio-recovery"',
    );
    expect(STUDIO_OPFS_ROOTS).toEqual(expect.arrayContaining([
      "toonstudio-studio-assets",
      "toonstudio-studio-large-documents",
      "toonstudio-studio-history-recovery",
      "toonstudio-studio-vrm-assets-v12",
      "toonstudio-studio-bg3d-libraries-v12",
      "studio-recovery",
    ]));
  });

  it("IndexedDB names match the library modules", () => {
    expect(read("./vrm/vrm-library.ts")).toContain('"toonstudio-studio-vrm-library"');
    expect(read("./live/studio-crdt-outbox.ts")).toContain("toonstudio-studio-crdt-outbox");
    expect(read("./studio-checkpoints.ts")).toContain("toonstudio-studio-checkpoints");
    expect(read("./live/studio-crdt-recovery-vault.ts")).toContain(
      "createStudioCrdtRecoverySqlitePersistence",
    );
    // The old IndexedDB authority is no longer opened by product code, but its
    // exact name remains in the destructive cutover inventory.
    expect(STUDIO_INDEXED_DB_DATABASES).toContain(
      "toonstudio-studio-crdt-recovery-vault",
    );
    expect(read("./bg3d/bg3d-model-library.ts")).toContain(
      '"toonstudio-studio-bg3d-model-library"',
    );
    expect(read("./studio-asset-library.ts")).toContain(
      '"toonstudio-studio-asset-library"',
    );
    expect(read("./studio-scene-snapshot-library.ts")).toContain(
      '"toonstudio-studio-scene-snapshot-library"',
    );
    expect(read("./bg3d/bg3d-template-library.ts")).toContain(
      '"toonstudio-studio-bg3d-template-library"',
    );
    expect(read("./studio-production-bible.ts")).toContain(
      '"toonstudio-studio-production-bible"',
    );
    expect(read("./bg3d/studio-bg3d-asset-metadata-store.ts")).toContain(
      '"toonstudio-studio-bg3d-asset-metadata"',
    );
    expect(read("./bg3d/studio-bg3d-shot-batch-recovery-store.ts")).toContain(
      '"toonstudio-studio-bg3d-shot-batch-recovery"',
    );
    expect(read("./vrm/studio-vrm-texture-paint-library.ts")).toContain(
      '"toonstudio-studio-vrm-texture-paint-library"',
    );
    expect(STUDIO_INDEXED_DB_DATABASES).toEqual(
      expect.arrayContaining([
        "toonstudio-studio-production-bible",
        "toonstudio-studio-bg3d-asset-metadata",
        "toonstudio-studio-bg3d-shot-batch-recovery",
        "toonstudio-studio-vrm-texture-paint-library",
      ]),
    );
  });

  it("covers the V12 localStorage fallback without reopening legacy data", () => {
    const brushRepository = read("./brush/studio-brush-library-sqlite-repository.ts");
    const fallbackKey = "toonstudio-studio-v12-brush-library-fallback";
    expect(brushRepository).toContain(`"${fallbackKey}"`);
    expect(STUDIO_LOCAL_STORAGE_PREFIXES.some((prefix) => fallbackKey.startsWith(prefix)))
      .toBe(true);
    expect(brushRepository).toContain('legacyDataPolicy?: "discard" | "import-explicit"');
  });

  it("covers dotted Studio creative keys without using a broad platform prefix", () => {
    expect(STUDIO_LOCAL_STORAGE_PREFIXES).not.toContain("toonstudio.studio");
    expect(STUDIO_LOCAL_STORAGE_EXACT_KEYS).toEqual(expect.arrayContaining([
      "toonstudio.studio-marketplace-library.v1",
      "toonstudio.studio-creator-filter-presets.v1",
      "toonstudio.studio-filter-library.v12.fallback",
      "toonstudio.studio.bg3d.lt-presets.v1",
      "toonstudio.studio.bg3d.lt-presets.corrupt.v1",
    ]));
  });
});
