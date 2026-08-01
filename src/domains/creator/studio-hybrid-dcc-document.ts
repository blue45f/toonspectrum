/**
 * Hybrid DCC document foundation (DOC P0 + Rights BOM P1).
 * Command transactions with undo/redo, dependency dirty, content-addressed assets,
 * OPFS journal checkpoint recovery that restores full geometry/document state, Rights BOM.
 */

import {
  createStudioCommandEnvelope,
  createStudioCommandJournal,
  type StudioCommandJournal,
  type StudioCommandJsonValue,
} from "./studio-command-journal";
import {
  deserializeStudioEditableMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  type StudioEditableMesh,
  type StudioEditableMeshSnapshot,
} from "./studio-editable-half-edge-mesh";
import {
  commitStudioGeometryAuthorityMesh,
  createStudioGeometryAuthorityRegistry,
  registerStudioGeometryAuthority,
  type StudioGeometryAuthorityRegistry,
} from "./studio-geometry-authority";
import {
  createStudioOpfsRecoveryJournal,
  type StudioOpfsRecoveryJournal,
  type StudioOpfsRecoveryJournalAdapter,
  type StudioOpfsRecoveryWriterLease,
} from "./studio-opfs-recovery-journal";
import { sha256HexPortable } from "./studio-sha256";

export const STUDIO_HYBRID_DCC_DOCUMENT_VERSION = 1 as const;
export const STUDIO_HYBRID_DCC_DOCUMENT_FORMAT =
  "toonspectrum.hybrid-dcc-document" as const;
export const STUDIO_HYBRID_DCC_ENGINE_VERSION = "hybrid-dcc-engine-1" as const;

export interface StudioRightsBomRecord {
  readonly assetId: string;
  readonly source: string;
  readonly creator: string;
  readonly license: string;
  readonly useScope: string;
  readonly derivative: string;
  readonly contentHash?: `sha256:${string}`;
}

export interface StudioHybridDccDependencyEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: "geometry" | "shot-pass" | "material" | "pose";
}

export interface StudioHybridDccDocumentState {
  readonly format: typeof STUDIO_HYBRID_DCC_DOCUMENT_FORMAT;
  readonly version: typeof STUDIO_HYBRID_DCC_DOCUMENT_VERSION;
  readonly documentId: string;
  readonly geometry: StudioGeometryAuthorityRegistry;
  readonly rightsBom: readonly StudioRightsBomRecord[];
  readonly dependencies: readonly StudioHybridDccDependencyEdge[];
  readonly dirtyNodeIds: readonly string[];
  readonly milestoneLabel: string | null;
  readonly commandCount: number;
  readonly stateHash: string;
}

/** Serializable full-document snapshot (meshes as polygon soup). */
export interface StudioHybridDccPersistedSnapshot {
  readonly format: typeof STUDIO_HYBRID_DCC_DOCUMENT_FORMAT;
  readonly version: typeof STUDIO_HYBRID_DCC_DOCUMENT_VERSION;
  readonly documentId: string;
  readonly commandCount: number;
  readonly stateHash: string;
  readonly milestoneLabel: string | null;
  readonly dirtyNodeIds: readonly string[];
  readonly rightsBom: readonly StudioRightsBomRecord[];
  readonly dependencies: readonly StudioHybridDccDependencyEdge[];
  readonly assets: readonly {
    readonly assetId: string;
    readonly meshHash: string;
    readonly revision: number;
    readonly mesh: StudioEditableMeshSnapshot;
  }[];
}

export interface StudioHybridDccSession {
  readonly state: StudioHybridDccDocumentState;
  readonly journal: StudioCommandJournal;
  /** Prior states for undo (most recent last). */
  readonly undoStack: readonly StudioHybridDccPersistedSnapshot[];
  /** States undone, available for redo. */
  readonly redoStack: readonly StudioHybridDccPersistedSnapshot[];
  /** Last group id for command-journal undo linkage. */
  readonly lastGroupId: string | null;
  readonly undoGroupStack: readonly string[];
  readonly redoGroupStack: readonly string[];
  readonly lamport: number;
}

