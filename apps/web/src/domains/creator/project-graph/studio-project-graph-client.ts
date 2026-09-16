import { z } from "zod";

import {
  artifactKindSchema,
  blobRoleSchema,
  externalFileProviderSchema,
  externalFileSyncModeSchema,
  isoTimestampSchema,
  revisionKindSchema,
  scopeRefSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "@toonspectrum/studio-project-model";
import { api, isHttpError, toApiError } from "@/infrastructure/api";

const BASE = "/studio-project-graph";
const MAX_IDEMPOTENCY_KEY_LENGTH = 240;

const accessSchema = z.object({
  view: z.boolean(),
  comment: z.boolean(),
  edit: z.boolean(),
  manage: z.boolean(),
  owner: z.boolean(),
  role: z.enum(["owner", "admin", "editor", "commenter", "viewer"]).nullable(),
}).strict();

const artifactRecordSchema = z.object({
  id: studioEntityIdSchema,
  projectId: studioEntityIdSchema,
  kind: artifactKindSchema,
  title: z.string().trim().min(1).max(240),
  scope: scopeRefSchema,
  headRevisionId: studioEntityIdSchema,
  approvedRevisionId: studioEntityIdSchema.nullable(),
  ownerWorkspaceId: studioEntityIdSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();

const projectRecordSchema = z.object({
  id: studioEntityIdSchema,
  workId: studioEntityIdSchema,
  schemaVersion: z.literal(3),
  authorityVersion: z.enum(["legacy-v2", "project-graph-v3"]),
  ownerUserId: studioEntityIdSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  access: accessSchema,
  artifacts: z.array(artifactRecordSchema),
}).strict();

const revisionRecordSchema = z.object({
  id: studioEntityIdSchema,
  artifactId: studioEntityIdSchema,
  kind: revisionKindSchema,
  parentIds: z.array(studioEntityIdSchema).max(16),
  rootGraphHash: sha256Schema,
  operationFirst: z.number().int().positive().nullable(),
  operationLast: z.number().int().positive().nullable(),
  createdBy: studioEntityIdSchema.nullable(),
  deviceId: studioEntityIdSchema,
  createdAt: isoTimestampSchema,
  message: z.string().trim().min(1).max(500).nullable(),
  compatibilityReportId: studioEntityIdSchema.nullable(),
  provenanceManifestId: studioEntityIdSchema.nullable(),
  blobRefs: z.array(z.object({
    sha256: sha256Schema,
    role: blobRoleSchema,
    ordinal: z.number().int().nonnegative(),
  }).strict()),
}).strict();

const revisionCommitResponseSchema = z.object({
  artifactId: studioEntityIdSchema,
  revisionId: studioEntityIdSchema,
  headRevisionId: studioEntityIdSchema,
  approvedRevisionId: studioEntityIdSchema.nullable(),
  sequence: z.number().int().positive(),
  replayed: z.boolean(),
}).strict();

const projectCreateResponseSchema = z.object({
  projectId: studioEntityIdSchema,
  artifactId: studioEntityIdSchema,
  revisionId: studioEntityIdSchema,
  replayed: z.boolean(),
}).strict();

const blobRecordSchema = z.object({
  hash: sha256Schema,
  size: z.number().int().nonnegative(),
  mediaType: z.string().trim().min(1).max(160),
  objectKey: z.string().trim().min(1).max(2_048),
  ready: z.boolean(),
  existing: z.boolean(),
}).strict();

const externalBindingRecordSchema = z.object({
  id: studioEntityIdSchema,
  artifactId: studioEntityIdSchema,
  provider: externalFileProviderSchema,
  providerAccountId: z.string().trim().min(1).max(512).nullable(),
  remoteFileId: z.string().trim().min(1).max(2_048),
  displayPath: z.string().trim().min(1).max(4_096),
  syncMode: externalFileSyncModeSchema,
  remoteVersion: z.string().trim().min(1).max(1_024).nullable(),
  remoteEtag: z.string().trim().min(1).max(1_024).nullable(),
  contentHash: sha256Schema.nullable(),
  lastSyncedRevisionId: studioEntityIdSchema.nullable(),
  lastSyncedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();

export type StudioProjectGraphSnapshot = z.infer<typeof projectRecordSchema>;
export type StudioProjectArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type StudioProjectRevisionRecord = z.infer<typeof revisionRecordSchema>;
export type StudioRevisionCommitResponse = z.infer<typeof revisionCommitResponseSchema>;
export type StudioProjectCreateResponse = z.infer<typeof projectCreateResponseSchema>;
export type StudioProjectBlobRecord = z.infer<typeof blobRecordSchema>;
export type StudioExternalFileBindingRecord = z.infer<typeof externalBindingRecordSchema>;

export interface CreateStudioProjectGraphInput {
  readonly projectId: string;
  readonly workId: string;
  readonly workspaceId: string;
  readonly artifact: {
    readonly id: string;
    readonly kind: z.infer<typeof artifactKindSchema>;
    readonly title: string;
    readonly scope: z.infer<typeof scopeRefSchema>;
  };
  readonly initialRevision: {
    readonly id: string;
    readonly rootGraphHash: string;
    readonly deviceId: string;
    readonly createdAt: string;
    readonly message?: string;
    readonly blobRefs?: readonly StudioBlobCommitRef[];
  };
}

export interface StudioBlobCommitRef {
  readonly sha256: string;
  readonly role: z.infer<typeof blobRoleSchema>;
  readonly ordinal: number;
}

export interface StudioCommandCommitInput {
  readonly id: string;
  readonly type: string;
  readonly scope: z.infer<typeof scopeRefSchema>;
  readonly payloadHash: string;
  readonly issuedAt: string;
  readonly deterministicSeed?: number;
  readonly payload?: unknown;
  readonly patches?: readonly unknown[];
  readonly inversePatches?: readonly unknown[];
  readonly invalidations?: readonly unknown[];
}

export interface CommitStudioProjectRevisionInput {
  readonly revisionId: string;
  readonly kind: z.infer<typeof revisionKindSchema>;
  readonly parentIds: readonly string[];
  readonly rootGraphHash: string;
  readonly operationRange?: { readonly first: number; readonly last: number };
  readonly blobRefs?: readonly StudioBlobCommitRef[];
  readonly deviceId: string;
  readonly createdAt: string;
  readonly message?: string;
  readonly compatibilityReportId?: string;
  readonly provenanceManifestId?: string;
  readonly command: StudioCommandCommitInput;
}

export interface CreateStudioExternalFileBindingInput {
  readonly id: string;
  readonly provider: z.infer<typeof externalFileProviderSchema>;
  readonly providerAccountId?: string;
  readonly remoteFileId: string;
  readonly displayPath: string;
  readonly syncMode: z.infer<typeof externalFileSyncModeSchema>;
}

export interface UpdateStudioExternalFileBindingInput {
  readonly displayPath?: string;
  readonly syncMode?: z.infer<typeof externalFileSyncModeSchema>;
  readonly remoteVersion?: string | null;
  readonly remoteEtag?: string | null;
  readonly contentHash?: string | null;
  readonly lastSyncedRevisionId?: string | null;
  readonly lastSyncedAt?: string | null;
}

export interface RegisterStudioProjectBlobInput {
  readonly hash: string;
  readonly size: number;
  readonly mediaType: string;
  readonly objectKey: string;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
}

export class StudioProjectGraphContractError extends Error {
  constructor(message = "작품 그래프 서버 응답 형식이 올바르지 않습니다.") {
    super(message);
    this.name = "StudioProjectGraphContractError";
  }
}

export class StudioProjectGraphConflictError extends Error {
  constructor(readonly currentRevisionId: string | null) {
    super("다른 기기나 팀원이 먼저 저장했습니다. 최신 버전과 비교해 주세요.");
    this.name = "StudioProjectGraphConflictError";
  }
}

function entityId(value: string, label: string): string {
  const parsed = studioEntityIdSchema.safeParse(value.trim());
  if (!parsed.success) throw new TypeError(`${label}이(가) 올바르지 않습니다.`);
  return parsed.data;
}

function idempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new TypeError("멱등성 키는 8~240자여야 합니다.");
  }
  return key;
}

function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StudioProjectGraphContractError();
  return parsed.data;
}

async function rethrowProjectGraphError(
  error: unknown,
  fallback: string,
): Promise<never> {
  if (isHttpError(error) && error.response.status === 409) {
    const payload = error.data;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const revisionId = (payload as Record<string, unknown>).currentRevisionId;
      const parsed = studioEntityIdSchema.safeParse(revisionId);
      throw new StudioProjectGraphConflictError(
        parsed.success ? parsed.data : null,
      );
    }
    throw new StudioProjectGraphConflictError(null);
  }
  throw await toApiError(error, fallback);
}

function projectPath(projectId: string): string {
  return `${BASE}/projects/${encodeURIComponent(entityId(projectId, "프로젝트 ID"))}`;
}

function artifactPath(artifactId: string): string {
  return `${BASE}/artifacts/${encodeURIComponent(entityId(artifactId, "산출물 ID"))}`;
}

export async function loadStudioProjectGraph(
  projectId: string,
  signal?: AbortSignal,
): Promise<StudioProjectGraphSnapshot> {
  try {
    const value = await api.get<unknown>(projectPath(projectId), { signal });
    return parseResponse(projectRecordSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "작품 그래프를 불러오지 못했습니다.");
  }
}

export async function loadStudioProjectGraphByWork(
  workIdValue: string,
  signal?: AbortSignal,
): Promise<StudioProjectGraphSnapshot> {
  const workId = entityId(workIdValue, "작품 ID");
  try {
    const value = await api.get<unknown>(
      `${BASE}/works/${encodeURIComponent(workId)}/project`,
      { signal },
    );
    return parseResponse(projectRecordSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "작품 그래프를 불러오지 못했습니다.");
  }
}

export async function createStudioProjectGraph(
  input: CreateStudioProjectGraphInput,
  mutationId: string,
  signal?: AbortSignal,
): Promise<StudioProjectCreateResponse> {
  try {
    const value = await api.post<unknown>(`${BASE}/projects`, input, {
      signal,
      headers: { "Idempotency-Key": idempotencyKey(mutationId) },
    });
    return parseResponse(projectCreateResponseSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "작품 그래프를 만들지 못했습니다.");
  }
}

export async function listStudioProjectRevisions(
  artifactId: string,
  signal?: AbortSignal,
): Promise<readonly StudioProjectRevisionRecord[]> {
  try {
    const value = await api.get<unknown>(`${artifactPath(artifactId)}/revisions`, {
      signal,
    });
    return parseResponse(z.array(revisionRecordSchema), value);
  } catch (error) {
    return rethrowProjectGraphError(error, "버전 이력을 불러오지 못했습니다.");
  }
}

export async function registerStudioProjectBlob(
  projectId: string,
  input: RegisterStudioProjectBlobInput,
  signal?: AbortSignal,
): Promise<StudioProjectBlobRecord> {
  try {
    const value = await api.post<unknown>(
      `${projectPath(projectId)}/blobs`,
      input,
      { signal },
    );
    return parseResponse(blobRecordSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "파일 조각을 등록하지 못했습니다.");
  }
}

export async function commitStudioProjectRevision(
  artifactId: string,
  expectedHeadRevisionId: string,
  mutationId: string,
  input: CommitStudioProjectRevisionInput,
  signal?: AbortSignal,
): Promise<StudioRevisionCommitResponse> {
  const expectedHead = entityId(expectedHeadRevisionId, "기준 버전 ID");
  try {
    const value = await api.post<unknown>(`${artifactPath(artifactId)}/revisions`, input, {
      signal,
      headers: {
        "If-Match": `"${expectedHead}"`,
        "Idempotency-Key": idempotencyKey(mutationId),
      },
    });
    return parseResponse(revisionCommitResponseSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "새 버전을 저장하지 못했습니다.");
  }
}

export async function listStudioExternalFileBindings(
  artifactId: string,
  signal?: AbortSignal,
): Promise<readonly StudioExternalFileBindingRecord[]> {
  try {
    const value = await api.get<unknown>(
      `${artifactPath(artifactId)}/external-bindings`,
      { signal },
    );
    return parseResponse(z.array(externalBindingRecordSchema), value);
  } catch (error) {
    return rethrowProjectGraphError(error, "연결된 파일 목록을 불러오지 못했습니다.");
  }
}

export async function createStudioExternalFileBinding(
  artifactId: string,
  input: CreateStudioExternalFileBindingInput,
  signal?: AbortSignal,
): Promise<StudioExternalFileBindingRecord> {
  try {
    const value = await api.post<unknown>(
      `${artifactPath(artifactId)}/external-bindings`,
      input,
      { signal },
    );
    return parseResponse(externalBindingRecordSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "외부 파일을 연결하지 못했습니다.");
  }
}

function externalBindingPath(bindingId: string): string {
  const id = entityId(bindingId, "외부 파일 연결 ID");
  return `${BASE}/external-bindings/${encodeURIComponent(id)}`;
}

export async function updateStudioExternalFileBinding(
  bindingId: string,
  input: UpdateStudioExternalFileBindingInput,
  signal?: AbortSignal,
): Promise<StudioExternalFileBindingRecord> {
  try {
    const value = await api.patch<unknown>(externalBindingPath(bindingId), input, {
      signal,
    });
    return parseResponse(externalBindingRecordSchema, value);
  } catch (error) {
    return rethrowProjectGraphError(error, "외부 파일 동기화 상태를 갱신하지 못했습니다.");
  }
}

export async function removeStudioExternalFileBinding(
  bindingId: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await api.delete(externalBindingPath(bindingId), { signal });
  } catch (error) {
    return rethrowProjectGraphError(error, "외부 파일 연결을 해제하지 못했습니다.");
  }
}

export const studioProjectGraphClientTestHelpers = {
  artifactRecordSchema,
  blobRecordSchema,
  externalBindingRecordSchema,
  projectCreateResponseSchema,
  projectRecordSchema,
  revisionCommitResponseSchema,
  revisionRecordSchema,
};
