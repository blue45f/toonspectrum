import type { CreateStudioOfflineBranchInput } from "./studio-offline-branch-automerge";
import type {
  StudioOfflineBranchConflict,
  StudioOfflineBranchOperation,
  StudioOfflineBranchReceipt,
  StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";
import type {
  StudioOfflineBranchWorkerCommand,
  StudioOfflineBranchWorkerLike,
  StudioOfflineBranchWorkerResponse,
  StudioOfflineBranchWorkerResult,
} from "./studio-offline-branch-worker-protocol";

type StudioOfflineBranchWorkerCommandInput =
  StudioOfflineBranchWorkerCommand extends infer TCommand
    ? TCommand extends { readonly requestId: number }
      ? Omit<TCommand, "requestId">
      : never
    : never;

export type StudioOfflineBranchWorkerFactory = () => StudioOfflineBranchWorkerLike;

function productWorkerFactory(): StudioOfflineBranchWorkerLike {
  return new Worker(
    new URL("./studio-offline-branch.worker.ts", import.meta.url),
    { type: "module", name: "toonstudio-automerge-offline-branch" },
  );
}

interface PendingRequest {
  readonly resolve: (result: StudioOfflineBranchWorkerResult) => void;
  readonly reject: (cause: unknown) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface StudioOfflineBranchWorkerClientOptions {
  readonly createWorker?: StudioOfflineBranchWorkerFactory;
  readonly timeoutMs?: number;
}

export interface StudioOfflineBranchWorkerPort {
  open(
    input: CreateStudioOfflineBranchInput,
    bytes: Uint8Array | null,
  ): Promise<StudioOfflineBranchSnapshot>;
  append(
    operations: readonly StudioOfflineBranchOperation[],
    updatedAt: number,
  ): Promise<{ count: number; snapshot: StudioOfflineBranchSnapshot }>;
  recordReceipts(
    receipts: readonly StudioOfflineBranchReceipt[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot>;
  recordConflicts(
    conflicts: readonly StudioOfflineBranchConflict[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot>;
  snapshot(): Promise<StudioOfflineBranchSnapshot>;
  save(): Promise<Uint8Array>;
  importPeerDocument(
    bytes: Uint8Array,
    updatedAt: number,
  ): Promise<{
    changed: boolean;
    replyNeeded: boolean;
    snapshot: StudioOfflineBranchSnapshot;
  }>;
  close(): Promise<void>;
}

export class StudioOfflineBranchWorkerClient implements StudioOfflineBranchWorkerPort {
  private readonly worker: StudioOfflineBranchWorkerLike;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, PendingRequest>();
  private requestId = 0;
  private closed = false;

  private readonly onMessage = (event: MessageEvent<StudioOfflineBranchWorkerResponse>): void => {
    const response = event.data;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timeout);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error));
  };

  constructor(options: StudioOfflineBranchWorkerClientOptions = {}) {
    this.worker = (options.createWorker ?? productWorkerFactory)();
    this.timeoutMs = Math.max(1_000, Math.min(60_000, options.timeoutMs ?? 15_000));
    this.worker.addEventListener("message", this.onMessage);
  }

  private request(
    command: StudioOfflineBranchWorkerCommandInput,
    transfer: Transferable[] = [],
  ): Promise<StudioOfflineBranchWorkerResult> {
    if (this.closed) return Promise.reject(new Error("offline branch worker client is closed"));
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("offline branch worker request timed out"));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timeout });
      try {
        this.worker.postMessage(
          { ...command, requestId } as StudioOfflineBranchWorkerCommand,
          transfer,
        );
      } catch (cause) {
        clearTimeout(timeout);
        this.pending.delete(requestId);
        reject(cause);
      }
    });
  }

  async open(
    input: CreateStudioOfflineBranchInput,
    bytes: Uint8Array | null,
  ): Promise<StudioOfflineBranchSnapshot> {
    const payload = bytes ? Uint8Array.from(bytes) : null;
    const result = await this.request(
      { type: "open", input, bytes: payload },
      payload ? [payload.buffer] : [],
    );
    if (result.kind !== "opened") {
      throw new Error("offline branch worker returned an invalid open result");
    }
    return result.snapshot;
  }

  async append(
    operations: readonly StudioOfflineBranchOperation[],
    updatedAt: number,
  ): Promise<{ count: number; snapshot: StudioOfflineBranchSnapshot }> {
    const result = await this.request({ type: "append", operations, updatedAt });
    if (result.kind !== "appended") {
      throw new Error("offline branch worker returned an invalid append result");
    }
    return { count: result.count, snapshot: result.snapshot };
  }

  async recordReceipts(
    receipts: readonly StudioOfflineBranchReceipt[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    const result = await this.request({ type: "receipts", receipts, updatedAt });
    if (result.kind !== "updated") {
      throw new Error("offline branch worker returned an invalid receipt result");
    }
    return result.snapshot;
  }

  async recordConflicts(
    conflicts: readonly StudioOfflineBranchConflict[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    const result = await this.request({ type: "conflicts", conflicts, updatedAt });
    if (result.kind !== "updated") {
      throw new Error("offline branch worker returned an invalid conflict result");
    }
    return result.snapshot;
  }

  async snapshot(): Promise<StudioOfflineBranchSnapshot> {
    const result = await this.request({ type: "snapshot" });
    if (result.kind !== "snapshot") {
      throw new Error("offline branch worker returned an invalid snapshot result");
    }
    return result.snapshot;
  }

  async save(): Promise<Uint8Array> {
    const result = await this.request({ type: "save" });
    if (result.kind !== "saved") {
      throw new Error("offline branch worker returned an invalid save result");
    }
    return Uint8Array.from(result.bytes);
  }

  async importPeerDocument(
    bytes: Uint8Array,
    updatedAt: number,
  ): Promise<{
    changed: boolean;
    replyNeeded: boolean;
    snapshot: StudioOfflineBranchSnapshot;
  }> {
    const payload = Uint8Array.from(bytes);
    const result = await this.request(
      { type: "import-peer", bytes: payload, updatedAt },
      [payload.buffer],
    );
    if (result.kind !== "imported") {
      throw new Error("offline branch worker returned an invalid peer import result");
    }
    return {
      changed: result.changed,
      replyNeeded: result.replyNeeded,
      snapshot: result.snapshot,
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      const result = await this.request({ type: "close" });
      if (result.kind !== "closed") throw new Error("offline branch worker did not close");
    } finally {
      this.closed = true;
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("offline branch worker client closed"));
      }
      this.pending.clear();
    }
  }
}
