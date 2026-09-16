import type {
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeVisibility,
} from "./types";

export const COMMUNITY_CAFE_KINDS = [
  "creator",
  "work",
  "genre",
  "project",
  "study",
  "social",
] as const satisfies readonly CommunityCafeKind[];

export const COMMUNITY_CAFE_VISIBILITIES = [
  "public",
  "private",
] as const satisfies readonly CommunityCafeVisibility[];

export const COMMUNITY_CAFE_JOIN_POLICIES = [
  "open",
  "approval",
  "invite",
] as const satisfies readonly CommunityCafeJoinPolicy[];

export const COMMUNITY_CAFE_POSTING_POLICIES = [
  "members",
  "staff",
] as const satisfies readonly CommunityCafePostingPolicy[];

export const COMMUNITY_CAFE_ROLES = [
  "owner",
  "admin",
  "moderator",
  "member",
] as const satisfies readonly CommunityCafeRole[];

export const COMMUNITY_CAFE_KIND_LABELS: Record<CommunityCafeKind, string> = {
  creator: "창작자 팬 커뮤니티",
  work: "작품 팬 커뮤니티",
  genre: "장르·관심사",
  project: "공동창작·프로젝트",
  study: "정보 공유·스터디",
  social: "자유 친목",
};

export const COMMUNITY_CAFE_VISIBILITY_LABELS: Record<CommunityCafeVisibility, string> = {
  public: "공개",
  private: "비공개",
};

export const COMMUNITY_CAFE_JOIN_POLICY_LABELS: Record<CommunityCafeJoinPolicy, string> = {
  open: "바로 가입",
  approval: "가입 승인",
  invite: "초대 전용",
};

export const COMMUNITY_CAFE_POSTING_POLICY_LABELS: Record<CommunityCafePostingPolicy, string> = {
  members: "회원 작성",
  staff: "운영진만 작성",
};

export const COMMUNITY_CAFE_ROLE_LABELS: Record<CommunityCafeRole, string> = {
  owner: "소유자",
  admin: "관리자",
  moderator: "운영자",
  member: "회원",
};

const ROLE_RANK: Record<CommunityCafeRole, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export function communityCafeRoleRank(role: CommunityCafeRole | null | undefined): number {
  return role ? ROLE_RANK[role] : 0;
}

export function canManageCommunityCafe(role: CommunityCafeRole | null | undefined): boolean {
  return communityCafeRoleRank(role) >= ROLE_RANK.admin;
}

export function canModerateCommunityCafe(role: CommunityCafeRole | null | undefined): boolean {
  return communityCafeRoleRank(role) >= ROLE_RANK.moderator;
}

export function canPublishCommunityCafePost(
  role: CommunityCafeRole | null | undefined,
  postingPolicy: CommunityCafePostingPolicy,
): boolean {
  if (!role) return false;
  return postingPolicy === "members" || canModerateCommunityCafe(role);
}
