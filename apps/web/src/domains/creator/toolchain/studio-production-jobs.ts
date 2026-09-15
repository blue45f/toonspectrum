import { z } from "zod";

import {
  studioProductionOperation,
  studioProductionTool,
  studioToolchainProfileIdSchema,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";

export const STUDIO_PRODUCTION_JOB_LIMITS = Object.freeze({
  retainedJobs: 128,
  optionBytes: 64 * 1024,
  inputCount: 16,
  outputCount: 32,
  fileBytes: 2 * 1024 * 1024 * 1024,
});

export const studioProductionJobStatusSchema = z.enum([
  "draft",
  "preparing",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type StudioProductionJobStatus = z.infer<typeof studioProductionJobStatusSchema>;

const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const isoTimeSchema = z.string().datetime({ offset: true });

const inputSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/u),
  name: z.string().min(1).max(240),
  mime: z.string().min(1).max(160),
  bytes: z.number().int().nonnegative().max(STUDIO_PRODUCTION_JOB_LIMITS.fileBytes),
  sha256: sha256Schema.nullable(),
  uploaded: z.boolean(),
}).strict();
export type StudioProductionJobInput = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/u),
  name: z.string().min(1).max(240),
  mime: z.string().min(1).max(160),
  bytes: z.number().int().nonnegative().max(STUDIO_PRODUCTION_JOB_LIMITS.fileBytes),
  sha256: sha256Schema,
  href: z.string().min(1).max(1_000),
}).strict();
export type StudioProductionJobOutput = z.infer<typeof outputSchema>;

const progressSchema = z.object({
  value: z.number().min(0).max(1),
  phase: z.string().max(160),
}).strict();

const failureSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{2,80}$/u),
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
}).strict();

const receiptSchema = z.object({
  toolId: z.string().min(1),
  toolVersion: z.string().min(1).max(160),
  operationId: z.string().min(1),
  license: z.string().min(1).max(160),
  source: z.string().url(),
  commandDigest: sha256Schema,
  inputDigests: z.array(sha256Schema).max(STUDIO_PRODUCTION_JOB_LIMITS.inputCount),
  outputDigests: z.array(sha256Schema).max(STUDIO_PRODUCTION_JOB_LIMITS.outputCount),
  startedAt: isoTimeSchema,
  finishedAt: isoTimeSchema,
}).strict();
export type StudioProductionJobReceipt = z.infer<typeof receiptSchema>;

export const studioProductionJobSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u),
  remoteId: z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u).nullable(),
  projectId: z.string().max(160).nullable(),
  profile: studioToolchainProfileIdSchema,
  toolId: z.string().min(1).max(80),
  operationId: z.string().min(1).max(80),
  status: studioProductionJobStatusSchema,
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
  progress: progressSchema,
  inputs: z.array(inputSchema).max(STUDIO_PRODUCTION_JOB_LIMITS.inputCount),
  outputs: z.array(outputSchema).max(STUDIO_PRODUCTION_JOB_LIMITS.outputCount),
  options: z.record(z.string(), z.unknown()),
  failure: failureSchema.nullable(),
  receipt: receiptSchema.nullable(),
}).strict();
export type StudioProductionJob = z.infer<typeof studioProductionJobSchema>;

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function randomJobId(): string {
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  if (uuid) return `job_${uuid}`;
  const random = Math.random().toString(36).slice(2);
  return `job_${Date.now().toString(36)}_${random}`;
}

function assertJsonSafe(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 12) throw new Error("작업 옵션의 중첩이 너무 깊습니다.");
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("작업 옵션 숫자는 유한해야 합니다.");
    return;
  }
  if (typeof value !== "object") throw new Error("작업 옵션은 JSON 값이어야 합니다.");
  if (seen.has(value as object)) throw new Error("작업 옵션에 순환 참조가 있습니다.");
  seen.add(value as object);
  if (Array.isArray(value)) {
    if (value.length > 256) throw new Error("작업 옵션 배열이 너무 큽니다.");
    value.forEach((entry) => assertJsonSafe(entry, depth + 1, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("작업 옵션은 일반 JSON 객체여야 합니다.");
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new Error("작업 옵션에 허용되지 않는 키가 있습니다.");
      }
      assertJsonSafe(entry, depth + 1, seen);
    }
  }
  seen.delete(value as object);
}

export function validateStudioProductionJobOptions(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("작업 옵션은 객체여야 합니다.");
  }
  assertJsonSafe(value);
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > STUDIO_PRODUCTION_JOB_LIMITS.optionBytes) {
    throw new Error("작업 옵션이 허용 크기를 넘었습니다.");
  }
  return Object.freeze(JSON.parse(serialized) as Record<string, unknown>);
}

