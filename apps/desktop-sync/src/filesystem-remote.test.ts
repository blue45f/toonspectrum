import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
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
import { scanSyncFolder } from "./scanner.js";

const roots: string[] = [];

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("filesystem desktop sync remote", () => {
  it("syncs supported files in both directions and rescans after journal creation", async () => {
    const local = await temporaryRoot("toonstudio-sync-local");
    const remoteRoot = await temporaryRoot("toonstudio-sync-remote");
    const largeArtwork = randomBytes(256 * 1024);
    await writeFile(join(local, "local.psd"), largeArtwork);
    await writeFile(join(remoteRoot, "remote.clip"), "remote artwork");

    const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
    const first = await runDesktopSyncCycle(local, remote, {
      now: "2026-09-17T00:00:00.000Z",
    });
    expect(first.counts).toMatchObject({ upload: 1, download: 1, conflict: 0 });
    expect(first.execution).toMatchObject({ uploaded: 1, downloaded: 1 });
    await expect(readFile(join(remoteRoot, "local.psd"))).resolves.toEqual(
      largeArtwork,
    );
    await expect(readFile(join(local, "remote.clip"), "utf8")).resolves.toBe(
      "remote artwork",
    );

    const second = await runDesktopSyncCycle(local, remote, {
      now: "2026-09-17T00:01:00.000Z",
    });
    expect(second.counts).toMatchObject({ record: 2, conflict: 0 });
    expect(second.execution).toMatchObject({ recorded: 2 });
  }, 20_000);

  it("skips reserved sync metadata before canonical path validation", async () => {
    const root = await temporaryRoot("toonstudio-sync-reserved");
    await mkdir(join(root, ".toonstudio", "trash"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".toonstudio", "journal.json"), "{}");
    await writeFile(join(root, ".git", "index"), "ignored");
    await writeFile(join(root, "page.psd"), "included");

    await expect(scanSyncFolder(root)).resolves.toMatchObject([
      { relativePath: "page.psd", sha256: sha256("included") },
    ]);
  });

  it("uses remote versions as compare-and-swap guards", async () => {
    const remoteRoot = await temporaryRoot("toonstudio-sync-version");
    const downloadRoot = await temporaryRoot("toonstudio-sync-download");
    await writeFile(join(remoteRoot, "page.psd"), "version one");
    const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
    const [snapshot] = await remote.listRemoteFiles();
    expect(snapshot).toBeDefined();

    await writeFile(join(remoteRoot, "page.psd"), "version two");
    await expect(remote.downloadFile({
      remote: snapshot!,
      temporaryAbsolutePath: join(downloadRoot, "download.tmp"),
    })).rejects.toMatchObject({ code: "version-conflict" });

    await expect(remote.deleteRemoteFile({
      remote: snapshot!,
      expectedRemoteVersion: snapshot!.version,
    })).rejects.toMatchObject({ code: "version-conflict" });
  });

  it("refuses changed upload bytes and automatically rejects identical roots", async () => {
    const root = await temporaryRoot("toonstudio-sync-same-root");
    const source = await temporaryRoot("toonstudio-sync-source");
    const remote = await FileSystemDesktopSyncRemote.create(root);
    await expect(runDesktopSyncCycle(root, remote)).rejects.toBeInstanceOf(
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

  it("rejects nested roots before recursive self-synchronization can start", async () => {
    const local = await temporaryRoot("toonstudio-sync-parent");
    const nestedRemoteRoot = join(local, "backup");
    await mkdir(nestedRemoteRoot);
    const nestedRemote = await FileSystemDesktopSyncRemote.create(nestedRemoteRoot);

    await expect(runDesktopSyncCycle(local, nestedRemote)).rejects.toMatchObject({
      code: "nested-root",
    });
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
