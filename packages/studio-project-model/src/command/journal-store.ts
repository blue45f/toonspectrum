import type { JournalEntryIR, SnapshotIR } from "../ir/journal";

/**
 * Storage boundary for the append-only journal. Implementations:
 * - MemoryJournalStore (tests, ephemeral sessions)
 * - FileJournalStore (Node, `./node`)
 * - OpfsJournalStore (browser OPFS, `./browser`)
 *
 * Contract: `append` must be durable in call order; `readEntries` returns
 * whatever survived a crash, including a possibly torn tail that recovery
 * truncates. Stores never validate CRCs — that is recovery's job, so a corrupt
 * store still yields its salvageable prefix.
 */
export interface JournalStore {
  append(entry: JournalEntryIR): Promise<void>;
  readEntries(): Promise<JournalEntryIR[]>;
  writeSnapshot(snapshot: SnapshotIR): Promise<void>;
  readSnapshots(): Promise<SnapshotIR[]>;
  /** Drops entries covered by a snapshot; optional compaction hook. */
  compactBefore?(seq: number): Promise<void>;
}

export class MemoryJournalStore implements JournalStore {
  private entries: JournalEntryIR[] = [];
  private snapshots = new Map<string, SnapshotIR>();

  append(entry: JournalEntryIR): Promise<void> {
    this.entries.push(structuredClone(entry));
    return Promise.resolve();
  }

  readEntries(): Promise<JournalEntryIR[]> {
    return Promise.resolve(this.entries.map((entry) => structuredClone(entry)));
  }

  writeSnapshot(snapshot: SnapshotIR): Promise<void> {
    this.snapshots.set(snapshot.slot, structuredClone(snapshot));
    return Promise.resolve();
  }

  readSnapshots(): Promise<SnapshotIR[]> {
    return Promise.resolve(
      [...this.snapshots.values()].map((snapshot) => structuredClone(snapshot)),
    );
  }

  compactBefore(seq: number): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.seq >= seq);
    return Promise.resolve();
  }

  /** Test hook: simulate storage corruption of the entry at `index`. */
  corruptEntryAt(index: number, mutate: (entry: JournalEntryIR) => void): void {
    const entry = this.entries[index];
    if (entry) mutate(entry);
  }

  /** Test hook: simulate snapshot corruption. */
  corruptSnapshot(slot: string, mutate: (snapshot: SnapshotIR) => void): void {
    const snapshot = this.snapshots.get(slot);
    if (snapshot) mutate(snapshot);
  }
}
