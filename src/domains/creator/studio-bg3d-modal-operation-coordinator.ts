export const STUDIO_BG3D_GLOBAL_ASSET_LOAD_CONCURRENCY = 1;

export interface StudioBg3dModalSession {
  readonly epoch: number;
}

export type StudioBg3dSceneMutationResult<T> =
  | {
      readonly status: "committed";
      readonly value: T;
    }
  | {
      readonly status: "stale";
    };

export interface StudioBg3dAssetLoadGateOptions {
  /** Checked immediately before the queued work receives a global load slot. */
  readonly isCurrent?: () => boolean;
}

export class StudioBg3dStaleModalOperationError extends Error {
  readonly code = "stale-modal-epoch";

  constructor() {
    super("닫힌 3D 배경 편집기의 비동기 작업입니다.");
    this.name = "AbortError";
  }
}

/**
 * Process-wide FIFO admission gate for decoded BG3D assets.
 *
 * A GLB load can temporarily own the source bytes, validation copy, decoded geometry, textures,
 * and GPU upload at the same time. Per-scene byte validation does not bound that transient peak,
 * so every modal generation shares this small gate. A queued stale generation is rejected before
 * it can allocate any of those resources.
 */
export class StudioBg3dAssetLoadGate {
  readonly #maxConcurrent: number;
  readonly #queue: Array<() => void> = [];
  #activeCount = 0;

  constructor(maxConcurrent = STUDIO_BG3D_GLOBAL_ASSET_LOAD_CONCURRENCY) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError("maxConcurrent must be a positive safe integer");
    }
    this.#maxConcurrent = maxConcurrent;
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  get queuedCount(): number {
    return this.#queue.length;
  }

  run<T>(
    task: () => Promise<T> | T,
    options: StudioBg3dAssetLoadGateOptions = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#queue.push(() => {
        void Promise.resolve()
          .then(() => {
            if (options.isCurrent?.() === false) {
              throw new StudioBg3dStaleModalOperationError();
            }
            return task();
          })
          .then(resolve, reject)
          .finally(() => {
            this.#activeCount -= 1;
            this.#drain();
          });
      });
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#activeCount < this.#maxConcurrent) {
      const start = this.#queue.shift();
      if (!start) return;
      this.#activeCount += 1;
      start();
    }
  }
}

/**
 * Global modal/session authority plus a FIFO scene-mutation lane.
 *
 * The editor is conditionally mounted, so a close/reopen cycle creates a fresh React tree while an
 * unabortable IndexedDB, decoder, or GPU task from the prior tree may still finish. Object identity
 * as well as the numeric epoch is required: only the exact active ticket can commit. Scene add and
 * delete operations share one lane across modal remounts, preventing a late add from resurrecting a
 * model after a later delete (or a late delete from removing a newly re-added model).
 */
export class StudioBg3dModalOperationCoordinator {
  #epoch = 0;
  #activeSession: StudioBg3dModalSession | null = null;
  #sceneMutationTail: Promise<void> = Promise.resolve();

  beginSession(): StudioBg3dModalSession {
    const session = Object.freeze({ epoch: ++this.#epoch });
    this.#activeSession = session;
    return session;
  }

  endSession(session: StudioBg3dModalSession): boolean {
    if (!this.isCurrent(session)) return false;
    this.#activeSession = null;
    this.#epoch += 1;
    return true;
  }

  isCurrent(session: StudioBg3dModalSession | null | undefined): boolean {
    return Boolean(session && this.#activeSession === session);
  }

  commitIfCurrent(session: StudioBg3dModalSession, commit: () => void): boolean {
    if (!this.isCurrent(session)) return false;
    commit();
    return true;
  }

  runSceneMutation<T>(
    session: StudioBg3dModalSession,
    prepare: () => Promise<T> | T,
    commit: (value: T) => void,
  ): Promise<StudioBg3dSceneMutationResult<T>> {
    const operation: Promise<StudioBg3dSceneMutationResult<T>> =
      this.#sceneMutationTail.then(async () => {
        if (!this.isCurrent(session)) return { status: "stale" };
        const value = await prepare();
        if (!this.isCurrent(session)) return { status: "stale" };
        // No await is permitted between the exact-session check and this synchronous commit.
        commit(value);
        return { status: "committed", value };
      });
    this.#sceneMutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export const studioBg3dGlobalAssetLoadGate = new StudioBg3dAssetLoadGate();
export const studioBg3dModalOperationCoordinator = new StudioBg3dModalOperationCoordinator();
