import {
  normalizeCreatorRoleWorkspacePreference,
  type CreatorRoleCapacity,
  type CreatorRoleWorkspacePreference,
  type CreatorRoleWorkspaceSnapshot,
  type PublicCreatorRoleCandidate,
} from "@/shared/lib/creator-role-workspace-contract";
import {
  normalizePublicCreatorRoleProfile,
  type CreatorCollaborationStatus,
  type CreatorRoleId,
  type CreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";
import { api, isHttpError, toApiError } from "@/infrastructure/api";

interface WorkspaceEnvelope {
  readonly projectKey?: unknown;
  readonly revision?: unknown;
  readonly document?: unknown;
  readonly updatedAt?: unknown;
}

interface PublicRoleCandidateEnvelope {
  readonly userId?: unknown;
  readonly name?: unknown;
  readonly roleProfile?: unknown;
  readonly capacity?: unknown;
  readonly customRoleLabel?: unknown;
}

export interface CreatorRoleDirectoryQuery {
  readonly role?: CreatorRoleId | null;
  readonly specialty?: CreatorSpecialtyId | null;
  readonly collaborationStatus?: CreatorCollaborationStatus | null;
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreatorRoleDirectoryResult {
  readonly items: readonly PublicCreatorRoleCandidate[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class CreatorRoleWorkspaceConflictError extends Error {
  constructor(
    readonly latest: CreatorRoleWorkspaceSnapshot,
  ) {
    super("다른 화면에서 직무 작업 설정이 먼저 변경되었습니다.");
    this.name = "CreatorRoleWorkspaceConflictError";
  }
}

function normalizeCapacity(value: unknown): CreatorRoleCapacity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return normalizeCreatorRoleWorkspacePreference({ capacity: value }).capacity;
}

function normalizeSnapshot(
  envelope: WorkspaceEnvelope,
  fallbackKey: string,
  source: CreatorRoleWorkspaceSnapshot["source"] = "server",
): CreatorRoleWorkspaceSnapshot {
  const revision = typeof envelope.revision === "number"
    && Number.isSafeInteger(envelope.revision)
    && envelope.revision >= 0
    ? envelope.revision
    : 0;
  return {
    projectKey: typeof envelope.projectKey === "string"
      ? envelope.projectKey
      : fallbackKey,
    revision,
    document: normalizeCreatorRoleWorkspacePreference(envelope.document),
    updatedAt: typeof envelope.updatedAt === "string"
      && Number.isFinite(Date.parse(envelope.updatedAt))
      ? new Date(envelope.updatedAt).toISOString()
      : null,
    source,
  };
}

function normalizeCandidate(
  value: PublicRoleCandidateEnvelope,
): PublicCreatorRoleCandidate | null {
  if (typeof value.userId !== "string" || !value.userId) return null;
  const roleProfile = normalizePublicCreatorRoleProfile(value.roleProfile);
  if (!roleProfile) return null;
  return {
    userId: value.userId,
    name: typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : "익명 창작자",
    roleProfile,
    capacity: normalizeCapacity(value.capacity),
    customRoleLabel: typeof value.customRoleLabel === "string"
      ? value.customRoleLabel.trim().slice(0, 48) || null
      : null,
  };
}

function conflictFrom(
  error: unknown,
  projectKey: string,
): CreatorRoleWorkspaceConflictError | null {
  if (!isHttpError(error) || error.response.status !== 409) return null;
  const payload = error.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const latest = (payload as Record<string, unknown>).latest;
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) return null;
  return new CreatorRoleWorkspaceConflictError(
    normalizeSnapshot(latest as WorkspaceEnvelope, projectKey),
  );
}

export async function getCreatorRoleWorkspace(
  projectKey: string,
  signal?: AbortSignal,
): Promise<CreatorRoleWorkspaceSnapshot> {
  try {
    const data = await api.get<WorkspaceEnvelope>(
      `/creator/role-workspaces/${encodeURIComponent(projectKey)}`,
      { signal },
    );
    return normalizeSnapshot(data, projectKey);
  } catch (error) {
    throw await toApiError(error, "직무별 작업 설정을 불러오지 못했어요.");
  }
}

export async function saveCreatorRoleWorkspace(
  projectKey: string,
  baseRevision: number,
  document: CreatorRoleWorkspacePreference,
): Promise<CreatorRoleWorkspaceSnapshot> {
  try {
    const data = await api.put<WorkspaceEnvelope>(
      `/creator/role-workspaces/${encodeURIComponent(projectKey)}`,
      {
        baseRevision,
        document: normalizeCreatorRoleWorkspacePreference(document),
      },
    );
    return normalizeSnapshot(data, projectKey);
  } catch (error) {
    const conflict = conflictFrom(error, projectKey);
    if (conflict) throw conflict;
    throw await toApiError(error, "직무별 작업 설정을 저장하지 못했어요.");
  }
}

export async function batchPublicCreatorRoleProfiles(
  userIds: readonly string[],
  signal?: AbortSignal,
): Promise<readonly PublicCreatorRoleCandidate[]> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return [];
  try {
    const data = await api.post<{ items?: PublicRoleCandidateEnvelope[] }>(
      "/creator/role-profiles/batch",
      { userIds: ids },
      { signal },
    );
    return (data.items ?? [])
      .map(normalizeCandidate)
      .filter((candidate): candidate is PublicCreatorRoleCandidate => candidate !== null);
  } catch (error) {
    throw await toApiError(error, "팀원의 공개 직무 정보를 불러오지 못했어요.");
  }
}

export async function searchPublicCreatorRoles(
  query: CreatorRoleDirectoryQuery,
  signal?: AbortSignal,
): Promise<CreatorRoleDirectoryResult> {
  const params = new URLSearchParams();
  if (query.role) params.set("role", query.role);
  if (query.specialty) params.set("specialty", query.specialty);
  if (query.collaborationStatus) {
    params.set("collaborationStatus", query.collaborationStatus);
  }
  if (query.q?.trim()) params.set("q", query.q.trim().slice(0, 80));
  params.set("limit", String(Math.max(1, Math.min(50, query.limit ?? 12))));
  params.set("offset", String(Math.max(0, query.offset ?? 0)));
  try {
    const data = await api.get<{
      items?: PublicRoleCandidateEnvelope[];
      total?: unknown;
      limit?: unknown;
      offset?: unknown;
    }>(`/creator/role-directory?${params.toString()}`, { signal });
    return {
      items: (data.items ?? [])
        .map(normalizeCandidate)
        .filter((candidate): candidate is PublicCreatorRoleCandidate => candidate !== null),
      total: typeof data.total === "number" ? data.total : 0,
      limit: typeof data.limit === "number" ? data.limit : Number(params.get("limit")),
      offset: typeof data.offset === "number" ? data.offset : Number(params.get("offset")),
    };
  } catch (error) {
    throw await toApiError(error, "협업 가능한 창작자를 찾지 못했어요.");
  }
}
