import {
  prepareStudioSkiaSpecialistRaster,
  type PrepareStudioSkiaSpecialistRasterOptions,
  type StudioSkiaSpecialistRasterElement,
  type StudioSkiaSpecialistRasterLease,
  type StudioSkiaSpecialistRasterPlan,
} from "./studio-skia-specialist-raster";

export const STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_ENTRIES = 128;
export const STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_CONCURRENT = 2;

export interface StudioSkiaSpecialistRasterCacheSnapshot {
  readonly disposed: boolean;
  readonly entryCount: number;
  readonly readyCount: number;
  readonly preparingCount: number;
  readonly activeReferenceCount: number;
  readonly residentBytes: number;
  readonly queuedCount: number;
  readonly activePreparations: number;
}

export interface StudioSkiaSpecialistRasterCacheAcquireOptions
  extends Omit<PrepareStudioSkiaSpecialistRasterOptions, "signal"> {
  readonly signal?: AbortSignal;
}

export interface StudioSkiaSpecialistRasterCache {
  acquire(
    element: StudioSkiaSpecialistRasterElement,
    plan: StudioSkiaSpecialistRasterPlan,
    options?: StudioSkiaSpecialistRasterCacheAcquireOptions,
  ): Promise<StudioSkiaSpecialistRasterLease>;
  invalidate(key: string): boolean;
  snapshot(): StudioSkiaSpecialistRasterCacheSnapshot;
  dispose(): void;
}

export interface CreateStudioSkiaSpecialistRasterCacheOptions {
  readonly maxResidentBytes?: number;
  readonly maxEntries?: number;
  readonly maxConcurrentPreparations?: number;
  readonly prepare?: typeof prepareStudioSkiaSpecialistRaster;
}

interface PendingPermit {
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  readonly signal: AbortSignal;
  active: boolean;
}

interface CacheEntry {
  readonly key: string;
  readonly controller: AbortController;
  promise: Promise<StudioSkiaSpecialistRasterLease>;
  lease: StudioSkiaSpecialistRasterLease | null;
  references: number;
  waiters: number;
  lastUsed: number;
  invalidated: boolean;
  removed: boolean;
}

