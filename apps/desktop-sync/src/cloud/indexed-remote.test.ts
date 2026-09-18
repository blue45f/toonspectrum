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
  DESKTOP_CLOUD_INDEX_PATH,
  IndexedCloudDesktopSyncRemote,
} from "./indexed-remote.js";
import {
  DesktopCloudError,
  type DesktopCloudObject,
  type DesktopCloudProvider,
} from "./types.js";

const roots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-cloud-index-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
interface StoredFile {
  readonly object: DesktopCloudObject;
  readonly bytes: Uint8Array;
}

class MemoryCloudProvider implements DesktopCloudProvider {
  readonly id = "dropbox" as const;
  readonly rootLabel = "/ToonStudio/Sync";
  readonly files = new Map<string, StoredFile>();
  downloads = 0;
  failNextIndexUpload = false;
  private sequence = 0;

  seed(relativePath: string, body: string): void {
    const bytes = new TextEncoder().encode(body);
    this.sequence += 1;
    this.files.set(relativePath, {
      object: {
        id: `id-${this.sequence}`,
        relativePath,
        size: bytes.byteLength,
        version: `v${this.sequence}`,
        modifiedAt: `2026-09-17T00:00:${String(this.sequence).padStart(2, "0")}.000Z`,
      },
      bytes,
    });
  }

  async listFiles(): Promise<readonly DesktopCloudObject[]> {
    return [...this.files.values()].map((file) => ({ ...file.object }));
  }

  async downloadFile(file: DesktopCloudObject): Promise<Uint8Array> {
    this.downloads += 1;
    const stored = this.files.get(file.relativePath);
    if (!stored || stored.object.version !== file.version) {
      throw new DesktopCloudError(this.id, "version-conflict", "stale download");
    }
    return stored.bytes.slice();
  }
  async uploadFile(input: {
    readonly relativePath: string;
    readonly bytes: Uint8Array;
    readonly expected: DesktopCloudObject | null;
  }): Promise<DesktopCloudObject> {
    if (
      input.relativePath === DESKTOP_CLOUD_INDEX_PATH
      && this.failNextIndexUpload
    ) {
      this.failNextIndexUpload = false;
      throw new DesktopCloudError(this.id, "version-conflict", "index race");
    }
    const current = this.files.get(input.relativePath) ?? null;
    if (
      (input.expected === null && current !== null)
      || (
        input.expected !== null
        && (
          current === null
          || current.object.id !== input.expected.id
          || current.object.version !== input.expected.version
        )
      )
    ) {
      throw new DesktopCloudError(this.id, "version-conflict", "stale upload");
    }
    this.sequence += 1;
    const object: DesktopCloudObject = {
      id: current?.object.id ?? `id-${this.sequence}`,
      relativePath: input.relativePath,
      size: input.bytes.byteLength,
      version: `v${this.sequence}`,
      modifiedAt: `2026-09-17T00:01:${String(this.sequence).padStart(2, "0")}.000Z`,
    };
    this.files.set(input.relativePath, {
      object,
      bytes: input.bytes.slice(),
    });
    return { ...object };
  }

  async deleteFile(input: {
    readonly file: DesktopCloudObject;
    readonly expectedVersion: string;
  }): Promise<void> {
    const current = this.files.get(input.file.relativePath);
    if (
      !current
      || current.object.id !== input.file.id
      || current.object.version !== input.expectedVersion
    ) {
      throw new DesktopCloudError(this.id, "version-conflict", "stale delete");
    }
    this.files.delete(input.file.relativePath);
  }
}
describe("indexed cloud desktop sync remote", () => {
  it("builds and reuses a SHA-256 sidecar index", async () => {
    const provider = new MemoryCloudProvider();
    provider.seed("episode.psd", "artwork");
    const remote = new IndexedCloudDesktopSyncRemote(provider);

    const first = await remote.listRemoteFiles();
    expect(first).toEqual([
      expect.objectContaining({
        relativePath: "episode.psd",
        sha256: sha256("artwork"),
        size: 7,
      }),
    ]);
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(false);
    expect(provider.downloads).toBe(1);
    await remote.commitMetadata();
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(true);

    const second = await remote.listRemoteFiles();
    expect(second).toEqual(first);
    expect(provider.downloads).toBe(2);
  });

  it("uploads, downloads and deletes through versioned provider objects", async () => {
    const provider = new MemoryCloudProvider();
    const remote = new IndexedCloudDesktopSyncRemote(provider);
    const root = await temporaryRoot();
    const source = join(root, "new.clip");
    const destination = join(root, "download.tmp");
    await writeFile(source, "clip body");

    const uploaded = await remote.uploadFile({
      relativePath: "scenes/new.clip",
      absolutePath: source,
      sha256: sha256("clip body"),
      size: 9,
      expectedRemoteVersion: null,
    });
    expect(uploaded).toMatchObject({
      relativePath: "scenes/new.clip",
      sha256: sha256("clip body"),
      size: 9,
    });

    await remote.downloadFile({
      remote: uploaded,
      temporaryAbsolutePath: destination,
    });
    await expect(readFile(destination, "utf8")).resolves.toBe("clip body");

    await remote.deleteRemoteFile({
      remote: uploaded,
      expectedRemoteVersion: uploaded.version,
    });
    expect(provider.files.has("scenes/new.clip")).toBe(false);
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(false);
    await remote.commitMetadata();
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(true);
  });
  it("retries a sidecar index compare-and-swap conflict", async () => {
    const provider = new MemoryCloudProvider();
    provider.seed("page.psd", "page");
    provider.failNextIndexUpload = true;
    const remote = new IndexedCloudDesktopSyncRemote(provider);

    await expect(remote.listRemoteFiles()).resolves.toHaveLength(1);
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(false);
    await remote.commitMetadata();
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(true);
  });

  it("refuses to commit a digest for a cloud object that changed after listing", async () => {
    const provider = new MemoryCloudProvider();
    provider.seed("page.psd", "page one");
    const remote = new IndexedCloudDesktopSyncRemote(provider);

    await expect(remote.listRemoteFiles()).resolves.toHaveLength(1);
    provider.seed("page.psd", "page two");

    await expect(remote.commitMetadata()).rejects.toMatchObject({
      code: "version-conflict",
    });
    expect(provider.files.has(DESKTOP_CLOUD_INDEX_PATH)).toBe(false);
  });

  it("rejects stale opaque version tokens before destructive actions", async () => {
    const provider = new MemoryCloudProvider();
    provider.seed("page.psd", "page one");
    const remote = new IndexedCloudDesktopSyncRemote(provider);
    const [snapshot] = await remote.listRemoteFiles();
    expect(snapshot).toBeDefined();

    provider.seed("page.psd", "page two");
    await expect(remote.deleteRemoteFile({
      remote: snapshot!,
      expectedRemoteVersion: snapshot!.version,
    })).rejects.toMatchObject({ code: "version-conflict" });
    expect(provider.files.has("page.psd")).toBe(true);
  });
});
