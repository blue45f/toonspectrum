import { canonicalJson, crc32, sceneDigest } from "../ir/digest";
import { projectDigest } from "../ir/project-state";

import { applyProjectCommand } from "./reducer";

import type { JournalStore } from "./journal-store";
import type { JournalEntryIR, SnapshotIR } from "../ir/journal";
import type { ProjectStateIR } from "../ir/project-state";
import type { SceneIR } from "../ir/scene";

/**
 * Crash recovery (V11 §10.5 vertical slice).
 *
 * Strategy: pick the newest snapshot whose CRC and digests all verify
 * (two-slot A/B scheme guarantees at most one slot is mid-write at crash
 * time), then replay the CRC-valid, gap-free journal suffix. The first invalid
 * entry truncates the tail — a torn append never poisons earlier history.
 *
 * Snapshot compatibility: v1 snapshots (scene only, no `version` field)
 * migrate by null-filling the comic/animation/effects layers; their CRC and
 * scene digest keep verifying byte-for-byte because both are computed over
 * exactly the fields present in the stored body.
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
  /** Full project state (scene + graphs); null before the first scene/init. */
  project: ProjectStateIR | null;
  seq: number;
  report: RecoveryReport;
}

export function entryCrc(entry: Omit<JournalEntryIR, "crc">): number {
  return crc32(
    canonicalJson({ seq: entry.seq, tMs: entry.tMs, command: entry.command }),
  );
}

export function snapshotCrc(snapshot: Omit<SnapshotIR, "crc">): number {
  // canonicalJson drops undefined keys, so a v1-shaped body (no version /
  // graph fields) hashes to exactly the pre-v2 value — old snapshot files
  // keep verifying against the CRC they were written with.
  return crc32(
    canonicalJson({
      slot: snapshot.slot,
      seq: snapshot.seq,
      digest: snapshot.digest,
      scene: snapshot.scene,
      version: snapshot.version,
      projectDigest: snapshot.projectDigest,
      comic: snapshot.comic,
      animation: snapshot.animation,
      effects: snapshot.effects,
    }),
  );
}

/** v1 → v2 snapshot migration: absent graph layers load as null. */
export function projectFromSnapshot(snapshot: SnapshotIR): ProjectStateIR {
  return {
    scene: snapshot.scene,
    comic: snapshot.comic ?? null,
    animation: snapshot.animation ?? null,
    effects: snapshot.effects ?? null,
  };
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
  if (
    snapshot.projectDigest !== undefined &&
    projectDigest(projectFromSnapshot(snapshot)) !== snapshot.projectDigest
  ) {
    issues.push(`snapshot slot ${snapshot.slot}: project digest mismatch`);
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

  let project: ProjectStateIR | null = anchor ? projectFromSnapshot(anchor) : null;
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
      project = applyProjectCommand(project, entry.command);
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
    scene: project?.scene ?? null,
    project,
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
