import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DesktopSyncConflictError,
  executeDesktopSyncPlan,
} from "./agent.js";
import { createEmptySyncJournal } from "./journal.js";

import type { DesktopSyncTransport } from "./agent.js";
import type { SyncPlanItem } from "./planner.js";

const roots: string[] = [];
const NOW = "2026-09-17T00:00:00.000Z";

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "toonstudio-agent-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function transport(downloadBody = "remote"): DesktopSyncTransport & {
  uploadFile: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  deleteRemoteFile: ReturnType<typeof vi.fn>;
} {
  return {
    uploadFile: vi.fn(async (input) => ({
      relativePath: input.relativePath,
      sha256: input.sha256,
      size: input.size,
      version: "v2",
    })),
    downloadFile: vi.fn(async ({ temporaryAbsolutePath }) => {
      await writeFile(temporaryAbsolutePath, downloadBody);
    }),
    deleteRemoteFile: vi.fn(async () => undefined),
  };
}

describe("desktop sync executor", () => {
  it("refuses the entire destructive batch when any conflict exists", async () => {
    const directory = await root();
    const remote = transport();
    const plan: SyncPlanItem[] = [{
      relativePath: "page.psd",
      action: "conflict",
      local: null,
      remote: null,
      base: null,
      reason: "both-modified",
    }];
    await expect(executeDesktopSyncPlan(
      directory,
      plan,
      createEmptySyncJournal("f".repeat(64), NOW),
      remote,
      NOW,
    )).rejects.toBeInstanceOf(DesktopSyncConflictError);
    expect(remote.uploadFile).not.toHaveBeenCalled();
  });

  it("uploads and downloads with content-hash verification", async () => {
    const directory = await root();
    await writeFile(join(directory, "local.psd"), "local");
    const remote = transport("remote");
    const plan: SyncPlanItem[] = [
      {
        relativePath: "local.psd",
        action: "upload",
        local: {
          relativePath: "local.psd",
          sha256: sha("local"),
          size: 5,
          modifiedAtMs: 1,
        },
        remote: null,
        base: null,
        reason: "local-only",
      },
      {
        relativePath: "remote.clip",
        action: "download",
        local: null,
        remote: {
          relativePath: "remote.clip",
          sha256: sha("remote"),
          size: 6,
          version: "v1",
        },
        base: null,
        reason: "remote-only",
      },
    ];
    const result = await executeDesktopSyncPlan(
      directory,
      plan,
      createEmptySyncJournal("f".repeat(64), NOW),
      remote,
      NOW,
    );
    expect(result).toMatchObject({ uploaded: 1, downloaded: 1 });
    expect(await readFile(join(directory, "remote.clip"), "utf8")).toBe("remote");
    expect(result.journal.entries["local.psd"]).toMatchObject({
      localSha256: sha("local"),
      remoteVersion: "v2",
    });
    expect(result.journal.entries["remote.clip"]).toMatchObject({
      localSha256: sha("remote"),
      remoteVersion: "v1",
    });
  });

  it("moves remotely deleted files to recoverable local trash", async () => {
    const directory = await root();
    await writeFile(join(directory, "deleted.png"), "recover me");
    const remote = transport();
    const plan: SyncPlanItem[] = [{
      relativePath: "deleted.png",
      action: "delete-local",
      local: {
        relativePath: "deleted.png",
        sha256: sha("recover me"),
        size: 10,
        modifiedAtMs: 1,
      },
      remote: null,
      base: null,
      reason: "remote-deleted",
    }];
    const result = await executeDesktopSyncPlan(
      directory,
      plan,
      createEmptySyncJournal("f".repeat(64), NOW),
      remote,
      NOW,
    );
    expect(result.deletedLocal).toBe(1);
    await expect(readFile(join(directory, "deleted.png"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const trashPath = join(
      directory,
      ".toonstudio",
      "trash",
      "20260917000000000",
      "deleted.png",
    );
    await expect(readFile(trashPath, "utf8")).resolves.toBe("recover me");
  });
});
