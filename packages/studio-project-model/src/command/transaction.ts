import { z } from "zod";

import { isoTimestampSchema, studioEntityIdSchema } from "../graph/ids";
import { scopeRefSchema } from "../graph/scope-ref";
import { canonicalJson } from "../ir/digest";

import type {
  ArtifactId,
  CommandId,
  DeviceId,
  RevisionId,
  Sha256,
  UserId,
} from "../graph/ids";
import type { ScopeRef } from "../graph/scope-ref";

export type StudioCommandType = `${string}.${string}`;

export interface LeaseToken {
  readonly leaseId: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface CommandEnvelope<P = unknown> {
  readonly id: CommandId;
  readonly type: StudioCommandType;
  readonly actorId: UserId;
  readonly deviceId: DeviceId;
  readonly artifactId: ArtifactId;
  readonly scope: ScopeRef;
  readonly baseRevisionId: RevisionId;
  readonly issuedAt: string;
  readonly idempotencyKey: string;
  readonly undoGroupId?: string;
  readonly deterministicSeed?: number;
  readonly leaseTokens?: readonly LeaseToken[];
  readonly payload: P;
}

const commandTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u);

export const commandEnvelopeBaseSchema = z
  .object({
    id: studioEntityIdSchema,
    type: commandTypeSchema,
    actorId: studioEntityIdSchema,
    deviceId: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    scope: scopeRefSchema,
    baseRevisionId: studioEntityIdSchema,
    issuedAt: isoTimestampSchema,
    idempotencyKey: z.string().trim().min(8).max(240),
    undoGroupId: studioEntityIdSchema.optional(),
    deterministicSeed: z.number().int().nonnegative().optional(),
    leaseTokens: z
      .array(
        z
          .object({
            leaseId: studioEntityIdSchema,
            token: z.string().min(16).max(2_048),
            expiresAt: isoTimestampSchema,
          })
          .strict(),
      )
      .max(32)
      .optional(),
    payload: z.unknown(),
  })
  .strict();

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonPatchOperation =
  | { readonly op: "add"; readonly path: string; readonly value: JsonValue }
  | { readonly op: "replace"; readonly path: string; readonly value: JsonValue }
  | { readonly op: "test"; readonly path: string; readonly value: JsonValue }
  | { readonly op: "remove"; readonly path: string }
  | { readonly op: "move"; readonly path: string; readonly from: string }
  | { readonly op: "copy"; readonly path: string; readonly from: string };

export interface BlobWrite {
  readonly sha256: Sha256;
  readonly mediaType: string;
  readonly bytesLength: number;
  readonly role:
    | "graph"
    | "tile"
    | "vector"
    | "source"
    | "thumbnail"
    | "preview"
    | "export"
    | "license"
    | "provenance";
  readonly source: "generated" | "imported" | "copied";
}

