import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import {
  InMemoryStudio3dGenerationJobStore,
  Studio3dGenerationJobLedger,
  type Studio3dGenerationArtifactRevision,
  type Studio3dGenerationJobRecord,
  type Studio3dGenerationJobRequestSummary,
  type Studio3dGenerationJobStore,
} from "./studio-3d-generation-job-ledger";
import {
  InMemoryStudio3dGenerationProviderIdentityStore,
  PostgresStudio3dGenerationProviderIdentityStore,
  type Studio3dGenerationProviderIdentityStore,
} from "./studio-3d-generation-provider-identity-store";
import {
  PostgresStudio3dGenerationStore,
  type Studio3dGenerationArtifactStore,
  type Studio3dGenerationStoredArtifact,
} from "./studio-3d-generation-postgres-store";
import { createHyper3dRodinProvider } from "./studio-hyper3d-rodin-provider";
import { STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION } from "./studio-3d-generation-provider";

export interface Studio3dGenerationBinaryInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly dataBase64: string;
  readonly label?: string;
}

export interface Studio3dGenerationCreateInput {
  readonly mode: "text-to-3d" | "image-to-3d" | "multiview-to-3d" | "texture-only";
  readonly prompt?: string;
  readonly images?: readonly Studio3dGenerationBinaryInput[];
  readonly model?: Studio3dGenerationBinaryInput;
  readonly transport?: "server" | "byok";
  readonly options?: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly estimatedCredits?: number;
}

interface Studio3dProviderRuntime {
  submit(request: unknown, signal: AbortSignal): Promise<unknown>;
  poll(job: unknown, signal: AbortSignal): Promise<unknown>;
  download(job: unknown, signal: AbortSignal): Promise<unknown>;
  cancel?(job: unknown): Promise<void>;
}

class InMemoryArtifactStore implements Studio3dGenerationArtifactStore {
  readonly #artifacts = new Map<string, Studio3dGenerationStoredArtifact>();

  async putArtifact(artifact: Studio3dGenerationStoredArtifact): Promise<void> {
    this.#artifacts.set(artifact.revision.id, artifact);
  }

