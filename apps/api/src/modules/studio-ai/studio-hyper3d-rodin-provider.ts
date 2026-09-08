import {
  STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
  Studio3dGenerationProviderError,
  type Studio3dGenerationArtifact,
  type Studio3dGenerationArtifacts,
  type Studio3dGenerationBinary,
  type Studio3dGenerationCapabilities,
  type Studio3dGenerationImage,
  type Studio3dGenerationJobIdentity,
  type Studio3dGenerationJobProgress,
  type Studio3dGenerationProgress,
  type Studio3dGenerationProvider,
  type Studio3dGenerationRequest,
  type Studio3dGenerationSubmission,
} from "./studio-3d-generation-provider";

export const HYPER3D_RODIN_PROVIDER_ID = "hyper3d-rodin" as const;
const DEFAULT_BASE_URL = "https://api.hyper3d.com/api/v2";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_FIRST_POLL_DELAY_MS = 5_000;
const DEFAULT_MAX_POLL_DELAY_MS = 30_000;
const DEFAULT_DEADLINE_MS = 20 * 60_000;
const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_MODEL_BYTES = 200 * 1024 * 1024;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

export type Hyper3dRodinFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface Hyper3dRodinProviderConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly retryAttempts?: number;
  readonly maxImageBytes?: number;
  readonly maxModelBytes?: number;
  readonly fetchImpl?: Hyper3dRodinFetch;
  readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

type JsonRecord = Record<string, unknown>;

function recordOf(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function boundedString(value: unknown, maxLength = 240): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function boundedTimeout(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) >= 5_000 && (value ?? 0) <= 120_000
    ? Math.round(value as number)
    : DEFAULT_TIMEOUT_MS;
}

function sanitizedBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_BASE_URL;
  const url = new URL(candidate);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "3D generation provider URL must use HTTPS.",
    });
  }
  return url.toString().replace(/\/$/u, "");
}

function abortError(message: string): Studio3dGenerationProviderError {
  return new Studio3dGenerationProviderError({ code: "cancelled", message });
}

function defaultSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError("3D generation request was cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    timer.unref?.();
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError("3D generation request was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function parseHyper3dRetryAfterMs(
  retryAfter: string | null,
  nowMs = Date.now()
): number | null {
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(1_000, Math.round(seconds * 1_000)));
  }
  const timestamp = Date.parse(retryAfter);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(1_000, Math.round(timestamp - nowMs)));
}

function providerErrorCode(payload: unknown): string | null {
  return boundedString(recordOf(payload)?.error, 120);
}

function assertNoProviderBodyError(payload: unknown, responseStatus: number): void {
  const code = providerErrorCode(payload);
  if (!code || code.toLowerCase() === "none") return;
  throw new Studio3dGenerationProviderError({
    code: "provider-rejected",
    message: `Hyper3D rejected the request (${code}).`,
    responseStatus,
    providerCode: code,
  });
}

function responseFailure(
  status: number,
  retryAfterMs: number | null,
  payload: unknown
): Studio3dGenerationProviderError {
  const code = providerErrorCode(payload);
  if (status === 401 || status === 403) {
    return new Studio3dGenerationProviderError({
      code: "authentication",
      message: "Hyper3D authentication failed.",
      responseStatus: status,
      providerCode: code,
    });
  }
  if (status === 429) {
    return new Studio3dGenerationProviderError({
      code: "rate-limited",
      message: "Hyper3D rate limit was reached.",
      retryable: true,
      responseStatus: status,
      retryAfterMs,
      providerCode: code,
    });
  }
  if (status >= 500) {
    return new Studio3dGenerationProviderError({
      code: "provider-unavailable",
      message: "Hyper3D is temporarily unavailable.",
      retryable: true,
      responseStatus: status,
      retryAfterMs,
      providerCode: code,
    });
  }
  return new Studio3dGenerationProviderError({
    code: "provider-rejected",
    message: `Hyper3D rejected the request with HTTP ${status}.`,
    responseStatus: status,
    providerCode: code,
  });
}

