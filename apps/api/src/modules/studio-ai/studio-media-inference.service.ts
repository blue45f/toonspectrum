import { rejectOperatorFundedAi } from "../../config/user-funded-ai-policy";
import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, HttpException, HttpStatus } from "@nestjs/common";
import { buildMediaInferenceGraph, DEFAULT_MEDIA_MODELS, mediaGraphAvailability, parseMediaInferenceInput, record, type MediaInferenceKind } from "./studio-media-inference-graph";
import { MediaInferenceStore, type MediaArtifact, type MediaJob } from "./studio-media-inference-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const KINDS: MediaInferenceKind[] = ["image-to-video", "image-to-3d", "render-to-2d"];
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
export function validateInferencePng(data: string): Buffer {
  const bytes = Buffer.from(data.slice("data:image/png;base64,".length), "base64");
  if (bytes.length < 33 || bytes.length > 4 * 1024 * 1024 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR") throw new BadRequestException("올바른 PNG 이미지가 필요해요.");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 64 || height < 64 || width > 2048 || height > 2048 || width * height > 2_097_152) throw new BadRequestException("이미지 해상도는 64~2048, 최대 209만 화소여야 해요.");
  return bytes;
}
function privateMediaRuntimeHost(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".internal")
    || hostname === "::1"
    || hostname === "::"
    || hostname.startsWith("fc")
    || hostname.startsWith("fd")
    || /^fe[89ab]/u.test(hostname)
  ) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}
