import { sceneDigest } from "../ir/digest";

import { entryCrc, recoverProject, snapshotCrc, type RecoveryReport } from "./recovery";
import { applyCommand } from "./reducer";

import type { JournalStore } from "./journal-store";
import type { CommandIR, SnapshotSlot } from "../ir/journal";
import type { SceneIR } from "../ir/scene";


/**
 * CommandBus — the single mutation entrypoint of a V11 project (V11 §2).
 *
 * DOM UI, canvas HUD, collaboration and scripting all dispatch CommandIR here;
 * nothing mutates SceneIR directly. Dispatch order: reduce (validating), then
 * durably append, then notify. Snapshots alternate between the A/B slots every
 * `snapshotEvery` commands so recovery always has a verified anchor.
 */

export interface CommandBusOptions {
  snapshotEvery?: number;
  now?: () => number;
}

export type CommandBusListener = (scene: SceneIR | null, seq: number) => void;

export class CommandBus {
  private scene: SceneIR | null;
  private seq: number;
  private nextSlot: SnapshotSlot;
  private readonly snapshotEvery: number;
  private readonly now: () => number;
  private readonly listeners = new Set<CommandBusListener>();
  private readonly startedAtSeq: number;
  private lastSnapshotError: unknown = null;

  private constructor(
    private readonly store: JournalStore,
    scene: SceneIR | null,
    seq: number,
    options: CommandBusOptions,
  ) {
    this.scene = scene;
    this.seq = seq;
    this.startedAtSeq = seq;
    this.snapshotEvery = options.snapshotEvery ?? 64;
    this.now = options.now ?? (() => Date.now());
    this.nextSlot = "A";
  }

  /** Opens a project over a journal store, running crash recovery first. */
  static async open(
    store: JournalStore,
    options: CommandBusOptions = {},
  ): Promise<{ bus: CommandBus; recovery: RecoveryReport }> {
    const recovered = await recoverProject(store);
    const bus = new CommandBus(store, recovered.scene, recovered.seq, options);
    return { bus, recovery: recovered.report };
  }

  getScene(): SceneIR | null {
    return this.scene;
  }

  getSeq(): number {
    return this.seq;
  }

  subscribe(listener: CommandBusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispatch(command: CommandIR): Promise<SceneIR> {
    // Reduce first: an invalid command must fail before it reaches storage.
    const nextScene = applyCommand(this.scene, command);
    const seq = this.seq + 1;
    const body = { seq, tMs: this.now(), command };
    await this.store.append({ ...body, crc: entryCrc(body) });
    this.scene = nextScene;
    this.seq = seq;
    if ((seq - this.startedAtSeq) % this.snapshotEvery === 0) {
      // Snapshots are a recovery accelerator, not a durability requirement —
      // the entry above is already appended, so an automatic snapshot failure
      // must not fail the dispatch. Recovery replays from the journal.
      try {
        await this.writeSnapshot();
        this.lastSnapshotError = null;
      } catch (error) {
        this.lastSnapshotError = error;
      }
    }
    for (const listener of this.listeners) listener(this.scene, this.seq);
    return nextScene;
  }

  /** Last automatic-snapshot failure since the most recent success, if any. */
  getLastSnapshotError(): unknown {
    return this.lastSnapshotError;
  }

  /** Forces a snapshot into the next A/B slot (also used on clean shutdown). */
  async writeSnapshot(): Promise<void> {
    if (this.scene === null) return;
    const body = {
      slot: this.nextSlot,
      seq: this.seq,
      digest: sceneDigest(this.scene),
      scene: this.scene,
    };
    await this.store.writeSnapshot({ ...body, crc: snapshotCrc(body) });
    this.nextSlot = this.nextSlot === "A" ? "B" : "A";
  }
}
