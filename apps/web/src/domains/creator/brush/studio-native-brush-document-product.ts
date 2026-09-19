import { createStudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";
import { validateNativeBrushDocumentOutput } from "./studio-native-brush-probe-contract";

import type { StudioNativeBrushDocumentPlan, StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";

function abort(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("네이티브 브러시 변환을 취소했습니다.", "AbortError");
}
/** Narrow transport for one-shot and explicitly scoped reusable execution. */
export type StudioNativeBrushDocumentClientPort = Pick<StudioNativeBrushProbeClient, "request" | "dispose">;

/** Shared validated execution; caller decides whether a successful engine may remain scoped. */
export async function renderStudioNativeBrushDocumentOnClient(
  captured: StudioNativeBrushDocumentPlan,
  signal: AbortSignal,
  client: StudioNativeBrushDocumentClientPort,
  initialize: boolean,
): Promise<StudioNativeBrushDocumentResult> {
  const onAbort = () => client.dispose(new DOMException("네이티브 브러시 변환을 취소했습니다.", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    abort(signal);
    if (initialize) await client.request({ type: "init", engine: captured.engine, surface: captured.surface });
    abort(signal);
    const reply = await client.request({ type: "render-document", surface: captured.surface, config: captured.config, samples: captured.samples, clipEdges: captured.clipEdges });
    abort(signal);
    if (reply.type !== "document" || reply.engine !== captured.engine || reply.samples !== captured.samples.length
      || !validateNativeBrushDocumentOutput(reply, captured.surface)) {
      throw new Error("네이티브 브러시 PNG 결과가 요청한 획과 일치하지 않습니다.");
    }
    const digest = await crypto.subtle.digest("SHA-256", reply.png);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    abort(signal);
    if (hash !== reply.pngHash) throw new Error("네이티브 브러시 PNG 무결성 검증에 실패했습니다.");
    const bytes = new Uint8Array(reply.png);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x4000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x4000));
    }
    abort(signal);
    return { sourceElementId: captured.sourceElementId, sourceRevision: captured.sourceRevision,
      engine: captured.engine, style: captured.config.style, seed: captured.config.seed, bounds: { ...captured.bounds },
      src: `data:image/png;base64,${btoa(binary)}`, pngHash: hash };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Standalone callers keep the original one-Worker-per-conversion contract. */
export async function renderStudioNativeBrushDocument(
  plan: StudioNativeBrushDocumentPlan,
  signal: AbortSignal,
  createClient: () => StudioNativeBrushDocumentClientPort = createStudioNativeBrushProbeClient,
): Promise<StudioNativeBrushDocumentResult> {
  abort(signal);
  const captured = structuredClone(plan);
  const client = createClient();
  try { return await renderStudioNativeBrushDocumentOnClient(captured, signal, client, true); }
  finally { client.dispose(); }
}