export interface Invalidation {
  readonly kind: "tile" | "layer" | "effect" | "thumbnail" | "3d-pass" | "search-index";
  readonly targetId: string;
  readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface CommandPlan {
  readonly patches: readonly JsonPatchOperation[];
  readonly inversePatches: readonly JsonPatchOperation[];
  readonly blobWrites: readonly BlobWrite[];
  readonly invalidations: readonly Invalidation[];
  readonly warnings: readonly string[];
}

export interface CommandContext {
  readonly now: string;
  readonly actorId: UserId;
  readonly deviceId: DeviceId;
  readonly permissionSet: ReadonlySet<string>;
  readonly currentHead: RevisionId;
  readonly leases: readonly LeaseToken[];
}

export interface StudioCommandHandler<P = unknown> {
  readonly type: StudioCommandType;
  validate(
    command: CommandEnvelope<P>,
    context: CommandContext,
    document: JsonValue,
  ): readonly string[];
  plan(
    command: CommandEnvelope<P>,
    context: CommandContext,
    document: JsonValue,
  ): Promise<CommandPlan>;
}

export interface DocumentSnapshot<D extends JsonValue = JsonValue> {
  readonly artifactId: ArtifactId;
  readonly revisionId: RevisionId;
  readonly document: D;
}

export interface DocumentCommit<D extends JsonValue = JsonValue> {
  readonly expectedRevisionId: RevisionId;
  readonly nextRevisionId: RevisionId;
  readonly command: CommandEnvelope;
  readonly plan: CommandPlan;
  readonly document: D;
}

export interface DocumentAuthority<D extends JsonValue = JsonValue> {
  read(artifactId: ArtifactId): Promise<DocumentSnapshot<D>>;
  findIdempotent(
    artifactId: ArtifactId,
    idempotencyKey: string,
  ): Promise<DocumentSnapshot<D> | null>;
  commit(commit: DocumentCommit<D>): Promise<DocumentSnapshot<D>>;
}

export class StudioRevisionConflictError extends Error {
  constructor(
    readonly expected: RevisionId,
    readonly actual: RevisionId,
  ) {
    super(`revision conflict: expected ${expected}, current ${actual}`);
    this.name = "StudioRevisionConflictError";
  }
}

export class StudioCommandValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`command validation failed: ${issues.join("; ")}`);
    this.name = "StudioCommandValidationError";
  }
}

export class StudioCommandHandlerMissingError extends Error {
  constructor(readonly type: string) {
    super(`no Studio command handler registered for ${type}`);
    this.name = "StudioCommandHandlerMissingError";
  }
}

export class InMemoryDocumentAuthority<D extends JsonValue> implements DocumentAuthority<D> {
  private readonly heads = new Map<string, DocumentSnapshot<D>>();
  private readonly revisions = new Map<string, DocumentSnapshot<D>>();
  private readonly idempotency = new Map<string, DocumentSnapshot<D>>();

  constructor(initial: readonly DocumentSnapshot<D>[]) {
    for (const snapshot of initial) {
      const copy = cloneSnapshot(snapshot);
      this.heads.set(snapshot.artifactId, copy);
      this.revisions.set(snapshot.revisionId, copy);
    }
  }

  async read(artifactId: ArtifactId): Promise<DocumentSnapshot<D>> {
    const snapshot = this.heads.get(artifactId);
    if (snapshot === undefined) throw new Error(`document ${artifactId} not found`);
    return cloneSnapshot(snapshot);
  }

  async findIdempotent(
    artifactId: ArtifactId,
    idempotencyKey: string,
  ): Promise<DocumentSnapshot<D> | null> {
    const snapshot = this.idempotency.get(`${artifactId}:${idempotencyKey}`);
    return snapshot === undefined ? null : cloneSnapshot(snapshot);
  }

  async commit(commit: DocumentCommit<D>): Promise<DocumentSnapshot<D>> {
    const idempotencyKey = `${commit.command.artifactId}:${commit.command.idempotencyKey}`;
    const replay = this.idempotency.get(idempotencyKey);
    if (replay !== undefined) return cloneSnapshot(replay);
    const current = this.heads.get(commit.command.artifactId);
    if (current === undefined) throw new Error(`document ${commit.command.artifactId} not found`);
    if (current.revisionId !== commit.expectedRevisionId) {
      throw new StudioRevisionConflictError(commit.expectedRevisionId, current.revisionId);
    }
    const occupied = this.revisions.get(commit.nextRevisionId);
    if (occupied !== undefined) throw new Error(`revision ${commit.nextRevisionId} already exists`);
    const next: DocumentSnapshot<D> = {
      artifactId: commit.command.artifactId,
      revisionId: commit.nextRevisionId,
      document: cloneJson(commit.document),
    };
    this.heads.set(next.artifactId, next);
    this.revisions.set(next.revisionId, next);
    this.idempotency.set(idempotencyKey, next);
    return cloneSnapshot(next);
  }

  listRevisions(artifactId: ArtifactId): readonly DocumentSnapshot<D>[] {
    return [...this.revisions.values()]
      .filter((snapshot) => snapshot.artifactId === artifactId)
      .map(cloneSnapshot);
  }
}