function blobFor(binary: Studio3dGenerationBinary): Blob {
  const start = binary.bytes.byteOffset;
  const end = start + binary.bytes.byteLength;
  const bytes = binary.bytes.buffer.slice(start, end) as ArrayBuffer;
  return new Blob([bytes], { type: binary.mimeType });
}

function validateFilename(filename: string, field: string): string {
  const trimmed = filename.trim();
  if (
    !trimmed ||
    trimmed.length > 180 ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: `${field} has an invalid filename.`,
    });
  }
  return trimmed;
}

function validateBinary(
  binary: Studio3dGenerationBinary,
  field: string,
  maxBytes: number,
  expected: "image" | "model"
): void {
  validateFilename(binary.filename, field);
  if (!(binary.bytes instanceof Uint8Array) || binary.bytes.byteLength === 0) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: `${field} is empty.`,
    });
  }
  if (binary.bytes.byteLength > maxBytes) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: `${field} exceeds the configured byte limit.`,
    });
  }
  const mimeType = binary.mimeType.trim().toLowerCase();
  if (expected === "image" && !mimeType.startsWith("image/")) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: `${field} must be an image.`,
    });
  }
  if (expected === "model" && !(
    mimeType.includes("gltf") ||
    mimeType.includes("model") ||
    mimeType === "application/octet-stream"
  )) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: `${field} must be a supported 3D model.`,
    });
  }
}

function validatePrompt(prompt: string | undefined, required: boolean): string | null {
  const value = prompt?.trim() ?? "";
  if (required && !value) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "A prompt is required for text-to-3D generation.",
    });
  }
  if (value.length > 1_024) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "The 3D generation prompt exceeds 1024 characters.",
    });
  }
  return value || null;
}

function validateRequest(
  request: Studio3dGenerationRequest,
  maxImageBytes: number,
  maxModelBytes: number
): void {
  if (request.schemaVersion !== STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "Unsupported 3D generation request version.",
    });
  }
  if (!request.requestId.trim() || request.requestId.length > 200) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "A bounded request identity is required.",
    });
  }

  const images = request.images ?? [];
  if (images.length > 5) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "Hyper3D accepts at most five reference images.",
    });
  }
  images.forEach((image, index) => validateBinary(image, `images[${index}]`, maxImageBytes, "image"));

  if (request.mode === "text-to-3d") {
    validatePrompt(request.prompt, true);
    if (images.length > 0 || request.model) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "Text-to-3D cannot include image or model files.",
      });
    }
  } else if (request.mode === "image-to-3d") {
    validatePrompt(request.prompt, false);
    if (images.length !== 1 || request.model) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "Image-to-3D requires exactly one image and no model.",
      });
    }
  } else if (request.mode === "multiview-to-3d") {
    validatePrompt(request.prompt, false);
    if (images.length < 2 || request.model) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "Multiview-to-3D requires two to five images and no model.",
      });
    }
  } else {
    validatePrompt(request.prompt, false);
    if (images.length !== 1 || !request.model) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "Texture-only generation requires one image and one model.",
      });
    }
    validateBinary(request.model, "model", maxModelBytes, "model");
  }

  const options = request.options;
  if (options?.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 65_535)) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "The generation seed must be an integer from 0 to 65535.",
    });
  }
  if (options?.targetFaceCount !== undefined) {
    const max = options.meshMode === "Quad" ? 200_000 : 2_000_000;
    if (!Number.isInteger(options.targetFaceCount) || options.targetFaceCount < 500 || options.targetFaceCount > max) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: `Target face count must be between 500 and ${max}.`,
      });
    }
  }
  if (options?.boundingBox && options.boundingBox.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "Bounding-box dimensions must be positive integers.",
    });
  }
  if (options?.textureReferenceScale !== undefined && (
    options.textureReferenceScale < 0.5 || options.textureReferenceScale > 1
  )) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "Texture reference scale must be between 0.5 and 1.",
    });
  }
  if (options?.textureComplexity !== undefined && (
    options.textureComplexity < 0 || options.textureComplexity > 10
  )) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "Texture complexity must be between 0 and 10.",
    });
  }
}

function appendScalar(form: FormData, key: string, value: string | number | boolean | undefined): void {
  if (value === undefined) return;
  form.append(key, String(value));
}

