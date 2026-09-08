const crdtRuntimePattern = /(?:studio-crdt-document|studio-crdt-room-binding|node_modules.*\/yjs\/)/u;

/** The emitted dependency-free schema constants are data, not the lazy Yjs document engine. */
export function isStudioCrdtRuntimeEntry(key, entry) {
  const identity = [key, entry.src, entry.file].filter(Boolean).join(" ");
  if (!crdtRuntimePattern.test(identity)) return false;
  const constantsOnly = entry.name === "studio-crdt-document-constants"
    && /(?:^|\/)_?studio-crdt-document-constants(?:-[^/]+\.js|\.ts)$/u.test(key)
    && /(?:^|\/)studio-crdt-document-constants-[^/]+\.js$/u.test(entry.file ?? "")
    && (!entry.src || /(?:^|\/)studio-crdt-document-constants\.ts$/u.test(entry.src))
    && (entry.imports?.length ?? 0) === 0
    && (entry.dynamicImports?.length ?? 0) === 0;
  return !constantsOnly;
}
