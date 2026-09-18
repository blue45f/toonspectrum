import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createEmptySyncJournal,
  desktopSyncRootFingerprint,
  loadSyncJournal,
  saveSyncJournal,
} from "./journal.js";
import { scanSyncFolder } from "./scanner.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "toonstudio-sync-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("desktop sync journal and scanner", () => {
  it("hashes supported files and ignores reserved or unknown paths", async () => {
    const directory = await root();
    await writeFile(join(directory, "page.psd"), "page");
    await writeFile(join(directory, "notes.txt"), "notes");
    const snapshots = await scanSyncFolder(directory);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ relativePath: "page.psd", size: 4 });
    expect(snapshots[0]!.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("writes the journal atomically and reloads only the bound root", async () => {
    const directory = await root();
    const fingerprint = await desktopSyncRootFingerprint(directory);
    const journal = {
      ...createEmptySyncJournal(fingerprint, "2026-09-17T00:00:00.000Z"),
      entries: {
        "page.psd": {
          relativePath: "page.psd",
          localSha256: "a".repeat(64),
          remoteSha256: "a".repeat(64),
          remoteVersion: "v1",
          syncedAt: "2026-09-17T00:00:00.000Z",
        },
      },
    };
    await saveSyncJournal(directory, journal);
    await expect(loadSyncJournal(directory)).resolves.toEqual(journal);
    const raw = await readFile(join(directory, ".toonstudio", "sync-journal.json"), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 1, rootFingerprint: fingerprint });
  });

  it("returns an empty journal before the first sync", async () => {
    const directory = await root();
    await expect(loadSyncJournal(directory)).resolves.toMatchObject({
      schemaVersion: 1,
      entries: {},
    });
  });
});
