export type Studio3dGenerationMode = "text-to-3d" | "image-to-3d" | "multiview-to-3d" | "texture-only";
export type Studio3dGenerationJobState = "queued" | "uploading" | "generating-geometry" | "generating-texture" | "downloading" | "validating" | "importing" | "ready" | "failed" | "cancelled" | "expired";
export interface Studio3dGenerationArtifactRevision {
  readonly id: string;
  readonly modelId: string;
  readonly contentHashSha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly createdAtMs: number;
  readonly sourceJobId: string;
}
export interface Studio3dGenerationJob {
  readonly id: string;
  readonly state: Studio3dGenerationJobState;
  readonly generation: number;
  readonly estimatedCredits: number;
  readonly actualCredits?: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly deadlineAtMs: number;
  readonly terminalReason?: string;
  readonly request: {
    readonly mode: Studio3dGenerationMode;
    readonly provider: string;
    readonly model: string;
    readonly tier: string;
    readonly seed?: number;
    readonly transport: "server" | "byok";
  };
  readonly artifactRevision?: Studio3dGenerationArtifactRevision;
}
export interface Studio3dGenerationBinaryInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly dataBase64: string;
  readonly label?: string;
}
export interface Studio3dGenerationCreateInput {
  readonly mode: Studio3dGenerationMode;
  readonly prompt?: string;
  readonly images?: readonly Studio3dGenerationBinaryInput[];
  readonly model?: Studio3dGenerationBinaryInput;
  readonly transport?: "server" | "byok";
  readonly options?: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly estimatedCredits?: number;
}
export interface Studio3dGenerationStatus {
  readonly configured: boolean;
  readonly durable: boolean;
  readonly provider: string;
  readonly modes: readonly Studio3dGenerationMode[];
  readonly apiKeyExposedToClient: false;
}
export interface Studio3dGenerationClientOptions {
  readonly baseUrl?: string;
  readonly userId: string;
  readonly fetchImpl?: typeof fetch;
  readonly providerApiKey?: () => string | undefined;
}
const MAX_ARTIFACT_BYTES = 200 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MODES = new Set(["text-to-3d", "image-to-3d", "multiview-to-3d", "texture-only"]);
const STATES = new Set(["queued", "uploading", "generating-geometry", "generating-texture", "downloading", "validating", "importing", "ready", "failed", "cancelled", "expired"]);

