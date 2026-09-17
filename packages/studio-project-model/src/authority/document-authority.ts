export interface StudioDocumentSnapshot<State> {
  readonly sequence: number;
  readonly digest: string;
  readonly state: State;
}

export interface StudioTransactionCommand<Payload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: Payload;
}

export interface StudioTransactionEnvelope<Payload = unknown> {
  readonly version: 1;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly baseSequence: number;
  readonly baseDigest: string;
  readonly actorId: string;
  readonly createdAt: string;
  readonly commands: readonly StudioTransactionCommand<Payload>[];
}

export interface StudioPreparedTransaction<State, Payload = unknown> {
  readonly envelope: StudioTransactionEnvelope<Payload>;
  readonly previous: StudioDocumentSnapshot<State>;
  readonly next: StudioDocumentSnapshot<State>;
}

export interface StudioTransactionReceipt {
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly status: "committed" | "idempotent-replay";
  readonly sequence: number;
  readonly digest: string;
  readonly committedAt: string;
}

export interface StudioDocumentAuthority<State, Payload = unknown> {
  readonly read: () => StudioDocumentSnapshot<State>;
  readonly prepare: (
    envelope: StudioTransactionEnvelope<Payload>,
  ) => StudioPreparedTransaction<State, Payload>;
  readonly commit: (
    prepared: StudioPreparedTransaction<State, Payload>,
  ) => StudioTransactionReceipt;
  readonly transact: (
    envelope: StudioTransactionEnvelope<Payload>,
  ) => StudioTransactionReceipt;
}

export interface StudioDocumentAuthorityOptions<State, Payload = unknown> {
  readonly initialState: State;
  readonly digest: (state: State) => string;
  readonly reduce: (
    state: State,
    command: StudioTransactionCommand<Payload>,
  ) => State;
  readonly now?: () => string;
}

export class StudioDocumentAuthorityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioDocumentAuthorityConflictError";
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validateEnvelope<Payload>(
  envelope: StudioTransactionEnvelope<Payload>,
): void {
  if (
    envelope.version !== 1
    || !SAFE_ID.test(envelope.id)
    || !SAFE_ID.test(envelope.idempotencyKey)
    || !SAFE_ID.test(envelope.actorId)
    || !Number.isSafeInteger(envelope.baseSequence)
    || envelope.baseSequence < 0
    || !envelope.baseDigest.trim()
    || !validTimestamp(envelope.createdAt)
    || envelope.commands.length === 0
  ) {
    throw new TypeError("Studio transaction envelope is invalid.");
  }
  const commandIds = new Set<string>();
  for (const command of envelope.commands) {
    if (!SAFE_ID.test(command.id) || !command.type.trim()) {
      throw new TypeError("Studio transaction command is invalid.");
    }
    if (commandIds.has(command.id)) {
      throw new TypeError(`Studio transaction command is duplicated: ${command.id}`);
    }
    commandIds.add(command.id);
  }
}

export function createInMemoryStudioDocumentAuthority<State, Payload = unknown>(
  options: StudioDocumentAuthorityOptions<State, Payload>,
): StudioDocumentAuthority<State, Payload> {
  let current: StudioDocumentSnapshot<State> = Object.freeze({
    sequence: 0,
    digest: options.digest(options.initialState),
    state: options.initialState,
  });
  const receipts = new Map<string, StudioTransactionReceipt>();
  const now = options.now ?? (() => new Date().toISOString());

  const read = (): StudioDocumentSnapshot<State> => current;

  const prepare = (
    envelope: StudioTransactionEnvelope<Payload>,
  ): StudioPreparedTransaction<State, Payload> => {
    validateEnvelope(envelope);
    const existing = receipts.get(envelope.idempotencyKey);
    if (existing) {
      throw new StudioDocumentAuthorityConflictError(
        `Transaction ${envelope.idempotencyKey} was already committed.`,
      );
    }
    if (
      envelope.baseSequence !== current.sequence
      || envelope.baseDigest !== current.digest
    ) {
      throw new StudioDocumentAuthorityConflictError(
        "Transaction base no longer matches the document authority.",
      );
    }
    let nextState = current.state;
    for (const command of envelope.commands) {
      nextState = options.reduce(nextState, command);
    }
    return Object.freeze({
      envelope,
      previous: current,
      next: Object.freeze({
        sequence: current.sequence + 1,
        digest: options.digest(nextState),
        state: nextState,
      }),
    });
  };

  const commit = (
    prepared: StudioPreparedTransaction<State, Payload>,
  ): StudioTransactionReceipt => {
    const replay = receipts.get(prepared.envelope.idempotencyKey);
    if (replay) return Object.freeze({ ...replay, status: "idempotent-replay" });
    if (
      prepared.previous.sequence !== current.sequence
      || prepared.previous.digest !== current.digest
    ) {
      throw new StudioDocumentAuthorityConflictError(
        "Prepared transaction became stale before commit.",
      );
    }
    current = prepared.next;
    const receipt = Object.freeze({
      transactionId: prepared.envelope.id,
      idempotencyKey: prepared.envelope.idempotencyKey,
      status: "committed" as const,
      sequence: current.sequence,
      digest: current.digest,
      committedAt: now(),
    });
    receipts.set(prepared.envelope.idempotencyKey, receipt);
    return receipt;
  };

  const transact = (
    envelope: StudioTransactionEnvelope<Payload>,
  ): StudioTransactionReceipt => {
    const replay = receipts.get(envelope.idempotencyKey);
    if (replay) return Object.freeze({ ...replay, status: "idempotent-replay" });
    return commit(prepare(envelope));
  };

  return Object.freeze({ read, prepare, commit, transact });
}
