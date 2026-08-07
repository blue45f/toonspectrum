import { canonicalJson, crc32, sceneDigest } from "../ir/digest";

import { applyCommand } from "./reducer";

import type { JournalStore } from "./journal-store";
import type { JournalEntryIR, SnapshotIR } from "../ir/journal";
import type { SceneIR } from "../ir/scene";

/**
 * Crash recovery (V11 §10.5 vertical slice).
 *
 * Strategy: pick the newest snapshot whose CRC and scene digest both verify
 * (two-slot A/B scheme guarantees at most one slot is mid-write at crash
 * time), then replay the CRC-valid, gap-free journal suffix. The first invalid
 * entry truncates the tail — a torn append never poisons earlier history.
 */

export interface RecoveryReport {
  snapshotSlotUsed: SnapshotIR["slot"] | null;
  snapshotSeq: number;
  replayedEntries: number;
  truncatedFromSeq: number | null;
  droppedEntries: number;
  issues: string[];
}

export interface RecoveredProject {
  scene: SceneIR | null;
  seq: number;
  report: RecoveryReport;
}

export function entryCrc(entry: Omit<JournalEntryIR, "crc">): number {
  return crc32(
    canonicalJson({ seq: entry.seq, tMs: entry.tMs, command: entry.command }),
  );
}

export function snapshotCrc(snapshot: Omit<SnapshotIR, "crc">): number {
  return crc32(
    canonicalJson({
      slot: snapshot.slot,
      seq: snapshot.seq,
      digest: snapshot.digest,
      scene: snapshot.scene,
    }),
  );
}

function isSnapshotValid(snapshot: SnapshotIR, issues: string[]): boolean {
  const { crc, ...body } = snapshot;
  if (snapshotCrc(body) !== crc) {
    issues.push(`snapshot slot ${snapshot.slot}: crc mismatch`);
    return false;
  }
  if (sceneDigest(snapshot.scene) !== snapshot.digest) {
    issues.push(`snapshot slot ${snapshot.slot}: scene digest mismatch`);
    return false;
  }
  return true;
}

export async function recoverProject(store: JournalStore): Promise<RecoveredProject> {
  const issues: string[] = [];
  const snapshots = await store.readSnapshots();
  const validSnapshots = snapshots
    .filter((snapshot) => isSnapshotValid(snapshot, issues))
    .sort((a, b) => a.seq - b.seq);
  const anchor = validSnapshots.at(-1) ?? null;

  let scene: SceneIR | null = anchor ? anchor.scene : null;
  let seq = anchor ? anchor.seq : 0;

  const entries = await store.readEntries();
  const replayable = entries
    .filter((entry) => entry.seq > seq)
    .sort((a, b) => a.seq - b.seq);

  let replayed = 0;
  let truncatedFromSeq: number | null = null;

  for (const entry of replayable) {
    if (entry.seq !== seq + 1) {
      truncatedFromSeq = entry.seq;
      issues.push(`journal gap: expected seq ${seq + 1}, found ${entry.seq}`);
      break;
    }
    const { crc, ...body } = entry;
    if (entryCrc(body) !== crc) {
      truncatedFromSeq = entry.seq;
      issues.push(`journal entry ${entry.seq}: crc mismatch, tail truncated`);
      break;
    }
    try {
      scene = applyCommand(scene, entry.command);
    } catch (error) {
      truncatedFromSeq = entry.seq;
      issues.push(
        `journal entry ${entry.seq}: apply failed (${(error as Error).message}), tail truncated`,
      );
      break;
    }
    seq = entry.seq;
    replayed += 1;
  }

  const droppedEntries =
    truncatedFromSeq === null ? 0 : replayable.filter((e) => e.seq >= truncatedFromSeq).length;

  return {
    scene,
    seq,
    report: {
      snapshotSlotUsed: anchor?.slot ?? null,
      snapshotSeq: anchor?.seq ?? 0,
      replayedEntries: replayed,
      truncatedFromSeq,
      droppedEntries,
      issues,
    },
  };
}
