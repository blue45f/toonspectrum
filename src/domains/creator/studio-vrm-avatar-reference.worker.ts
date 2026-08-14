/// <reference lib="webworker" />

import { resolveStudioMediaPipeVisionWasmFileset } from "./studio-mediapipe-vision-assets";
import {
  loadStudioMediaPipeVisionModule,
  runStudioMediaPipeVisionTaskCreation,
} from "./studio-mediapipe-vision-init-arbiter";
import { createSha256Portable, sha256HexPortable } from "./studio-sha256";
import {
  STUDIO_VRM_AVATAR_REFERENCE_LIMITS,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_FETCH_TIMEOUT_MS,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_URL,
  STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
  StudioVrmAvatarReferenceError,
  rankStudioVrmAvatarReferenceRecommendations,
  type StudioVrmAvatarReferenceEmbedding,
} from "./studio-vrm-avatar-reference-recommendation";
import {
  isStudioVrmAvatarReferenceWorkerRequest,
  type StudioVrmAvatarReferenceWorkerErrorResponse,
  type StudioVrmAvatarReferenceWorkerRecommendRequest,
  type StudioVrmAvatarReferenceWorkerResponse,
} from "./studio-vrm-avatar-reference-worker-protocol";

import type { ImageEmbedder as MediaPipeImageEmbedder } from "@mediapipe/tasks-vision";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const active = new Map<number, AbortController>();

function postProgress(
  request: StudioVrmAvatarReferenceWorkerRecommendRequest,
  stage: "model" | "embedding" | "ranking",
  progress: number,
): void {
  if (!active.has(request.requestId)) return;
  const response: StudioVrmAvatarReferenceWorkerResponse = {
    version: STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
    kind: "progress",
    requestId: request.requestId,
    generationId: request.generationId,
    stage,
    progress,
  };
  scope.postMessage(response);
}

function ensureActive(request: StudioVrmAvatarReferenceWorkerRecommendRequest): void {
  if (active.get(request.requestId)?.signal.aborted) {
    throw new StudioVrmAvatarReferenceError("aborted");
  }
}

async function fetchBoundedModel(signal: AbortSignal): Promise<Uint8Array> {
  const requestController = new AbortController();
  let timedOut = false;
  const handleAbort = () => requestController.abort(signal.reason);
  if (signal.aborted) handleAbort();
  else signal.addEventListener("abort", handleAbort, { once: true });
  const timeout = scope.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, STUDIO_VRM_AVATAR_REFERENCE_MODEL_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(STUDIO_VRM_AVATAR_REFERENCE_MODEL_URL, {
      cache: "force-cache",
      credentials: "omit",
      mode: "cors",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: requestController.signal,
    });
  } catch (cause) {
    scope.clearTimeout(timeout);
    signal.removeEventListener("abort", handleAbort);
    if (signal.aborted) throw new StudioVrmAvatarReferenceError("aborted", { cause });
    throw new StudioVrmAvatarReferenceError("model-unavailable", { cause });
  }
  try {
    if (!response.ok || timedOut) throw new StudioVrmAvatarReferenceError("model-unavailable");
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader !== null) {
      const declaredLength = Number(contentLengthHeader);
      if (
        !Number.isSafeInteger(declaredLength)
        || declaredLength !== STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH
        || declaredLength > STUDIO_VRM_AVATAR_REFERENCE_LIMITS.maxModelBytes
      ) throw new StudioVrmAvatarReferenceError("model-unavailable");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.byteLength !== STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH
        || bytes.byteLength > STUDIO_VRM_AVATAR_REFERENCE_LIMITS.maxModelBytes
        || sha256HexPortable(bytes) !== STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256
      ) throw new StudioVrmAvatarReferenceError("model-unavailable");
      return bytes;
    }
    const chunks: Uint8Array[] = [];
    const hasher = createSha256Portable();
    let total = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) {
          throw new StudioVrmAvatarReferenceError("model-unavailable");
        }
        total += chunk.value.byteLength;
        if (
          total > STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH
          || total > STUDIO_VRM_AVATAR_REFERENCE_LIMITS.maxModelBytes
        ) {
          await reader.cancel();
          throw new StudioVrmAvatarReferenceError("model-unavailable");
        }
        hasher.update(chunk.value);
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (
      total !== STUDIO_VRM_AVATAR_REFERENCE_MODEL_BYTE_LENGTH
      || hasher.finalizeHex() !== STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256
    ) throw new StudioVrmAvatarReferenceError("model-unavailable");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (cause) {
    if (cause instanceof StudioVrmAvatarReferenceError) throw cause;
    if (signal.aborted) throw new StudioVrmAvatarReferenceError("aborted", { cause });
    throw new StudioVrmAvatarReferenceError("model-unavailable", { cause });
  } finally {
    scope.clearTimeout(timeout);
    signal.removeEventListener("abort", handleAbort);
  }
}

