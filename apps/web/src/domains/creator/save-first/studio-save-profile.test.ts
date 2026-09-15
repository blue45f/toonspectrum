import { describe, expect, it } from "vitest";

import {
  createDefaultStudioSaveProfile,
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  readStudioSaveProfiles,
  recordStudioExport,
  recordStudioPublication,
  studioSaveSafetySummary,
  upsertStudioStorageBinding,
  type StudioSaveProfileStorage,
} from "./studio-save-profile";

class MemoryStorage implements StudioSaveProfileStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("studio save profile", () => {
  it("starts private, local and unpublished", () => {
    const profile = createDefaultStudioSaveProfile("project-1", {
      now: "2026-09-15T00:00:00.000Z",
    });

    expect(profile.accessMode).toBe("owner-only");
    expect(profile.storageMode).toBe("browser-local");
    expect(profile.distributionState).toBe("none");
    expect(studioSaveSafetySummary(profile)).toMatchObject({
      browserOnly: true,
      hasRemoteBackup: false,
      needsBackup: true,
    });
  });

  it("does not call a selected but disconnected drive a backup", () => {
    const storage = new MemoryStorage();
    ensureStudioSaveProfile(storage, "project-1", { now: "2026-09-15T00:00:00.000Z" });
    const pending = upsertStudioStorageBinding(storage, "project-1", {
      provider: "google-drive",
      role: "canonical",
    }, { now: "2026-09-15T00:01:00.000Z" });

    expect(studioSaveSafetySummary(pending)).toMatchObject({
      hasRemoteBackup: false,
      hasPendingConnection: true,
      headline: "저장소 연결 필요",
    });

    const synced = markStudioStorageBindingSynced(
      storage,
      "project-1",
      "google-drive:canonical",
      { remotePath: "ToonStudio/project-1.toonstudio", revision: 3 },
      { now: "2026-09-15T00:02:00.000Z" },
    );
    expect(studioSaveSafetySummary(synced)).toMatchObject({
      hasRemoteBackup: true,
      needsBackup: false,
      headline: "원격 백업 완료",
    });
  });

  it("keeps export separate from publication", () => {
    const storage = new MemoryStorage();
    ensureStudioSaveProfile(storage, "project-1", { now: "2026-09-15T00:00:00.000Z" });
    const exported = recordStudioExport(storage, "project-1", {
      now: "2026-09-15T01:00:00.000Z",
    });

    expect(exported.distributionState).toBe("exported");
    expect(exported.accessMode).toBe("owner-only");

    const published = recordStudioPublication(storage, "project-1", true, {
      now: "2026-09-15T02:00:00.000Z",
    });
    expect(published.distributionState).toBe("published");
    expect(published.accessMode).toBe("public");

    const privateAgain = recordStudioPublication(storage, "project-1", false, {
      now: "2026-09-15T03:00:00.000Z",
    });
    expect(privateAgain.accessMode).toBe("owner-only");
    expect(privateAgain.distributionState).toBe("exported");
  });

  it("drops unsafe remote links from persisted storage metadata", () => {
    const storage = new MemoryStorage();
    ensureStudioSaveProfile(storage, "project-1", {
      now: "2026-09-15T00:00:00.000Z",
    });
    const profile = upsertStudioStorageBinding(storage, "project-1", {
      provider: "google-drive",
      role: "backup",
      connectionRequired: false,
      syncState: "synced",
      lastSyncedAt: "2026-09-15T00:01:00.000Z",
      webUrl: "javascript:alert(1)",
    }, { now: "2026-09-15T00:01:00.000Z" });

    expect(profile.bindings.find((binding) => binding.provider === "google-drive")?.webUrl)
      .toBeNull();
  });

  it("recovers safely from malformed persisted data", () => {
    const storage = new MemoryStorage();
    storage.setItem("toonstudio.save-profiles.v1", "{broken");
    expect(readStudioSaveProfiles(storage).profiles).toEqual({});
  });
});