export function allowedInferenceOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
    || privateMediaRuntimeHost(url.hostname)
  ) throw new Error("Use a public managed-cloud HTTPS origin only");
  return url.origin;
}
export async function boundedInferenceBytes(response: Response, max: number): Promise<Uint8Array> {
  if (!response.body || Number(response.headers.get("content-length") ?? 0) > max) throw new Error("invalid-provider-size");
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > max) throw new Error("provider-size-limit"); chunks.push(next.value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
export function mediaHistoryArtifacts(value: unknown, id: string, kind: MediaInferenceKind): MediaArtifact[] {
  if (!record(value) || !record(value.outputs)) return [];
  const outputNode = kind === "image-to-video" ? "11" : kind === "image-to-3d" ? "9" : "8";
  const output = value.outputs[outputNode]; if (!record(output)) return [];
  const extension = kind === "image-to-video" ? ".webm" : kind === "image-to-3d" ? ".glb" : ".png";
  const mime = kind === "image-to-video" ? "video/webm" : kind === "image-to-3d" ? "model/gltf-binary" : "image/png";
  const candidates = [output.images, output.gifs, output.videos, output["3d"]].flatMap(item => Array.isArray(item) ? item : []);
  return candidates.filter(item => record(item) && typeof item.filename === "string" && /^result_[a-zA-Z0-9_.-]+$/u.test(item.filename)
    && item.filename.endsWith(extension) && item.type === "output" && item.subfolder === `toonstudio/${id}`).slice(0, 1)
    .map(item => ({ filename: String(item.filename), subfolder: `toonstudio/${id}`, type: "output" as const, mime }));
}
function publicJob(job: MediaJob) {
  return { id: job.id, kind: job.kind, state: job.state, error: job.error_code,
    createdAt: job.created_at, updatedAt: job.updated_at, artifacts: job.artifacts.map((artifact, index) => ({ index, mime: artifact.mime, name: artifact.filename })) };
}
@Injectable()
export class StudioMediaInferenceService {
  private store: MediaInferenceStore | undefined;
  private configuration() {
    rejectOperatorFundedAi();
    const value = process.env.STUDIO_MEDIA_CLOUD_API_URL?.trim();
    if (!value || !process.env.DATABASE_URL) throw new ServiceUnavailableException("관리형 클라우드 미디어 런타임과 작업 저장소가 아직 설정되지 않았어요.");
    let origin: string;
    try { origin = allowedInferenceOrigin(value); } catch { throw new ServiceUnavailableException("클라우드 미디어 런타임 보안 설정을 확인해 주세요."); }
    this.store ??= new MediaInferenceStore(process.env.DATABASE_URL);
    return { origin, store: this.store, models: {
      wan: process.env.STUDIO_WAN_MODEL || DEFAULT_MEDIA_MODELS.wan, text: process.env.STUDIO_WAN_TEXT_ENCODER || DEFAULT_MEDIA_MODELS.text,
      vae: process.env.STUDIO_WAN_VAE || DEFAULT_MEDIA_MODELS.vae, shape: process.env.STUDIO_HUNYUAN_MODEL || DEFAULT_MEDIA_MODELS.shape,
      image: process.env.STUDIO_SDXL_MODEL || DEFAULT_MEDIA_MODELS.image,
    } };
  }
  private async request(path: string, init: RequestInit = {}, max = 16 * 1024 * 1024): Promise<Uint8Array> {
    const { origin } = this.configuration();
    const headers = new Headers(init.headers);
    const token = process.env.STUDIO_MEDIA_CLOUD_API_TOKEN; if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${origin}${path}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`provider-http-${response.status}`); }
    return boundedInferenceBytes(response, max);
  }
  private async json(path: string, body?: unknown): Promise<unknown> {
    const bytes = await this.request(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  private statusCache: { value: unknown; expires: number } | undefined;
  private statusPending: Promise<unknown> | undefined;
  async status(): Promise<unknown> {
    if (this.statusCache && this.statusCache.expires > Date.now()) return this.statusCache.value;
    if (this.statusPending) return this.statusPending;
    this.statusPending = this.readStatus().then(value => { this.statusCache = { value, expires: Date.now() + 30000 }; return value; });
    try { return await this.statusPending; } finally { this.statusPending = undefined; }
  }
  private async readStatus() {
    try {
      const config = this.configuration(); await config.store.ready();
      const info = await this.json("/object_info");
      const sample = { image: "", prompt: "", negative: "", seed: 42, frames: 81 as const, aspect: "landscape" as const, strength: .45 };
      const capabilities = KINDS.map(kind => { const missing = mediaGraphAvailability(buildMediaInferenceGraph({ ...sample, kind }, "00000000-0000-4000-8000-000000000000.png", "00000000-0000-4000-8000-000000000000", config.models), info); return { kind, ready: missing.length === 0, missing }; });
      return { configured: true, provider: "managed-cloud-comfyui", capabilities, requiresAuth: true, limits: { activePerUser: 1, dailyPerUser: 12 }, externalPaidFallback: false };
    } catch { return { configured: false, provider: "managed-cloud-comfyui", capabilities: KINDS.map(kind => ({ kind, ready: false, missing: ["관리형 클라우드 런타임·모델·작업 저장소 연결을 확인해 주세요."] })), requiresAuth: true, externalPaidFallback: false }; }
  }
  async list(owner: string) { return (await this.configuration().store.list(owner)).map(publicJob); }
  private async owned(owner: string, id: string): Promise<MediaJob> {
    if (!UUID.test(id)) throw new BadRequestException("올바르지 않은 작업 ID예요.");
    try { return await this.configuration().store.get(owner, id); } catch (error) {
      if (error instanceof Error && error.message === "job-not-found") throw new NotFoundException("작업을 찾을 수 없어요."); throw error;
    }
  }
  async create(owner: string, key: string, raw: unknown) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u.test(key)) throw new BadRequestException("작업 식별자가 필요해요.");
    let input; try { input = parseMediaInferenceInput(raw); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "입력을 확인해 주세요."); }
    const bytes = validateInferencePng(input.image); const { store, models } = this.configuration();
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    let admission;
    try { admission = await store.admit(owner, key, hash, input.kind); } catch (error) {
      if (error instanceof Error && error.message === "idempotency-conflict") throw new ConflictException("같은 작업 ID의 입력이 변경되었어요.");
      if (error instanceof Error && error.message === "inference-capacity-exceeded") throw new HttpException("진행 중인 작업을 완료하거나 취소한 뒤 다시 시도해 주세요. 하루 최대 12개 작업을 생성할 수 있어요.", HttpStatus.TOO_MANY_REQUESTS);
      throw new ServiceUnavailableException("작업 기록을 저장할 수 없어 추론 요청을 전송하지 않았어요.");
    }
    const { job } = admission;
    if (!admission.created) return publicJob(job);
    let submissionStarted = false;
    try {
      const filename = `${job.id}.png`;
      const graph = buildMediaInferenceGraph(input, filename, job.id, models);
      const missing = mediaGraphAvailability(graph, await this.json("/object_info"));
      if (missing.length) { return publicJob(await store.patch(owner, job.id, "failed", null, [], "model-or-node-missing")); }
      const form = new FormData(); form.set("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename); form.set("type", "input"); form.set("overwrite", "false");
      const uploaded: unknown = JSON.parse(new TextDecoder().decode(await this.request("/upload/image", { method: "POST", body: form }, 64 * 1024)));
      if (!record(uploaded) || uploaded.name !== filename || (uploaded.subfolder && uploaded.subfolder !== "") || uploaded.type !== "input") throw new Error("invalid-upload-receipt");
      if (["cancel-requested", "cancelled"].includes((await store.get(owner, job.id)).state)) return publicJob(await store.patch(owner, job.id, "cancelled", null));
      // Persist deterministic prompt identity before POST. A lost response never causes automatic resubmission.
      const beforeSubmit = await store.patch(owner, job.id, "submitting", job.id);
      if (["cancel-requested", "cancelled"].includes(beforeSubmit.state)) return publicJob(await store.patch(owner, job.id, "cancelled", null));
      submissionStarted = true;
      const result = await this.json("/prompt", { prompt_id: job.id, client_id: job.id, prompt: graph });
      if (!record(result) || typeof result.prompt_id !== "string" || !UUID.test(result.prompt_id)) throw new Error("invalid-prompt-receipt");
      const queued = await store.patch(owner, job.id, "queued", result.prompt_id);
      if (queued.state === "cancel-requested") return this.cancel(owner, job.id);
      return publicJob(queued);
    } catch {
      return publicJob(await store.patch(owner, job.id, submissionStarted ? "submission-unknown" : "failed", null, [], submissionStarted ? "submission-uncertain-do-not-resubmit" : "provider-unavailable"));
    }
  }
  async get(owner: string, id: string) {
    const job = await this.owned(owner, id); if (TERMINAL.has(job.state) || !job.provider_id) return publicJob(job);
    const { store } = this.configuration();
    try {
      const history = await this.json(`/history/${encodeURIComponent(job.provider_id)}`);
      const entry = record(history) ? history[job.provider_id] : undefined;
      if (record(entry)) {
        const status = record(entry.status) ? entry.status : {};
        if (status.status_str === "error") return publicJob(await store.patch(owner, id, job.state === "cancel-requested" ? "cancelled" : "failed", null, [], "provider-generation-failed"));
        if (status.completed === true) {
          const artifacts = mediaHistoryArtifacts(entry, job.id, job.kind);
          return publicJob(await store.patch(owner, id, artifacts.length ? "succeeded" : "failed", null, artifacts, artifacts.length ? null : "empty-provider-output"));
        }
      }
      const queue = await this.json("/queue");
      if (record(queue)) {
        const contains = (items: unknown) => Array.isArray(items) && items.some(item => Array.isArray(item) && item[1] === job.provider_id);
        if (contains(queue.queue_running)) return publicJob(await store.patch(owner, id, "running", null));
        if (contains(queue.queue_pending)) return publicJob(await store.patch(owner, id, "queued", null));
        if (job.state === "cancel-requested") return publicJob(await store.patch(owner, id, "cancelled", null));
      }
      return publicJob(job);
    } catch { throw new ServiceUnavailableException("클라우드 런타임 상태를 확인하지 못했어요. 작업 ID를 유지한 채 다시 확인해 주세요."); }
  }
  async cancel(owner: string, id: string) {
    const job = await this.owned(owner,id); if (TERMINAL.has(job.state)) return publicJob(job);
    const { store } = this.configuration(); await store.patch(owner,id,"cancel-requested",null);
    if (!job.provider_id) return publicJob(await store.patch(owner,id,"cancelled",null));
    try { await this.json(`/api/jobs/${encodeURIComponent(job.provider_id)}/cancel`, {}); }
    catch { throw new ServiceUnavailableException("서버에서 취소를 확인하지 못했어요. 다른 사용자의 작업을 중단하는 전체 취소는 실행하지 않습니다."); }
    return this.get(owner,id);
  }
  async artifact(owner: string, id: string, index: number) {
    const job = await this.owned(owner,id);
    const artifact = Number.isSafeInteger(index) && index >= 0 ? job.artifacts[index] : undefined;
    if (job.state !== "succeeded" || !artifact) throw new NotFoundException("생성 결과를 찾을 수 없어요.");
    const query = new URLSearchParams({ filename: artifact.filename, subfolder: artifact.subfolder, type: "output" });
    const bytes = await this.request(`/view?${query}`, {}, 80 * 1024 * 1024);
    const head = Buffer.from(bytes.subarray(0, 12));
    const valid = artifact.mime === "image/png" ? head.subarray(0,8).toString("hex") === "89504e470d0a1a0a"
      : artifact.mime === "video/webm" ? head.subarray(0,4).toString("hex") === "1a45dfa3"
      : head.length >= 12 && head.toString("ascii",0,4) === "glTF" && head.readUInt32LE(4) === 2 && head.readUInt32LE(8) === bytes.byteLength;
    if (!valid) throw new ServiceUnavailableException("생성 파일의 형식을 검증하지 못했어요.");
    return { bytes, mime: artifact.mime, name: artifact.filename, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  async onModuleDestroy() { await this.store?.close(); }
}
