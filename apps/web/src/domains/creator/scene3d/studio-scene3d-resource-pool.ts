/** Runtime-only, bounded GPU resource reuse. Never persisted in a Scene3D document. */
export interface StudioScene3dResourceLease<T> {
  readonly value: T;
  /** Discard a failed resource; otherwise return it only after the GPU fence has settled. */
  release(discard?: boolean): void;
}

export interface StudioScene3dResourcePoolSnapshot {
  readonly activeBytes: number;
  readonly idleBytes: number;
  readonly activeCount: number;
  readonly idleCount: number;
  readonly closed: boolean;
  readonly disposalFailures: number;
}

interface Entry<T> {
  readonly key: string;
  readonly bytes: number;
  readonly value: T;
}

export function createStudioScene3dResourcePool<T>(options: {
  readonly maxBytes: number;
  readonly maxIdleBytes: number;
  readonly maxIdleEntries: number;
  readonly dispose: (value: T) => void;
}) {
  const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (!validCount(options.maxBytes) || options.maxBytes === 0
    || !validCount(options.maxIdleBytes) || options.maxIdleBytes > options.maxBytes
    || !validCount(options.maxIdleEntries)) {
    throw new RangeError("Invalid Scene3D resource pool budget.");
  }
  const active = new Set<Entry<T>>();
  const idle: Entry<T>[] = [];
  let activeBytes = 0;
  let idleBytes = 0;
  let closed = false;
  let disposalFailures = 0;

  const destroy = (entry: Entry<T>) => {
    try { options.dispose(entry.value); } catch { disposalFailures += 1; }
  };
  const evictOldest = () => {
    const entry = idle.shift();
    if (!entry) return;
    idleBytes -= entry.bytes;
    destroy(entry);
  };

  return Object.freeze({
    acquire(key: string, bytes: number, create: () => T): StudioScene3dResourceLease<T> {
      if (closed) throw new Error("Scene3D resource pool is disposed.");
      if (!key || key.length > 240 || !validCount(bytes) || bytes === 0) {
        throw new RangeError("Invalid Scene3D resource request.");
      }
      // Compare by subtraction: do not overflow before refusing a hostile allocation.
      if (bytes > options.maxBytes - activeBytes) {
        throw new RangeError("Scene3D capture GPU memory budget exceeded.");
      }
      const index = idle.findIndex((entry) => entry.key === key && entry.bytes === bytes);
      let entry: Entry<T>;
      if (index >= 0) {
        entry = idle.splice(index, 1)[0]!;
        idleBytes -= entry.bytes;
      } else {
        while (idle.length && bytes > options.maxBytes - activeBytes - idleBytes) evictOldest();
        activeBytes += bytes; // Reserve before the allocator runs (including reentrant allocators).
        try {
          entry = { key, bytes, value: create() };
        } catch (error) {
          activeBytes -= bytes;
          throw error;
        }
        activeBytes -= bytes;
        if (closed) {
          destroy(entry);
          throw new Error("Scene3D resource pool was disposed during allocation.");
        }
      }
      active.add(entry);
      activeBytes += entry.bytes;
      let released = false;
      return Object.freeze({
        value: entry.value,
        release(discard = false) {
          if (released) return;
          released = true;
          active.delete(entry);
          activeBytes -= entry.bytes;
          if (closed || discard || entry.bytes > options.maxIdleBytes || !options.maxIdleEntries) {
            destroy(entry);
            return;
          }
          while (idle.length && (idle.length >= options.maxIdleEntries
            || entry.bytes > options.maxIdleBytes - idleBytes)) evictOldest();
          // Disposal events can synchronously close the pool while an older idle entry is evicted.
          if (closed) { destroy(entry); return; }
          idle.push(entry);
          idleBytes += entry.bytes;
        },
      });
    },
    snapshot(): StudioScene3dResourcePoolSnapshot {
      return Object.freeze({ activeBytes, idleBytes, activeCount: active.size,
        idleCount: idle.length, closed, disposalFailures });
    },
    dispose() {
      if (closed) return;
      closed = true;
      while (idle.length) evictOldest();
      // In-flight GPU copies own active leases. They are destroyed by release(), not here.
    },
  });
}
