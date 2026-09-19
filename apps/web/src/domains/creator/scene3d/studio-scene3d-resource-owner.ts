/** Attach runtime resources to the actual renderer/device lifetime without importing an engine. */
const disposers = new WeakMap<object, Set<() => void>>();
const closed = new WeakSet<object>();

export function registerStudioScene3dResourceOwner(owner: object, dispose: () => void): () => void {
  if (closed.has(owner)) {
    dispose();
    throw new Error("Scene3D renderer resource owner is disposed.");
  }
  let entries = disposers.get(owner);
  if (!entries) { entries = new Set(); disposers.set(owner, entries); }
  entries.add(dispose);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    entries.delete(dispose);
    if (entries.size === 0 && disposers.get(owner) === entries) disposers.delete(owner);
  };
}

export function disposeStudioScene3dResourceOwner(owner: object): void {
  if (closed.has(owner)) return;
  closed.add(owner);
  const entries = disposers.get(owner);
  disposers.delete(owner);
  for (const dispose of [...(entries ?? [])]) {
    try { dispose(); } catch { /* A lost GPU must not prevent other owners from being released. */ }
  }
}