  async getArtifact(revisionId: string): Promise<Studio3dGenerationStoredArtifact | undefined> {
    return this.#artifacts.get(revisionId);
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedString(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TypeError(`${field} is invalid.`);
  return normalized;
}

function base64Bytes(input: Studio3dGenerationBinaryInput, field: string, maxBytes: number): Uint8Array {
  const filename = boundedString(input.filename, `${field}.filename`, 180);
  if (filename.includes("/") || filename.includes("\\") || filename.includes("\0")) {
    throw new TypeError(`${field}.filename is invalid.`);
  }
  boundedString(input.mimeType, `${field}.mimeType`, 120);
  if (typeof input.dataBase64 !== "string" || input.dataBase64.length > Math.ceil(maxBytes * 4 / 3) + 16) {
    throw new RangeError(`${field} exceeds its encoded byte budget.`);
  }
  const bytes = Uint8Array.from(Buffer.from(input.dataBase64, "base64"));
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) throw new RangeError(`${field} byte length is invalid.`);
  return bytes;
}

function providerIdentity(value: unknown, depth = 0): unknown | undefined {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).map((key) => key.toLowerCase());
  if (keys.some((key) => key === "taskid" || key === "task_id" || key === "uuid")) return value;
  for (const entry of Object.values(object)) {
    const found = providerIdentity(entry, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function providerIdentityString(identity: unknown, names: readonly string[]): string | undefined {
  if (!identity || typeof identity !== "object") return undefined;
  const object = identity as Record<string, unknown>;
  for (const [key, value] of Object.entries(object)) {
    if (names.includes(key.toLowerCase()) && typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(object)) {
    const found = providerIdentityString(value, names);
    if (found) return found;
  }
  return undefined;
}

function providerState(value: unknown): string {
  const states: string[] = [];
  const visit = (entry: unknown, depth = 0): void => {
    if (depth > 7 || entry === undefined || entry === null) return;
    if (typeof entry === "string") {
      states.push(entry.toLowerCase());
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof entry === "object") {
      for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
        if (/status|state|phase|message|error/iu.test(key)) visit(item, depth + 1);
      }
    }
  };
  visit(value);
  return states.join(" ");
}

function modelBinary(value: unknown, depth = 0): { readonly bytes: Uint8Array; readonly mimeType: string; readonly filename: string } | undefined {
  if (depth > 10 || !value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.bytes instanceof Uint8Array) {
    const mimeType = typeof object.mimeType === "string" ? object.mimeType : "application/octet-stream";
    const filename = typeof object.filename === "string" ? object.filename : "generated.glb";
    if (/gltf|model|octet-stream/iu.test(mimeType) || /\.(glb|gltf)$/iu.test(filename)) {
      return Object.freeze({ bytes: object.bytes, mimeType, filename });
    }
  }
  for (const entry of Object.values(object)) {
    const found = modelBinary(entry, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function assertGlb(bytes: Uint8Array): void {
  if (bytes.byteLength < 20) throw new RangeError("generated GLB is too small.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new TypeError("generated artifact is not a GLB v2 container.");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) throw new TypeError("generated GLB length is invalid.");
}

function sealKey(): Buffer {
  const secret = process.env.STUDIO_3D_JOB_SECRET?.trim()
    || process.env.SESSION_SECRET?.trim()
    || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new ServiceUnavailableException("3D generation identity encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}

function sealIdentity(identity: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(identity), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function openIdentity(sealed: string): unknown {
  const payload = Buffer.from(sealed, "base64url");
  if (payload.byteLength < 29) throw new TypeError("sealed 3D provider identity is malformed.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as unknown;
}

@Injectable()
export class Studio3dGenerationService {
  readonly #jobStore: Studio3dGenerationJobStore;
  readonly #artifactStore: Studio3dGenerationArtifactStore;
  readonly #identityStore: Studio3dGenerationProviderIdentityStore;
  readonly #ledger: Studio3dGenerationJobLedger;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      const store = new PostgresStudio3dGenerationStore(databaseUrl);
      this.#jobStore = store;
      this.#artifactStore = store;
      this.#identityStore = new PostgresStudio3dGenerationProviderIdentityStore(databaseUrl);
    } else if (process.env.NODE_ENV !== "production") {
      this.#jobStore = new InMemoryStudio3dGenerationJobStore();
      this.#artifactStore = new InMemoryArtifactStore();
      this.#identityStore = new InMemoryStudio3dGenerationProviderIdentityStore();
    } else {
      throw new ServiceUnavailableException("Durable 3D generation storage is not configured.");
    }
    this.#ledger = new Studio3dGenerationJobLedger(
      this.#jobStore,
      async () => ({
        maxConcurrentJobs: Math.max(1, Number(process.env.STUDIO_3D_MAX_CONCURRENT_JOBS ?? 2)),
        dailyCreditBudget: Math.max(0, Number(process.env.STUDIO_3D_DAILY_CREDIT_BUDGET ?? 20)),
        monthlyCreditBudget: Math.max(0, Number(process.env.STUDIO_3D_MONTHLY_CREDIT_BUDGET ?? 200)),
      }),
    );
  }

  status() {
    return Object.freeze({
      configured: Boolean(process.env.HYPER3D_API_KEY?.trim() || process.env.RODIN_API_KEY?.trim()),
      durable: Boolean(process.env.DATABASE_URL?.trim()),
      provider: "hyper3d-rodin",
      modes: Object.freeze(["text-to-3d", "image-to-3d", "multiview-to-3d", "texture-only"]),
      apiKeyExposedToClient: false,
    });
  }

  #provider(providerApiKey?: string): Studio3dProviderRuntime {
    const apiKey = providerApiKey?.trim()
      || process.env.HYPER3D_API_KEY?.trim()
      || process.env.RODIN_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Hyper3D/Rodin is not configured.");
    return createHyper3dRodinProvider({ apiKey }) as unknown as Studio3dProviderRuntime;
  }

  #request(input: Studio3dGenerationCreateInput, requestId: string): {
    readonly providerRequest: unknown;
    readonly summary: Studio3dGenerationJobRequestSummary;
  } {
    const images = (input.images ?? []).map((image, index) => ({
      filename: boundedString(image.filename, `images[${index}].filename`, 180),
      mimeType: boundedString(image.mimeType, `images[${index}].mimeType`, 120),
      bytes: base64Bytes(image, `images[${index}]`, 25 * 1024 * 1024),
      ...(image.label ? { label: image.label.trim().slice(0, 80) } : {}),
    }));
    const model = input.model
      ? {
          filename: boundedString(input.model.filename, "model.filename", 180),
          mimeType: boundedString(input.model.mimeType, "model.mimeType", 120),
          bytes: base64Bytes(input.model, "model", 200 * 1024 * 1024),
        }
      : undefined;
    const prompt = input.prompt?.trim();
    if (prompt && prompt.length > 1_024) throw new RangeError("3D generation prompt exceeds 1024 characters.");
    const options = Object.freeze({ ...(input.options ?? {}) });
    const transport = input.transport ?? "server";
    return Object.freeze({
      providerRequest: Object.freeze({
        schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
        requestId,
        mode: input.mode,
        ...(prompt ? { prompt } : {}),
        ...(images.length > 0 ? { images: Object.freeze(images) } : {}),
        ...(model ? { model } : {}),
        options,
      }),
      summary: Object.freeze({
        mode: input.mode,
        ...(prompt ? { promptHash: sha256(prompt) } : {}),
        inputContentHashes: Object.freeze(images.map((image) => sha256(image.bytes))),
        ...(model ? { sourceAssetRevisionId: sha256(model.bytes) } : {}),
        provider: "hyper3d-rodin",
        model: String(options.tier ?? "Rodin Gen-2.5"),
        tier: String(options.tier ?? "Gen-2.5-Medium"),
        ...(options.meshMode ? { meshMode: String(options.meshMode) } : {}),
        ...(typeof options.targetFaceCount === "number" ? { targetFaceCount: options.targetFaceCount } : {}),
        ...(options.material ? { material: String(options.material) } : {}),
        ...(options.textureMode ? { textureMode: String(options.textureMode) } : {}),
        ...(typeof options.textureResolution === "number" ? { textureResolution: options.textureResolution } : {}),
        ...(typeof options.seed === "number" ? { seed: options.seed } : {}),
        ...(typeof options.symmetry === "boolean" ? { symmetry: options.symmetry } : {}),
        ...(options.pose ? { pose: String(options.pose) } : {}),
        transport,
      }),
    });
  }

  async create(
    userId: string,
    idempotencyKey: string,
    input: Studio3dGenerationCreateInput,
    providerApiKey?: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<Studio3dGenerationJobRecord> {
    const requestId = `studio-3d-${sha256(`${userId}\u0000${idempotencyKey}`).slice(0, 24)}`;
    const { providerRequest, summary } = this.#request(input, requestId);
    const created = await this.#ledger.create({
      userId,
      idempotencyKey,
      request: summary,
      estimatedCredits: input.estimatedCredits ?? 1,
    });
    if (created.duplicate) return created.record;
    let record = await this.#ledger.transition({
      jobId: created.record.id,
      expectedGeneration: created.record.generation,
      state: "uploading",
    });
    try {
      const submission = await this.#provider(providerApiKey).submit(providerRequest, signal);
      const identity = providerIdentity(submission) ?? submission;
      const subscriptionKey = providerIdentityString(identity, ["subscriptionkey", "subscription_key"]) ?? "provider-managed";
      const taskId = providerIdentityString(identity, ["taskid", "task_id", "uuid"]);
      if (!taskId) throw new TypeError("Hyper3D submission did not return a task identity.");
      record = await this.#ledger.recordProviderIdentity({
        jobId: record.id,
        expectedGeneration: record.generation,
        subscriptionKey,
        taskId,
        requestId: providerIdentityString(submission, ["requestid", "request_id"]),
      });
      await this.#identityStore.put(record.id, sealIdentity(identity), record.updatedAtMs);
      return this.#ledger.transition({
        jobId: record.id,
        expectedGeneration: record.generation,
        state: "generating-geometry",
      });
    } catch (error) {
      try {
        await this.#ledger.transition({
          jobId: record.id,
          expectedGeneration: record.generation,
          state: "failed",
          terminalReason: error instanceof Error ? error.message : "provider-submit-failed",
        });
      } catch {
        // Preserve the provider error if the job was concurrently cancelled.
      }
      throw error;
    }
  }

  async advance(
    userId: string,
    jobId: string,
    providerApiKey?: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<Studio3dGenerationJobRecord> {
    let record = await this.get(userId, jobId);
    if (["ready", "failed", "cancelled", "expired"].includes(record.state)) return record;
    const sealed = await this.#identityStore.get(record.id);
    if (!sealed) throw new ServiceUnavailableException("3D generation provider identity is unavailable.");
    const identity = openIdentity(sealed);
    const provider = this.#provider(providerApiKey);
    const progress = await provider.poll(identity, signal);
    const state = providerState(progress);
    if (/fail|error|reject|violation/iu.test(state)) {
      return this.#ledger.transition({
        jobId: record.id,
        expectedGeneration: record.generation,
        state: "failed",
        terminalReason: state.slice(0, 240),
      });
    }
    if (!/complete|completed|succeed|success|ready|done|finished/iu.test(state)) {
      if (/texture/iu.test(state) && record.state === "generating-geometry") {
        return this.#ledger.transition({
          jobId: record.id,
          expectedGeneration: record.generation,
          state: "generating-texture",
        });
      }
      return record;
    }
    if (record.state === "generating-geometry" || record.state === "generating-texture") {
      record = await this.#ledger.transition({
        jobId: record.id,
        expectedGeneration: record.generation,
        state: "downloading",
      });
    }
    const artifacts = await provider.download(identity, signal);
    const binary = modelBinary(artifacts);
    if (!binary) throw new TypeError("Hyper3D download did not include a model binary.");
    assertGlb(binary.bytes);
    record = await this.#ledger.transition({
      jobId: record.id,
      expectedGeneration: record.generation,
      state: "validating",
    });
    record = await this.#ledger.transition({
      jobId: record.id,
      expectedGeneration: record.generation,
      state: "importing",
    });
    const ready = await this.#ledger.internalizeArtifact({
      jobId: record.id,
      expectedGeneration: record.generation,
      bytes: binary.bytes,
      mimeType: binary.mimeType,
      objectKey: `studio-3d/${record.userId}/${record.id}/${sha256(binary.bytes)}.glb`,
      validationVersion: "glb-v2-header-v1",
      modelId: `model_${sha256(binary.bytes).slice(0, 24)}`,
      actualCredits: record.estimatedCredits,
    });
    if (!ready.artifactRevision) throw new TypeError("ready 3D job has no artifact revision.");
    await this.#artifactStore.putArtifact({
      revision: ready.artifactRevision,
      bytes: new Uint8Array(binary.bytes),
    });
    await this.#identityStore.delete(record.id);
    return ready;
  }

  async cancel(
    userId: string,
    jobId: string,
    providerApiKey?: string,
  ): Promise<Studio3dGenerationJobRecord> {
    let record = await this.get(userId, jobId);
    if (["ready", "failed", "cancelled", "expired"].includes(record.state)) return record;
    const sealed = await this.#identityStore.get(record.id);
    record = await this.#ledger.requestCancellation(record.id);
    if (sealed) {
      const provider = this.#provider(providerApiKey);
      if (provider.cancel) {
        try {
          await provider.cancel(openIdentity(sealed));
        } catch {
          // Cancellation is persisted locally even if the provider cannot acknowledge it.
        }
      }
    }
    const cancelled = await this.#ledger.transition({
      jobId: record.id,
      expectedGeneration: record.generation,
      state: "cancelled",
      terminalReason: "user-cancelled",
    });
    await this.#identityStore.delete(record.id);
    return cancelled;
  }

  async get(userId: string, jobId: string): Promise<Studio3dGenerationJobRecord> {
    const record = await this.#ledger.require(jobId);
    if (record.userId !== userId) throw new Error("3D generation job does not belong to the user.");
    return record;
  }

  async list(userId: string): Promise<readonly Studio3dGenerationJobRecord[]> {
    return this.#ledger.list(userId);
  }

  async artifact(
    userId: string,
    revisionId: string,
  ): Promise<{ readonly revision: Studio3dGenerationArtifactRevision; readonly bytes: Uint8Array }> {
    const stored = await this.#artifactStore.getArtifact(revisionId);
    if (!stored) throw new Error("3D generation artifact was not found.");
    const job = await this.get(userId, stored.revision.sourceJobId);
    if (job.artifactRevision?.id !== revisionId) throw new Error("3D generation artifact ownership mismatch.");
    return stored;
  }
}
