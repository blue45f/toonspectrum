import {
  STUDIO_OFFLINE_BRANCH_LIMITS,
  STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
  studioOfflineBranchOperationPayloadHashes,
  studioOfflineBranchPendingOperations,
  type StudioOfflineBranchConflict,
  type StudioOfflineBranchOperation,
  type StudioOfflineBranchReceipt,
  type StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";
import {
  applyStudioOfflineBranchOperationToYjs,
  currentStudioOfflineBranchFingerprint,
  planStudioOfflineSceneTransition,
  projectStudioOfflineBranchOperation,
  revertStudioOfflineBranchOperation,
  type StudioOfflinePreparedMutation,
} from "./studio-offline-branch-scene-bridge";
import { fingerprintStudioOfflineBranchValue } from "./studio-offline-branch-payload";
import {
  createProductStudioOfflineBranchStorage,
  type StudioOfflineBranchStorage,
} from "./studio-offline-branch-storage";
import {
  StudioOfflineBranchWorkerClient,
  type StudioOfflineBranchWorkerPort,
} from "./studio-offline-branch-worker-client";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type { StudioCrdtDraftProtectionBarrierResult } from "../live/studio-crdt-room-binding";
import type { StudioCanvasMutationIntent } from "../live/studio-live-canvas-mutation-gate";
import type { PageState } from "../studio-page-state";

const ZERO_CONTENT_HASH = `sha256:${"0".repeat(64)}`;

export interface StudioOfflineBranchRuntimeStatus {
  readonly state: StudioOfflineBranchSnapshot["branch"]["state"];
  readonly pendingOperations: number;
  readonly conflicts: number;
  readonly canonicalAuthority: boolean;
  readonly durability: "durable" | "memory-only";
  readonly storageMessage: string;
}

export interface StudioOfflineBranchStageResult {
  readonly staged: boolean;
  readonly operations: number;
  readonly unsupported: readonly string[];
}

export interface OpenStudioOfflineBranchRuntimeOptions {
  readonly workId: string;
  readonly scope: string;
  readonly actorId: string;
  readonly baseRevision?: string | null;
  readonly canonicalAuthority: boolean;
  readonly storage?: StudioOfflineBranchStorage;
  readonly worker?: StudioOfflineBranchWorkerPort;
  readonly now?: () => number;
  readonly randomId?: () => string;
  readonly onError?: (message: string) => void;
}

interface OptimisticEntry {
  readonly operation: StudioOfflineBranchOperation;
  readonly payload: Uint8Array | null;
  readonly previousPayload: Uint8Array | null;
}

function clonePages(pages: readonly PageState[]): PageState[] {
  return pages.map((page) => ({
    ...page,
    elements: [...page.elements],
    ...(page.groups ? { groups: [...page.groups] } : {}),
  }));
}

function defaultRandomId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 오프라인 작업 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

function operationOrder(
  left: StudioOfflineBranchOperation,
  right: StudioOfflineBranchOperation,
): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function operationConflict(
  operation: StudioOfflineBranchOperation,
  code: StudioOfflineBranchConflict["code"],
  message: string,
  detectedAt: number,
): StudioOfflineBranchConflict {
  return {
    operationId: operation.id,
    code,
    message: message.slice(0, STUDIO_OFFLINE_BRANCH_LIMITS.maxMessageLength),
    detectedAt,
  };
}

export class StudioOfflineBranchRuntime {
  private readonly workId: string;
  private readonly scope: string;
  private readonly actorId: string;
  private readonly storage: StudioOfflineBranchStorage;
  private readonly worker: StudioOfflineBranchWorkerPort;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly onError: (message: string) => void;
  private readonly listeners = new Set<(status: StudioOfflineBranchRuntimeStatus) => void>();
  private readonly payloads = new Map<string, Uint8Array>();
  private readonly optimistic = new Map<string, OptimisticEntry>();
  private canonicalPages: PageState[] = [];
  private snapshotValue: StudioOfflineBranchSnapshot;
  private canonicalAuthorityValue: boolean;
  private proposalDepth = 0;
  private closed = false;
  private serial: Promise<unknown> = Promise.resolve();
  private lastOperationCreatedAt = 0;

  private constructor(
    options: OpenStudioOfflineBranchRuntimeOptions,
    storage: StudioOfflineBranchStorage,
    worker: StudioOfflineBranchWorkerPort,
    snapshot: StudioOfflineBranchSnapshot,
  ) {
    this.workId = options.workId;
    this.scope = options.scope;
    this.actorId = options.actorId;
    this.storage = storage;
    this.worker = worker;
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? defaultRandomId;
    this.onError = options.onError ?? (() => undefined);
    this.snapshotValue = snapshot;
    this.canonicalAuthorityValue = options.canonicalAuthority;
    this.lastOperationCreatedAt = snapshot.operations.reduce(
      (maximum, operation) => Math.max(maximum, operation.createdAt),
      snapshot.branch.createdAt,
    );
  }

  static async create(
    options: OpenStudioOfflineBranchRuntimeOptions,
  ): Promise<StudioOfflineBranchRuntime> {
    const storage = options.storage ?? await createProductStudioOfflineBranchStorage();
    const worker = options.worker ?? new StudioOfflineBranchWorkerClient();
    const existing = await storage.loadDocument(options.scope, options.workId);
    const createdAt = (options.now ?? Date.now)();
    const snapshot = await worker.open({
      id: `offline-${options.randomId?.() ?? defaultRandomId()}`,
      workId: options.workId,
      scope: options.scope,
      actorId: options.actorId,
      baseRevision: options.baseRevision ?? null,
      createdAt,
    }, existing);
    const runtime = new StudioOfflineBranchRuntime(options, storage, worker, snapshot);
    await runtime.hydratePayloads();
    await runtime.persistDocument();
    return runtime;
  }

  get status(): StudioOfflineBranchRuntimeStatus {
    const pending = studioOfflineBranchPendingOperations(this.snapshotValue).length
      + this.optimistic.size;
    return {
      state: this.snapshotValue.branch.state,
      pendingOperations: pending,
      conflicts: Object.keys(this.snapshotValue.conflicts).length,
      canonicalAuthority: this.canonicalAuthorityValue,
      durability: this.storage.status.durability,
      storageMessage: this.storage.status.message,
    };
  }

  get snapshot(): StudioOfflineBranchSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: (status: StudioOfflineBranchRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const status = this.status;
    for (const listener of this.listeners) listener(status);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("offline branch runtime is closed"));
    const next = this.serial.then(task, task);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }

  private nextOperationTime(): number {
    const selected = Math.max(this.now(), this.lastOperationCreatedAt + 1);
    this.lastOperationCreatedAt = selected;
    return selected;
  }

  setCanonicalAuthority(value: boolean): void {
    if (this.canonicalAuthorityValue === value) return;
    this.canonicalAuthorityValue = value;
    this.notify();
  }

  beginProposal(_input: {
    readonly pageId: string;
    readonly elementIds: readonly string[];
    readonly intent: StudioCanvasMutationIntent;
  }): boolean {
    if (this.closed) return false;
    this.proposalDepth += 1;
    return true;
  }

  endProposal(): void {
    this.proposalDepth = Math.max(0, this.proposalDepth - 1);
  }

  shouldStageSceneTransition(): boolean {
    return this.proposalDepth > 0 || !this.canonicalAuthorityValue;
  }

  observeCanonicalPages(pages: readonly PageState[]): void {
    this.canonicalPages = clonePages(pages);
  }

  canonicalPagesSnapshot(): PageState[] {
    return clonePages(this.canonicalPages);
  }

  private causalPredecessorFor(
    mutation: StudioOfflinePreparedMutation,
  ): StudioOfflineBranchOperation | null {
    let predecessor: StudioOfflineBranchOperation | null = null;
    const consider = (operation: StudioOfflineBranchOperation): void => {
      if (
        operation.targetType !== mutation.targetType
        || operation.targetId !== mutation.targetId
        || operation.pageId !== mutation.pageId
      ) return;
      if (!predecessor || operationOrder(predecessor, operation) < 0) {
        predecessor = operation;
      }
    };
    for (const operation of this.snapshotValue.operations) consider(operation);
    for (const entry of this.optimistic.values()) consider(entry.operation);
    return predecessor;
  }

  private optimisticOperation(
    mutation: StudioOfflinePreparedMutation,
    id: string,
    createdAt: number,
  ): StudioOfflineBranchOperation {
    const predecessor = this.causalPredecessorFor(mutation);
    const causalKey = predecessor
      ? fingerprintStudioOfflineBranchValue({
          id: predecessor.id,
          dedupeKey: predecessor.dedupeKey,
        })
      : "root";
    return {
      version: STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
      id,
      // Semantic equality alone is not a safe idempotency key: A→B→A→B must keep the
      // final B transition. Chaining the key to the last operation on the same target keeps
      // retries/peer copies idempotent while preserving repeated edits after an intervening op.
      dedupeKey: `${mutation.dedupeKey}:${causalKey}`,
      targetType: mutation.targetType,
      action: mutation.action,
      targetId: mutation.targetId,
      pageId: mutation.pageId,
      layerId: mutation.layerId,
      beforeId: mutation.beforeId,
      previousBeforeId: mutation.previousBeforeId,
      expectedFingerprint: mutation.expectedFingerprint,
      resultFingerprint: mutation.resultFingerprint,
      payloadHash: mutation.payload ? ZERO_CONTENT_HASH : null,
      payloadBytes: mutation.payload?.byteLength ?? 0,
      previousPayloadHash: mutation.previousPayload ? ZERO_CONTENT_HASH : null,
      previousPayloadBytes: mutation.previousPayload?.byteLength ?? 0,
      actorId: this.actorId,
      createdAt,
    };
  }

  stageSceneTransition(
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
  ): boolean {
    const plan = planStudioOfflineSceneTransition(previousPages, nextPages);
    if (plan.unsupported.length > 0) {
      this.onError(plan.unsupported.join("\n"));
      return false;
    }
    if (plan.mutations.length === 0) return false;
    if (
      this.snapshotValue.operations.length
      + this.optimistic.size
      + plan.mutations.length
      > STUDIO_OFFLINE_BRANCH_LIMITS.maxOperations
    ) {
      this.onError("오프라인 변경 보관 한도를 초과했습니다. 먼저 서버 정본과 동기화해 주세요.");
      return false;
    }
    try {
      if (this.canonicalPages.length === 0) {
        this.canonicalPages = this.status.pendingOperations > 0
          ? this.reconstructCanonicalPages(previousPages)
          : clonePages(previousPages);
      }
    } catch (cause) {
      this.onError(
        cause instanceof Error ? cause.message : "오프라인 정본 기준을 복원하지 못했습니다.",
      );
      return false;
    }

    for (const mutation of plan.mutations) {
      const id = `offline-op-${this.randomId()}`;
      const operation = this.optimisticOperation(mutation, id, this.nextOperationTime());
      const entry = {
        operation,
        payload: mutation.payload ? Uint8Array.from(mutation.payload) : null,
        previousPayload: mutation.previousPayload
          ? Uint8Array.from(mutation.previousPayload)
          : null,
      } satisfies OptimisticEntry;
      this.optimistic.set(id, entry);
    }
    this.notify();

    void this.enqueue(() =>
      this.persistOptimisticEntries([...this.optimistic.values()])
    ).catch((cause) => {
      this.onError(
        cause instanceof Error ? cause.message : "오프라인 변경을 영속화하지 못했습니다.",
      );
    });
    return true;
  }

  private async persistOptimisticEntries(
    entries: readonly OptimisticEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const durable: StudioOfflineBranchOperation[] = [];
    for (const entry of entries) {
      if (!this.optimistic.has(entry.operation.id)) continue;
      const resultRef = entry.payload
        ? await this.storage.putPayload(entry.payload)
        : null;
      const previousRef = entry.previousPayload
        ? await this.storage.putPayload(entry.previousPayload)
        : null;
      durable.push({
        ...entry.operation,
        payloadHash: resultRef?.hash ?? null,
        payloadBytes: resultRef?.bytes ?? 0,
        previousPayloadHash: previousRef?.hash ?? null,
        previousPayloadBytes: previousRef?.bytes ?? 0,
      });
      if (resultRef && entry.payload) {
        this.payloads.set(resultRef.hash, Uint8Array.from(entry.payload));
      }
      if (previousRef && entry.previousPayload) {
        this.payloads.set(previousRef.hash, Uint8Array.from(entry.previousPayload));
      }
    }
    if (durable.length === 0) return;
    const appended = await this.worker.append(
      durable,
      Math.max(this.now(), this.lastOperationCreatedAt),
    );
    await this.persistDocument(appended.snapshot);
    this.snapshotValue = appended.snapshot;
    for (const entry of entries) this.optimistic.delete(entry.operation.id);
    this.notify();
  }

  projectPages(canonicalPages: readonly PageState[]): PageState[] {
    let projected = clonePages(canonicalPages);
    const pendingEntries: OptimisticEntry[] = studioOfflineBranchPendingOperations(this.snapshotValue)
      .map((operation) => ({
        operation,
        payload: operation.payloadHash ? this.payloads.get(operation.payloadHash) ?? null : null,
        previousPayload: operation.previousPayloadHash
          ? this.payloads.get(operation.previousPayloadHash) ?? null
          : null,
      }));
    const entries = [...pendingEntries, ...this.optimistic.values()]
      .sort((left, right) => operationOrder(left.operation, right.operation));
    for (const entry of entries) {
      if (this.snapshotValue.conflicts[entry.operation.id]) continue;
      try {
        projected = projectStudioOfflineBranchOperation(
          projected,
          entry.operation,
          entry.payload,
        );
      } catch {
        // Persisted conflict recording happens during hydration/promotion. Rendering remains usable.
      }
    }
    return projected;
  }

  reconstructCanonicalPages(projectedPages: readonly PageState[]): PageState[] {
    let canonical = clonePages(projectedPages);
    const pendingEntries: OptimisticEntry[] = studioOfflineBranchPendingOperations(this.snapshotValue)
      .map((operation) => ({
        operation,
        payload: operation.payloadHash ? this.payloads.get(operation.payloadHash) ?? null : null,
        previousPayload: operation.previousPayloadHash
          ? this.payloads.get(operation.previousPayloadHash) ?? null
          : null,
      }));
    const entries = [...pendingEntries, ...this.optimistic.values()]
      .sort((left, right) => operationOrder(right.operation, left.operation));
    for (const entry of entries) {
      if (this.snapshotValue.conflicts[entry.operation.id]) continue;
      const current = currentStudioOfflineBranchFingerprint(canonical, entry.operation);
      if (current !== entry.operation.resultFingerprint) continue;
      canonical = revertStudioOfflineBranchOperation(
        canonical,
        entry.operation,
        entry.previousPayload,
      );
    }
    return canonical;
  }

  private async hydratePayloads(): Promise<void> {
    const conflicts: StudioOfflineBranchConflict[] = [];
    for (const operation of studioOfflineBranchPendingOperations(this.snapshotValue)) {
      for (const hash of studioOfflineBranchOperationPayloadHashes(operation)) {
        if (this.payloads.has(hash)) continue;
        try {
          const payload = await this.storage.getPayload(hash);
          if (!payload) {
            conflicts.push(operationConflict(
              operation,
              "payload-missing",
              "오프라인 변경 payload를 이 기기에서 찾지 못했습니다.",
              this.now(),
            ));
            continue;
          }
          this.payloads.set(hash, Uint8Array.from(payload));
        } catch (cause) {
          conflicts.push(operationConflict(
            operation,
            "payload-corrupt",
            cause instanceof Error ? cause.message : "오프라인 payload 검증에 실패했습니다.",
            this.now(),
          ));
        }
      }
    }
    if (conflicts.length > 0) {
      this.snapshotValue = await this.worker.recordConflicts(conflicts, this.now());
    }
  }

  private async persistDocument(
    snapshot = this.snapshotValue,
  ): Promise<void> {
    const bytes = await this.worker.save();
    await this.storage.saveDocument(this.scope, this.workId, bytes, snapshot);
    const hashes = studioOfflineBranchPendingOperations(snapshot)
      .flatMap(studioOfflineBranchOperationPayloadHashes);
    await this.storage.setPayloadRefs(this.scope, this.workId, [...new Set(hashes)]);
  }

  async exportPeerDocument(): Promise<Uint8Array> {
    await this.enqueue(() =>
      this.persistOptimisticEntries([...this.optimistic.values()])
    );
    return this.worker.save();
  }

  async peerPayloads(): Promise<readonly { hash: string; bytes: Uint8Array }[]> {
    await this.enqueue(() =>
      this.persistOptimisticEntries([...this.optimistic.values()])
    );
    const hashes = new Set(
      studioOfflineBranchPendingOperations(this.snapshotValue)
        .flatMap(studioOfflineBranchOperationPayloadHashes),
    );
    const payloads: Array<{ hash: string; bytes: Uint8Array }> = [];
    for (const hash of hashes) {
      const bytes = this.payloads.get(hash) ?? await this.storage.getPayload(hash);
      if (!bytes) continue;
      this.payloads.set(hash, Uint8Array.from(bytes));
      payloads.push({ hash, bytes: Uint8Array.from(bytes) });
    }
    return payloads;
  }

  async acceptPeerPayload(hash: string, bytes: Uint8Array): Promise<void> {
    const stored = await this.storage.putPayload(bytes);
    if (stored.hash !== hash) throw new Error("피어 payload의 content hash가 일치하지 않습니다.");
    this.payloads.set(hash, Uint8Array.from(bytes));
  }

  importPeerDocument(
    _peerId: string,
    bytes: Uint8Array,
  ): Promise<{ changed: boolean; replyNeeded: boolean }> {
    return this.enqueue(async () => {
      await this.persistOptimisticEntries([...this.optimistic.values()]);
      const imported = await this.worker.importPeerDocument(bytes, this.now());
      this.snapshotValue = imported.snapshot;
      await this.hydratePayloads();
      await this.persistDocument();
      this.notify();
      return { changed: imported.changed, replyNeeded: imported.replyNeeded };
    });
  }

  promotePending(
    document: StudioCrdtDocument,
    protect: () => Promise<StudioCrdtDraftProtectionBarrierResult>,
  ): Promise<void> {
    return this.enqueue(async () => {
      await this.persistOptimisticEntries([...this.optimistic.values()]);
      if (!this.canonicalAuthorityValue || this.canonicalPages.length === 0) return;
      const pending = studioOfflineBranchPendingOperations(this.snapshotValue)
        .sort(operationOrder);
      if (pending.length === 0) return;

      const conflicts: StudioOfflineBranchConflict[] = [];
      const localReceipts: StudioOfflineBranchReceipt[] = [];
      let canonical = clonePages(this.canonicalPages);
      for (const operation of pending) {
        if (this.snapshotValue.conflicts[operation.id]) continue;
        const current = currentStudioOfflineBranchFingerprint(canonical, operation);
        const alreadyApplied = current === operation.resultFingerprint;
        if (!alreadyApplied) {
          if (operation.expectedFingerprint === null && current !== null) {
            conflicts.push(operationConflict(
              operation,
              "target-exists",
              "정본에 같은 식별자의 요소가 이미 있어 자동 병합하지 않았습니다.",
              this.now(),
            ));
            continue;
          }
          if (operation.expectedFingerprint !== null && current === null) {
            conflicts.push(operationConflict(
              operation,
              "target-missing",
              "오프라인에서 수정한 대상이 정본에서 삭제되어 자동 병합하지 않았습니다.",
              this.now(),
            ));
            continue;
          }
          if (
            operation.expectedFingerprint !== null
            && current !== operation.expectedFingerprint
          ) {
            conflicts.push(operationConflict(
              operation,
              "target-changed",
              "오프라인 편집 이후 정본 대상이 변경되어 검토가 필요합니다.",
              this.now(),
            ));
            continue;
          }
          const payload = operation.payloadHash
            ? this.payloads.get(operation.payloadHash) ?? null
            : null;
          try {
            applyStudioOfflineBranchOperationToYjs(document, operation, payload);
            canonical = projectStudioOfflineBranchOperation(canonical, operation, payload);
          } catch (cause) {
            conflicts.push(operationConflict(
              operation,
              "unsupported",
              cause instanceof Error ? cause.message : "Yjs 정본에 오프라인 변경을 적용하지 못했습니다.",
              this.now(),
            ));
            continue;
          }
        }
        localReceipts.push({
          operationId: operation.id,
          state: "canonical-local",
          yjsUpdateId: operation.id,
          serverSequence: null,
          appliedAt: this.now(),
        });
      }

      if (conflicts.length > 0) {
        this.snapshotValue = await this.worker.recordConflicts(conflicts, this.now());
      }
      if (localReceipts.length > 0) {
        this.snapshotValue = await this.worker.recordReceipts(localReceipts, this.now());
        this.canonicalPages = canonical;
        await this.persistDocument();
      }
      if (localReceipts.length === 0) {
        await this.persistDocument();
        this.notify();
        return;
      }

      const protection = await protect();
      if (protection.protection === "server" && protection.serverSequence) {
        const serverReceipts: StudioOfflineBranchReceipt[] = localReceipts.map((receipt) => ({
          ...receipt,
          state: "server",
          serverSequence: protection.serverSequence,
          appliedAt: protection.acknowledgedAt ?? this.now(),
        }));
        this.snapshotValue = await this.worker.recordReceipts(serverReceipts, this.now());
        await this.persistDocument();
      }
      this.notify();
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.serial;
    await this.persistOptimisticEntries([...this.optimistic.values()]);
    await this.persistDocument();
    this.closed = true;
    this.listeners.clear();
    await this.worker.close();
  }
}

export { studioAutomergeOfflineBranchEnabled } from "./studio-offline-branch-feature";