export interface StudioTransactionResult<D extends JsonValue> {
  readonly snapshot: DocumentSnapshot<D>;
  readonly plan: CommandPlan;
  readonly idempotentReplay: boolean;
}

export class StudioTransactionCoordinator<D extends JsonValue> {
  private readonly handlers = new Map<string, StudioCommandHandler>();

  constructor(
    private readonly authority: DocumentAuthority<D>,
    handlers: readonly StudioCommandHandler[],
    private readonly allocateRevisionId: (
      command: CommandEnvelope,
      current: DocumentSnapshot<D>,
      plan: CommandPlan,
    ) => RevisionId,
  ) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.type)) {
        throw new Error(`duplicate Studio command handler ${handler.type}`);
      }
      this.handlers.set(handler.type, handler);
    }
  }

  async execute<P>(
    commandInput: CommandEnvelope<P>,
    contextInput: Omit<CommandContext, "currentHead">,
  ): Promise<StudioTransactionResult<D>> {
    const command = commandEnvelopeBaseSchema.parse(commandInput) as CommandEnvelope<P>;
    const replay = await this.authority.findIdempotent(
      command.artifactId,
      command.idempotencyKey,
    );
    if (replay !== null) {
      return { snapshot: replay, plan: emptyCommandPlan(), idempotentReplay: true };
    }
    const current = await this.authority.read(command.artifactId);
    if (current.revisionId !== command.baseRevisionId) {
      throw new StudioRevisionConflictError(command.baseRevisionId, current.revisionId);
    }
    const handler = this.handlers.get(command.type);
    if (handler === undefined) throw new StudioCommandHandlerMissingError(command.type);
    const context: CommandContext = { ...contextInput, currentHead: current.revisionId };
    const issues = handler.validate(command, context, current.document);
    if (issues.length > 0) throw new StudioCommandValidationError(issues);
    const plan = await handler.plan(command, context, current.document);
    const nextDocument = applyJsonPatches(current.document, plan.patches) as D;
    const nextRevisionId = this.allocateRevisionId(command, current, plan);
    const snapshot = await this.authority.commit({
      expectedRevisionId: current.revisionId,
      nextRevisionId,
      command,
      plan,
      document: nextDocument,
    });
    return { snapshot, plan, idempotentReplay: false };
  }
}

export function emptyCommandPlan(): CommandPlan {
  return { patches: [], inversePatches: [], blobWrites: [], invalidations: [], warnings: [] };
}

export function applyJsonPatches<T extends JsonValue>(
  document: T,
  patches: readonly JsonPatchOperation[],
): T {
  let root: JsonValue = cloneJson(document);
  for (const patch of patches) {
    if (patch.op === "test") {
      const actual = readPointer(root, patch.path);
      if (canonicalJson(actual) !== canonicalJson(patch.value)) {
        throw new Error(`JSON patch test failed at ${patch.path}`);
      }
      continue;
    }
    if (patch.op === "copy" || patch.op === "move") {
      const value = cloneJson(readPointer(root, patch.from));
      if (patch.op === "move") root = removePointer(root, patch.from);
      root = writePointer(root, patch.path, value, "add");
      continue;
    }
    if (patch.op === "remove") {
      root = removePointer(root, patch.path);
      continue;
    }
    if (patch.op === "add" || patch.op === "replace") {
      root = writePointer(root, patch.path, cloneJson(patch.value), patch.op);
      continue;
    }
    const unreachable: never = patch;
    throw new Error(`unsupported JSON patch operation ${String(unreachable)}`);
  }
  return root as T;
}

function cloneSnapshot<D extends JsonValue>(snapshot: DocumentSnapshot<D>): DocumentSnapshot<D> {
  return { ...snapshot, document: cloneJson(snapshot.document) };
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]),
    ) as T;
  }
  return value;
}

