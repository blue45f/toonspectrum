let activeWorkers = 0;
async function execute(message: unknown): Promise<Record<string, unknown>> {
  const worker = new Worker(new URL("./brush-original-source.worker.ts", import.meta.url), { type: "module" });
  activeWorkers++;
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Original-source worker timed out")), 90_000);
      worker.onmessage = (event) => { clearTimeout(timeout);
        if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error)); };
      worker.onerror = (event) => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage(message);
    });
  } finally { worker.terminate(); activeWorkers--; }
}
Object.assign(window, { verifyBrushOriginalSource: async () => {
  const written = await execute({ phase: "write" });
  const reopened = await execute({ phase: "reopen", receipts: written.receipts });
  if (JSON.stringify(written.receipts) !== JSON.stringify(reopened.receipts)) throw new Error("Receipt mismatch");
  const result = { written, reopened, activeWorkers,
    scope: "Production-bundled real SQL/OPFS import, edit, duplicate, delete/restore; fresh Worker reopen and portable archive. Isolated browser origin, not production data or native engine rendering." };
  document.body.textContent = JSON.stringify(result, null, 2);
  return result;
} });

let actionRoot: import("react-dom/client").Root | null = null;
Object.assign(window, { mountBrushOriginalDownload: async (source: import("../../src/domains/creator/brush/studio-brush-original-source").StudioBrushOriginalSource) => {
  const [{ createRoot }, { createElement }, { StudioBrushOriginalSourceActions }] = await Promise.all([
    import("react-dom/client"), import("react"), import("../../src/domains/creator/brush/StudioBrushOriginalSourceActions"),
  ]);
  actionRoot?.unmount();
  const host = document.createElement("div"); document.body.append(host); actionRoot = createRoot(host);
  actionRoot.render(createElement(StudioBrushOriginalSourceActions, { source, name: "보존 검증",
    onError: (message: string) => { document.body.dataset.downloadError = message; } }));
} });

// Isolated-origin lifecycle checks: block the actual CAS lock, not the hydration function.
let releaseOriginalLock: (() => void) | null = null;
let originalLockName = "";
Object.assign(window, {
  holdBrushOriginalStorageLock: async () => {
    if (releaseOriginalLock) throw new Error("Original lock is already held");
    const { STUDIO_ASSET_LIBRARY_LOCK_NAME } = await import("../../src/domains/creator/studio-asset-library-sqlite-opfs-repository");
    originalLockName = STUDIO_ASSET_LIBRARY_LOCK_NAME;
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request(originalLockName, () => new Promise<void>((release) => {
        releaseOriginalLock = release; resolve();
      })).catch(reject);
    });
    return originalLockName;
  },
  releaseBrushOriginalStorageLock: async () => {
    releaseOriginalLock?.(); releaseOriginalLock = null;
    await navigator.locks.request(originalLockName, () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
  },
  unmountBrushOriginalDownload: () => { actionRoot?.unmount(); actionRoot = null; },
});
