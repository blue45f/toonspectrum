import { z } from "zod";

import { api, isAppApiError } from "@/platform/api";

/**
 * CT-1: 원고 버전 스냅샷·공유 링크 서버 정본 API 클라이언트.
 *
 * 서버 계약은 apps/api의 manuscript-version-share 컨트롤러가 정본이다.
 * 스냅샷은 revision 참조만 들고 있고, 공유 링크 응답에는 원문 토큰이 없다
 * (서버는 해시만 저장한다 — 목록에서는 tokenSuffix 표시만 가능하다).
 */

const BASE = "/studio-project-graph";

const serverManuscriptSnapshotSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  name: z.string().min(1),
  memo: z.string(),
  revisionId: z.string().min(1),
  rootGraphHash: z.string().min(1),
  revisionKind: z.string().min(1),
  revisionMessage: z.string().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
});
export type ServerManuscriptSnapshot = z.infer<typeof serverManuscriptSnapshotSchema>;

const serverVersionShareLinkSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  snapshotId: z.string().min(1),
  snapshotName: z.string(),
  tokenSuffix: z.string(),
  permission: z.enum(["view", "comment", "edit"]),
  watermark: z.boolean(),
  hasPassword: z.boolean(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ServerVersionShareLink = z.infer<typeof serverVersionShareLinkSchema>;

export interface CreateServerManuscriptSnapshotInput {
  readonly id?: string;
  readonly name?: string;
  readonly memo?: string;
  readonly revisionId: string;
  readonly createdAt?: string;
}

export interface CreateServerVersionShareInput {
  readonly id?: string;
  readonly snapshotId: string;
  readonly token: string;
  readonly permission: "view" | "comment" | "edit";
  readonly expiresInDays: number | null;
  readonly watermark: boolean;
  readonly password?: string;
}

function artifactPath(artifactId: string): string {
  return `${BASE}/artifacts/${encodeURIComponent(artifactId)}`;
}

export async function fetchServerManuscriptSnapshots(
  artifactId: string,
  signal?: AbortSignal,
): Promise<ServerManuscriptSnapshot[]> {
  const body = await api.get<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots`,
    signal ? { signal } : undefined,
  );
  return z.array(serverManuscriptSnapshotSchema).parse(body);
}

export async function createServerManuscriptSnapshot(
  artifactId: string,
  input: CreateServerManuscriptSnapshotInput,
): Promise<ServerManuscriptSnapshot> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots`,
    input,
  );
  return serverManuscriptSnapshotSchema.parse(body);
}

export async function updateServerManuscriptSnapshotMemo(
  artifactId: string,
  snapshotId: string,
  memo: string,
): Promise<ServerManuscriptSnapshot> {
  const body = await api.patch<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots/${encodeURIComponent(snapshotId)}`,
    { memo },
  );
  return serverManuscriptSnapshotSchema.parse(body);
}

export async function fetchServerVersionShares(
  artifactId: string,
  signal?: AbortSignal,
): Promise<ServerVersionShareLink[]> {
  const body = await api.get<unknown>(
    `${artifactPath(artifactId)}/version-shares`,
    signal ? { signal } : undefined,
  );
  return z.array(serverVersionShareLinkSchema).parse(body);
}

export async function createServerVersionShare(
  artifactId: string,
  input: CreateServerVersionShareInput,
): Promise<ServerVersionShareLink> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/version-shares`,
    input,
  );
  return serverVersionShareLinkSchema.parse(body);
}

export async function revokeServerVersionShare(
  artifactId: string,
  linkId: string,
): Promise<ServerVersionShareLink> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/version-shares/${encodeURIComponent(linkId)}/revoke`,
    {},
  );
  return serverVersionShareLinkSchema.parse(body);
}

const resolvedVersionShareSchema = z.object({
  kind: z.literal("ok"),
  permission: z.enum(["view", "comment", "edit"]),
  watermark: z.boolean(),
  workId: z.string().min(1),
  projectId: z.string().min(1),
  artifactId: z.string().min(1),
  artifactTitle: z.string(),
  workTitle: z.string(),
  snapshot: serverManuscriptSnapshotSchema,
  revision: z.object({
    id: z.string().min(1),
    artifactId: z.string().min(1),
    kind: z.string().min(1),
    parentIds: z.array(z.string()),
    rootGraphHash: z.string().min(1),
    operationFirst: z.number().nullable(),
    operationLast: z.number().nullable(),
    createdBy: z.string().nullable(),
    deviceId: z.string(),
    createdAt: z.string().min(1),
    message: z.string().nullable(),
  }),
});
export type ResolvedVersionShare = z.infer<typeof resolvedVersionShareSchema>;

export type VersionShareResolution =
  | { readonly status: "ok"; readonly share: ResolvedVersionShare }
  | { readonly status: "not_found" }
  | { readonly status: "revoked" }
  | { readonly status: "expired" }
  | { readonly status: "password_required" }
  | { readonly status: "password_invalid" }
  | { readonly status: "login_required" };

const RESOLUTION_CODE_MAP: Readonly<Record<string, VersionShareResolution["status"]>> = {
  version_share_not_found: "not_found",
  version_share_revoked: "revoked",
  version_share_expired: "expired",
  version_share_password_required: "password_required",
  version_share_password_invalid: "password_invalid",
};

/**
 * 공유 링크 해석. 알려진 상태 코드는 throw하지 않고 판정값으로 돌려주고,
 * 네트워크 오류 같은 진짜 실패만 throw한다(페이지에서 재시도 안내).
 * 비밀번호는 쿼리가 아니라 헤더로 보낸다.
 */
export async function resolveVersionShare(
  token: string,
  password?: string,
  signal?: AbortSignal,
): Promise<VersionShareResolution> {
  try {
    const body = await api.get<unknown>(
      `${BASE}/version-shares/${encodeURIComponent(token)}`,
      {
        ...(signal ? { signal } : {}),
        ...(password
          ? { headers: { "x-version-share-password": password } }
          : {}),
      },
    );
    return { status: "ok", share: resolvedVersionShareSchema.parse(body) };
  } catch (error) {
    if (isAppApiError(error)) {
      if (error.status === 403) return { status: "login_required" };
      const mapped = error.code ? RESOLUTION_CODE_MAP[error.code] : undefined;
      if (mapped && mapped !== "ok") return { status: mapped };
    }
    throw error;
  }
}
