import type { StudioWorldPublication } from "@toonspectrum/studio-project-model";
import { StudioWorldPublicationError, studioWorldDigest } from "./studio-world-publication-client";

export interface PreparedStudioWorld {
  readonly publication: StudioWorldPublication;
  /** Exact immutable revision AND hash. Equal-content undo still creates another scope. */
  readonly scope: string;
  readonly assetUrls: ReadonlyMap<string, string>;
  dispose(): void;
}
export interface StudioWorldAssetDependencies {
  fetch: typeof globalThis.fetch;
  decode(url: string, signal: AbortSignal): Promise<void>;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
}
const BROWSER: StudioWorldAssetDependencies = {
  fetch: (...args) => fetch(...args), createUrl: (blob) => URL.createObjectURL(blob), revokeUrl: (url) => URL.revokeObjectURL(url),
  decode: (url, signal) => new Promise<void>((resolve, reject) => {
    const image = new Image();
    const clear = () => { image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort); };
    const abort = () => { clear(); image.src = ""; reject(new StudioWorldPublicationError("context-changed")); };
    image.onload = () => {
      void image.decode().then(() => { clear();
        if (signal.aborted) reject(new StudioWorldPublicationError("context-changed"));
        else if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
        else reject(new StudioWorldPublicationError("assets"));
      }, () => { clear(); reject(new StudioWorldPublicationError("assets")); });
    };
    image.onerror = () => { clear(); reject(new StudioWorldPublicationError("assets")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true }); image.src = url;
  }),
};

/** Preload exact bytes once. Phaser consumes these URLs, avoiding a second mutable network read. */
export async function prepareStudioWorldAssets(publication: StudioWorldPublication, signal: AbortSignal,
  deps: StudioWorldAssetDependencies = BROWSER): Promise<PreparedStudioWorld> {
  const urls = new Map<string, string>(); let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; for (const url of urls.values()) deps.revokeUrl(url); } };
  const queue = [...new Set([publication.manifest.backgroundUrl, ...publication.manifest.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : [])])];
  try {
    // Bound concurrent decoders, without lowering source resolution or skipping props.
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !signal.aborted && !disposed) {
        const source = queue.shift()!;
        const response = await deps.fetch(source, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new StudioWorldPublicationError("assets");
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("image/")) throw new StudioWorldPublicationError("assets");
        if (signal.aborted || disposed) throw new StudioWorldPublicationError("context-changed");
        const url = deps.createUrl(blob); urls.set(source, url); await deps.decode(url, signal);
        if (disposed) throw new StudioWorldPublicationError("context-changed");
      }
    }));
    if (signal.aborted) throw new StudioWorldPublicationError("context-changed");
    const scope = await studioWorldDigest({ workId: publication.workId, worldId: publication.manifest.id,
      revisionId: publication.revisionId, contentHash: publication.contentHash });
    if (signal.aborted) throw new StudioWorldPublicationError("context-changed");
    return { publication, scope, assetUrls: urls, dispose };
  } catch (error) { dispose(); throw error instanceof StudioWorldPublicationError ? error : new StudioWorldPublicationError("assets"); }
}