async function createImageEmbedder(
  signal: AbortSignal,
): Promise<{
  readonly embedder: MediaPipeImageEmbedder;
  readonly cosineSimilarity: typeof import("@mediapipe/tasks-vision").ImageEmbedder.cosineSimilarity;
}> {
  try {
    const { FilesetResolver, ImageEmbedder } = await loadStudioMediaPipeVisionModule();
    const [wasm, modelAssetBuffer] = await Promise.all([
      resolveStudioMediaPipeVisionWasmFileset({
        isSimdSupported: () => FilesetResolver.isSimdSupported(false),
      }),
      fetchBoundedModel(signal),
    ]);
    if (signal.aborted) throw new StudioVrmAvatarReferenceError("aborted");
    const embedder = await runStudioMediaPipeVisionTaskCreation({
      owner: "vrm-avatar-reference-image",
      signal,
      create: () => ImageEmbedder.createFromOptions(wasm.fileset, {
        baseOptions: {
          delegate: "CPU",
          modelAssetBuffer,
        },
        runningMode: "IMAGE",
        l2Normalize: false,
        quantize: false,
      }),
    });
    return { embedder, cosineSimilarity: ImageEmbedder.cosineSimilarity };
  } catch (cause) {
    if (cause instanceof StudioVrmAvatarReferenceError) throw cause;
    if (signal.aborted) throw new StudioVrmAvatarReferenceError("aborted", { cause });
    throw new StudioVrmAvatarReferenceError("model-unavailable", { cause });
  }
}

function normalizeQueryEmbedding(value: unknown): StudioVrmAvatarReferenceEmbedding {
  if (typeof value !== "object" || value === null) {
    throw new StudioVrmAvatarReferenceError("protocol");
  }
  const embedding = value as {
    readonly headIndex?: unknown;
    readonly headName?: unknown;
    readonly floatEmbedding?: unknown;
  };
  if (
    typeof embedding.headIndex !== "number"
    || !Number.isSafeInteger(embedding.headIndex)
    || embedding.headIndex < 0
    || typeof embedding.headName !== "string"
    || !Array.isArray(embedding.floatEmbedding)
    || embedding.floatEmbedding.length < 1
    || embedding.floatEmbedding.length > STUDIO_VRM_AVATAR_REFERENCE_LIMITS.maxEmbeddingDimensions
    || !embedding.floatEmbedding.every(
      (component) => typeof component === "number" && Number.isFinite(component),
    )
  ) throw new StudioVrmAvatarReferenceError("protocol");
  return {
    headIndex: embedding.headIndex,
    headName: embedding.headName,
    floatEmbedding: embedding.floatEmbedding,
  };
}

function sha256Embedding(embedding: StudioVrmAvatarReferenceEmbedding): string {
  const bytes = new Uint8Array(embedding.floatEmbedding.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  embedding.floatEmbedding.forEach((component, index) => {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, component, true);
  });
  return sha256HexPortable(bytes);
}

function workerErrorCode(error: unknown): StudioVrmAvatarReferenceWorkerErrorResponse["code"] {
  if (error instanceof StudioVrmAvatarReferenceError) {
    if (
      error.code === "model-unavailable"
      || error.code === "protocol"
      || error.code === "unsupported-browser"
    ) return error.code;
  }
  return "inference-failed";
}

async function recommend(request: StudioVrmAvatarReferenceWorkerRecommendRequest): Promise<void> {
  const controller = new AbortController();
  active.set(request.requestId, controller);
  let embedder: MediaPipeImageEmbedder | null = null;
  try {
    postProgress(request, "model", 0.18);
    const runtime = await createImageEmbedder(controller.signal);
    embedder = runtime.embedder;
    ensureActive(request);
    postProgress(request, "embedding", 0.62);
    // MediaPipe's image embedder is synchronous. It runs only in this dedicated Worker so the
    // editor/UI thread remains responsive while the official engine computes the feature vector.
    const query = normalizeQueryEmbedding(embedder.embed(request.bitmap).embeddings[0]);
    ensureActive(request);
    const queryEmbeddingSha256 = sha256Embedding(query);
    ensureActive(request);
    postProgress(request, "ranking", 0.9);
    const receipt = rankStudioVrmAvatarReferenceRecommendations({
      catalogue: request.catalogue,
      queryEmbedding: query,
      queryEmbeddingSha256,
      topK: request.topK,
      cosineSimilarity: runtime.cosineSimilarity,
    });
    ensureActive(request);
    const response: StudioVrmAvatarReferenceWorkerResponse = {
      version: STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
      kind: "result",
      requestId: request.requestId,
      generationId: request.generationId,
      receipt,
    };
    scope.postMessage(response);
  } catch (error) {
    if (controller.signal.aborted) return;
    const response: StudioVrmAvatarReferenceWorkerResponse = {
      version: STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
      kind: "error",
      requestId: request.requestId,
      generationId: request.generationId,
      code: workerErrorCode(error),
    };
    scope.postMessage(response);
  } finally {
    active.delete(request.requestId);
    try {
      embedder?.close();
    } catch {
      // The short-lived Worker is terminated by the client after settlement.
    }
    request.bitmap.close();
  }
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isStudioVrmAvatarReferenceWorkerRequest(request)) return;
  if (request.kind === "cancel") {
    active.get(request.requestId)?.abort();
    return;
  }
  if (active.has(request.requestId)) return;
  void recommend(request);
});

export {};
