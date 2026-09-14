import {
  getUnifiedAiAuxSettings,
  validateUserAiBaseUrl,
} from "@/shared/ai/unified-ai-settings";

export type PersonalInferenceMode = "image-to-video" | "image-to-3d" | "model-to-2d";
export interface PersonalInferenceArtifact { name: string; bytes: number; mime: string; sha256: string }
export interface PersonalInferenceJob {
  id: string;
  mode: PersonalInferenceMode;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  progress: number;
  stage: string;
  error: string | null;
  artifacts: PersonalInferenceArtifact[];
}
export interface PersonalInferenceCapabilities {
  enabled: boolean;
  reason?: string;
  engines: Partial<Record<PersonalInferenceMode, { configured: boolean; model: string; validation: string }>>;
}
export interface PersonalInferenceRequest {
  mode: PersonalInferenceMode;
  assets: string[];
  prompt: string;
  negativePrompt: string;
  captions: string[];
  seed: number;
  frames: number;
  steps: number;
  strength: number;
  yaw: number;
}

const CHUNK = 1024 * 1024;
const ID = /^[a-f0-9]{32}$/u;
const STATES = new Set(["queued", "running", "succeeded", "failed", "cancelled", "interrupted"]);
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function connection() {
  const settings = getUnifiedAiAuxSettings();
  if (!settings.creatorRuntimeBaseUrl || !settings.creatorRuntimeToken) throw new Error("통합 AI 설정에서 개인 Creator Runtime 주소와 토큰을 등록하세요.");
  return { base: validateUserAiBaseUrl(settings.creatorRuntimeBaseUrl, false), token: settings.creatorRuntimeToken, owner: settings.creatorRuntimeOwner };
}
async function boundedBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maximum || !response.body) { await response.body?.cancel(); throw new Error("개인 추론 서버 응답 크기를 확인할 수 없습니다."); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new Error("개인 추론 서버 응답이 허용 크기를 초과했습니다."); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function request(path: string, init: RequestInit = {}, maximum = 1536 * 1024): Promise<Response> {
  if (!/^\/(?:[A-Za-z0-9._-]+\/?)+$/u.test(path) || path.includes("..")) throw new Error("개인 추론 서버 경로가 올바르지 않습니다.");
  const current = connection();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${current.token}`);
  headers.set("X-Creator-Owner", current.owner);
  const response = await fetch(`${current.base}${path}`, { ...init, headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
  const bytes = await boundedBytes(response, maximum);
  if (!response.ok) throw new Error(`개인 추론 서버 요청 실패 (HTTP ${response.status}). 자동 재시도하지 않았습니다.`);
  return new Response(bytes.buffer as ArrayBuffer, { status: response.status, headers: response.headers });
}
async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  try { return await response.json() as T; }
  catch (error) { throw new Error("개인 추론 서버 JSON 응답을 확인하지 못했습니다.", { cause: error }); }
}
function base64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) value += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return btoa(value);
}
async function sha256(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function validatePersonalInferenceJob(value: unknown): PersonalInferenceJob {
  if (!object(value) || typeof value.id !== "string" || !ID.test(value.id)
    || typeof value.mode !== "string" || !["image-to-video", "image-to-3d", "model-to-2d"].includes(value.mode)
    || typeof value.state !== "string" || !STATES.has(value.state)
    || typeof value.progress !== "number" || value.progress < 0 || value.progress > 100
    || typeof value.stage !== "string" || !Array.isArray(value.artifacts) || value.artifacts.length > 16) throw new Error("개인 추론 작업 응답이 올바르지 않습니다.");
  const artifacts = value.artifacts.map((entry) => {
    if (!object(entry) || typeof entry.name !== "string" || !/^[a-z0-9_-]+\.(?:mp4|glb|png|json|srt)$/u.test(entry.name)
      || typeof entry.bytes !== "number" || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 256 * CHUNK
      || typeof entry.mime !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error("개인 추론 결과 파일 정보가 올바르지 않습니다.");
    return { name: entry.name, bytes: entry.bytes, mime: entry.mime, sha256: entry.sha256 };
  });
  return { id: value.id, mode: value.mode as PersonalInferenceMode, state: value.state as PersonalInferenceJob["state"], progress: value.progress, stage: value.stage.slice(0, 160), error: typeof value.error === "string" ? value.error.slice(0, 500) : null, artifacts };
}

export async function personalInferenceCapabilities(signal?: AbortSignal): Promise<PersonalInferenceCapabilities> {
  const value = await json<unknown>("/capabilities", { signal });
  if (!object(value) || typeof value.enabled !== "boolean" || !object(value.engines)) throw new Error("개인 추론 서버 기능 정보를 확인하지 못했습니다.");
  const engines: PersonalInferenceCapabilities["engines"] = {};
  for (const mode of ["image-to-video", "image-to-3d", "model-to-2d"] as const) {
    const raw = value.engines[mode];
    if (object(raw) && typeof raw.configured === "boolean" && typeof raw.model === "string" && typeof raw.validation === "string") engines[mode] = { configured: raw.configured, model: raw.model.slice(0, 200), validation: raw.validation.slice(0, 500) };
  }
  return { enabled: value.enabled, engines, ...(typeof value.reason === "string" ? { reason: value.reason.slice(0, 500) } : {}) };
}

export async function uploadPersonalInferenceAsset(file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<string> {
  const mime = file.name.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : file.type;
  const maximum = mime === "model/gltf-binary" ? 32 * CHUNK : 8 * CHUNK;
  if (!["image/png", "image/jpeg", "image/webp", "model/gltf-binary"].includes(mime) || !file.size || file.size > maximum) throw new Error("이미지는 8MB, GLB는 32MB 이하만 사용할 수 있습니다.");
  const checksum = await sha256(await file.arrayBuffer());
  signal.throwIfAborted();
  const upload = await json<{ id: string; chunkBytes: number; chunks: number }>("/uploads", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mime, bytes: file.size, sha256: checksum }) });
  if (!ID.test(upload.id) || upload.chunkBytes !== CHUNK || upload.chunks !== Math.ceil(file.size / CHUNK)) throw new Error("개인 추론 서버 업로드 응답이 올바르지 않습니다.");
  try {
    for (let index = 0; index < upload.chunks; index += 1) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(await file.slice(index * CHUNK, (index + 1) * CHUNK).arrayBuffer());
      await json(`/uploads/${upload.id}/chunks/${index}`, { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: base64(bytes) }) });
      onProgress(Math.round(((index + 1) / upload.chunks) * 100));
    }
    await json(`/uploads/${upload.id}/complete`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: "{}" });
    return upload.id;
  } catch (error) {
    void request(`/uploads/${upload.id}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

export async function listPersonalInferenceJobs(signal?: AbortSignal): Promise<PersonalInferenceJob[]> {
  const value = await json<{ jobs?: unknown[] }>("/jobs", { signal });
  if (!Array.isArray(value.jobs) || value.jobs.length > 40) throw new Error("개인 추론 작업 목록을 확인하지 못했습니다.");
  return value.jobs.map(validatePersonalInferenceJob);
}
export async function submitPersonalInferenceJob(input: PersonalInferenceRequest, key: string, signal: AbortSignal): Promise<PersonalInferenceJob> {
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(key)) throw new Error("중복 방지 요청 키가 올바르지 않습니다.");
  return validatePersonalInferenceJob(await json("/jobs", { method: "POST", signal, headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) }));
}
export async function cancelPersonalInferenceJob(id: string): Promise<PersonalInferenceJob> {
  if (!ID.test(id)) throw new Error("작업 ID가 올바르지 않습니다.");
  return validatePersonalInferenceJob(await json(`/jobs/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
}
export async function downloadPersonalInferenceArtifact(job: PersonalInferenceJob, artifact: PersonalInferenceArtifact, signal: AbortSignal, onProgress: (percent: number) => void): Promise<Blob> {
  validatePersonalInferenceJob(job);
  if (job.state !== "succeeded" || !job.artifacts.some((entry) => entry.name === artifact.name && entry.sha256 === artifact.sha256)) throw new Error("검증되지 않은 결과 파일입니다.");
  const output = new Uint8Array(artifact.bytes);
  const chunks = Math.ceil(artifact.bytes / CHUNK);
  for (let index = 0; index < chunks; index += 1) {
    const response = await request(`/jobs/${job.id}/artifacts/${artifact.name}/chunks/${index}`, { signal }, CHUNK);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const expected = Math.min(CHUNK, artifact.bytes - index * CHUNK);
    if (bytes.length !== expected) throw new Error("결과 파일 조각이 잘렸습니다.");
    output.set(bytes, index * CHUNK);
    onProgress(Math.round(((index + 1) / chunks) * 100));
  }
  if (await sha256(output.buffer) !== artifact.sha256) throw new Error("결과 파일 무결성 검사에 실패했습니다.");
  return new Blob([output], { type: artifact.mime });
}
