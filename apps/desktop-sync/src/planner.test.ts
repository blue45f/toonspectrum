import { describe, expect, it } from "vitest";

import { createEmptySyncJournal } from "./journal.js";
import { buildDesktopSyncPlan, countSyncPlanActions } from "./planner.js";

const NOW = "2026-09-17T00:00:00.000Z";

function local(relativePath: string, sha256: string) {
  return { relativePath, sha256, size: 1, modifiedAtMs: 1 };
}

function remote(relativePath: string, sha256: string, version = "v1") {
  return { relativePath, sha256, size: 1, version };
}

function journalEntry(
  relativePath: string,
  localSha256: string | null,
  remoteSha256: string | null,
  remoteVersion = "v1",
) {
  return { relativePath, localSha256, remoteSha256, remoteVersion, syncedAt: NOW };
}

describe("desktop sync planner", () => {
  it("plans new local, new remote, and identical content without ambiguity", () => {
    const journal = createEmptySyncJournal("f".repeat(64), NOW);
    const plan = buildDesktopSyncPlan(
      [local("local.psd", "a"), local("same.png", "c")],
      [remote("remote.clip", "b"), remote("same.png", "c")],
      journal,
    );
    expect(plan.map(({ relativePath, action }) => ({ relativePath, action }))).toEqual([
      { relativePath: "local.psd", action: "upload" },
      { relativePath: "remote.clip", action: "download" },
      { relativePath: "same.png", action: "record" },
    ]);
    expect(countSyncPlanActions(plan)).toMatchObject({ upload: 1, download: 1, record: 1 });
  });

  it("blocks two-sided edits and edit-versus-delete races", () => {
    const journal = {
      ...createEmptySyncJournal("f".repeat(64), NOW),
      entries: {
        "both.psd": journalEntry("both.psd", "base", "base"),
        "remote-deleted.psd": journalEntry("remote-deleted.psd", "old", "old"),
        "local-deleted.psd": journalEntry("local-deleted.psd", "old", "old"),
      },
    };
    const plan = buildDesktopSyncPlan(
      [local("both.psd", "local-new"), local("remote-deleted.psd", "local-new")],
      [remote("both.psd", "remote-new", "v2"), remote("local-deleted.psd", "remote-new", "v2")],
      journal,
    );
    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "both.psd", action: "conflict", reason: "both-modified" }),
      expect.objectContaining({ relativePath: "remote-deleted.psd", action: "conflict" }),
      expect.objectContaining({ relativePath: "local-deleted.psd", action: "conflict" }),
    ]));
  });

  it("propagates unmodified deletions in the originating direction", () => {
    const journal = {
      ...createEmptySyncJournal("f".repeat(64), NOW),
      entries: {
        "remote-deleted.psd": journalEntry("remote-deleted.psd", "same", "same"),
        "local-deleted.psd": journalEntry("local-deleted.psd", "same", "same"),
      },
    };
    const plan = buildDesktopSyncPlan(
      [local("remote-deleted.psd", "same")],
      [remote("local-deleted.psd", "same")],
      journal,
    );
    expect(plan.map(({ action }) => action)).toEqual([
      "delete-remote",
      "delete-local",
    ]);
  });
});
