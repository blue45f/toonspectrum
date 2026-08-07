import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_DATA_RESET_CONFIRMATION_PHRASE,
  STUDIO_INDEXED_DB_DATABASES,
  STUDIO_LOCAL_STORAGE_PREFIXES,
  STUDIO_OPFS_ROOTS,
  StudioDataDestructionRefusedError,
  authorizeStudioDataDestruction,
  executeStudioDataDestruction,
  planStudioDataDestruction,
} from "./studio-data-destruction";

import type { StudioDataDestructionAdapter } from "./studio-data-destruction";

/** V11.1 §12.5 gate: 3중 플래그가 전부 정확해야만 파괴가 실행된다. */

const DEPLOYMENT = "toonspectrum-prod-vercel";

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
  };
}

describe("authorizeStudioDataDestruction", () => {
  it("refuses when any of the three flags is missing or wrong", () => {
    const badCases = [
      {},
      { ...VALID_FLAGS, RESET_EXISTING_STUDIO_DATA: "yes" },
      { ...VALID_FLAGS, RESET_TARGET: "some-other-deployment" },
      { ...VALID_FLAGS, RESET_CONFIRMATION: "REPLACE" },
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
      2 * STUDIO_LOCAL_STORAGE_PREFIXES.length,
    );
  });
});

describe("inventory stays in sync with the owning modules (drift contract)", () => {
  const read = (relative: string): string =>
    readFileSync(new URL(relative, import.meta.url), "utf8");

  it("OPFS roots match the storage modules", () => {
    expect(read("./studio-autosave-opfs-session.ts")).toContain(
      '"toonspectrum-studio-autosave-v3"',
    );
    expect(read("./studio-engine-tile-storage-opfs-v2-backend.ts")).toContain(
      '"toonspectrum-studio-engine-storage-v2"',
    );
    expect(read("./studio-hybrid-dcc-workspace-persistence.ts")).toContain(
      'STUDIO_HYBRID_DCC_WORKSPACE_PERSISTENCE_ROOT = "dcc-workspaces"',
    );
    expect(
      read("../../../packages/studio-project-model/src/browser/opfs-journal-store.ts"),
    ).toContain('"toonspectrum-studio-projects"');
  });

  it("IndexedDB names match the library modules", () => {
    expect(read("./vrm-library.ts")).toContain('"toonspectrum-studio-vrm-library"');
    expect(read("./studio-crdt-outbox.ts")).toContain("toonspectrum-studio-crdt-outbox");
    expect(read("./studio-checkpoints.ts")).toContain("toonspectrum-studio-checkpoints");
    expect(read("./studio-crdt-recovery-vault.ts")).toContain(
      '"toonspectrum-studio-crdt-recovery-vault"',
    );
    expect(read("./bg3d-model-library.ts")).toContain(
      '"toonspectrum-studio-bg3d-model-library"',
    );
    expect(read("./studio-asset-library.ts")).toContain(
      '"toonspectrum-studio-asset-library"',
    );
    expect(read("./studio-scene-snapshot-library.ts")).toContain(
      '"toonspectrum-studio-scene-snapshot-library"',
    );
    expect(read("./bg3d-template-library.ts")).toContain(
      '"toonspectrum-studio-bg3d-template-library"',
    );
  });
});