export class Studio3dGenerationRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number | null = null) {
    super(message);
    this.name = "Studio3dGenerationRequestError";
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function invalidResponse(): never { throw new Error("3D 생성 서버의 응답 형식이 올바르지 않아요. 원본 작업은 변경하지 않았어요."); }
export function validateStudio3dGenerationJob(value: unknown): Studio3dGenerationJob {
  if (!object(value) || !nonempty(value.id) || !STATES.has(String(value.state))
    || !Number.isSafeInteger(value.generation) || !nonnegative(value.generation)
    || !nonnegative(value.estimatedCredits) || !nonnegative(value.createdAtMs)
    || !nonnegative(value.updatedAtMs) || !nonnegative(value.deadlineAtMs)
    || (value.actualCredits !== undefined && !nonnegative(value.actualCredits))
    || !object(value.request) || !MODES.has(String(value.request.mode))
    || !["server", "byok"].includes(String(value.request.transport))
    || !nonempty(value.request.provider) || !nonempty(value.request.model) || !nonempty(value.request.tier)) invalidResponse();
  const revision = value.artifactRevision;
  if (revision !== undefined && (!object(revision) || !nonempty(revision.id) || !nonempty(revision.modelId)
    || typeof revision.contentHashSha256 !== "string" || !/^[a-f\d]{64}$/iu.test(revision.contentHashSha256)
    || !Number.isSafeInteger(revision.byteLength) || !nonnegative(revision.byteLength) || revision.byteLength < 1 || revision.byteLength > MAX_ARTIFACT_BYTES
    || !nonempty(revision.mimeType) || !nonnegative(revision.createdAtMs) || revision.sourceJobId !== value.id)) invalidResponse();
  if (value.state === "ready" && revision === undefined) invalidResponse();
  return value as unknown as Studio3dGenerationJob;
}
/** Stop streaming as soon as a response exceeds its budget; Content-Length is not trusted. */
// The stream is assembled into an owned ArrayBuffer, suitable for Web Crypto and Blob.
async function responseBytes(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new RangeError("3D 생성 응답이 허용 크기를 초과했어요.");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError("3D 생성 응답이 허용 크기를 초과했어요.");
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
async function responseJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const bytes = await responseBytes(response, MAX_JSON_BYTES, signal);
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { payload = undefined; }
  if (!response.ok) {
    const defaultMessage = response.status === 401 || response.status === 403 ? "3D 생성을 사용하려면 로그인과 이용 권한을 확인해 주세요."
      : response.status === 429 ? "3D 생성 요청이 많아요. 잠시 후 다시 시도해 주세요."
      : response.status >= 500 ? "3D 생성 서버가 응답하지 못했어요. 원본을 유지한 채 다시 시도할 수 있어요."
      : `3D 생성 요청에 실패했어요. (HTTP ${response.status})`;
    const message = object(payload) && typeof payload.message === "string" && !/[<>]/u.test(payload.message)
      ? payload.message.slice(0, 500) : defaultMessage;
    const raw = response.headers.get("retry-after");
    const seconds = raw && /^\d+$/u.test(raw) ? Number(raw) : NaN;
    throw new Studio3dGenerationRequestError(message, response.status, Number.isFinite(seconds) ? Math.min(seconds * 1000, 3_600_000) : null);
  }
  if (payload === undefined) invalidResponse();
  return payload;
}
function normalizedBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || "/api/studio-ai/3d";
  return raw.replace(/\/$/u, "");
}
function requestHeaders(options: Studio3dGenerationClientOptions, idempotencyKey?: string): Headers {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json", "X-User-Id": options.userId });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const providerKey = options.providerApiKey?.()?.trim();
  if (providerKey) headers.set("X-Studio-3D-Provider-Key", providerKey);
  return headers;
}
export class Studio3dGenerationHttpClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #revisions = new Map<string, Studio3dGenerationArtifactRevision>();
  constructor(private readonly options: Studio3dGenerationClientOptions) {
    if (!options.userId.trim()) throw new TypeError("Studio 3D generation client requires a user identity.");
    this.#baseUrl = normalizedBaseUrl(options.baseUrl);
    this.#fetch = options.fetchImpl ?? fetch;
  }
  #remember(value: unknown): Studio3dGenerationJob {
    const job = validateStudio3dGenerationJob(value);
    if (job.artifactRevision) {
      this.#revisions.set(job.artifactRevision.id, Object.freeze({ ...job.artifactRevision }));
      if (this.#revisions.size > 1000) {
        const oldest = this.#revisions.keys().next().value;
        if (oldest !== undefined) this.#revisions.delete(oldest);
      }
    }
    return job;
  }
  async status(signal?: AbortSignal): Promise<Studio3dGenerationStatus> {
    const response = await this.#fetch(`${this.#baseUrl}/status`, { headers: requestHeaders(this.options), credentials: "include", signal });
    const status = await responseJson(response, signal);
    if (!object(status) || typeof status.configured !== "boolean" || typeof status.durable !== "boolean"
      || typeof status.provider !== "string" || status.apiKeyExposedToClient !== false || !Array.isArray(status.modes)
      || !status.modes.every((mode) => typeof mode === "string" && MODES.has(mode))) invalidResponse();
    return status as unknown as Studio3dGenerationStatus;
  }
  async create(input: Studio3dGenerationCreateInput, idempotencyKey: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    if (!idempotencyKey.trim()) throw new TypeError("중복 생성을 막기 위한 요청 ID가 필요해요.");
    const response = await this.#fetch(`${this.#baseUrl}/jobs`, { method: "POST", headers: requestHeaders(this.options, idempotencyKey), credentials: "include", body: JSON.stringify(input), signal });
    return this.#remember(await responseJson(response, signal));
  }
  async advance(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    return this.#jobRequest(jobId, "/advance", "POST", signal);
  }
  async cancel(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    return this.#jobRequest(jobId, "/cancel", "POST", signal);
  }
  async get(jobId: string, signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    return this.#jobRequest(jobId, "", "GET", signal);
  }
  async #jobRequest(jobId: string, suffix: string, method: "GET" | "POST", signal?: AbortSignal): Promise<Studio3dGenerationJob> {
    if (!jobId.trim()) throw new TypeError("3D 생성 작업 ID가 필요해요.");
    const response = await this.#fetch(`${this.#baseUrl}/jobs/${encodeURIComponent(jobId)}${suffix}`, { method, headers: requestHeaders(this.options), credentials: "include", signal });
    return this.#remember(await responseJson(response, signal));
  }
  async list(signal?: AbortSignal): Promise<readonly Studio3dGenerationJob[]> {
    const response = await this.#fetch(`${this.#baseUrl}/jobs`, { headers: requestHeaders(this.options), credentials: "include", signal });
    const jobs = await responseJson(response, signal);
    if (!Array.isArray(jobs) || jobs.length > 1000) invalidResponse();
    return jobs.map((job) => this.#remember(job));
  }
  async downloadArtifact(revisionId: string, signal?: AbortSignal): Promise<Blob> {
    const headers = requestHeaders(this.options);
    headers.delete("Content-Type");
    headers.set("Accept", "model/gltf-binary, application/octet-stream");
    const response = await this.#fetch(`${this.#baseUrl}/artifacts/${encodeURIComponent(revisionId)}`, { headers, credentials: "include", signal });
    if (!response.ok) { await responseJson(response, signal); throw new Error("3D 결과를 내려받지 못했어요."); }
    const expected = this.#revisions.get(revisionId);
    const bytes = await responseBytes(response, expected?.byteLength ?? MAX_ARTIFACT_BYTES, signal);
    if (!bytes.length) throw new Error("3D 결과 파일이 비어 있어요.");
    if (expected) {
      if (bytes.byteLength !== expected.byteLength) throw new Error("3D 결과의 크기가 기록과 달라요. 다시 내려받아 주세요.");
      if (!globalThis.crypto?.subtle) throw new Error("3D 결과 무결성 검증에는 보안 연결이 필요해요.");
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      signal?.throwIfAborted();
      const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hex !== expected.contentHashSha256.toLowerCase()) throw new Error("3D 결과 검증에 실패했어요. 손상된 파일은 삽입하지 않았어요.");
    }
    const mime = expected?.mimeType ?? response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
    if (mime.includes("html") || mime.includes("json") || mime.includes("javascript")) throw new Error("3D 모델 대신 오류 문서가 반환되었어요.");
    return new Blob([bytes], { type: mime });
  }
}
export async function studioFileToGenerationInput(file: File, maxBytes: number, label?: string, signal?: AbortSignal): Promise<Studio3dGenerationBinaryInput> {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ARTIFACT_BYTES) throw new RangeError("입력 파일의 크기 제한이 올바르지 않아요.");
  if (file.size < 1 || file.size > maxBytes) throw new RangeError(`File must be between 1 byte and ${maxBytes} bytes.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (bytes.byteLength !== file.size || bytes.byteLength > maxBytes) throw new RangeError("입력 파일의 실제 크기가 파일 정보와 달라요.");
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    signal?.throwIfAborted();
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return Object.freeze({ filename: file.name, mimeType: file.type || "application/octet-stream", dataBase64: btoa(binary), ...(label ? { label } : {}) });
}
