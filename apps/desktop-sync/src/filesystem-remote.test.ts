import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileSystemDesktopSyncRemote,
  FileSystemDesktopSyncRemoteError,
} from "./filesystem-remote.js";
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

describe("filesystem desktop sync remote", () => {
  it("syncs supported files in both directions and persists a stable journal", async () => {
    const local = await temporaryRoot("toonstudio-sync-local");
    const remoteRoot = await temporaryRoot("toonstudio-sync-remote");
    await writeFile(join(local, "local.psd"), "local artwork");
    await writeFile(join(remoteRoot, "remote.clip"), "remote artwork");

    const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
    await expect(remote.assertDistinctFrom(local)).resolves.toBeUndefined();

    const first = await runDesktopSyncCycle(local, remote, {
      now: "2026-09-17T00:00:00.000Z",
    });
    expect(first.counts).toMatchObject({ upload: 1, download: 1, conflict: 0 });
    expect(first.execution).toMatchObject({ uploaded: 1, downloaded: 1 });
    await expect(readFile(join(remoteRoot, "local.psd"), "utf8")).resolves.toBe(
      "local artwork",
    );
    await expect(readFile(join(local, "remote.clip"), "utf8")).resolves.toBe(
      "remote artwork",
    );

    const second = await runDesktopSyncCycle(local, remote, {
      now: "2026-09-17T00:01:00.000Z",
    });
    expect(second.counts).toMatchObject({ record: 2, conflict: 0 });
    expect(second.execution).toMatchObject({ recorded: 2 });
  });

  it("uses remote versions as compare-and-swap guards", async () => {
    const remoteRoot = await temporaryRoot("toonstudio-sync-version");
    await writeFile(join(remoteRoot, "page.psd"), "version one");
    const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
    const [snapshot] = await remote.listRemoteFiles();
    expect(snapshot).toBeDefined();

    await writeFile(join(remoteRoot, "page.psd"), "version two");
    await expect(remote.downloadFile({
      remote: snapshot!,
      temporaryAbsolutePath: join(remoteRoot, "download.tmp"),
    })).rejects.toMatchObject({ code: "version-conflict" });

    await expect(remote.deleteRemoteFile({
      remote: snapshot!,
      expectedRemoteVersion: snapshot!.version,
    })).rejects.toMatchObject({ code: "version-conflict" });
  });

  it("refuses changed upload bytes and identical roots", async () => {
    const root = await temporaryRoot("toonstudio-sync-same-root");
    const source = await temporaryRoot("toonstudio-sync-source");
    const remote = await FileSystemDesktopSyncRemote.create(root);
    await expect(remote.assertDistinctFrom(root)).rejects.toBeInstanceOf(
      FileSystemDesktopSyncRemoteError,
    );

    const sourcePath = join(source, "page.psd");
    await writeFile(sourcePath, "changed after scan");
    await expect(remote.uploadFile({
      relativePath: "page.psd",
      absolutePath: sourcePath,
      sha256: sha256("original"),
      size: "original".length,
      expectedRemoteVersion: null,
    })).rejects.toMatchObject({ code: "hash-mismatch" });
  });

  it.runIf(process.platform !== "win32")(
    "rejects a symlinked remote parent that escapes the configured root",
    async () => {
      const remoteRoot = await temporaryRoot("toonstudio-sync-safe-root");
      const outside = await temporaryRoot("toonstudio-sync-outside");
      const source = await temporaryRoot("toonstudio-sync-symlink-source");
      await symlink(outside, join(remoteRoot, "escaped"));
      const sourcePath = join(source, "page.psd");
      await writeFile(sourcePath, "page");
      const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);

      await expect(remote.uploadFile({
        relativePath: "escaped/page.psd",
        absolutePath: sourcePath,
        sha256: sha256("page"),
        size: 4,
        expectedRemoteVersion: null,
      })).rejects.toMatchObject({ code: "unsafe-parent" });
      await expect(readFile(join(outside, "page.psd"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );
});
