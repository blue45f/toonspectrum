export const CREATOR_COLLABORATION_ROLES = ["admin", "editor", "commenter", "viewer"] as const;
export const CREATOR_COLLABORATION_STATUSES = ["pending", "active", "declined"] as const;

export type CreatorCollaborationRole = (typeof CREATOR_COLLABORATION_ROLES)[number];
export type CreatorCollaborationStatus = (typeof CREATOR_COLLABORATION_STATUSES)[number];
export type CreatorCollaborationViewerRole = "owner" | CreatorCollaborationRole;

export type CreatorCollaborationAccess = Readonly<{
  view: boolean;
  comment: boolean;
  edit: boolean;
  manageMembers: boolean;
  respondInvite: boolean;
}>;

export type CreatorCollaborationMembershipLike = Readonly<{
  userId: string;
  role: unknown;
  status: unknown;
}>;

export type ResolveCreatorCollaborationAccessInput = Readonly<{
  actorUserId: string;
  ownerUserId: string;
  membership?: CreatorCollaborationMembershipLike | null;
}>;

const NO_ACCESS = Object.freeze({
  view: false,
  comment: false,
  edit: false,
  manageMembers: false,
  respondInvite: false,
}) satisfies CreatorCollaborationAccess;

const PENDING_INVITE_ACCESS = Object.freeze({
  ...NO_ACCESS,
  respondInvite: true,
}) satisfies CreatorCollaborationAccess;

const ACTIVE_ACCESS_BY_ROLE: Readonly<Record<CreatorCollaborationViewerRole, CreatorCollaborationAccess>> = {
  owner: Object.freeze({
    view: true,
    comment: true,
    edit: true,
    manageMembers: true,
    respondInvite: false,
  }),
  admin: Object.freeze({
    view: false,
    comment: false,
    edit: false,
    manageMembers: true,
    respondInvite: false,
  }),
  editor: Object.freeze({
    view: false,
    comment: false,
    edit: false,
    manageMembers: false,
    respondInvite: false,
  }),
  commenter: Object.freeze({
    view: false,
    comment: false,
    edit: false,
    manageMembers: false,
    respondInvite: false,
  }),
  viewer: Object.freeze({
    view: false,
    comment: false,
    edit: false,
    manageMembers: false,
    respondInvite: false,
  }),
};

export function normalizeCreatorCollaborationRole(value: unknown): CreatorCollaborationRole | null {
  switch (value) {
    case "admin":
    case "editor":
    case "commenter":
    case "viewer":
      return value;
    default:
      return null;
  }
}

export function normalizeCreatorCollaborationStatus(value: unknown): CreatorCollaborationStatus | null {
  switch (value) {
    case "pending":
    case "active":
    case "declined":
      return value;
    default:
      return null;
  }
}

export function deriveCreatorCollaborationAccess(
  viewerRole: CreatorCollaborationViewerRole | null,
  status: CreatorCollaborationStatus | null
): CreatorCollaborationAccess {
  if (viewerRole === "owner") return ACTIVE_ACCESS_BY_ROLE.owner;
  if (viewerRole === null || status === null || status === "declined") return NO_ACCESS;
  if (status === "pending") return PENDING_INVITE_ACCESS;
  return ACTIVE_ACCESS_BY_ROLE[viewerRole];
}

export function resolveCreatorCollaborationAccess({
  actorUserId,
  ownerUserId,
  membership,
}: ResolveCreatorCollaborationAccessInput): CreatorCollaborationAccess {
  if (actorUserId.length === 0 || ownerUserId.length === 0) return NO_ACCESS;
  if (actorUserId === ownerUserId) return deriveCreatorCollaborationAccess("owner", "active");
  if (!membership || membership.userId !== actorUserId) return NO_ACCESS;

  const role = normalizeCreatorCollaborationRole(membership.role);
  const status = normalizeCreatorCollaborationStatus(membership.status);
  return deriveCreatorCollaborationAccess(role, status);
}

export function canManageCreatorCollaborationMember(
  access: CreatorCollaborationAccess,
  actorUserId: string,
  targetUserId: string,
  ownerUserId: string
): boolean {
  return (
    access.manageMembers &&
    actorUserId.length > 0 &&
    targetUserId.length > 0 &&
    ownerUserId.length > 0 &&
    targetUserId !== actorUserId &&
    targetUserId !== ownerUserId
  );
}