function positiveSafeInteger(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function abortError(message = "Skia 전문 래스터 cache 요청이 취소되었습니다."): DOMException {
  return new DOMException(message, "AbortError");
}

function disposedError(): Error {
  return new Error("Skia 전문 래스터 cache가 이미 해제되었습니다.");
}

function racedWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export function createStudioSkiaSpecialistRasterCache(
  options: CreateStudioSkiaSpecialistRasterCacheOptions = {},
): StudioSkiaSpecialistRasterCache {
  const maxResidentBytes = positiveSafeInteger(
    options.maxResidentBytes,
    STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_BYTES,
  );
  const maxEntries = positiveSafeInteger(
    options.maxEntries,
    STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_ENTRIES,
  );
  const maxConcurrentPreparations = positiveSafeInteger(
    options.maxConcurrentPreparations,
    STUDIO_SKIA_SPECIALIST_RASTER_CACHE_MAX_CONCURRENT,
  );
  const prepare = options.prepare ?? prepareStudioSkiaSpecialistRaster;
  const entries = new Map<string, CacheEntry>();
  const queue: PendingPermit[] = [];
  let activePreparations = 0;
  let clock = 0;
  let disposed = false;

  const releasePermit = (): void => {
    activePreparations = Math.max(0, activePreparations - 1);
    grantPermits();
  };

  const grantPermits = (): void => {
    while (activePreparations < maxConcurrentPreparations && queue.length > 0) {
      const pending = queue.shift();
      if (!pending || !pending.active) continue;
      if (disposed || pending.signal.aborted) {
        pending.active = false;
        pending.reject(disposed ? disposedError() : abortError());
        continue;
      }
      pending.active = false;
      activePreparations += 1;
      let released = false;
      pending.resolve(() => {
        if (released) return;
        released = true;
        releasePermit();
      });
    }
  };

  const acquirePermit = (signal: AbortSignal): Promise<() => void> => {
    if (disposed) return Promise.reject(disposedError());
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<() => void>((resolve, reject) => {
      function onAbort(): void {
        if (!pending.active) return;
        pending.active = false;
        signal.removeEventListener("abort", onAbort);
        reject(abortError());
      }
      const pending: PendingPermit = {
        active: true,
        signal,
        resolve: (release) => {
          signal.removeEventListener("abort", onAbort);
          resolve(release);
        },
        reject: (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      };
      signal.addEventListener("abort", onAbort, { once: true });
      queue.push(pending);
      grantPermits();
    });
  };

  const removeEntry = (entry: CacheEntry): void => {
    if (entry.removed) return;
    entry.removed = true;
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    entry.controller.abort();
    entry.lease?.release();
    entry.lease = null;
  };

  const residentBytes = (): number => {
    let total = 0;
    for (const entry of entries.values()) {
      if (entry.lease) total += entry.lease.bytes;
    }
    return total;
  };

  const evict = (): void => {
    if (disposed) return;
    const candidates = [...entries.values()]
      .filter((entry) => entry.lease && entry.references === 0 && entry.waiters === 0)
      .sort((left, right) => {
        if (left.invalidated !== right.invalidated) return left.invalidated ? -1 : 1;
        return left.lastUsed - right.lastUsed;
      });
    let bytes = residentBytes();
    let count = entries.size;
    for (const entry of candidates) {
      if (!entry.invalidated && bytes <= maxResidentBytes && count <= maxEntries) break;
      bytes -= entry.lease?.bytes ?? 0;
      count -= 1;
      removeEntry(entry);
    }
  };

  const createEntry = (
    element: StudioSkiaSpecialistRasterElement,
    plan: StudioSkiaSpecialistRasterPlan,
    acquireOptions: StudioSkiaSpecialistRasterCacheAcquireOptions,
  ): CacheEntry => {
    const controller = new AbortController();
    const entry: CacheEntry = {
      key: plan.key,
      controller,
      promise: Promise.resolve(null as never),
      lease: null,
      references: 0,
      waiters: 0,
      lastUsed: ++clock,
      invalidated: false,
      removed: false,
    };
    entries.set(entry.key, entry);
    entry.promise = (async () => {
      const releasePermitForEntry = await acquirePermit(controller.signal);
      try {
        const lease = await prepare(element, plan, {
          ...(acquireOptions.authority ? { authority: acquireOptions.authority } : {}),
          ...(acquireOptions.dependencies ? { dependencies: acquireOptions.dependencies } : {}),
          ...(acquireOptions.consumer ? { consumer: acquireOptions.consumer } : {}),
          signal: controller.signal,
        });
        if (disposed || entry.removed || controller.signal.aborted) {
          lease.release();
          throw disposed ? disposedError() : abortError();
        }
        entry.lease = lease;
        entry.lastUsed = ++clock;
        evict();
        return lease;
      } catch (error) {
        removeEntry(entry);
        throw error;
      } finally {
        releasePermitForEntry();
      }
    })();
    return entry;
  };

  const releaseReference = (entry: CacheEntry): void => {
    if (entry.references > 0) entry.references -= 1;
    entry.lastUsed = ++clock;
    if (entry.invalidated && entry.references === 0 && entry.waiters === 0) removeEntry(entry);
    else evict();
  };

  const wrapLease = (entry: CacheEntry, lease: StudioSkiaSpecialistRasterLease): StudioSkiaSpecialistRasterLease => {
    let released = false;
    entry.references += 1;
    entry.lastUsed = ++clock;
    return Object.freeze({
      key: lease.key,
      src: lease.src,
      width: lease.width,
      height: lease.height,
      bytes: lease.bytes,
      localX: lease.localX,
      localY: lease.localY,
      displayWidth: lease.displayWidth,
      displayHeight: lease.displayHeight,
      capturesLiveFrame: lease.capturesLiveFrame,
      release(): void {
        if (released) return;
        released = true;
        releaseReference(entry);
      },
    });
  };

  const cache: StudioSkiaSpecialistRasterCache = {
    async acquire(
      element: StudioSkiaSpecialistRasterElement,
      plan: StudioSkiaSpecialistRasterPlan,
      acquireOptions: StudioSkiaSpecialistRasterCacheAcquireOptions = {},
    ) {
      if (disposed) throw disposedError();
      if (acquireOptions.signal?.aborted) throw abortError();
      let entry = entries.get(plan.key);
      if (!entry || entry.invalidated || entry.removed) {
        entry = createEntry(element, plan, acquireOptions);
      }
      entry.waiters += 1;
      entry.lastUsed = ++clock;
      try {
        const lease = await racedWithAbort(entry.promise, acquireOptions.signal);
        if (disposed || entry.removed) throw disposedError();
        return wrapLease(entry, lease);
      } finally {
        entry.waiters = Math.max(0, entry.waiters - 1);
        entry.lastUsed = ++clock;
        if (entry.waiters === 0 && entry.references === 0 && !entry.lease) {
          entry.controller.abort();
        }
        if (entry.invalidated && entry.waiters === 0 && entry.references === 0) removeEntry(entry);
        else evict();
      }
    },

    invalidate(key: string): boolean {
      const entry = entries.get(key);
      if (!entry) return false;
      entry.invalidated = true;
      if (entry.references === 0 && entry.waiters === 0) removeEntry(entry);
      return true;
    },

    snapshot(): StudioSkiaSpecialistRasterCacheSnapshot {
      let readyCount = 0;
      let preparingCount = 0;
      let activeReferenceCount = 0;
      for (const entry of entries.values()) {
        if (entry.lease) readyCount += 1;
        else preparingCount += 1;
        activeReferenceCount += entry.references;
      }
      return Object.freeze({
        disposed,
        entryCount: entries.size,
        readyCount,
        preparingCount,
        activeReferenceCount,
        residentBytes: residentBytes(),
        queuedCount: queue.filter((pending) => pending.active).length,
        activePreparations,
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const pending of queue.splice(0)) {
        if (!pending.active) continue;
        pending.active = false;
        pending.reject(disposedError());
      }
      for (const entry of [...entries.values()]) removeEntry(entry);
    },
  };
  return Object.freeze(cache);
}
