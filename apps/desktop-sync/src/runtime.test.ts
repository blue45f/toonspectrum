import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopSyncJournalPath } from "./journal.js";
import { runDesktopSyncCycle } from "./runtime.js";

import type { DesktopSyncRemote } from "./runtime.js";

const roots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-runtime-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function remote(overrides: Partial<DesktopSyncRemote> = {}): DesktopSyncRemote {
  return {
    listRemoteFiles: vi.fn(async () => []),
    uploadFile: vi.fn(async (input) => ({
      relativePath: input.relativePath,
      sha256: input.sha256,
      size: input.size,
      version: "remote-v1",
    })),
    downloadFile: vi.fn(async () => undefined),
    deleteRemoteFile: vi.fn(async () => undefined),
    commitMetadata: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("desktop sync cycle metadata boundary", () => {
  it("does not commit remote metadata when the plan contains a conflict", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "page.psd"), "local");
    const commitMetadata = vi.fn(async () => undefined);
    const target = remote({
      listRemoteFiles: vi.fn(async () => [{
        relativePath: "page.psd",
        sha256: sha256("remote"),
        size: 6,
        version: "remote-v1",
      }]),
      commitMetadata,
    });
    const result = await runDesktopSyncCycle(root, target, {
      now: "2026-09-17T00:00:00.000Z",
    });

    expect(result.counts.conflict).toBe(1);
    expect(result.execution).toBeNull();
    expect(commitMetadata).not.toHaveBeenCalled();
    await expect(readFile(desktopSyncJournalPath(root), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("commits remote metadata before persisting the local journal", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "page.psd"), "local");
    const order: string[] = [];
    const target = remote({
      uploadFile: vi.fn(async (input) => {
        order.push("upload");
        return {
          relativePath: input.relativePath,
          sha256: input.sha256,
          size: input.size,
          version: "remote-v1",
        };
      }),
      commitMetadata: vi.fn(async () => {
        order.push("metadata");
        await expect(readFile(desktopSyncJournalPath(root), "utf8"))
          .rejects.toMatchObject({ code: "ENOENT" });
      }),
    });
    const result = await runDesktopSyncCycle(root, target, {
      now: "2026-09-17T00:01:00.000Z",
    });

    expect(result.execution).toMatchObject({ uploaded: 1 });
    expect(order).toEqual(["upload", "metadata"]);
    await expect(readFile(desktopSyncJournalPath(root), "utf8"))
      .resolves.toContain("remote-v1");
  });

  it("does not persist a journal when metadata commit fails", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "page.psd"), "local");
    const target = remote({
      commitMetadata: vi.fn(async () => {
        throw new Error("index commit failed");
      }),
    });

    await expect(runDesktopSyncCycle(root, target, {
      now: "2026-09-17T00:02:00.000Z",
    })).rejects.toThrow("index commit failed");
    await expect(readFile(desktopSyncJournalPath(root), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});

it("forgets a journal tombstone after both sides delete the same file", async () => {
  const root = await temporaryRoot();
  await writeFile(join(root, "page.psd"), "base");
  const target = remote();
  await runDesktopSyncCycle(root, target, {
    now: "2026-09-17T00:03:00.000Z",
  });
  await rm(join(root, "page.psd"));
  target.listRemoteFiles = vi.fn(async () => []);

  const result = await runDesktopSyncCycle(root, target, {
    now: "2026-09-17T00:04:00.000Z",
  });
  expect(result.counts.forget).toBe(1);
  expect(result.execution).toMatchObject({ forgotten: 1 });
  await expect(readFile(desktopSyncJournalPath(root), "utf8"))
    .resolves.not.toContain("page.psd");
});
