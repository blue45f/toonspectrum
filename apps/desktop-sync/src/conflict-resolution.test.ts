import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyDesktopSyncConflictDecisions,
  buildDesktopSyncConflictReport,
  DesktopSyncConflictResolutionError,
  readDesktopSyncConflictReceipt,
} from "./conflict-resolution.js";
import { FileSystemDesktopSyncRemote } from "./filesystem-remote.js";
import { runDesktopSyncCycle } from "./runtime.js";

const roots: string[] = [];

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function independentConflict() {
  const local = await temporaryRoot("toonstudio-conflict-local");
  const remoteRoot = await temporaryRoot("toonstudio-conflict-remote");
  await writeFile(join(local, "page.psd"), "local artwork");
  await writeFile(join(remoteRoot, "page.psd"), "remote artwork");
  const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
  const report = await buildDesktopSyncConflictReport(local, remote, {
    remoteLabel: remoteRoot,
    createdAt: "2026-09-17T00:00:00.000Z",
  });
  return { local, remoteRoot, remote, report };
}

describe("desktop sync conflict resolution", () => {
  it("builds a content-only report and rejects stale decisions", async () => {
    const fixture = await independentConflict();
    expect(fixture.report.conflicts).toHaveLength(1);
    expect(fixture.report.conflicts[0]).toMatchObject({
      relativePath: "page.psd",
      reason: "independent-files",
      local: { sha256: sha256("local artwork") },
      remote: { sha256: sha256("remote artwork") },
    });
    expect(JSON.stringify(fixture.report)).not.toContain(fixture.local);

    await writeFile(join(fixture.local, "page.psd"), "changed after report");
    await expect(applyDesktopSyncConflictDecisions(
      fixture.local,
      fixture.remote,
      fixture.report,
      [{
        conflictId: fixture.report.conflicts[0]!.id,
        resolution: "use-local",
      }],
      { remoteLabel: fixture.remoteRoot },
    )).rejects.toMatchObject({ code: "stale-report" });
  });

  it("uses local as primary, backs up remote, and writes a checksum receipt", async () => {
    const fixture = await independentConflict();
    const result = await applyDesktopSyncConflictDecisions(
      fixture.local,
      fixture.remote,
      fixture.report,
      [{
        conflictId: fixture.report.conflicts[0]!.id,
        resolution: "use-local",
      }],
      {
        remoteLabel: fixture.remoteRoot,
        sessionId: "session-use-local",
        now: "2026-09-17T00:01:00.000Z",
      },
    );

    await expect(readFile(join(fixture.remoteRoot, "page.psd"), "utf8"))
      .resolves.toBe("local artwork");
    const backup = result.receipt.decisions[0]!.backups[0]!;
    await expect(readFile(join(fixture.local, backup.backupPath), "utf8"))
      .resolves.toBe("remote artwork");
    await expect(readDesktopSyncConflictReceipt(result.receiptPath))
      .resolves.toMatchObject({ receiptSha256: result.receipt.receiptSha256 });
    expect(result.finalCycle.counts.conflict).toBe(0);
  });

  it("keeps both versions with the remote file primary", async () => {
    const fixture = await independentConflict();
    const result = await applyDesktopSyncConflictDecisions(
      fixture.local,
      fixture.remote,
      fixture.report,
      [{
        conflictId: fixture.report.conflicts[0]!.id,
        resolution: "keep-both-remote-primary",
      }],
      {
        remoteLabel: fixture.remoteRoot,
        sessionId: "session-keep-both",
      },
    );
    const sidecarPath = result.receipt.decisions[0]!.sidecarPath!;
    expect(sidecarPath).toMatch(/page\.conflict-local-[a-f0-9]{8}\.psd/u);
    await expect(readFile(join(fixture.local, "page.psd"), "utf8"))
      .resolves.toBe("remote artwork");
    await expect(readFile(join(fixture.local, sidecarPath), "utf8"))
      .resolves.toBe("local artwork");
    await expect(readFile(join(fixture.remoteRoot, sidecarPath), "utf8"))
      .resolves.toBe("local artwork");
  });

  it("resolves a remote-deleted/local-modified conflict without losing the local backup", async () => {
    const local = await temporaryRoot("toonstudio-delete-local");
    const remoteRoot = await temporaryRoot("toonstudio-delete-remote");
    await writeFile(join(local, "page.psd"), "base");
    const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
    await runDesktopSyncCycle(local, remote, {
      now: "2026-09-17T00:00:00.000Z",
    });
    await writeFile(join(local, "page.psd"), "local changed");
    await rm(join(remoteRoot, "page.psd"));
    const report = await buildDesktopSyncConflictReport(local, remote, {
      remoteLabel: remoteRoot,
    });
    expect(report.conflicts[0]).toMatchObject({
      reason: "remote-deleted-local-modified",
      allowedResolutions: ["use-local", "use-remote"],
    });

    const result = await applyDesktopSyncConflictDecisions(
      local,
      remote,
      report,
      [{
        conflictId: report.conflicts[0]!.id,
        resolution: "use-remote",
      }],
      { remoteLabel: remoteRoot, sessionId: "session-accept-delete" },
    );
    await expect(readFile(join(local, "page.psd"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    const backup = result.receipt.decisions[0]!.backups[0]!;
    await expect(readFile(join(local, backup.backupPath), "utf8"))
      .resolves.toBe("local changed");
  });

  it("requires exactly one supported decision per conflict", async () => {
    const fixture = await independentConflict();
    await expect(applyDesktopSyncConflictDecisions(
      fixture.local,
      fixture.remote,
      fixture.report,
      [],
      { remoteLabel: fixture.remoteRoot },
    )).rejects.toBeInstanceOf(DesktopSyncConflictResolutionError);
  });
});
