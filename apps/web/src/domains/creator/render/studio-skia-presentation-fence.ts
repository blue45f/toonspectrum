let nextFence = 0;
export interface StudioSkiaPaintFenceLayer {
  on(event: string, handler: () => void): unknown;
  off(event: string, handler: () => void): unknown;
  batchDraw(): unknown;
}

/** The existing committed-stroke receipt must finish before its pending live overlay is replaced. */
export function waitForStudioSkiaPresentationFence(layer: StudioSkiaPaintFenceLayer | null, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Superseded document frame", "AbortError"));
  if (!layer) return Promise.reject(new Error("Committed document display fence is not available"));
  return new Promise((resolve, reject) => {
    const event = `draw.skiaDocumentFence${++nextFence}`;
    const cleanup = () => { layer.off(event, drawn); signal.removeEventListener("abort", aborted); };
    const drawn = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(new DOMException("Superseded document frame", "AbortError")); };
    layer.on(event, drawn); signal.addEventListener("abort", aborted, { once: true });
    try { layer.batchDraw(); } catch (cause) { cleanup(); reject(cause); }
  });
}