export function createStudioProductionJob(input: {
  readonly projectId?: string | null;
  readonly profile: StudioToolchainProfileId;
  readonly toolId: string;
  readonly operationId: string;
  readonly inputs?: readonly StudioProductionJobInput[];
  readonly options?: Readonly<Record<string, unknown>>;
  readonly id?: string;
  readonly now?: () => Date;
}): StudioProductionJob {
  const tool = studioProductionTool(input.toolId);
  const operation = studioProductionOperation(input.toolId, input.operationId);
  if (!tool || !operation) throw new Error("알 수 없는 제작 도구 또는 작업입니다.");
  const now = input.now ?? (() => new Date());
  const timestamp = nowIso(now);
  return studioProductionJobSchema.parse({
    schemaVersion: 1,
    id: input.id ?? randomJobId(),
    remoteId: null,
    projectId: input.projectId?.trim() || null,
    profile: input.profile,
    toolId: tool.id,
    operationId: operation.id,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    progress: { value: 0, phase: "준비 전" },
    inputs: input.inputs ?? [],
    outputs: [],
    options: validateStudioProductionJobOptions(input.options ?? {}),
    failure: null,
    receipt: null,
  });
}

const allowedTransitions: Readonly<Record<StudioProductionJobStatus, readonly StudioProductionJobStatus[]>> = {
  draft: ["preparing", "cancelled"],
  preparing: ["queued", "failed", "cancelled"],
  queued: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["queued", "cancelled"],
  cancelled: ["queued"],
};

export function transitionStudioProductionJob(
  jobInput: StudioProductionJob,
  status: StudioProductionJobStatus,
  options: {
    readonly now?: () => Date;
    readonly phase?: string;
    readonly remoteId?: string | null;
    readonly failure?: StudioProductionJob["failure"];
    readonly outputs?: readonly StudioProductionJobOutput[];
    readonly receipt?: StudioProductionJobReceipt | null;
  } = {},
): StudioProductionJob {
  const job = studioProductionJobSchema.parse(jobInput);
  if (!allowedTransitions[job.status].includes(status)) {
    throw new Error(`작업 상태를 ${job.status}에서 ${status}(으)로 바꿀 수 없습니다.`);
  }
  const terminal = status === "completed" || status === "failed" || status === "cancelled";
  return studioProductionJobSchema.parse({
    ...job,
    status,
    remoteId: options.remoteId === undefined ? job.remoteId : options.remoteId,
    updatedAt: nowIso(options.now ?? (() => new Date())),
    progress: {
      value: status === "completed" ? 1 : job.progress.value,
      phase: options.phase ?? (terminal ? status : job.progress.phase),
    },
    outputs: options.outputs ?? job.outputs,
    failure: status === "failed" ? options.failure ?? {
      code: "UNKNOWN_FAILURE",
      message: "작업이 실패했습니다.",
      retryable: false,
    } : null,
    receipt: status === "completed" ? options.receipt ?? job.receipt : null,
  });
}

export function updateStudioProductionJobProgress(
  jobInput: StudioProductionJob,
  value: number,
  phase: string,
  now: () => Date = () => new Date(),
): StudioProductionJob {
  const job = studioProductionJobSchema.parse(jobInput);
  if (job.status !== "running" && job.status !== "queued" && job.status !== "preparing") {
    throw new Error("진행 중인 작업만 진행률을 갱신할 수 있습니다.");
  }
  if (!Number.isFinite(value) || value < job.progress.value || value < 0 || value > 1) {
    throw new Error("진행률은 0~1의 비감소 값이어야 합니다.");
  }
  return studioProductionJobSchema.parse({
    ...job,
    updatedAt: nowIso(now),
    progress: { value, phase: phase.slice(0, 160) },
  });
}

export function mergeStudioProductionJobSnapshot(
  localInput: StudioProductionJob,
  remoteInput: StudioProductionJob,
): StudioProductionJob {
  const local = studioProductionJobSchema.parse(localInput);
  const remote = studioProductionJobSchema.parse(remoteInput);
  if (local.id !== remote.id) throw new Error("서로 다른 작업을 합칠 수 없습니다.");
  if (remote.progress.value < local.progress.value && remote.status === local.status) return local;
  return Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local;
}

export function retainStudioProductionJobs(
  jobs: readonly StudioProductionJob[],
): readonly StudioProductionJob[] {
  const unique = new Map<string, StudioProductionJob>();
  for (const input of jobs) {
    const job = studioProductionJobSchema.parse(input);
    const previous = unique.get(job.id);
    unique.set(job.id, previous ? mergeStudioProductionJobSnapshot(previous, job) : job);
  }
  return Object.freeze([...unique.values()]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, STUDIO_PRODUCTION_JOB_LIMITS.retainedJobs));
}
