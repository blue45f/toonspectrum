import { journalEntryIRSchema, snapshotIRSchema } from "../ir/journal";

import type { JournalStore } from "../command/journal-store";
import type { JournalEntryIR, SnapshotIR } from "../ir/journal";

/**
 * OPFS-backed JournalStore (browser, V11 §10.5).
 *
 * Layout: <root>/toonspectrum-studio-projects/<projectId>/journal.jsonl + snapshot-{a,b}.json.
 * Appends are serialized through a single promise chain — OPFS writable
 * streams do not support concurrent writers, and command order must match
 * journal order for recovery to reason about gaps.
 */

export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

export class OpfsJournalStore implements JournalStore {
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(private readonly dir: FileSystemDirectoryHandle) {}

  static async open(projectId: string): Promise<OpfsJournalStore> {
    if (!isOpfsAvailable()) {
      throw new Error("OPFS is not available in this environment");
    }
    const root = await navigator.storage.getDirectory();
    const app = await root.getDirectoryHandle("toonspectrum-studio-projects", { create: true });
    const project = await app.getDirectoryHandle(projectId, { create: true });
    return new OpfsJournalStore(project);
  }

  append(entry: JournalEntryIR): Promise<void> {
    const task = this.writeChain.then(async () => {
      const handle = await this.dir.getFileHandle("journal.jsonl", { create: true });
      const file = await handle.getFile();
      const writable = await handle.createWritable({ keepExistingData: true });
      try {
        await writable.seek(file.size);
        await writable.write(`${JSON.stringify(entry)}\n`);
      } finally {
        await writable.close();
      }
    });
    // Keep the chain alive even if one append rejects; the caller still sees
    // the rejection through `task`.
    this.writeChain = task.catch(() => undefined);
    return task;
  }

  async readEntries(): Promise<JournalEntryIR[]> {
    let text: string;
    try {
      const handle = await this.dir.getFileHandle("journal.jsonl");
      text = await (await handle.getFile()).text();
    } catch {
      return [];
    }
    const entries: JournalEntryIR[] = [];
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        const parsed = journalEntryIRSchema.safeParse(JSON.parse(line));
        if (parsed.success) entries.push(parsed.data);
      } catch {
        // Torn tail line — treated as absent, recovery replays the prefix.
      }
    }
    return entries;
  }

  writeSnapshot(snapshot: SnapshotIR): Promise<void> {
    const task = this.writeChain.then(async () => {
      const name = `snapshot-${snapshot.slot.toLowerCase()}.json`;
      const handle = await this.dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(JSON.stringify(snapshot));
      } finally {
        await writable.close();
      }
    });
    this.writeChain = task.catch(() => undefined);
    return task;
  }

  async readSnapshots(): Promise<SnapshotIR[]> {
    const snapshots: SnapshotIR[] = [];
    for (const slot of ["a", "b"]) {
      try {
        const handle = await this.dir.getFileHandle(`snapshot-${slot}.json`);
        const raw = await (await handle.getFile()).text();
        const parsed = snapshotIRSchema.safeParse(JSON.parse(raw));
        if (parsed.success) snapshots.push(parsed.data);
      } catch {
        // Missing/corrupt slot: two-slot scheme falls back to the sibling.
      }
    }
    return snapshots;
  }
}
