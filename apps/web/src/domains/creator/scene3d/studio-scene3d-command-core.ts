import { sha256HexPortable } from "../studio-sha256";

export const STUDIO_SCENE3D_COMMAND_CORE_REVISION = 1 as const;
export const STUDIO_SCENE3D_COMMAND_DEFAULT_MAX_ENTRIES = 120;
export const STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS = 512;

export type StudioScene3dCommandSource =
  | "canvas"
  | "inspector"
  | "keyboard"
  | "menu"
  | "palette"
  | "restore"
  | "system"
  | "test"
  | "worker";

export interface StudioScene3dStateCommand<State> {
  readonly id: string;
  readonly label: string;
  readonly source?: StudioScene3dCommandSource;
  readonly apply: (state: Readonly<State>) => State;
}

export interface StudioScene3dCommandTransaction<State> {
  readonly id: string;
  readonly label: string;
  readonly source?: StudioScene3dCommandSource;
  readonly commands: readonly StudioScene3dStateCommand<State>[];
}

export interface StudioScene3dCommandRevisionFence {
  readonly timelineId: string;
  readonly epoch: number;
  readonly revision: number;
  readonly stateHash: string;
  readonly scope: string | null;
}

export interface StudioScene3dGestureToken {
  readonly timelineId: string;
  readonly gestureId: number;
  readonly epoch: number;
  readonly baseRevision: number;
  readonly baseHash: string;
  readonly label: string;
  readonly source: StudioScene3dCommandSource;
}

export interface StudioScene3dCommandCommitReceipt {
  readonly status: "applied" | "noop" | "stale";
  readonly commandId: string;
  readonly label: string;
  readonly revision: number;
  readonly cursor: number;
  readonly stateHash: string;
}

export interface StudioScene3dCommandStepReceipt<State> {
  readonly status: "applied" | "empty";
  readonly revision: number;
  readonly cursor: number;
  readonly stateHash: string;
  readonly state: State;
  readonly commandId?: string;
  readonly label?: string;
}

export interface StudioScene3dCommandHistoryEntry {
  readonly commandId: string;
  readonly label: string;
  readonly source: StudioScene3dCommandSource;
  readonly transactionId: string | null;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly committedRevision: number;
}

export interface StudioScene3dCommandTimelineSnapshot<State> {
  readonly revision: typeof STUDIO_SCENE3D_COMMAND_CORE_REVISION;
  readonly timelineId: string;
  readonly epoch: number;
  readonly documentRevision: number;
  readonly cursor: number;
  readonly entryCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly stateHash: string;
  readonly state: State;
  readonly history: readonly StudioScene3dCommandHistoryEntry[];
}

export interface StudioScene3dCommandTimelineOptions<State> {
  readonly clone?: (state: Readonly<State>) => State;
  readonly serialize?: (state: Readonly<State>) => string;
  readonly maxEntries?: number;
}

interface InternalCommandRecord<State> extends StudioScene3dCommandHistoryEntry {
  readonly command: StudioScene3dStateCommand<State>;
  readonly before: State;
  readonly after: State;
}

interface ActiveGesture<State> {
  readonly token: StudioScene3dGestureToken;
  readonly baseState: State;
}

let nextTimelineId = 1;

function safeIntegerInRange(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
}

function cloneJsonState<State>(state: Readonly<State>): State {
  if (typeof structuredClone === "function") return structuredClone(state) as State;
  return JSON.parse(JSON.stringify(state)) as State;
}

function canonicalJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "n";
  if (typeof value === "string") return `s:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return value ? "b:1" : "b:0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Studio 3D command state contains a non-finite number.");
    return `d:${Object.is(value, -0) ? "0" : JSON.stringify(value)}`;
  }
  if (typeof value === "bigint") return `i:${value.toString()}`;
  if (typeof value === "undefined") return "u";
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("Studio 3D command state is not serializable.");
  }
  if (typeof value !== "object") return `x:${JSON.stringify(value)}`;
  if (ancestors.has(value)) throw new TypeError("Studio 3D command state contains a cycle.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `a:[${value.map((item) => canonicalJsonValue(item, ancestors)).join(",")}]`;
    }
    if (value instanceof Date) return `t:${JSON.stringify(value.toISOString())}`;
    if (value instanceof ArrayBuffer) {
      return `r:[${Array.from(new Uint8Array(value)).join(",")}]`;
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      const type = Object.getPrototypeOf(value)?.constructor?.name ?? "ArrayBufferView";
      return `v:${JSON.stringify(type)}:[${Array.from(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      ).join(",")}]`;
    }
    if (value instanceof Set) {
      const encoded = [...value].map((item) => canonicalJsonValue(item, ancestors)).sort();
      return `e:[${encoded.join(",")}]`;
    }
    if (value instanceof Map) {
      const encoded = [...value].map(([key, item]) => [
        canonicalJsonValue(key, ancestors),
        canonicalJsonValue(item, ancestors),
      ] as const).sort((left, right) => left[0].localeCompare(right[0]));
      return `m:[${encoded.map(([key, item]) => `[${key},${item}]`).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const properties: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (typeof item === "undefined" || typeof item === "function" || typeof item === "symbol") {
        continue;
      }
      properties.push(`${JSON.stringify(key)}:${canonicalJsonValue(item, ancestors)}`);
    }
    return `o:{${properties.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Stable type-tagged encoding used only for command-state identity, never for persistence. */
export function canonicalizeStudioScene3dCommandState(value: unknown): string {
  return canonicalJsonValue(value, new Set());
}

export function hashStudioScene3dCommandState<State>(
  state: Readonly<State>,
  serialize: (state: Readonly<State>) => string = canonicalizeStudioScene3dCommandState,
): string {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(serialize(state)))}`;
}

