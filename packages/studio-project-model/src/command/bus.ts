import { sceneDigest } from "../ir/digest";
import { PROJECT_SNAPSHOT_VERSION } from "../ir/journal";
import { projectDigest } from "../ir/project-state";

import { entryCrc, recoverProject, snapshotCrc, type RecoveryReport } from "./recovery";
import { applyProjectCommand } from "./reducer";

import type { JournalStore } from "./journal-store";
import type { CommandIR, SnapshotSlot } from "../ir/journal";
import type { ProjectStateIR } from "../ir/project-state";
import type { SceneIR } from "../ir/scene";


/**
 * CommandBus — the single mutation entrypoint of a V11 project (V11 §2).
 *
 * DOM UI, canvas HUD, collaboration and scripting all dispatch CommandIR here;
 * nothing mutates SceneIR (or the comic/animation/effect graphs) directly.
 * Dispatch order: reduce (validating), then durably append, then notify.
 * Snapshots alternate between the A/B slots every `snapshotEvery` commands so
 * recovery always has a verified anchor.
 */

export interface CommandBusOptions {
  snapshotEvery?: number;
  now?: () => number;
}

export type CommandBusListener = (scene: SceneIR | null, seq: number) => void;

export class CommandBus {
  private state: ProjectStateIR | null;
  private seq: number;
  private nextSlot: SnapshotSlot;
  private readonly snapshotEvery: number;
  private readonly now: () => number;
  private readonly listeners = new Set<CommandBusListener>();
  private readonly startedAtSeq: number;
  private lastSnapshotError: unknown = null;

  private constructor(
    private readonly store: JournalStore,
    state: ProjectStateIR | null,
    seq: number,
    options: CommandBusOptions,
  ) {
    this.state = state;
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
    const bus = new CommandBus(store, recovered.project, recovered.seq, options);
    return { bus, recovery: recovered.report };
  }

  getScene(): SceneIR | null {
    return this.state?.scene ?? null;
  }

  /** Full project state (scene + comic/animation/effect graphs). */
  getProject(): ProjectStateIR | null {
    return this.state;
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
    const nextState = applyProjectCommand(this.state, command);
    const seq = this.seq + 1;
    const body = { seq, tMs: this.now(), command };
    await this.store.append({ ...body, crc: entryCrc(body) });
    this.state = nextState;
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
    for (const listener of this.listeners) listener(this.getScene(), this.seq);
    return nextState.scene;
  }

  /** Last automatic-snapshot failure since the most recent success, if any. */
  getLastSnapshotError(): unknown {
    return this.lastSnapshotError;
  }

  /** Forces a snapshot into the next A/B slot (also used on clean shutdown). */
  async writeSnapshot(): Promise<void> {
    if (this.state === null) return;
    const body = {
      slot: this.nextSlot,
      seq: this.seq,
      digest: sceneDigest(this.state.scene),
      scene: this.state.scene,
      version: PROJECT_SNAPSHOT_VERSION,
      projectDigest: projectDigest(this.state),
      comic: this.state.comic,
      animation: this.state.animation,
      effects: this.state.effects,
    };
    await this.store.writeSnapshot({ ...body, crc: snapshotCrc(body) });
    this.nextSlot = this.nextSlot === "A" ? "B" : "A";
  }
}