function assertSafeJsonPointerSegment(segment: string, pointer: string): void {
  if (segment === "__proto__" || segment === "constructor" || segment === "prototype") {
    throw new Error(`unsafe JSON pointer segment in ${pointer}`);
  }
}

function hasOwnJsonProperty(object: { [key: string]: JsonValue }, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function pointerSegments(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((encodedSegment) => {
      const segment = encodedSegment.replace(/~1/gu, "/").replace(/~0/gu, "~");
      assertSafeJsonPointerSegment(segment, pointer);
      return segment;
    });
}

function readPointer(root: JsonValue, pointer: string): JsonValue {
  let current = root;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(current)) {
      const index = parseArrayIndex(segment, current.length, false);
      const value = current[index];
      if (value === undefined) throw new Error(`missing JSON pointer ${pointer}`);
      current = value;
    } else if (current !== null && typeof current === "object") {
      if (!hasOwnJsonProperty(current, segment)) throw new Error(`missing JSON pointer ${pointer}`);
      current = current[segment] as JsonValue;
    } else {
      throw new Error(`JSON pointer traverses a primitive at ${pointer}`);
    }
  }
  return current;
}

function writePointer(
  root: JsonValue,
  pointer: string,
  value: JsonValue,
  mode: "add" | "replace",
): JsonValue {
  const segments = pointerSegments(pointer);
  if (segments.length === 0) return value;
  const { parent, key } = resolveParent(root, segments, pointer);
  if (Array.isArray(parent)) {
    if (mode === "add" && key === "-") {
      parent.push(value);
      return root;
    }
    const index = parseArrayIndex(key, parent.length, mode === "add");
    if (mode === "add") parent.splice(index, 0, value);
    else {
      if (parent[index] === undefined) throw new Error(`missing JSON pointer ${pointer}`);
      parent[index] = value;
    }
    return root;
  }
  if (mode === "replace" && !hasOwnJsonProperty(parent, key)) {
    throw new Error(`missing JSON pointer ${pointer}`);
  }
  Object.defineProperty(parent, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return root;
}

function removePointer(root: JsonValue, pointer: string): JsonValue {
  const segments = pointerSegments(pointer);
  if (segments.length === 0) throw new Error("cannot remove the JSON document root");
  const { parent, key } = resolveParent(root, segments, pointer);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, false);
    if (parent[index] === undefined) throw new Error(`missing JSON pointer ${pointer}`);
    parent.splice(index, 1);
  } else {
    if (!hasOwnJsonProperty(parent, key)) throw new Error(`missing JSON pointer ${pointer}`);
    delete parent[key];
  }
  return root;
}

function resolveParent(
  root: JsonValue,
  segments: readonly string[],
  pointer: string,
): { parent: JsonValue[] | { [key: string]: JsonValue }; key: string } {
  let parent: JsonValue = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = parseArrayIndex(segment, parent.length, false);
      const next = parent[index];
      if (next === undefined) throw new Error(`missing JSON pointer ${pointer}`);
      parent = next;
    } else if (parent !== null && typeof parent === "object") {
      if (!hasOwnJsonProperty(parent, segment)) throw new Error(`missing JSON pointer ${pointer}`);
      const next = parent[segment];
      if (next === undefined) throw new Error(`missing JSON pointer ${pointer}`);
      parent = next;
    } else {
      throw new Error(`JSON pointer traverses a primitive at ${pointer}`);
    }
  }
  if (Array.isArray(parent) || (parent !== null && typeof parent === "object")) {
    const key = segments.at(-1);
    if (key === undefined) throw new Error(`invalid JSON pointer ${pointer}`);
    return { parent, key };
  }
  throw new Error(`JSON pointer parent is a primitive at ${pointer}`);
}

function parseArrayIndex(segment: string, length: number, allowEnd: boolean): number {
  if (!/^(0|[1-9][0-9]*)$/u.test(segment)) throw new Error(`invalid array index ${segment}`);
  const index = Number(segment);
  const upper = allowEnd ? length : length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > upper) {
    throw new Error(`array index ${segment} out of range`);
  }
  return index;
}
