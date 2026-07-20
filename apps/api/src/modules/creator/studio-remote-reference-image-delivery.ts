export const STUDIO_REMOTE_REFERENCE_MAX_ACTIVE_DELIVERIES = 8;
export const STUDIO_REMOTE_REFERENCE_MAX_PENDING_DELIVERIES = 32;
export const STUDIO_REMOTE_REFERENCE_DELIVERY_DEADLINE_MS = 30_000;
export const STUDIO_REMOTE_REFERENCE_DELIVERY_WAIT_TIMEOUT_MS = 10_000;

export interface StudioRemoteReferenceImageDeliveryLease {
  /** Idempotent: response `finish` and `close` may both be observed. */
  release(): void;
}

export interface StudioRemoteReferenceImageResponseLifecycle {
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
  once(event: "finish" | "close", listener: () => void): unknown;
  off(event: "finish" | "close", listener: () => void): unknown;
  destroy(error?: Error): unknown;
}

type PendingDelivery = {
  readonly signal: AbortSignal;
  readonly resolve: (lease: StudioRemoteReferenceImageDeliveryLease) => void;
  readonly reject: (error: Error) => void;
  readonly abort: () => void;
  timeout: ReturnType<typeof setTimeout> | null;
};

export class StudioRemoteReferenceImageDeliveryAbortedError extends Error {
  constructor() {
    super("remote_reference_delivery_aborted");
    this.name = "StudioRemoteReferenceImageDeliveryAbortedError";
  }
}

export class StudioRemoteReferenceImageDeliveryBusyError extends Error {
  constructor() {
    super("remote_reference_delivery_busy");
    this.name = "StudioRemoteReferenceImageDeliveryBusyError";
  }
}

export class StudioRemoteReferenceImageDeliveryWaitTimeoutError extends Error {
  constructor() {
    super("remote_reference_delivery_wait_timeout");
    this.name = "StudioRemoteReferenceImageDeliveryWaitTimeoutError";
  }
}

/**
 * Bounds response retention separately from upstream fetch concurrency.
 *
 * A lease is acquired before fetching, so queued requests do not retain a validated 3,000,000-byte
 * payload (roughly 4,000,000 base64 characters plus bounded JSON metadata).
 * It remains active until Express reports response `finish` or `close`, covering base64 JSON
 * serialization and slow-client transmission. Waiting requests carry only small request metadata and
 * are both queue-bounded and abortable.
 */
export class StudioRemoteReferenceImageDeliveryLimiter {
  private active = 0;
  private readonly pending: PendingDelivery[] = [];

  constructor(
    private readonly maximumActive = STUDIO_REMOTE_REFERENCE_MAX_ACTIVE_DELIVERIES,
    private readonly maximumPending = STUDIO_REMOTE_REFERENCE_MAX_PENDING_DELIVERIES,
    private readonly waitTimeoutMs = STUDIO_REMOTE_REFERENCE_DELIVERY_WAIT_TIMEOUT_MS
  ) {
    if (!Number.isSafeInteger(maximumActive) || maximumActive < 1) {
      throw new RangeError("maximumActive must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maximumPending) || maximumPending < 0) {
      throw new RangeError("maximumPending must be a nonnegative safe integer");
    }
    if (!Number.isSafeInteger(waitTimeoutMs) || waitTimeoutMs < 1) {
      throw new RangeError("waitTimeoutMs must be a positive safe integer");
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  async acquire(signal: AbortSignal): Promise<StudioRemoteReferenceImageDeliveryLease> {
    if (signal.aborted) throw new StudioRemoteReferenceImageDeliveryAbortedError();
    if (this.active < this.maximumActive) return this.createLease();
    if (this.pending.length >= this.maximumPending) {
      throw new StudioRemoteReferenceImageDeliveryBusyError();
    }

    return new Promise<StudioRemoteReferenceImageDeliveryLease>((resolve, reject) => {
      const entry: PendingDelivery = {
        signal,
        resolve,
        reject,
        abort: () => {
          const index = this.pending.indexOf(entry);
          if (index < 0) return;
          this.pending.splice(index, 1);
          this.clearPendingEntry(entry);
          reject(new StudioRemoteReferenceImageDeliveryAbortedError());
        },
        timeout: null,
      };
      this.pending.push(entry);
      signal.addEventListener("abort", entry.abort, { once: true });
      entry.timeout = setTimeout(() => {
        const index = this.pending.indexOf(entry);
        if (index < 0) return;
        this.pending.splice(index, 1);
        this.clearPendingEntry(entry);
        reject(new StudioRemoteReferenceImageDeliveryWaitTimeoutError());
      }, this.waitTimeoutMs);
      entry.timeout.unref?.();
      // Close the small race between the first check and listener registration.
      if (signal.aborted) entry.abort();
    });
  }

  private createLease(): StudioRemoteReferenceImageDeliveryLease {
    this.active += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.active -= 1;
        this.drain();
      },
    };
  }

  private drain(): void {
    while (this.active < this.maximumActive && this.pending.length > 0) {
      const entry = this.pending.shift();
      if (!entry) return;
      this.clearPendingEntry(entry);
      if (entry.signal.aborted) {
        entry.reject(new StudioRemoteReferenceImageDeliveryAbortedError());
        continue;
      }
      entry.resolve(this.createLease());
    }
  }

  private clearPendingEntry(entry: PendingDelivery): void {
    entry.signal.removeEventListener("abort", entry.abort);
    if (entry.timeout) clearTimeout(entry.timeout);
    entry.timeout = null;
  }
}

/** Transfers lease ownership to the actual Express response lifecycle. */
export function bindStudioRemoteReferenceImageDeliveryLease(
  response: StudioRemoteReferenceImageResponseLifecycle,
  lease: StudioRemoteReferenceImageDeliveryLease,
  deadlineMs = STUDIO_REMOTE_REFERENCE_DELIVERY_DEADLINE_MS
): boolean {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
    throw new RangeError("deadlineMs must be a positive safe integer");
  }
  let released = false;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (released) return;
    released = true;
    if (deadline) clearTimeout(deadline);
    deadline = null;
    response.off("finish", release);
    response.off("close", release);
    lease.release();
  };

  if (response.writableEnded || response.destroyed) {
    release();
    return false;
  }
  response.once("finish", release);
  response.once("close", release);
  deadline = setTimeout(() => {
    if (released) return;
    if (response.writableEnded || response.destroyed) {
      release();
      return;
    }
    // Never free a slow-reader lease while its socket/body is still alive. Destroying the response
    // first bounds retained base64 JSON; `close` and this finally share the idempotent release path.
    try {
      response.destroy(new Error("remote reference delivery deadline exceeded"));
    } finally {
      release();
    }
  }, deadlineMs);
  deadline.unref?.();
  // Express may complete between the pre-check and listener registration.
  if (response.writableEnded || response.destroyed) release();
  return !released;
}

export const studioRemoteReferenceImageDeliveryLimiterProvider = {
  provide: StudioRemoteReferenceImageDeliveryLimiter,
  useFactory: () => new StudioRemoteReferenceImageDeliveryLimiter(),
};