function stateHash(parts: readonly string[]): string {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(parts.join("|")))}`;
}

function computeStateHash(
  state: Omit<StudioHybridDccDocumentState, "stateHash">,
  meshFingerprints: readonly string[],
): string {
  return stateHash([
    state.documentId,
    String(state.version),
    String(state.commandCount),
    String(Object.keys(state.geometry.records).length),
    ...meshFingerprints,
    ...state.dirtyNodeIds,
    ...state.rightsBom.map((r) => `${r.assetId}:${r.license}:${r.contentHash ?? ""}`),
    state.milestoneLabel ?? "",
  ]);
}

function meshFingerprints(geometry: StudioGeometryAuthorityRegistry): string[] {
  return Object.keys(geometry.records)
    .sort()
    .map((id) => `${id}:${geometry.records[id]!.meshHash}`);
}

function finalizeState(
  partial: Omit<StudioHybridDccDocumentState, "stateHash">,
): StudioHybridDccDocumentState {
  return {
    ...partial,
    stateHash: computeStateHash(partial, meshFingerprints(partial.geometry)),
  };
}

export function snapshotStudioHybridDccState(
  state: StudioHybridDccDocumentState,
): StudioHybridDccPersistedSnapshot {
  const assets = Object.values(state.geometry.records)
    .map((record) => ({
      assetId: record.assetId,
      meshHash: record.meshHash,
      revision: record.revision,
      mesh: serializeStudioEditableMesh(record.mesh),
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  return {
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId: state.documentId,
    commandCount: state.commandCount,
    stateHash: state.stateHash,
    milestoneLabel: state.milestoneLabel,
    dirtyNodeIds: [...state.dirtyNodeIds],
    rightsBom: [...state.rightsBom],
    dependencies: [...state.dependencies],
    assets,
  };
}

export function restoreStudioHybridDccStateFromSnapshot(
  snapshot: StudioHybridDccPersistedSnapshot,
): StudioHybridDccDocumentState {
  let geometry = createStudioGeometryAuthorityRegistry();
  for (const asset of snapshot.assets) {
    const mesh = deserializeStudioEditableMesh(asset.mesh);
    const registered = registerStudioGeometryAuthority(geometry, asset.assetId, mesh);
    if (!registered.ok) throw new Error(registered.detail);
    geometry = registered.value;
    // Preserve revision/hash from snapshot via recommit if needed
    const current = geometry.records[asset.assetId]!;
    if (current.meshHash !== asset.meshHash) {
      // hash is derived from mesh content; mismatch means serialize round-trip bug
      throw new Error(
        `mesh hash mismatch for ${asset.assetId}: ${current.meshHash} vs ${asset.meshHash}`,
      );
    }
  }
  return finalizeState({
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId: snapshot.documentId,
    geometry,
    rightsBom: [...snapshot.rightsBom],
    dependencies: [...snapshot.dependencies],
    dirtyNodeIds: [...snapshot.dirtyNodeIds],
    milestoneLabel: snapshot.milestoneLabel,
    commandCount: snapshot.commandCount,
  });
}

export function createStudioHybridDccSession(
  documentId = "hybrid-dcc-doc",
): StudioHybridDccSession {
  const state = finalizeState({
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId,
    geometry: createStudioGeometryAuthorityRegistry(),
    rightsBom: [],
    dependencies: [],
    dirtyNodeIds: [],
    milestoneLabel: null,
    commandCount: 0,
  });
  return {
    state,
    journal: createStudioCommandJournal(),
    undoStack: [],
    redoStack: [],
    lastGroupId: null,
    undoGroupStack: [],
    redoGroupStack: [],
    lamport: 0,
  };
}

function appendCommand(
  session: StudioHybridDccSession,
  kind: string,
  payload: StudioCommandJsonValue,
  inversePayload: StudioCommandJsonValue,
  nextPartial: Omit<
    StudioHybridDccDocumentState,
    "stateHash" | "commandCount" | "format" | "version" | "documentId"
  > &
    Partial<Pick<StudioHybridDccDocumentState, "documentId">>,
): StudioHybridDccSession {
  const priorSnapshot = snapshotStudioHybridDccState(session.state);
  // Lamport/ids never decrease (journal uniqueness survives undo of document commandCount).
  const lamport = session.lamport + 1;
  const commandCount = session.state.commandCount + 1;
  const groupId = `group:${lamport}`;
  const envelope = createStudioCommandEnvelope({
    id: `cmd:${lamport}`,
    actorId: "local",
    lamport,
    transactionId: null,
    groupId,
    command: { kind, payload },
    inverse: { kind: `${kind}.undo`, payload: inversePayload },
  });
  session.journal.appendCommand(envelope);

  const state = finalizeState({
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId: nextPartial.documentId ?? session.state.documentId,
    geometry: nextPartial.geometry,
    rightsBom: nextPartial.rightsBom,
    dependencies: nextPartial.dependencies,
    dirtyNodeIds: nextPartial.dirtyNodeIds,
    milestoneLabel: nextPartial.milestoneLabel,
    commandCount,
  });

  return {
    state,
    journal: session.journal,
    undoStack: [...session.undoStack, priorSnapshot],
    redoStack: [],
    lastGroupId: groupId,
    undoGroupStack: [...session.undoGroupStack, groupId],
    redoGroupStack: [],
    lamport,
  };
}

export function hybridDccRegisterAsset(
  session: StudioHybridDccSession,
  assetId: string,
  mesh: StudioEditableMesh,
  rights: Omit<StudioRightsBomRecord, "assetId" | "contentHash">,
): StudioHybridDccSession {
  const reg = registerStudioGeometryAuthority(session.state.geometry, assetId, mesh);
  if (!reg.ok) throw new Error(reg.detail);
  const meshHash = hashStudioEditableMesh(mesh);
  const rightsBom: StudioRightsBomRecord[] = [
    ...session.state.rightsBom.filter((r) => r.assetId !== assetId),
    {
      assetId,
      ...rights,
      contentHash: `sha256:${sha256HexPortable(new TextEncoder().encode(meshHash))}`,
    },
  ];
  const dependencies = [
    ...session.state.dependencies,
    { fromId: assetId, toId: `shot:*`, kind: "geometry" as const },
  ];
  return appendCommand(
    session,
    "geometry.register",
    { assetId, meshHash },
    { assetId },
    {
      geometry: reg.value,
      rightsBom,
      dependencies,
      dirtyNodeIds: [...new Set([...session.state.dirtyNodeIds, assetId])],
      milestoneLabel: session.state.milestoneLabel,
    },
  );
}

export function hybridDccCommitGeometry(
  session: StudioHybridDccSession,
  assetId: string,
  mesh: StudioEditableMesh,
): StudioHybridDccSession {
  const prev = session.state.geometry.records[assetId];
  if (!prev) throw new Error(`asset ${assetId} not found`);
  const prevSnapshot = serializeStudioEditableMesh(prev.mesh);
  const reg = commitStudioGeometryAuthorityMesh(session.state.geometry, assetId, mesh);
  if (!reg.ok) throw new Error(reg.detail);
  const dependents = session.state.dependencies
    .filter((d) => d.fromId === assetId)
    .map((d) => d.toId);
  const dirtyNodeIds = [...new Set([...session.state.dirtyNodeIds, assetId, ...dependents])];
  // Journal payloads must be plain JSON; mesh snapshots are stored as nested plain objects.
  const forwardPayload = JSON.parse(
    JSON.stringify({
      assetId,
      meshHash: hashStudioEditableMesh(mesh),
      mesh: serializeStudioEditableMesh(mesh),
    }),
  ) as StudioCommandJsonValue;
  const inversePayload = JSON.parse(
    JSON.stringify({
      assetId,
      meshHash: prev.meshHash,
      mesh: prevSnapshot,
    }),
  ) as StudioCommandJsonValue;
  return appendCommand(
    session,
    "geometry.commit",
    forwardPayload,
    inversePayload,
    {
      geometry: reg.value,
      rightsBom: session.state.rightsBom,
      dependencies: session.state.dependencies,
      dirtyNodeIds,
      milestoneLabel: session.state.milestoneLabel,
    },
  );
}

export function hybridDccClearDirty(
  session: StudioHybridDccSession,
  nodeIds: readonly string[],
): StudioHybridDccSession {
  const drop = new Set(nodeIds);
  const dirtyNodeIds = session.state.dirtyNodeIds.filter((id) => !drop.has(id));
  return appendCommand(
    session,
    "dirty.clear",
    { nodeIds: [...nodeIds] },
    { nodeIds: [...session.state.dirtyNodeIds] },
    {
      geometry: session.state.geometry,
      rightsBom: session.state.rightsBom,
      dependencies: session.state.dependencies,
      dirtyNodeIds,
      milestoneLabel: session.state.milestoneLabel,
    },
  );
}

export function hybridDccAutosaveCheckpoint(
  session: StudioHybridDccSession,
  label = "autosave",
): StudioHybridDccSession {
  return appendCommand(
    session,
    "milestone",
    { label },
    { label: session.state.milestoneLabel },
    {
      geometry: session.state.geometry,
      rightsBom: session.state.rightsBom,
      dependencies: session.state.dependencies,
      dirtyNodeIds: session.state.dirtyNodeIds,
      milestoneLabel: label,
    },
  );
}

/** Undo last command — restores prior geometry/document state (DOC-002). */
export function hybridDccUndo(session: StudioHybridDccSession): StudioHybridDccSession {
  if (session.undoStack.length === 0) {
    throw new Error("UNDO_EMPTY");
  }
  const prior = session.undoStack[session.undoStack.length - 1]!;
  const currentSnap = snapshotStudioHybridDccState(session.state);
  const groupId = session.undoGroupStack[session.undoGroupStack.length - 1];
  const lamport = session.lamport + 1;
  if (groupId) {
    session.journal.undo({
      id: `undo:${lamport}`,
      actorId: "local",
      lamport,
      groupId,
    });
  }
  const state = restoreStudioHybridDccStateFromSnapshot(prior);
  return {
    state,
    journal: session.journal,
    undoStack: session.undoStack.slice(0, -1),
    redoStack: [...session.redoStack, currentSnap],
    lastGroupId: session.undoGroupStack[session.undoGroupStack.length - 2] ?? null,
    undoGroupStack: session.undoGroupStack.slice(0, -1),
    redoGroupStack: groupId
      ? [...session.redoGroupStack, groupId]
      : session.redoGroupStack,
    lamport,
  };
}

/** Redo last undone command — reapplies geometry/document state. */
export function hybridDccRedo(session: StudioHybridDccSession): StudioHybridDccSession {
  if (session.redoStack.length === 0) {
    throw new Error("REDO_EMPTY");
  }
  const next = session.redoStack[session.redoStack.length - 1]!;
  const currentSnap = snapshotStudioHybridDccState(session.state);
  const groupId = session.redoGroupStack[session.redoGroupStack.length - 1];
  const lamport = session.lamport + 1;
  if (groupId) {
    session.journal.redo({
      id: `redo:${lamport}`,
      actorId: "local",
      lamport,
      groupId,
    });
  }
  const state = restoreStudioHybridDccStateFromSnapshot(next);
  return {
    state,
    journal: session.journal,
    undoStack: [...session.undoStack, currentSnap],
    redoStack: session.redoStack.slice(0, -1),
    lastGroupId: groupId ?? session.lastGroupId,
    undoGroupStack: groupId
      ? [...session.undoGroupStack, groupId]
      : session.undoGroupStack,
    redoGroupStack: session.redoGroupStack.slice(0, -1),
    lamport,
  };
}

export function hybridDccCanUndo(session: StudioHybridDccSession): boolean {
  return session.undoStack.length > 0;
}

export function hybridDccCanRedo(session: StudioHybridDccSession): boolean {
  return session.redoStack.length > 0;
}

/**
 * DOC-007 selective undo — only rewinds commands owned by actorId.
 * Local hybrid session uses actor "local"; multi-actor journal groups are filtered by prefix.
 */
export function hybridDccSelectiveUndo(
  session: StudioHybridDccSession,
  actorId: string,
): StudioHybridDccSession {
  if (actorId !== "local") {
    throw new Error(
      `SELECTIVE_UNDO_FOREIGN: cannot undo actor ${actorId} from local session`,
    );
  }
  if (!hybridDccCanUndo(session)) {
    throw new Error("UNDO_EMPTY");
  }
  return hybridDccUndo(session);
}

function encodeSnapshot(snapshot: StudioHybridDccPersistedSnapshot): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot));
}

function decodeSnapshot(bytes: Uint8Array): StudioHybridDccPersistedSnapshot {
  return JSON.parse(new TextDecoder().decode(bytes)) as StudioHybridDccPersistedSnapshot;
}

async function readEntryPayload(
  adapter: StudioOpfsRecoveryJournalAdapter,
  entry: {
    readonly chunks: readonly { readonly path: string; readonly byteLength: number }[];
  },
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const ref of entry.chunks) {
    const part = await adapter.read(ref.path);
    if (!part) throw new Error(`missing OPFS chunk ${ref.path}`);
    chunks.push(part);
    total += part.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export interface StudioHybridDccOpfsPorts {
  readonly adapter: StudioOpfsRecoveryJournalAdapter;
  readonly journal: StudioOpfsRecoveryJournal;
}

/** Build real OPFS recovery journal ports (inject FakeOpfsAdapter in tests). */
export function createStudioHybridDccOpfsPorts(input: {
  readonly adapter: StudioOpfsRecoveryJournalAdapter;
  readonly documentId: string;
  readonly now?: () => number;
  readonly randomToken?: () => string;
}): StudioHybridDccOpfsPorts {
  const journal = createStudioOpfsRecoveryJournal({
    adapter: input.adapter,
    identity: {
      documentId: input.documentId,
      documentVersion: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
      engineVersion: STUDIO_HYBRID_DCC_ENGINE_VERSION,
    },
    now: input.now,
    randomToken: input.randomToken,
  });
  return { adapter: input.adapter, journal };
}

/**
 * Persist full document snapshot as OPFS checkpoint (DOC-004).
 * Payload is the complete geometry/document state — recovery reloads it.
 */
export async function hybridDccWriteOpfsCheckpoint(
  session: StudioHybridDccSession,
  ports: StudioHybridDccOpfsPorts,
  options: { readonly ownerId?: string; readonly pageId?: string } = {},
): Promise<{
  readonly sequence: number;
  readonly stateHash: string;
  readonly writer: StudioOpfsRecoveryWriterLease;
}> {
  const snapshot = snapshotStudioHybridDccState(session.state);
  const payload = encodeSnapshot(snapshot);
  const writer = await ports.journal.acquireWriter({
    ownerId: options.ownerId ?? "hybrid-dcc-writer",
  });
  try {
    const scan = await ports.journal.scan();
    const entry = await ports.journal.appendCheckpoint(writer, {
      id: `checkpoint-${session.state.commandCount}-${Date.now()}`,
      pageId: options.pageId ?? "hybrid-main",
      revision: session.state.commandCount,
      payload,
      compactThroughSequence: scan.lastSequence,
    });
    return {
      sequence: entry.sequence,
      stateHash: snapshot.stateHash,
      writer,
    };
  } finally {
    await ports.journal.releaseWriter(writer);
  }
}

/**
 * Simulate forced stop + recovery from OPFS journal (DOC-004).
 * Restores last committed checkpoint state with structural equality (mesh hashes).
 */
export async function hybridDccRecoverFromOpfs(
  ports: StudioHybridDccOpfsPorts,
): Promise<{
  readonly session: StudioHybridDccSession;
  readonly recoveredStateHash: string;
  readonly lastSequence: number;
  readonly checkpointFound: boolean;
  readonly assetIds: readonly string[];
}> {
  const scan = await ports.journal.scan();
  const checkpoints = scan.entries.filter((e) => e.kind === "checkpoint");
  if (checkpoints.length === 0) {
    const empty = createStudioHybridDccSession(ports.journal.identity.documentId);
    return {
      session: empty,
      recoveredStateHash: empty.state.stateHash,
      lastSequence: scan.lastSequence,
      checkpointFound: false,
      assetIds: [],
    };
  }
  const latest = checkpoints[checkpoints.length - 1]!;
  const payload = await readEntryPayload(ports.adapter, latest);
  const snapshot = decodeSnapshot(payload);
  const state = restoreStudioHybridDccStateFromSnapshot(snapshot);
  const session: StudioHybridDccSession = {
    state,
    journal: createStudioCommandJournal(),
    undoStack: [],
    redoStack: [],
    lastGroupId: null,
    undoGroupStack: [],
    redoGroupStack: [],
    lamport: state.commandCount,
  };
  return {
    session,
    recoveredStateHash: state.stateHash,
    lastSequence: latest.sequence,
    checkpointFound: true,
    assetIds: Object.keys(state.geometry.records).sort(),
  };
}

/**
 * DOC-004 recovery entry: requires real OPFS journal ports.
 * Writes a full-document checkpoint then restores into a fresh session
 * (geometry mesh hashes equal last committed state).
 */
export async function hybridDccRecoverFromJournal(
  session: StudioHybridDccSession,
  ports: StudioHybridDccOpfsPorts,
): Promise<{
  readonly recoveredStateHash: string;
  readonly lastSequence: number;
  readonly journalRestored: boolean;
  readonly checkpointFound: boolean;
  readonly session: StudioHybridDccSession;
  /** Structural equality: recovered mesh hashes match pre-crash session. */
  readonly meshHashesEqual: boolean;
}> {
  if (!ports?.adapter || !ports?.journal) {
    throw new Error(
      "hybridDccRecoverFromJournal requires StudioOpfsRecoveryJournal ports (adapter+journal)",
    );
  }
  const beforeHashes = Object.fromEntries(
    Object.entries(session.state.geometry.records).map(([id, r]) => [id, r.meshHash]),
  );
  const beforeStateHash = session.state.stateHash;
  await hybridDccWriteOpfsCheckpoint(session, ports);
  const recovered = await hybridDccRecoverFromOpfs(ports);
  const afterHashes = Object.fromEntries(
    Object.entries(recovered.session.state.geometry.records).map(([id, r]) => [
      id,
      r.meshHash,
    ]),
  );
  const meshHashesEqual =
    Object.keys(beforeHashes).length === Object.keys(afterHashes).length
    && Object.keys(beforeHashes).every((id) => beforeHashes[id] === afterHashes[id]);
  if (recovered.recoveredStateHash !== beforeStateHash || !meshHashesEqual) {
    throw new Error(
      `OPFS recovery mismatch: state ${beforeStateHash}→${recovered.recoveredStateHash} meshesEqual=${meshHashesEqual}`,
    );
  }
  return {
    recoveredStateHash: recovered.recoveredStateHash,
    lastSequence: recovered.lastSequence,
    journalRestored: true,
    checkpointFound: recovered.checkpointFound,
    session: recovered.session,
    meshHashesEqual,
  };
}

export function hybridDccContentAddressAsset(
  bytes: Uint8Array,
): `sha256:${string}` {
  return `sha256:${sha256HexPortable(bytes)}`;
}

/** Propagate dirty only to dependents of changed ids. */
export function hybridDccPropagateDirty(
  dependencies: readonly StudioHybridDccDependencyEdge[],
  changedIds: readonly string[],
): readonly string[] {
  const changed = new Set(changedIds);
  const dirty = new Set(changedIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of dependencies) {
      if (changed.has(edge.fromId) || dirty.has(edge.fromId)) {
        if (!dirty.has(edge.toId)) {
          dirty.add(edge.toId);
          grew = true;
        }
      }
    }
  }
  return [...dirty].sort();
}
