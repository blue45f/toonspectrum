import { collectStudioManifestClosure, type StudioViteManifest } from "./studio-service-worker-precache-plan";

// Studio-only offline pack: never paid by catalogue visitors or during worker install.
// The mounted Studio prepares this bounded pack in the background after first online use.
export const DRAWING_ROOTS = ["StudioRouter", "StudioInspectorAside", "StudioToolHintBubble", "StudioColorVisionHintPreview", "StudioDraftSaveCenter", "studio-legacy-editor-adapter", "studio-pages-history-durable-runtime",
  "StudioEnhancedExportMenuPanel", "studio-export", "studio-capture-readiness", "studio-project-file", "studio-release-schedule", "studio-publication-analytics", "studio-autosave-sqlite-store", "studio-local-database-worker-client"];

/** Build-authoritative closure: resource timing may drop entries after its buffer fills. */
export function collectStudioOfflineDrawingUrls(manifest: StudioViteManifest, emittedFiles: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const name of DRAWING_ROOTS) {
    const roots = Object.keys(manifest).filter((key) => manifest[key].name === name);
    if (roots.length === 0) throw new Error(`Offline drawing root missing: ${name}`);
    for (const root of roots) for (const url of collectStudioManifestClosure(manifest, root)) urls.add(url);
  }
  // Workers and WASM are emitted assets, not normal import edges.
  for (const file of emittedFiles) {
    if (/^(?:studio-local-database\.worker-[\w-]+\.js|sqlite3(?:-opfs-async-proxy|-worker1)?-[\w-]+\.(?:js|wasm))$/u.test(file)) urls.add(`/assets/${file}`);
  }
  if (![...urls].some((url) => /studio-local-database\.worker-/u.test(url))
    || ![...urls].some((url) => /sqlite3-[\w-]+\.wasm$/u.test(url))) throw new Error("Offline storage worker/WASM missing");
  return [...urls].sort((left, right) => left.localeCompare(right));
}