function isLowercaseAsciiAlphaNumeric(value: string): boolean {
  if (value.length !== 1) return false;
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function isCommandIdSeparator(value: string): boolean {
  return value === "." || value === ":" || value === "/" || value === "-";
}

function isStableNamespacedCommandId(value: string): boolean {
  let cursor = 0;
  while (cursor < value.length && isLowercaseAsciiAlphaNumeric(value[cursor]!)) {
    cursor += 1;
  }
  if (cursor === 0 || cursor === value.length) return false;

  let namespaceSegments = 0;
  while (cursor < value.length) {
    if (!isCommandIdSeparator(value[cursor]!)) return false;
    cursor += 1;
    const segmentStart = cursor;
    while (
      cursor < value.length
      && (isLowercaseAsciiAlphaNumeric(value[cursor]!) || value[cursor] === "-")
    ) {
      cursor += 1;
    }
    if (cursor === segmentStart) return false;
    namespaceSegments += 1;
  }
  return namespaceSegments > 0;
}

function assertCommandId(value: string, label: string): void {
  if (!isStableNamespacedCommandId(value)) {
    throw new TypeError(`${label} must be a namespaced stable id.`);
  }
}

function assertCommandLabel(value: string): void {
  if (value.trim().length === 0 || value.length > 160) {
    throw new TypeError("Studio 3D command label must contain 1-160 characters.");
  }
}

function commandSource(value: StudioScene3dCommandSource | undefined): StudioScene3dCommandSource {
  return value ?? "system";
}

function createCompositeCommand<State>(
  transaction: StudioScene3dCommandTransaction<State>,
): StudioScene3dStateCommand<State> {
  assertCommandId(transaction.id, "Studio 3D transaction id");
  assertCommandLabel(transaction.label);
  if (
    transaction.commands.length === 0
    || transaction.commands.length > STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS
  ) {
    throw new RangeError(
      `Studio 3D transaction must contain 1-${STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS} commands.`,
    );
  }
  for (const command of transaction.commands) {
    assertCommandId(command.id, "Studio 3D command id");
    assertCommandLabel(command.label);
  }
  const commands = Object.freeze([...transaction.commands]);
  return Object.freeze({
    id: transaction.id,
    label: transaction.label,
    source: transaction.source,
    apply: (state: Readonly<State>) => {
      let next = state as State;
      for (const command of commands) next = command.apply(next);
      return next;
    },
  });
}

export class StudioScene3dCommandTimeline<State> {
  readonly #timelineId: string;
  readonly #clone: (state: Readonly<State>) => State;
  readonly #serialize: (state: Readonly<State>) => string;
  readonly #maxEntries: number;
  #baseState: State;
  #baseHash: string;
  #state: State;
  #stateHash: string;
  #entries: InternalCommandRecord<State>[] = [];
  #cursor = 0;
  #revision = 0;
  #epoch = 1;
  #nextGestureId = 1;
  #activeGesture: ActiveGesture<State> | null = null;

  constructor(initialState: State, options: StudioScene3dCommandTimelineOptions<State> = {}) {
    this.#timelineId = `scene3d-command-timeline-${nextTimelineId}`;
    nextTimelineId += 1;
    this.#clone = options.clone ?? cloneJsonState;
    this.#serialize = options.serialize ?? canonicalizeStudioScene3dCommandState;
    this.#maxEntries = safeIntegerInRange(
      options.maxEntries,
      STUDIO_SCENE3D_COMMAND_DEFAULT_MAX_ENTRIES,
      1,
      10_000,
    );
    this.#baseState = this.#clone(initialState);
    this.#baseHash = this.#hash(this.#baseState);
    this.#state = this.#clone(initialState);
    this.#stateHash = this.#baseHash;
  }

  get timelineId(): string {
    return this.#timelineId;
  }

  get revision(): number {
    return this.#revision;
  }

  get cursor(): number {
    return this.#cursor;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#entries.length;
  }

  get stateHash(): string {
    return this.#stateHash;
  }

  readState(): State {
    return this.#clone(this.#state);
  }

  readRetainedStates(): Readonly<{
    readonly states: readonly State[];
    readonly index: number;
  }> {
    const states = [
      this.#clone(this.#baseState),
      ...this.#entries.map((entry) => this.#clone(entry.after)),
    ];
    return Object.freeze({
      states: Object.freeze(states),
      index: this.#cursor,
    });
  }

  readSnapshot(): StudioScene3dCommandTimelineSnapshot<State> {
    return Object.freeze({
      revision: STUDIO_SCENE3D_COMMAND_CORE_REVISION,
      timelineId: this.#timelineId,
      epoch: this.#epoch,
      documentRevision: this.#revision,
      cursor: this.#cursor,
      entryCount: this.#entries.length,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      stateHash: this.#stateHash,
      state: this.readState(),
      history: Object.freeze(this.#entries.map((entry) => Object.freeze({
        commandId: entry.commandId,
        label: entry.label,
        source: entry.source,
        transactionId: entry.transactionId,
        beforeHash: entry.beforeHash,
        afterHash: entry.afterHash,
        committedRevision: entry.committedRevision,
      }))),
    });
  }

  reset(nextState: State): StudioScene3dCommandTimelineSnapshot<State> {
    const next = this.#clone(nextState);
    const hash = this.#hash(next);
    this.#baseState = this.#clone(next);
    this.#baseHash = hash;
    this.#state = next;
    this.#stateHash = hash;
    this.#entries = [];
    this.#cursor = 0;
    this.#epoch += 1;
    this.#revision += 1;
    this.#activeGesture = null;
    return this.readSnapshot();
  }

  /**
   * Replaces the current history anchor without adding an undo step. Orbit-camera sampling uses this
   * to keep an unrelated undo from jumping to a stale view while still invalidating worker fences.
   */
  rebaseCurrent(nextState: State): StudioScene3dCommandCommitReceipt {
    const next = this.#clone(nextState);
    const hash = this.#hash(next);
    if (hash === this.#stateHash) return this.#receipt("noop", "scene3d.history.rebase", "Rebase view");
    if (this.#cursor < this.#entries.length) {
      this.#entries = this.#entries.slice(0, this.#cursor);
    }
    this.#state = next;
    this.#stateHash = hash;
    if (this.#cursor === 0) {
      this.#baseState = this.#clone(next);
      this.#baseHash = hash;
    } else {
      const index = this.#cursor - 1;
      const previous = this.#entries[index];
      const replayState = this.#clone(next);
      this.#entries[index] = Object.freeze({
        ...previous,
        command: Object.freeze({
          id: previous.commandId,
          label: previous.label,
          source: previous.source,
          apply: () => this.#clone(replayState),
        }),
        after: this.#clone(next),
        afterHash: hash,
      });
    }
    this.#revision += 1;
    this.#activeGesture = null;
    return this.#receipt("applied", "scene3d.history.rebase", "Rebase view");
  }

  commit(
    command: StudioScene3dStateCommand<State>,
    options: { readonly transactionId?: string | null } = {},
  ): StudioScene3dCommandCommitReceipt {
    return this.#commitCommand(command, options.transactionId ?? null);
  }

  transact(transaction: StudioScene3dCommandTransaction<State>): StudioScene3dCommandCommitReceipt {
    const command = createCompositeCommand(transaction);
    return this.#commitCommand(command, transaction.id);
  }

  captureFence(scope: string | null = null): StudioScene3dCommandRevisionFence {
    return Object.freeze({
      timelineId: this.#timelineId,
      epoch: this.#epoch,
      revision: this.#revision,
      stateHash: this.#stateHash,
      scope,
    });
  }

  isFenceCurrent(fence: StudioScene3dCommandRevisionFence): boolean {
    return fence.timelineId === this.#timelineId
      && fence.epoch === this.#epoch
      && fence.revision === this.#revision
      && fence.stateHash === this.#stateHash;
  }

  commitPrepared(
    fence: StudioScene3dCommandRevisionFence,
    input: {
      readonly commandId: string;
      readonly label: string;
      readonly source?: StudioScene3dCommandSource;
      readonly nextState: State;
      readonly transactionId?: string | null;
    },
  ): StudioScene3dCommandCommitReceipt {
    if (!this.isFenceCurrent(fence)) {
      assertCommandId(input.commandId, "Studio 3D command id");
      assertCommandLabel(input.label);
      return this.#receipt("stale", input.commandId, input.label);
    }
    const nextState = this.#clone(input.nextState);
    return this.#commitCommand({
      id: input.commandId,
      label: input.label,
      source: input.source ?? "worker",
      apply: () => this.#clone(nextState),
    }, input.transactionId ?? null);
  }

  beginGesture(input: {
    readonly label: string;
    readonly source?: StudioScene3dCommandSource;
  }): StudioScene3dGestureToken {
    assertCommandLabel(input.label);
    if (this.#activeGesture) throw new Error("A Studio 3D gesture is already active.");
    const token = Object.freeze({
      timelineId: this.#timelineId,
      gestureId: this.#nextGestureId,
      epoch: this.#epoch,
      baseRevision: this.#revision,
      baseHash: this.#stateHash,
      label: input.label,
      source: input.source ?? "canvas",
    });
    this.#nextGestureId += 1;
    this.#activeGesture = {
      token,
      baseState: this.#clone(this.#state),
    };
    return token;
  }

  previewGesture(
    token: StudioScene3dGestureToken,
    command: StudioScene3dStateCommand<State>,
  ): Readonly<{ readonly state: State; readonly stateHash: string }> {
    const active = this.#requireGesture(token);
    assertCommandId(command.id, "Studio 3D command id");
    assertCommandLabel(command.label);
    const state = this.#clone(command.apply(this.#clone(active.baseState)));
    return Object.freeze({ state, stateHash: this.#hash(state) });
  }

  commitGesture(
    token: StudioScene3dGestureToken,
    command: StudioScene3dStateCommand<State>,
  ): StudioScene3dCommandCommitReceipt {
    this.#requireGesture(token);
    this.#activeGesture = null;
    return this.#commitCommand(command, `gesture:${token.gestureId}`);
  }

  cancelGesture(token: StudioScene3dGestureToken): boolean {
    if (!this.#gestureMatches(token)) return false;
    this.#activeGesture = null;
    return true;
  }

  undo(): StudioScene3dCommandStepReceipt<State> {
    if (this.#activeGesture) this.#activeGesture = null;
    if (!this.canUndo) return this.#emptyStep();
    const record = this.#entries[this.#cursor - 1];
    this.#cursor -= 1;
    this.#state = this.#clone(record.before);
    this.#stateHash = record.beforeHash;
    this.#revision += 1;
    return Object.freeze({
      status: "applied",
      revision: this.#revision,
      cursor: this.#cursor,
      stateHash: this.#stateHash,
      state: this.readState(),
      commandId: record.commandId,
      label: record.label,
    });
  }

  redo(): StudioScene3dCommandStepReceipt<State> {
    if (this.#activeGesture) this.#activeGesture = null;
    if (!this.canRedo) return this.#emptyStep();
    const record = this.#entries[this.#cursor];
    this.#cursor += 1;
    this.#state = this.#clone(record.after);
    this.#stateHash = record.afterHash;
    this.#revision += 1;
    return Object.freeze({
      status: "applied",
      revision: this.#revision,
      cursor: this.#cursor,
      stateHash: this.#stateHash,
      state: this.readState(),
      commandId: record.commandId,
      label: record.label,
    });
  }

  /** Replays reducer functions from the retained checkpoint and verifies every recorded digest. */
  verifyReplay(): Readonly<{ readonly state: State; readonly stateHash: string }> {
    let state = this.#clone(this.#baseState);
    let hash = this.#hash(state);
    if (hash !== this.#baseHash) throw new Error("Studio 3D history checkpoint was mutated.");
    for (let index = 0; index < this.#cursor; index += 1) {
      const record = this.#entries[index];
      if (hash !== record.beforeHash) {
        throw new Error(`Studio 3D command replay diverged before ${record.commandId}.`);
      }
      state = this.#clone(record.command.apply(this.#clone(state)));
      hash = this.#hash(state);
      if (hash !== record.afterHash) {
        throw new Error(`Studio 3D command replay diverged after ${record.commandId}.`);
      }
    }
    if (hash !== this.#stateHash) throw new Error("Studio 3D command replay does not match live state.");
    return Object.freeze({ state, stateHash: hash });
  }

  #commitCommand(
    command: StudioScene3dStateCommand<State>,
    transactionId: string | null,
  ): StudioScene3dCommandCommitReceipt {
    assertCommandId(command.id, "Studio 3D command id");
    assertCommandLabel(command.label);
    if (transactionId !== null) assertCommandId(transactionId, "Studio 3D transaction id");
    const before = this.#clone(this.#state);
    const beforeHash = this.#stateHash;
    const after = this.#clone(command.apply(this.#clone(before)));
    const afterHash = this.#hash(after);
    if (beforeHash === afterHash) return this.#receipt("noop", command.id, command.label);

    if (this.#cursor < this.#entries.length) this.#entries = this.#entries.slice(0, this.#cursor);
    this.#revision += 1;
    const record: InternalCommandRecord<State> = Object.freeze({
      command,
      commandId: command.id,
      label: command.label,
      source: commandSource(command.source),
      transactionId,
      before,
      after: this.#clone(after),
      beforeHash,
      afterHash,
      committedRevision: this.#revision,
    });
    this.#entries.push(record);
    this.#cursor = this.#entries.length;
    this.#state = after;
    this.#stateHash = afterHash;
    this.#activeGesture = null;
    this.#trimHistory();
    return this.#receipt("applied", command.id, command.label);
  }

  #trimHistory(): void {
    while (this.#entries.length > this.#maxEntries) {
      const removed = this.#entries.shift();
      if (!removed) break;
      this.#baseState = this.#clone(removed.after);
      this.#baseHash = removed.afterHash;
      this.#cursor = Math.max(0, this.#cursor - 1);
    }
  }

  #gestureMatches(token: StudioScene3dGestureToken): boolean {
    const active = this.#activeGesture;
    return Boolean(active)
      && active?.token.timelineId === token.timelineId
      && active.token.gestureId === token.gestureId
      && active.token.epoch === token.epoch
      && active.token.baseRevision === token.baseRevision
      && active.token.baseHash === token.baseHash
      && this.#revision === token.baseRevision
      && this.#stateHash === token.baseHash;
  }

  #requireGesture(token: StudioScene3dGestureToken): ActiveGesture<State> {
    if (!this.#gestureMatches(token) || !this.#activeGesture) {
      throw new Error("Studio 3D gesture token is stale or no longer active.");
    }
    return this.#activeGesture;
  }

  #emptyStep(): StudioScene3dCommandStepReceipt<State> {
    return Object.freeze({
      status: "empty",
      revision: this.#revision,
      cursor: this.#cursor,
      stateHash: this.#stateHash,
      state: this.readState(),
    });
  }

  #receipt(
    status: StudioScene3dCommandCommitReceipt["status"],
    commandId: string,
    label: string,
  ): StudioScene3dCommandCommitReceipt {
    return Object.freeze({
      status,
      commandId,
      label,
      revision: this.#revision,
      cursor: this.#cursor,
      stateHash: this.#stateHash,
    });
  }

  #hash(state: Readonly<State>): string {
    return hashStudioScene3dCommandState(state, this.#serialize);
  }
}

export function createStudioScene3dReplacementCommand<State>(input: {
  readonly id: string;
  readonly label: string;
  readonly nextState: State;
  readonly source?: StudioScene3dCommandSource;
  readonly clone?: (state: Readonly<State>) => State;
}): StudioScene3dStateCommand<State> {
  const clone = input.clone ?? cloneJsonState;
  const ownedState = clone(input.nextState);
  return Object.freeze({
    id: input.id,
    label: input.label,
    source: input.source,
    apply: () => clone(ownedState),
  });
}
