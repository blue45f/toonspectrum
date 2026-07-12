import { api, toApiError } from "@/src/infrastructure/api";

export const STUDIO_TEAM_ROLES = ["owner", "admin", "editor", "commenter", "viewer"] as const;
export const STUDIO_TEAM_ASSIGNABLE_ROLES = ["admin", "editor", "commenter", "viewer"] as const;
export const STUDIO_TEAM_STATUSES = ["active", "pending", "declined"] as const;

export type StudioTeamRole = (typeof STUDIO_TEAM_ROLES)[number];
export type StudioTeamAssignableRole = (typeof STUDIO_TEAM_ASSIGNABLE_ROLES)[number];
export type StudioTeamStatus = (typeof STUDIO_TEAM_STATUSES)[number];

export interface StudioTeamCapabilities {
  view: boolean;
  comment: boolean;
  edit: boolean;
  manageMembers: boolean;
  respondInvite: boolean;
}

export interface StudioTeamViewer {
  userId: string;
  role: StudioTeamRole;
  status: StudioTeamStatus;
  capabilities: StudioTeamCapabilities;
  invitationId?: string;
}

export interface StudioTeamMember {
  userId: string;
  name: string;
  image: string;
  role: StudioTeamRole;
  status: StudioTeamStatus;
  isOwner: boolean;
  invitationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudioTeamSnapshot {
  workId: string;
  viewer: StudioTeamViewer;
  members: StudioTeamMember[];
}

export interface InviteStudioTeamMemberInput {
  userId: string;
  role: StudioTeamAssignableRole;
}

export type StudioTeamInvitationAction = "accept" | "decline";

const TEAM_BASE = "/creator/works";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isTeamRole(value: unknown): value is StudioTeamRole {
  return typeof value === "string" && (STUDIO_TEAM_ROLES as readonly string[]).includes(value);
}

function isTeamStatus(value: unknown): value is StudioTeamStatus {
  return typeof value === "string" && (STUDIO_TEAM_STATUSES as readonly string[]).includes(value);
}

function normalizeCapabilities(value: unknown): StudioTeamCapabilities {
  if (!isRecord(value)) {
    return { view: false, comment: false, edit: false, manageMembers: false, respondInvite: false };
  }
  return {
    view: value.view === true,
    comment: value.comment === true,
    edit: value.edit === true,
    manageMembers: value.manageMembers === true,
    respondInvite: value.respondInvite === true,
  };
}

function noStudioTeamCapabilities(): StudioTeamCapabilities {
  return { view: false, comment: false, edit: false, manageMembers: false, respondInvite: false };
}

function normalizeViewer(value: unknown): StudioTeamViewer {
  if (!isRecord(value) || typeof value.userId !== "string" || !value.userId.trim()) {
    throw new Error("팀 작업 공간의 사용자 권한 정보를 확인하지 못했습니다.");
  }

  const normalizedRole = isTeamRole(value.role) ? value.role : null;
  const normalizedStatus = isTeamStatus(value.status) ? value.status : null;
  const validRole = normalizedRole !== null;
  const validStatus = normalizedStatus !== null;
  const role: StudioTeamRole = normalizedRole ?? "viewer";
  const status: StudioTeamStatus = normalizedStatus ?? "declined";
  const receivedCapabilities = normalizeCapabilities(value.capabilities);
  let capabilities = noStudioTeamCapabilities();
  if (validRole && validStatus && status === "pending") {
    capabilities = { ...capabilities, respondInvite: receivedCapabilities.respondInvite };
  } else if (validRole && validStatus && status === "active") {
    capabilities = {
      ...receivedCapabilities,
      manageMembers:
        (role === "owner" || role === "admin") && receivedCapabilities.manageMembers,
      respondInvite: false,
    };
  }

  const viewer: StudioTeamViewer = {
    userId: value.userId,
    // 알 수 없는 서버 값은 절대 높은 권한으로 올리지 않는다.
    role,
    status,
    capabilities,
  };
  const invitationId = normalizeInvitationId(value.invitationId);
  if (status === "pending" && capabilities.respondInvite && invitationId) {
    viewer.invitationId = invitationId;
  }
  return viewer;
}

function normalizeInvitationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : undefined;
}

