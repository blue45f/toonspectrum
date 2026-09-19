import { SpecialistError } from "./specialist-contract";

export interface SpecialistQueueLimits {
  readonly maxJobs: number;
  readonly maxSnapshotBytes: number;
  readonly maxWaitMs: number;
}
export const SPECIALIST_QUEUE_LIMITS: SpecialistQueueLimits = Object.freeze({
  maxJobs: 5,
  maxSnapshotBytes: 256 * 1024 * 1024,
  maxWaitMs: 120_000,
});
interface Entry {
  active: boolean;
  finished: boolean;
  start: () => void;
  position: (position: number) => void;
}
/** One running specialist per JS realm. This is NOT a cross-tab or global GPU-memory manager. */
export class SpecialistJobQueue {
  private readonly waiting: Entry[] = [];
  private active: Entry | undefined;
  private reservedBytes = 0;
  private jobs = 0;
  private readonly limits: SpecialistQueueLimits;
  constructor(limits: SpecialistQueueLimits = SPECIALIST_QUEUE_LIMITS) {
    for (const value of Object.values(limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError("Invalid specialist queue limits.");
    this.limits = Object.freeze({ ...limits });
  }
  snapshot(): {
    readonly active: number;
    readonly queued: number;
    readonly snapshotBytes: number;
  } {
    return Object.freeze({
      active: this.active ? 1 : 0,
      queued: this.waiting.length,
      snapshotBytes: this.reservedBytes,
    });
  }
  run<T>(input: {
    readonly bytes: number;
    readonly signal?: AbortSignal;
    readonly onPosition?: (position: number) => void;
    /** Called only AFTER reservation. Copy inputs here, start the worker in the returned function. */
    readonly prepare: () => () => Promise<T>;
  }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (input.signal?.aborted) {
        reject(new SpecialistError("cancelled", "Cancelled."));
        return;
      }
      if (
        !Number.isSafeInteger(input.bytes) ||
        input.bytes < 1 ||
        this.jobs >= this.limits.maxJobs ||
        input.bytes > this.limits.maxSnapshotBytes - this.reservedBytes
      ) {
        reject(
          new SpecialistError(
            "budget",
            "The specialist queue is full. Finish or cancel an existing job before submitting more input.",
          ),
        );
        return;
      }
      this.reservedBytes += input.bytes;
      this.jobs++;
      let work: (() => Promise<T>) | undefined;
      try {
        work = input.prepare();
      } catch (error) {
        this.reservedBytes -= input.bytes;
        this.jobs--;
        reject(error);
        return;
      }
      const entry: Entry = {
        active: false,
        finished: false,
        position: (position) => {
          try {
            input.onPosition?.(position);
          } catch {
            /* UI only. */
          }
        },
        start: () => {
          if (entry.finished) return;
          entry.active = true;
          this.active = entry;
          clearTimeout(timer);
          entry.position(0);
          if (input.signal?.aborted) {
            finish(false, new SpecialistError("cancelled", "Cancelled."));
            return;
          }
          const execute = work!;
          work = undefined;
          try {
            Promise.resolve(execute()).then(
              (value) => finish(true, value),
              (error: unknown) => finish(false, error),
            );
          } catch (error) {
            finish(false, error);
          }
        },
      };
      const finish = (ok: boolean, value: unknown) => {
        if (entry.finished) return;
        entry.finished = true;
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", cancel);
        work = undefined;
        entry.start = () => {};
        entry.position = () => {};
        const index = this.waiting.indexOf(entry);
        if (index >= 0) this.waiting.splice(index, 1);
        if (this.active === entry) this.active = undefined;
        this.reservedBytes -= input.bytes;
        this.jobs--;
        if (ok) resolve(value as T);
        else reject(value);
        this.drain();
      };
      const cancel = () => {
        // Active jobs retain their reservation until their Worker is terminated/settled by the client.
        if (!entry.active)
          finish(
            false,
            new SpecialistError(
              "cancelled",
              "Queued processing was cancelled before starting a worker.",
            ),
          );
      };
      input.signal?.addEventListener("abort", cancel, { once: true });
      this.waiting.push(entry);
      const timer = setTimeout(() => {
        if (!entry.active)
          finish(
            false,
            new SpecialistError(
              "timeout",
              "The queued job timed out before starting a worker.",
            ),
          );
      }, this.limits.maxWaitMs);
      if (input.signal?.aborted) cancel();
      this.drain();
    });
  }
  private drain(): void {
    if (!this.active) this.waiting.shift()?.start();
    // Observers can cancel/re-enter; use a snapshot and recheck membership.
    for (const entry of [...this.waiting]) {
      if (entry.finished || entry.active) continue;
      const index = this.waiting.indexOf(entry);
      if (index >= 0) entry.position(index + 1);
    }
  }
}
export const scene3dSpecialistJobQueue = new SpecialistJobQueue();
