import type { JournalStore } from "../command/journal-store";
import type { JournalEntryIR, SnapshotIR } from "../ir/journal";

/**
 * Fault-injection wrapper for any JournalStore (V11 Phase 7 harness).
 *
 * Simulated failure classes:
 * - append-reject: storage refuses the write; nothing persists.
 * - append-torn: storage persists a corrupted entry (flipped CRC) and then
 *   reports failure — models a crash mid-append that left bytes behind.
 * - snapshot-reject: snapshot write fails for a given slot.
 * - snapshot-corrupt: snapshot write "succeeds" but persists garbage — models
 *   a torn snapshot that only recovery-time CRC/digest checks can catch.
 */

export interface JournalFaultPlan {
  /** Reject append of the entry with this seq (nothing persisted). */
  rejectAppendAtSeq?: number;
  /** Persist a CRC-corrupted copy of this seq's entry, then throw. */
  tearAppendAtSeq?: number;
  /** Reject writeSnapshot calls targeting this slot. */
  rejectSnapshotSlot?: SnapshotIR["slot"];
  /** Silently corrupt snapshot writes targeting this slot. */
  corruptSnapshotSlot?: SnapshotIR["slot"];
}

export class InjectedStorageFault extends Error {
  constructor(operation: string) {
    super(`injected storage fault: ${operation}`);
    this.name = "InjectedStorageFault";
  }
}

export class FaultInjectingJournalStore implements JournalStore {
  readonly faultsFired: string[] = [];

  constructor(
    private readonly inner: JournalStore,
    private readonly plan: JournalFaultPlan,
  ) {}

  /** Each planned fault fires once — models transient storage failures so a
   *  retry of the same seq can succeed, which is itself part of the contract
   *  under test. */
  private fireOnce(key: string): boolean {
    if (this.faultsFired.includes(key)) return false;
    this.faultsFired.push(key);
    return true;
  }

  async append(entry: JournalEntryIR): Promise<void> {
    if (
      this.plan.rejectAppendAtSeq === entry.seq &&
      this.fireOnce(`append-reject@${entry.seq}`)
    ) {
      throw new InjectedStorageFault(`append seq ${entry.seq}`);
    }
    if (
      this.plan.tearAppendAtSeq === entry.seq &&
      this.fireOnce(`append-torn@${entry.seq}`)
    ) {
      await this.inner.append({ ...entry, crc: (entry.crc ^ 0xdeadbeef) >>> 0 });
      throw new InjectedStorageFault(`torn append seq ${entry.seq}`);
    }
    await this.inner.append(entry);
  }

  readEntries(): Promise<JournalEntryIR[]> {
    return this.inner.readEntries();
  }

  async writeSnapshot(snapshot: SnapshotIR): Promise<void> {
    if (this.plan.rejectSnapshotSlot === snapshot.slot) {
      this.faultsFired.push(`snapshot-reject@${snapshot.slot}`);
      throw new InjectedStorageFault(`snapshot slot ${snapshot.slot}`);
    }
    if (this.plan.corruptSnapshotSlot === snapshot.slot) {
      this.faultsFired.push(`snapshot-corrupt@${snapshot.slot}`);
      await this.inner.writeSnapshot({
        ...snapshot,
        digest: "0000000000000000",
      });
      return;
    }
    await this.inner.writeSnapshot(snapshot);
  }

  readSnapshots(): Promise<SnapshotIR[]> {
    return this.inner.readSnapshots();
  }
}
