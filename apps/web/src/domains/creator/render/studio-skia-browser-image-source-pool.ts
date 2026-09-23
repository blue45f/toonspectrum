/**
 * Browser-owned image source pool for retained Skia raster preparation.
 *
 * Keeping an HTMLImageElement alive is load-bearing for animated GIFs: repeated preparation draws
 * the currently advanced browser frame instead of constructing a fresh element that starts again at
 * frame zero. Static sources benefit from the same decode de-duplication and bounded idle LRU.
 */

export const STUDIO_SKIA_BROWSER_IMAGE_SOURCE_POOL_MAX_ENTRIES = 24;

export interface StudioSkiaBrowserImageSourceLease {
  readonly source: string;
  readonly image: HTMLImageElement;
  release(): void;
}

export interface StudioSkiaBrowserImageSourcePoolSnapshot {
  readonly disposed: boolean;
  readonly entryCount: number;
  readonly readyCount: number;
  readonly loadingCount: number;
  readonly activeReferenceCount: number;
}

export interface StudioSkiaBrowserImageSourcePool {
  acquire(source: string, signal?: AbortSignal): Promise<StudioSkiaBrowserImageSourceLease>;
  invalidate(source: string): boolean;
  snapshot(): StudioSkiaBrowserImageSourcePoolSnapshot;
  dispose(): void;
}

export interface CreateStudioSkiaBrowserImageSourcePoolOptions {
  readonly maxEntries?: number;
  readonly load?: (source: string, signal: AbortSignal) => Promise<HTMLImageElement>;
  readonly disposeImage?: (image: HTMLImageElement) => void;
}

interface PoolEntry {
  readonly source: string;
  readonly controller: AbortController;
  promise: Promise<HTMLImageElement>;
  image: HTMLImageElement | null;
  references: number;
  waiters: number;
  lastUsed: number;
  invalidated: boolean;
  removed: boolean;
}

function abortError(): DOMException {
  return new DOMException("Skia image source 요청이 취소되었습니다.", "AbortError");
}

function disposedError(): Error {
  return new Error("Skia image source pool이 이미 해제되었습니다.");
}

function normalizeSource(source: string): string {
  const normalized = typeof source === "string" ? source.trim() : "";
  if (!normalized) throw new TypeError("Skia image source는 비어 있을 수 없습니다.");
  return normalized;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
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

async function loadBrowserImage(source: string, signal: AbortSignal): Promise<HTMLImageElement> {
  if (typeof Image !== "function") throw new Error("브라우저 이미지 디코더를 사용할 수 없습니다.");
  if (signal.aborted) throw abortError();
  const image = new Image();
  image.decoding = "async";
  if (/^https?:/iu.test(source)) image.crossOrigin = "anonymous";
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const onAbort = () => {
      cleanup();
      image.src = "";
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      image.src = "";
      reject(new Error("Skia image source를 디코딩하지 못했습니다."));
    };
    image.src = source;
  });
}

export function createStudioSkiaBrowserImageSourcePool(
  options: CreateStudioSkiaBrowserImageSourcePoolOptions = {},
): StudioSkiaBrowserImageSourcePool {
  const maxEntries = Number.isSafeInteger(options.maxEntries) && (options.maxEntries ?? 0) > 0
    ? options.maxEntries!
    : STUDIO_SKIA_BROWSER_IMAGE_SOURCE_POOL_MAX_ENTRIES;
  const load = options.load ?? loadBrowserImage;
  const disposeImage = options.disposeImage ?? ((image: HTMLImageElement) => {
    image.src = "";
  });
  const entries = new Map<string, PoolEntry>();
  let clock = 0;
  let disposed = false;

  const remove = (entry: PoolEntry): void => {
    if (entry.removed) return;
    entry.removed = true;
    if (entries.get(entry.source) === entry) entries.delete(entry.source);
    entry.controller.abort();
    if (entry.image) disposeImage(entry.image);
    entry.image = null;
  };

  const evict = (): void => {
    if (disposed || entries.size <= maxEntries) return;
    const idle = [...entries.values()]
      .filter((entry) => entry.image && entry.references === 0 && entry.waiters === 0)
      .sort((left, right) => {
        if (left.invalidated !== right.invalidated) return left.invalidated ? -1 : 1;
        return left.lastUsed - right.lastUsed;
      });
    for (const entry of idle) {
      if (entries.size <= maxEntries && !entry.invalidated) break;
      remove(entry);
    }
  };

  const createEntry = (source: string): PoolEntry => {
    const controller = new AbortController();
    const entry: PoolEntry = {
      source,
      controller,
      promise: Promise.resolve(null as never),
      image: null,
      references: 0,
      waiters: 0,
      lastUsed: ++clock,
      invalidated: false,
      removed: false,
    };
    entries.set(source, entry);
    entry.promise = load(source, controller.signal).then(
      (image) => {
        if (disposed || entry.removed || controller.signal.aborted) {
          disposeImage(image);
          throw disposed ? disposedError() : abortError();
        }
        entry.image = image;
        entry.lastUsed = ++clock;
        evict();
        return image;
      },
      (error: unknown) => {
        remove(entry);
        throw error;
      },
    );
    return entry;
  };

  const releaseReference = (entry: PoolEntry): void => {
    if (entry.references > 0) entry.references -= 1;
    entry.lastUsed = ++clock;
    if (entry.invalidated && entry.references === 0 && entry.waiters === 0) remove(entry);
    else evict();
  };

  const pool: StudioSkiaBrowserImageSourcePool = {
    async acquire(source: string, signal?: AbortSignal) {
      if (disposed) throw disposedError();
      if (signal?.aborted) throw abortError();
      const normalized = normalizeSource(source);
      let entry = entries.get(normalized);
      if (!entry || entry.invalidated || entry.removed) entry = createEntry(normalized);
      entry.waiters += 1;
      entry.lastUsed = ++clock;
      try {
        const image = await raceWithAbort(entry.promise, signal);
        if (disposed || entry.removed) throw disposedError();
        entry.references += 1;
        entry.lastUsed = ++clock;
        let released = false;
        return Object.freeze({
          source: normalized,
          image,
          release(): void {
            if (released) return;
            released = true;
            releaseReference(entry);
          },
        });
      } finally {
        entry.waiters = Math.max(0, entry.waiters - 1);
        entry.lastUsed = ++clock;
        if (entry.waiters === 0 && entry.references === 0 && !entry.image) entry.controller.abort();
        if (entry.invalidated && entry.waiters === 0 && entry.references === 0) remove(entry);
        else evict();
      }
    },

    invalidate(source: string): boolean {
      const entry = entries.get(source.trim());
      if (!entry) return false;
      entry.invalidated = true;
      if (entry.references === 0 && entry.waiters === 0) remove(entry);
      return true;
    },

    snapshot(): StudioSkiaBrowserImageSourcePoolSnapshot {
      let readyCount = 0;
      let loadingCount = 0;
      let activeReferenceCount = 0;
      for (const entry of entries.values()) {
        if (entry.image) readyCount += 1;
        else loadingCount += 1;
        activeReferenceCount += entry.references;
      }
      return Object.freeze({
        disposed,
        entryCount: entries.size,
        readyCount,
        loadingCount,
        activeReferenceCount,
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const entry of [...entries.values()]) remove(entry);
    },
  };

  return Object.freeze(pool);
}

export const studioSkiaBrowserImageSourcePool = createStudioSkiaBrowserImageSourcePool();
