import type { StudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";

export const STUDIO_MUTATION_DOMAINS = [
  "project-ir",
  "page-state",
  "writer-room",
  "character-bible",
  "identity-index",
  "comments-draft",
  "asset-manifest",
  "workflow-local",
] as const;

export type StudioMutationDomain = (typeof STUDIO_MUTATION_DOMAINS)[number];

export interface StudioDomainCommand {
  readonly commandId: string;
  readonly domain: StudioMutationDomain;
  readonly type: string;
  readonly payload: unknown;
  readonly affectedSemanticIds: readonly string[];
}

export interface StudioMutationEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly mutationId: string;
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly workScope:
    | { readonly kind: "draft"; readonly draftId: string }
    | { readonly kind: "work"; readonly workId: string }
    | { readonly kind: "remix"; readonly sourceWorkId: string };
  readonly actor: {
    readonly userId: string | null;
    readonly clientId: string;
    readonly sessionId: string;
  };
  readonly base: StudioVersionCoordinates;
  readonly commands: readonly StudioDomainCommand[];
  readonly affectedSemanticIds: readonly string[];
  readonly createdAt: string;
}

export interface StudioPreparedDomainMutation {
  readonly domain: StudioMutationDomain;
  readonly previousSnapshot: unknown;
  readonly nextSnapshot: unknown;
  readonly inverseCommands: readonly StudioDomainCommand[];
  readonly changed: boolean;
}

export interface StudioMutationDomainPort {
  readonly domain: StudioMutationDomain;
  readonly getSnapshot: () => unknown;
  readonly prepare: (
    snapshot: unknown,
    commands: readonly StudioDomainCommand[],
  ) => StudioPreparedDomainMutation | Promise<StudioPreparedDomainMutation>;
  readonly commit: (snapshot: unknown) => void | Promise<void>;
  readonly restore: (snapshot: unknown) => void | Promise<void>;
}

export interface StudioMutationCommitRecord {
  readonly mutationId: string;
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly workScope: string;
  readonly baseLocalSequence: number;
  readonly nextLocalSequence: number;
  readonly commandCount: number;
  readonly domains: readonly StudioMutationDomain[];
  readonly createdAt: string;
}

export interface StudioMutationReceipt {
  readonly mutationId: string;
  readonly transactionId: string;
  readonly status: "committed" | "idempotent-replay";
  readonly localSequence: number;
  readonly serverSyncState: "none" | "queued";
  readonly affectedSemanticIds: readonly string[];
  readonly committedDomains: readonly StudioMutationDomain[];
}

export interface StudioMutationDurabilityPort {
  readonly findCommittedReceipt: (
    idempotencyKey: string,
  ) => StudioMutationReceipt | null | Promise<StudioMutationReceipt | null>;
  readonly begin: (record: StudioMutationCommitRecord) => void | Promise<void>;
  readonly appendPrepared: (
    record: StudioMutationCommitRecord,
    prepared: readonly StudioPreparedDomainMutation[],
  ) => void | Promise<void>;
  /**
   * Atomically commits the durable receipt and, for saved Work/Remix scopes, the server-sync outbox
   * item represented by `syncEnvelope`. Implementations must not persist one without the other.
   */
  readonly commit: (
    record: StudioMutationCommitRecord,
    receipt: StudioMutationReceipt,
    syncEnvelope: StudioMutationEnvelopeV2 | null,
  ) => void | Promise<void>;
  readonly abort: (
    record: StudioMutationCommitRecord,
    cause: unknown,
  ) => void | Promise<void>;
}

export interface StudioMutationCoordinatorOptions {
  readonly domains: readonly StudioMutationDomainPort[];
  readonly durability: StudioMutationDurabilityPort;
  readonly getCurrentCoordinates: () => StudioVersionCoordinates;
  readonly validateProjectedState?: (
    prepared: ReadonlyMap<StudioMutationDomain, StudioPreparedDomainMutation>,
    envelope: StudioMutationEnvelopeV2,
  ) => readonly string[] | Promise<readonly string[]>;
}

export type StudioMutationValidationIssueCode =
  | "invalid-envelope"
  | "duplicate-command-id"
  | "duplicate-domain-port"
  | "missing-domain-port"
  | "base-local-sequence-mismatch"
  | "base-local-digest-mismatch"
  | "base-server-revision-mismatch"
  | "base-server-digest-mismatch"
  | "idempotency-key-conflict"
  | "cross-domain-invariant";

export interface StudioMutationValidationIssue {
  readonly code: StudioMutationValidationIssueCode;
  readonly message: string;
  readonly commandId?: string;
  readonly domain?: StudioMutationDomain;
}

export class StudioMutationConflictError extends Error {
  readonly issues: readonly StudioMutationValidationIssue[];