function appendImages(form: FormData, images: readonly Studio3dGenerationImage[], field: string): void {
  for (const image of images) {
    form.append(field, blobFor(image), validateFilename(image.filename, field));
  }
}

function buildSubmissionForm(request: Studio3dGenerationRequest): { readonly path: string; readonly form: FormData } {
  const form = new FormData();
  const options = request.options ?? {};
  const prompt = request.prompt?.trim();

  if (request.mode === "texture-only") {
    const image = request.images?.[0];
    if (!image || !request.model) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "Texture-only generation files are missing.",
      });
    }
    form.append("image", blobFor(image), validateFilename(image.filename, "image"));
    form.append("model", blobFor(request.model), validateFilename(request.model.filename, "model"));
    appendScalar(form, "prompt", prompt);
    appendScalar(form, "material", options.material === "Hybrid" || options.material === "None" ? undefined : options.material);
    appendScalar(form, "resolution", options.textureResolution);
    appendScalar(form, "texture_mode", options.textureMode);
    appendScalar(form, "seed", options.seed);
    appendScalar(form, "reference_scale", options.textureReferenceScale);
    appendScalar(form, "escore", options.textureComplexity);
    appendScalar(form, "hd_texture", options.highDefinitionTexture);
    appendScalar(form, "texture_delight", options.textureDelight);
    appendScalar(form, "geometry_file_format", options.geometryFormat);
    return { path: "/rodin_texture_only", form };
  }

  appendImages(form, request.images ?? [], "images");
  for (const image of request.images ?? []) {
    if (image.label) form.append("image_label", image.label);
  }
  appendScalar(form, "prompt", prompt);
  appendScalar(form, "tier", options.tier ?? "Gen-2.5-Medium");
  appendScalar(form, "mesh_mode", options.meshMode);
  appendScalar(form, "quality", options.quality);
  appendScalar(form, "quality_override", options.targetFaceCount);
  appendScalar(form, "geometry_file_format", options.geometryFormat);
  appendScalar(form, "material", options.material);
  appendScalar(form, "texture_mode", options.textureMode);
  appendScalar(form, "seed", options.seed);
  appendScalar(form, "is_symmetric", options.symmetry);
  appendScalar(form, "TAPose", options.taPose);
  appendScalar(form, "use_original_alpha", options.preserveAlpha);
  appendScalar(form, "preview_render", options.previewRender);
  appendScalar(form, "hd_texture", options.highDefinitionTexture);
  appendScalar(form, "uhd_texture", options.ultraHighDefinitionTexture);
  appendScalar(form, "geometry_instruct_mode", options.geometryInstructionMode);
  appendScalar(form, "texture_delight", options.textureDelight);
  if (options.highPack) form.append("addons", "HighPack");
  for (const dimension of options.boundingBox ?? []) form.append("bbox_condition", String(dimension));
  return { path: "/rodin", form };
}

async function jsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Studio3dGenerationProviderError({
      code: "invalid-response",
      message: "Hyper3D returned a non-JSON response.",
      responseStatus: response.status,
    });
  }
}

function jobIdentity(job: Studio3dGenerationJobIdentity): void {
  if (job.providerId !== HYPER3D_RODIN_PROVIDER_ID) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "The 3D generation job belongs to another provider.",
    });
  }
  if (!job.taskUuid.trim() || !job.subscriptionKey.trim()) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "The Hyper3D task identities are incomplete.",
    });
  }
}

function statusJobs(payload: unknown): Studio3dGenerationJobProgress[] {
  const jobs = recordOf(payload)?.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-response",
      message: "Hyper3D status response did not include jobs.",
    });
  }
  return jobs.map((value, index) => {
    const record = recordOf(value);
    const status = boundedString(record?.status, 80);
    if (!record || !status) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Hyper3D returned an invalid job status.",
      });
    }
    const progress = finiteNumber(record.progress ?? record.percentage);
    return {
      jobUuid: boundedString(record.uuid, 240) ?? `job-${index + 1}`,
      status,
      progressPercent: progress === null ? null : Math.min(100, Math.max(0, progress)),
    };
  });
}

