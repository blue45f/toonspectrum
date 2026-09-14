import { createUserInferenceApi } from "@/shared/ai/user-inference-api";
import { userAiConnection } from "@/shared/ai/user-ai-store";

const apiPath = (path: string) => path;

export type InferenceMode = "image-to-video" | "image-to-3d" | "model-to-2d";
export interface InferenceArtifact { name: string; bytes: number; mime: string; sha256: string }
export interface InferenceJob {
  id: string; mode: InferenceMode; state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  progress: number; stage: string; created: number; updated: number; error: string | null; artifacts: InferenceArtifact[];
}
export interface InferenceCapabilities { enabled: boolean; reason?: string; engines: Partial<Record<InferenceMode, { configured: boolean; model: string; validation: string }>> }
export interface InferenceRequest { mode: InferenceMode; assets: string[]; prompt: string; negativePrompt: string; captions: string[]; seed: number; frames: number; steps: number; strength: number; yaw: number }
const BASE = "/studio-ai/inference";
const CHUNK = 1024 * 1024;
const ID = /^[a-f0-9]{32}$/;
export function validateInferenceJob(value: unknown): InferenceJob {
  if (!value || typeof value !== "object") throw new Error("추론 작업 응답이 올바르지 않습니다.");
  const job = value as InferenceJob;
  if (!ID.test(job.id) || !["image-to-video", "image-to-3d", "model-to-2d"].includes(job.mode) || !["queued", "running", "succeeded", "failed", "cancelled", "interrupted"].includes(job.state) || !Number.isFinite(job.progress) || job.progress < 0 || job.progress > 100 || typeof job.stage !== "string" || !Array.isArray(job.artifacts) || job.artifacts.length > 16) throw new Error("추론 작업 상태가 올바르지 않습니다.");
  for (const artifact of job.artifacts) {
    if (!artifact || !/^[a-z0-9_-]+\.(mp4|glb|png|json|srt)$/.test(artifact.name) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || artifact.bytes > 256 * CHUNK || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !["video/mp4", "model/gltf-binary", "image/png", "application/json", "application/x-subrip"].includes(artifact.mime)) throw new Error("결과 파일 정보가 올바르지 않습니다.");
  }
  if (job.state === "succeeded" && !job.artifacts.length) throw new Error("완료 작업에 결과 파일이 없습니다.");
  return job;
}
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
function base64(bytes: Uint8Array): string {
  let text = ""; for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
export async function uploadInferenceAsset(file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<string> {
  const api = createUserInferenceApi();
  const mime = file.name.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : file.type;
  if (!["image/png", "image/jpeg", "image/webp", "model/gltf-binary"].includes(mime) || !file.size || file.size > (mime === "model/gltf-binary" ? 32 : 8) * CHUNK) throw new Error("이미지는 8MB, GLB는 32MB 이하를 선택하세요.");
  const sha256 = await hash(await file.arrayBuffer());
  signal.throwIfAborted();
  const upload = await api.post<{ id: string; chunkBytes: number; chunks: number }>(`${BASE}/uploads`, { mime, bytes: file.size, sha256 }, { signal, timeout: 30_000 });
  if (!ID.test(upload.id) || upload.chunkBytes !== CHUNK || upload.chunks !== Math.ceil(file.size / CHUNK)) throw new Error("업로드 응답이 올바르지 않습니다.");
  try {
    for (let index = 0; index < upload.chunks; index++) {
      signal.throwIfAborted(); const bytes = new Uint8Array(await file.slice(index * CHUNK, (index + 1) * CHUNK).arrayBuffer());
      await api.put(`${BASE}/uploads/${upload.id}/chunks/${index}`, { data: base64(bytes) }, { signal, timeout: 30_000 });
      onProgress(Math.round((index + 1) * 100 / upload.chunks));
    }
    await api.post(`${BASE}/uploads/${upload.id}/complete`, undefined, { signal, timeout: 30_000 });
    return upload.id;
  } catch (error) {
    // Best effort cleanup has its own bounded request; it must not override the original failure.
    void api.delete(`${BASE}/uploads/${upload.id}`, { timeout: 10_000 }).catch(() => undefined);
    throw error;
  }
}
export async function inferenceCapabilities(signal?: AbortSignal): Promise<InferenceCapabilities> {
  if (!userAiConnection("inference")) return { enabled: false, engines: {}, reason: "통합 AI 설정에서 개인 Creator Runtime 주소와 토큰을 등록하세요." };
  const api = createUserInferenceApi();
  const value = await api.get<InferenceCapabilities>(`${BASE}/status`, { signal, timeout: 15_000 });
  if (!value || typeof value.enabled !== "boolean" || !value.engines || typeof value.engines !== "object") throw new Error("추론 서버 설정 응답이 올바르지 않습니다.");
  for (const engine of Object.values(value.engines)) if (!engine || typeof engine.configured !== "boolean" || typeof engine.model !== "string") throw new Error("추론 모델 설정이 올바르지 않습니다.");
  return value;
}
export async function listInferenceJobs(signal?: AbortSignal): Promise<InferenceJob[]> {
  const api = createUserInferenceApi();
  const value = await api.get<{ jobs: unknown[] }>(`${BASE}/jobs`, { signal, timeout: 15_000 });
  if (!Array.isArray(value.jobs) || value.jobs.length > 40) throw new Error("작업 목록이 올바르지 않습니다.");
  return value.jobs.map(validateInferenceJob);
}
export async function submitInferenceJob(body: InferenceRequest, key: string, signal: AbortSignal): Promise<InferenceJob> {
  const api = createUserInferenceApi();
  return validateInferenceJob(await api.post(`${BASE}/jobs`, body, { headers: { "Idempotency-Key": key }, signal, timeout: 30_000 }));
}
export async function cancelInferenceJob(id: string): Promise<void> {
  const api = createUserInferenceApi();
  if (!ID.test(id)) throw new Error("잘못된 작업 ID입니다.");
  await api.post(`${BASE}/jobs/${id}/cancel`, undefined, { timeout: 15_000 });
}
export async function downloadInferenceArtifact(job: InferenceJob, artifact: InferenceArtifact, signal: AbortSignal, onProgress: (percent: number) => void): Promise<Blob> {
  const api = createUserInferenceApi();
  validateInferenceJob(job);
  if (job.state !== "succeeded" || !job.artifacts.some((entry) => entry.name === artifact.name && entry.sha256 === artifact.sha256 && entry.bytes === artifact.bytes)) throw new Error("확인되지 않은 결과 파일입니다.");
  const data = new Uint8Array(artifact.bytes);
  for (let i = 0; i < Math.ceil(artifact.bytes / CHUNK); i++) {
    const response = await api.raw.get(apiPath(`${BASE}/jobs/${job.id}/artifacts/${artifact.name}/chunks/${i}`), { signal, timeout: 30_000 });
    const expected = Math.min(CHUNK, artifact.bytes - i * CHUNK);
    if (!response.headers.get("content-type")?.includes("application/octet-stream") || Number(response.headers.get("content-length")) !== expected) throw new Error("결과 파일 조각의 길이가 올바르지 않습니다.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== expected) throw new Error("결과 파일이 잘렸습니다.");
    data.set(bytes, i * CHUNK); onProgress(Math.round((i + 1) * 100 * CHUNK / artifact.bytes));
  }
  if (await hash(data.buffer) !== artifact.sha256) throw new Error("결과 파일 무결성 검사에 실패했습니다. 파일을 사용하지 마세요.");
  return new Blob([data], { type: artifact.mime });
}

export async function removeUserInferenceUpload(id: string): Promise<void> {
  if (!ID.test(id)) throw new Error("잘못된 업로드 ID입니다.");
  await createUserInferenceApi().delete(`${BASE}/uploads/${id}`);
}

export async function cleanupUserInferenceUploads(): Promise<number> {
  const result = await createUserInferenceApi().post<{ deleted: number }>(`${BASE}/uploads/cleanup`, {});
  if (!Number.isSafeInteger(result.deleted) || result.deleted < 0) throw new Error("입력 파일 정리 응답이 올바르지 않습니다.");
  return result.deleted;
}
export async function deleteUserInferenceJob(id: string): Promise<void> {
  if (!ID.test(id)) throw new Error("잘못된 작업 ID입니다.");
  await createUserInferenceApi().delete(`${BASE}/jobs/${id}`);
}
