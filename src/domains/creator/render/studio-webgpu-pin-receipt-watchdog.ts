export type StudioGpuPinReceiptTimeoutReason = "first-visible" | "progress";

interface StudioGpuPinReceiptWatchdogScheduler {
  readonly setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface StudioGpuPinReceiptWatchdogOptions {
  readonly timeoutMs: number;
  readonly onTimeout: (
    reason: StudioGpuPinReceiptTimeoutReason,
    requestId: string,
  ) => void;
  readonly scheduler?: StudioGpuPinReceiptWatchdogScheduler;
}

const DEFAULT_SCHEDULER: StudioGpuPinReceiptWatchdogScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/**
 * Receipt-correlated fail-visible watchdog for a single pinned live-ink epoch.
 *
 * The first-visible timer is absolute: pointer-frame requests cannot extend it. After the first
 * exact receipt, the first outstanding request starts a progress timer; newer requests update the
 * expected identity without moving that deadline. An exact current receipt is the only event that
 * clears either deadline.
 */
export class StudioGpuPinReceiptWatchdog {
  private readonly timeoutMs: number;
  private readonly onTimeout: StudioGpuPinReceiptWatchdogOptions["onTimeout"];
  private readonly scheduler: StudioGpuPinReceiptWatchdogScheduler;
  private firstVisibleTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private firstVisible = false;
  private expectedRequestId: string | null = null;
  private lastReadyRequestId: string | null = null;
  private epoch = 0;

  public constructor(options: StudioGpuPinReceiptWatchdogOptions) {
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
    this.onTimeout = options.onTimeout;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  }

  public begin(requestId: string): void {
    this.cancelTimers();
    this.active = true;
    this.epoch += 1;
    this.expectedRequestId = requestId;
    this.firstVisible = this.lastReadyRequestId === requestId;
    if (this.firstVisible) return;

    const epoch = this.epoch;
    this.firstVisibleTimer = this.scheduler.setTimeout(() => {
      this.firstVisibleTimer = null;
      if (!this.active || this.epoch !== epoch || this.firstVisible) return;
      this.fail("first-visible");
    }, this.timeoutMs);
  }

  public request(requestId: string): void {
    if (!this.active) return;
    this.expectedRequestId = requestId;
    if (this.lastReadyRequestId === requestId) {
      this.acceptExactReceipt();
      return;
    }
    // Before any visible receipt the immutable epoch timer is the stronger deadline. Crucially,
    // high-frequency appends do not clear or replace it.
    if (!this.firstVisible || this.progressTimer) return;

    const epoch = this.epoch;
    this.progressTimer = this.scheduler.setTimeout(() => {
      this.progressTimer = null;
      if (
        !this.active
        || this.epoch !== epoch
        || this.expectedRequestId === this.lastReadyRequestId
      ) return;
      this.fail("progress");
    }, this.timeoutMs);
  }

  /** Records all receipts, including a synchronous receipt that can arrive before begin/request. */
  public receipt(requestId: string): boolean {
    this.lastReadyRequestId = requestId;
    if (!this.active || requestId !== this.expectedRequestId) return false;
    this.acceptExactReceipt();
    return true;
  }

  public hasExactReceipt(requestId: string): boolean {
    return this.lastReadyRequestId === requestId;
  }

  public cancel(): void {
    this.active = false;
    this.epoch += 1;
    this.expectedRequestId = null;
    this.firstVisible = false;
    this.cancelTimers();
  }

  private acceptExactReceipt(): void {
    this.firstVisible = true;
    if (this.firstVisibleTimer) {
      this.scheduler.clearTimeout(this.firstVisibleTimer);
      this.firstVisibleTimer = null;
    }
    if (this.progressTimer) {
      this.scheduler.clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private fail(reason: StudioGpuPinReceiptTimeoutReason): void {
    const requestId = this.expectedRequestId;
    if (!requestId) return;
    this.active = false;
    this.epoch += 1;
    this.cancelTimers();
    this.onTimeout(reason, requestId);
  }

  private cancelTimers(): void {
    if (this.firstVisibleTimer) this.scheduler.clearTimeout(this.firstVisibleTimer);
    if (this.progressTimer) this.scheduler.clearTimeout(this.progressTimer);
    this.firstVisibleTimer = null;
    this.progressTimer = null;
  }
}