function progressState(jobs: readonly Studio3dGenerationJobProgress[]): Studio3dGenerationProgress["state"] {
  const statuses = jobs.map((job) => job.status.toLowerCase());
  if (statuses.some((status) => status === "failed" || status === "error")) return "failed";
  if (statuses.every((status) => status === "done" || status === "succeeded")) return "succeeded";
  if (statuses.every((status) => ["created", "waiting", "queued", "pending"].includes(status))) {
    return "queued";
  }
  return "running";
}

function downloadArtifacts(payload: unknown): Studio3dGenerationArtifact[] {
  const list = recordOf(payload)?.list;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-response",
      message: "Hyper3D returned no downloadable artifacts.",
    });
  }
  return list.map((value, index) => {
    const record = recordOf(value);
    const rawUrl = boundedString(record?.url, 4_096);
    if (!record || !rawUrl) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Hyper3D returned an invalid artifact entry.",
      });
    }
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Hyper3D returned an insecure artifact URL.",
      });
    }
    const rawName = boundedString(record.name, 240) ?? `artifact-${index + 1}`;
    const name = rawName.split(/[\\/]/u).pop() || `artifact-${index + 1}`;
    return { name, url: url.toString() };
  });
}

export class Hyper3dRodinProvider implements Studio3dGenerationProvider {
  readonly providerId = HYPER3D_RODIN_PROVIDER_ID;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #retryAttempts: number;
  readonly #maxImageBytes: number;
  readonly #maxModelBytes: number;
  readonly #fetch: Hyper3dRodinFetch;
  readonly #sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
  readonly #now: () => number;

  constructor(config: Hyper3dRodinProviderConfig) {
    this.#apiKey = config.apiKey.trim();
    this.#baseUrl = sanitizedBaseUrl(config.baseUrl);
    this.#timeoutMs = boundedTimeout(config.timeoutMs);
    this.#retryAttempts = Math.min(5, positiveInteger(config.retryAttempts, DEFAULT_RETRY_ATTEMPTS));
    this.#maxImageBytes = positiveInteger(config.maxImageBytes, DEFAULT_MAX_IMAGE_BYTES);
    this.#maxModelBytes = positiveInteger(config.maxModelBytes, DEFAULT_MAX_MODEL_BYTES);
    this.#fetch = config.fetchImpl ?? fetch;
    this.#sleep = config.sleep ?? defaultSleep;
    this.#now = config.now ?? Date.now;
  }