  constructor(issues: readonly StudioMutationValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "StudioMutationConflictError";
    this.issues = issues;
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const DOMAIN_SET = new Set<string>(STUDIO_MUTATION_DOMAINS);

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function workScopeKey(scope: StudioMutationEnvelopeV2["workScope"]): string {
  switch (scope.kind) {
    case "draft":
      return `draft:${scope.draftId}`;
    case "work":
      return `work:${scope.workId}`;
    case "remix":
      return `remix:${scope.sourceWorkId}`;
  }
}

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function observedDigestMismatch(
  left: string | null,
  right: string | null,
): boolean {
  return left !== null && right !== null && left !== right;
}

export function validateStudioMutationEnvelope(
  envelope: StudioMutationEnvelopeV2,
  current: StudioVersionCoordinates,
  domainPorts: readonly StudioMutationDomainPort[],
): readonly StudioMutationValidationIssue[] {
  const issues: StudioMutationValidationIssue[] = [];
  const scopeId = envelope.workScope.kind === "draft"
    ? envelope.workScope.draftId
    : envelope.workScope.kind === "work"
      ? envelope.workScope.workId
      : envelope.workScope.sourceWorkId;
  if (
    envelope.schemaVersion !== 2
    || !SAFE_ID.test(envelope.mutationId)
    || !SAFE_ID.test(envelope.transactionId)
    || !SAFE_ID.test(envelope.idempotencyKey)
    || !SAFE_ID.test(scopeId)
    || !SAFE_ID.test(envelope.actor.clientId)
    || !SAFE_ID.test(envelope.actor.sessionId)
    || !validTimestamp(envelope.createdAt)
    || envelope.commands.length === 0
  ) {
    issues.push({
      code: "invalid-envelope",
      message: "Studio mutation envelope is incomplete or invalid.",
    });
  }

  const commandIds = new Set<string>();
  for (const command of envelope.commands) {
    if (
      !SAFE_ID.test(command.commandId)
      || !command.type.trim()
      || !DOMAIN_SET.has(command.domain)
    ) {
      issues.push({
        code: "invalid-envelope",
        commandId: command.commandId,
        domain: command.domain,
        message: `Studio command ${command.commandId} is invalid.`,
      });
    }
    if (commandIds.has(command.commandId)) {
      issues.push({
        code: "duplicate-command-id",
        commandId: command.commandId,
        domain: command.domain,
        message: `Studio command ID is duplicated: ${command.commandId}`,
      });
    }
    commandIds.add(command.commandId);
  }

  const domainIds = domainPorts.map((port) => port.domain);
  for (const duplicate of domainIds.filter((domain, index) =>
    domainIds.indexOf(domain) !== index
  )) {
    issues.push({
      code: "duplicate-domain-port",
      domain: duplicate,
      message: `Studio mutation domain port is duplicated: ${duplicate}`,
    });
  }
  const portDomains = new Set(domainIds);
  for (const domain of distinct(envelope.commands.map((command) => command.domain))) {
    if (!portDomains.has(domain)) {
      issues.push({
        code: "missing-domain-port",
        domain,
        message: `No mutation port is registered for ${domain}.`,
      });
    }
  }

  if (envelope.base.local.sequence !== current.local.sequence) {
    issues.push({
      code: "base-local-sequence-mismatch",
      message: `Mutation local base ${envelope.base.local.sequence} does not match ${current.local.sequence}.`,
    });
  }
  if (observedDigestMismatch(
    envelope.base.local.documentDigest,
    current.local.documentDigest,
  )) {
    issues.push({
      code: "base-local-digest-mismatch",
      message: "Mutation local document digest does not match the current document.",
    });
  }
  const expectedServerRevision = envelope.base.server?.revision ?? null;
  const currentServerRevision = current.server?.revision ?? null;
  if (expectedServerRevision !== currentServerRevision) {
    issues.push({
      code: "base-server-revision-mismatch",
      message: "Mutation server base revision does not match the current server head.",
    });
  }
  if (observedDigestMismatch(
    envelope.base.server?.contentDigest ?? null,
    current.server?.contentDigest ?? null,
  )) {
    issues.push({
      code: "base-server-digest-mismatch",
      message: "Mutation server content digest does not match the current server head.",
    });
  }
  return issues;
}

async function rollbackCommittedDomains(
  committed: readonly StudioPreparedDomainMutation[],
  ports: ReadonlyMap<StudioMutationDomain, StudioMutationDomainPort>,
): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const prepared of [...committed].reverse()) {
    try {
      await ports.get(prepared.domain)?.restore(prepared.previousSnapshot);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError(
      rollbackErrors,
      "Studio mutation rollback did not restore every committed domain.",
    );
  }
}

export function createStudioMutationCoordinator(
  options: StudioMutationCoordinatorOptions,
) {
  const ports = new Map(options.domains.map((port) => [port.domain, port]));

  async function executeMutation(envelope: StudioMutationEnvelopeV2): Promise<StudioMutationReceipt> {
    const existing = await options.durability.findCommittedReceipt(envelope.idempotencyKey);
    if (existing) {
      if (
        existing.mutationId !== envelope.mutationId
        || existing.transactionId !== envelope.transactionId
      ) {
        throw new StudioMutationConflictError([{
          code: "idempotency-key-conflict",
          message: "Studio idempotency key belongs to another mutation or transaction.",
        }]);
      }
      return { ...existing, status: "idempotent-replay" };
    }

    const current = options.getCurrentCoordinates();
    const envelopeIssues = validateStudioMutationEnvelope(
      envelope,
      current,
      options.domains,
    );
    if (envelopeIssues.length > 0) {
      throw new StudioMutationConflictError(envelopeIssues);
    }

    const commandsByDomain = new Map<StudioMutationDomain, StudioDomainCommand[]>();
    for (const command of envelope.commands) {
      const commands = commandsByDomain.get(command.domain) ?? [];
      commands.push(command);
      commandsByDomain.set(command.domain, commands);
    }

    const prepared: StudioPreparedDomainMutation[] = [];
    for (const [domain, commands] of commandsByDomain) {
      const port = ports.get(domain);
      if (!port) {
        throw new StudioMutationConflictError([{
          code: "missing-domain-port",
          domain,
          message: `No mutation port is registered for ${domain}.`,
        }]);
      }
      const result = await port.prepare(port.getSnapshot(), commands);
      if (result.domain !== domain) {
        throw new Error(`Mutation port ${domain} prepared ${result.domain}.`);
      }
      prepared.push(result);
    }

    const projected = new Map(prepared.map((item) => [item.domain, item]));
    const invariantIssues = await options.validateProjectedState?.(projected, envelope) ?? [];
    if (invariantIssues.length > 0) {
      throw new StudioMutationConflictError(invariantIssues.map((message) => ({
        code: "cross-domain-invariant" as const,
        message,
      })));
    }

    const record: StudioMutationCommitRecord = {
      mutationId: envelope.mutationId,
      transactionId: envelope.transactionId,
      idempotencyKey: envelope.idempotencyKey,
      workScope: workScopeKey(envelope.workScope),
      baseLocalSequence: current.local.sequence,
      nextLocalSequence: current.local.sequence + 1,
      commandCount: envelope.commands.length,
      domains: prepared.map((item) => item.domain),
      createdAt: envelope.createdAt,
    };
    const shouldSync = envelope.workScope.kind !== "draft";
    const receipt: StudioMutationReceipt = {
      mutationId: envelope.mutationId,
      transactionId: envelope.transactionId,
      status: "committed",
      localSequence: record.nextLocalSequence,
      serverSyncState: shouldSync ? "queued" : "none",
      affectedSemanticIds: distinct([
        ...envelope.affectedSemanticIds,
        ...envelope.commands.flatMap((command) => command.affectedSemanticIds),
      ]),
      committedDomains: prepared.filter((item) => item.changed).map((item) => item.domain),
    };

    await options.durability.begin(record);
    const committed: StudioPreparedDomainMutation[] = [];
    try {
      await options.durability.appendPrepared(record, prepared);
      for (const item of prepared) {
        if (!item.changed) continue;
        const port = ports.get(item.domain);
        if (!port) throw new Error(`Mutation port disappeared: ${item.domain}`);
        // A port can mutate its owner before an asynchronous commit rejects.
        committed.push(item);
        await port.commit(item.nextSnapshot);
      }
      await options.durability.commit(
        record,
        receipt,
        shouldSync ? envelope : null,
      );
      return receipt;
    } catch (error) {
      try {
        await rollbackCommittedDomains(committed, ports);
      } catch (rollbackError) {
        await options.durability.abort(record, rollbackError);
        throw rollbackError;
      }
      await options.durability.abort(record, error);
      throw error;
    }
  }

  let executionTail: Promise<void> = Promise.resolve();
  return {
    execute(envelope: StudioMutationEnvelopeV2): Promise<StudioMutationReceipt> {
      // Include receipt lookup and rollback so a losing write cannot restore over a later commit.
      const result = executionTail.then(() => executeMutation(envelope));
      executionTail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

/**
 * Adapts an existing reducer/CommandBus owner into the coordinator. It does not create a second
 * command bus; it only supplies prepare/commit/restore ports around the already-owned snapshot.
 */
export function createStudioExistingReducerDomainPort<S>(input: {
  readonly domain: StudioMutationDomain;
  readonly getSnapshot: () => S;
  readonly reduce: (
    snapshot: S,
    command: StudioDomainCommand,
  ) => { readonly state: S; readonly inverse?: StudioDomainCommand | null };
  readonly replaceSnapshot: (snapshot: S) => void | Promise<void>;
}): StudioMutationDomainPort {
  return {
    domain: input.domain,
    getSnapshot: input.getSnapshot,
    prepare(snapshot, commands) {
      let state = snapshot as S;
      const inverseCommands: StudioDomainCommand[] = [];
      for (const command of commands) {
        const result = input.reduce(state, command);
        state = result.state;
        if (result.inverse) inverseCommands.unshift(result.inverse);
      }
      return {
        domain: input.domain,
        previousSnapshot: snapshot,
        nextSnapshot: state,
        inverseCommands,
        changed: !Object.is(snapshot, state),
      };
    },
    commit: (snapshot) => input.replaceSnapshot(snapshot as S),
    restore: (snapshot) => input.replaceSnapshot(snapshot as S),
  };
}