function optionalDate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeMember(value: unknown): StudioTeamMember | null {
  if (!isRecord(value) || typeof value.userId !== "string" || !value.userId.trim()) return null;

  const isOwner = value.isOwner === true || value.role === "owner";
  const member: StudioTeamMember = {
    userId: value.userId,
    name: typeof value.name === "string" && value.name.trim() ? value.name : value.userId,
    image: typeof value.image === "string" ? value.image : "",
    role: isOwner ? "owner" : isTeamRole(value.role) ? value.role : "viewer",
    status: isOwner ? "active" : isTeamStatus(value.status) ? value.status : "declined",
    isOwner,
  };
  const invitationId = normalizeInvitationId(value.invitationId);
  if (!isOwner && member.status === "pending" && invitationId) member.invitationId = invitationId;
  const createdAt = optionalDate(value.createdAt);
  const updatedAt = optionalDate(value.updatedAt);
  if (createdAt) member.createdAt = createdAt;
  if (updatedAt) member.updatedAt = updatedAt;
  return member;
}

/** 서버가 확장 필드를 추가해도 필요한 계약만 안전하게 추려 UI에 전달한다. */
export function normalizeStudioTeamSnapshot(
  value: unknown,
  expectedWorkId: string
): StudioTeamSnapshot {
  if (!isRecord(value)) throw new Error("팀 작업 공간 응답 형식이 올바르지 않습니다.");
  if (value.workId !== expectedWorkId) {
    throw new Error("다른 작품의 팀 권한 응답을 받았습니다. 다시 시도해 주세요.");
  }

  const membersByUserId = new Map<string, StudioTeamMember>();
  if (Array.isArray(value.members)) {
    for (const candidate of value.members) {
      const member = normalizeMember(candidate);
      if (member && !membersByUserId.has(member.userId)) membersByUserId.set(member.userId, member);
    }
  }

  return {
    workId: expectedWorkId,
    viewer: normalizeViewer(value.viewer),
    members: [...membersByUserId.values()],
  };
}

function teamPath(workId: string): string {
  return `${TEAM_BASE}/${encodeURIComponent(workId)}/team`;
}

async function requestSnapshot(
  workId: string,
  run: () => Promise<unknown>,
  fallback: string
): Promise<StudioTeamSnapshot> {
  let payload: unknown;
  try {
    payload = await run();
  } catch (error) {
    throw await toApiError(error, fallback);
  }
  if (payload == null) throw new Error(fallback);
  return normalizeStudioTeamSnapshot(payload, workId);
}

export function getStudioTeam(workId: string, signal?: AbortSignal): Promise<StudioTeamSnapshot> {
  return requestSnapshot(
    workId,
    () => api.get<unknown>(teamPath(workId), { signal }),
    "팀 작업 공간을 불러오지 못했습니다."
  );
}

export function inviteStudioTeamMember(
  workId: string,
  input: InviteStudioTeamMemberInput
): Promise<StudioTeamSnapshot> {
  return requestSnapshot(
    workId,
    () => api.post<unknown>(teamPath(workId), input),
    "팀원을 초대하지 못했습니다."
  );
}

export function updateStudioTeamMemberRole(
  workId: string,
  userId: string,
  role: StudioTeamAssignableRole
): Promise<StudioTeamSnapshot> {
  return requestSnapshot(
    workId,
    () => api.patch<unknown>(`${teamPath(workId)}/members/${encodeURIComponent(userId)}`, { role }),
    "팀원 역할을 변경하지 못했습니다."
  );
}

export function removeStudioTeamMember(
  workId: string,
  userId: string
): Promise<StudioTeamSnapshot> {
  return requestSnapshot(
    workId,
    () => api.delete<unknown>(`${teamPath(workId)}/members/${encodeURIComponent(userId)}`),
    "팀원을 내보내지 못했습니다."
  );
}

export function respondToStudioTeamInvitation(
  workId: string,
  action: StudioTeamInvitationAction,
  invitationId: string
): Promise<StudioTeamSnapshot> {
  return requestSnapshot(
    workId,
    () => api.post<unknown>(`${teamPath(workId)}/invitations/respond`, { action, invitationId }),
    action === "accept" ? "초대를 수락하지 못했습니다." : "초대를 거절하지 못했습니다."
  );
}