  async capabilities(): Promise<Studio3dGenerationCapabilities> {
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      modes: ["text-to-3d", "image-to-3d", "multiview-to-3d", "texture-only"],
      maxImages: 5,
      supportedFormats: ["glb", "usdz", "fbx", "obj", "stl"],
      supportsCancellation: false,
      firstPollDelayMs: DEFAULT_FIRST_POLL_DELAY_MS,
      maxPollDelayMs: DEFAULT_MAX_POLL_DELAY_MS,
      deadlineMs: DEFAULT_DEADLINE_MS,
    };
  }

  async submit(
    request: Studio3dGenerationRequest,
    signal: AbortSignal
  ): Promise<Studio3dGenerationSubmission> {
    this.#assertConfigured();
    validateRequest(request, this.#maxImageBytes, this.#maxModelBytes);
    const submission = buildSubmissionForm(request);

    // Submission is intentionally single-shot. A network failure or 5xx after
    // delivery is ambiguous and automatically resubmitting can charge twice.
    const response = await this.#request(`${this.#baseUrl}${submission.path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.#apiKey}` },
      body: submission.form,
    }, signal);
    const payload = await jsonPayload(response);
    if (!response.ok) {
      throw responseFailure(
        response.status,
        parseHyper3dRetryAfterMs(response.headers.get("retry-after"), this.#now()),
        payload
      );
    }
    assertNoProviderBodyError(payload, response.status);

    const record = recordOf(payload);
    const jobs = recordOf(record?.jobs);
    const taskUuid = boundedString(record?.uuid, 240);
    const subscriptionKey = boundedString(jobs?.subscription_key, 512);
    const jobUuids = Array.isArray(jobs?.uuids)
      ? jobs.uuids.map((value) => boundedString(value, 240)).filter((value): value is string => value !== null)
      : [];
    if (!taskUuid || !subscriptionKey || jobUuids.length === 0) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Hyper3D submission response omitted task identities.",
        responseStatus: response.status,
      });
    }

    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: request.requestId,
      taskUuid,
      subscriptionKey,
      jobUuids,
      consumedCredits: finiteNumber(record?.consumed),
      submittedAt: new Date(this.#now()).toISOString(),
    };
  }

  async poll(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal
  ): Promise<Studio3dGenerationProgress> {
    this.#assertConfigured();
    jobIdentity(job);
    const payload = await this.#requestJsonWithRetry(
      "/status",
      { subscription_key: job.subscriptionKey },
      signal
    );
    assertNoProviderBodyError(payload, 200);
    const jobs = statusJobs(payload);
    const state = progressState(jobs);
    if (state === "failed") {
      throw new Studio3dGenerationProviderError({
        code: "generation-failed",
        message: "Hyper3D reported a failed generation job.",
        providerCode: jobs.find((entry) => entry.status.toLowerCase() === "failed")?.status ?? null,
      });
    }
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: job.requestId,
      state,
      jobs,
      retryAfterMs: null,
    };
  }

  async download(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal
  ): Promise<Studio3dGenerationArtifacts> {
    this.#assertConfigured();
    jobIdentity(job);
    const payload = await this.#requestJsonWithRetry(
      "/download",
      { task_uuid: job.taskUuid },
      signal
    );
    assertNoProviderBodyError(payload, 200);
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: job.requestId,
      taskUuid: job.taskUuid,
      artifacts: downloadArtifacts(payload),
    };
  }

  #assertConfigured(): void {
    if (!this.#apiKey) {
      throw new Studio3dGenerationProviderError({
        code: "not-configured",
        message: "Hyper3D Rodin API key is not configured.",
      });
    }
  }

  async #requestJsonWithRetry(
    path: "/status" | "/download",
    body: JsonRecord,
    signal: AbortSignal
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= this.#retryAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.#request(`${this.#baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }, signal);
      } catch (error) {
        if (signal.aborted) throw abortError("3D generation request was cancelled.");
        if (
          !(error instanceof Studio3dGenerationProviderError) ||
          !error.retryable ||
          (error.code !== "timeout" && error.code !== "provider-unavailable") ||
          attempt === this.#retryAttempts
        ) {
          throw error;
        }
        // Only existing-job queries reach this helper. Paid submissions remain single-shot.
        await this.#sleep(
          Math.min(DEFAULT_MAX_POLL_DELAY_MS, DEFAULT_FIRST_POLL_DELAY_MS * attempt),
          signal
        );
        continue;
      }
      const payload = await jsonPayload(response);
      if (response.ok) return payload;

      const retryAfterMs = parseHyper3dRetryAfterMs(
        response.headers.get("retry-after"),
        this.#now()
      );
      const failure = responseFailure(response.status, retryAfterMs, payload);
      if (!failure.retryable || attempt === this.#retryAttempts) throw failure;
      await this.#sleep(
        retryAfterMs ?? Math.min(DEFAULT_MAX_POLL_DELAY_MS, DEFAULT_FIRST_POLL_DELAY_MS * attempt),
        signal
      );
    }
    throw new Studio3dGenerationProviderError({
      code: "provider-unavailable",
      message: "Hyper3D retry budget was exhausted.",
    });
  }

  async #request(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    if (signal.aborted) throw abortError("3D generation request was cancelled.");
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("timeout")), this.#timeoutMs);
    timer.unref?.();
    try {
      return await this.#fetch(url, { ...init, signal: controller.signal });
    } catch {
      if (signal.aborted) throw abortError("3D generation request was cancelled.");
      if (controller.signal.aborted) {
        throw new Studio3dGenerationProviderError({
          code: "timeout",
          message: "Hyper3D request exceeded the configured deadline.",
          retryable: true,
        });
      }
      throw new Studio3dGenerationProviderError({
        code: "provider-unavailable",
        message: "Hyper3D request failed before a response was received.",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abortFromCaller);
    }
  }
}

export function createHyper3dRodinProvider(
  config: Hyper3dRodinProviderConfig
): Hyper3dRodinProvider {
  return new Hyper3dRodinProvider(config);
}
