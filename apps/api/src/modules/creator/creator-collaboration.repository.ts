import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  creatorWorkCollaborationEvents,
  creatorWorkCollaborators,
  creatorWorkRevisions,
  creatorWorks,
  db,
  users,
} from "../../../../../lib/db";
import {
  CREATOR_WORK_REVISION_MAX,
  createCreatorWorkRevisionSnapshot,
  creatorWorkRevisionRetentionCutoff,
} from "../../../../../lib/server/creator-work-revisions";

import {
  canManageCreatorCollaborationMember,
  normalizeCreatorCollaborationRole,
  normalizeCreatorCollaborationStatus,
  resolveCreatorCollaborationAccess,
} from "./creator-collaboration.policy";

import type {
  CreatorCollaborationAccess,
  CreatorCollaborationRole,
  CreatorCollaborationStatus,
  CreatorCollaborationViewerRole,
} from "./creator-collaboration.policy";
import type { CreatorWorkRevisionSnapshot } from "../../../../../lib/server/creator-work-revisions";

type CreatorCollaborationInvitationAction = "accept" | "decline";
type CreatorCollaborationEventAction =
  | "invite"
  | "reinvite"
  | "accept"
  | "decline"
  | "role_change"
  | "remove";

interface CreatorCollaborationEventState {
  role: CreatorCollaborationRole;
  status: CreatorCollaborationStatus;
}

export const CREATOR_COLLABORATION_MAX_MEMBERS = 100;
export const CREATOR_COLLABORATION_REINVITE_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const CREATOR_SHARED_WORKS_CURSOR_VERSION = 1;
const CREATOR_SHARED_WORKS_CURSOR_MAX_LENGTH = 512;
const CREATOR_SHARED_WORKS_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface CreatorSharedWorksCursorKey {
  sortAt: Date;
  workId: string;
}

interface CreatorCollaborationWorkRecord {
  id: string;
  ownerUserId: string;
  title: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface CreatorSharedWorkRecord {
  workId: string;
  ownerUserId: string;
  ownerName: string | null;
  ownerStatus: string;
  title: string;
  format: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  membershipRole: string | null;
  membershipStatus: string | null;
}

interface CreatorSharedDocumentRecord extends CreatorSharedWorkRecord {
  revision: number;
  titleId: string | null;
  description: string;
  cover: string;
  tags: unknown;
  format: string;
  pages: unknown;
  doc: unknown;
  status: string;
  seriesId: string | null;
  episodeNo: number | null;
  challengeId: string | null;
  remixFromId: string | null;
}

interface CreatorSharedDocumentMetaRecord {
  workId: string;
  ownerUserId: string;
  ownerStatus: string;
  revision: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  membershipRole: string | null;
  membershipStatus: string | null;
}

type CreatorSharedDocumentMutationRecord = Omit<
  CreatorSharedDocumentRecord,
  "ownerName" | "ownerStatus" | "membershipRole" | "membershipStatus"
>;

export interface CreatorSharedDocumentPatch {
  title?: string;
  description?: string;
  cover?: string;
  tags?: string[];
  titleId?: string | null;
  pages?: string[];
  doc?: Record<string, unknown>;
  status?: "draft" | "published";
}

interface CreatorCollaborationUserRecord {
  userId: string;
  name: string | null;
  status: string;
}

interface CreatorCollaborationMembershipRecord {
  workId: string;
  userId: string;
  role: string;
  status: string;
  invitationId: string;
  invitedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  respondedAt: Date | null;
}

interface CreatorCollaborationMembershipWithUserRecord
  extends CreatorCollaborationMembershipRecord {
  name: string | null;
}

interface CreatorCollaborationInvitationRecord {
  workId: string;
  workTitle: string;
  ownerName: string | null;
  ownerStatus: string;
  role: string;
  status: string;
  invitationId: string;
  updatedAt: Date;
}

interface CreatorCollaborationEventRecord {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  actorStatus: string | null;
  targetUserId: string | null;
  targetName: string | null;
  targetStatus: string | null;
  beforeState: unknown;
  afterState: unknown;
  createdAt: Date;
}

interface CreatorCollaborationAuthorizedEventsRecord {
  authorized: true;
  events: CreatorCollaborationEventRecord[];
}

interface AppendCreatorCollaborationEventInput {
  id: string;
  workId: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: CreatorCollaborationEventAction;
  beforeState: CreatorCollaborationEventState | null;
  afterState: CreatorCollaborationEventState | null;
  createdAt: Date;
}

interface CreateCreatorCollaborationMembershipInput {
  workId: string;
  userId: string;
  role: CreatorCollaborationRole;
  invitedBy: string;
  invitationId: string;
  now: Date;
}

interface UpdateCreatorCollaborationMembershipInput {
  role?: CreatorCollaborationRole;
  status?: CreatorCollaborationStatus;
  invitedBy?: string;
  invitationId?: string;
  updatedAt: Date;
  respondedAt?: Date | null;
}

export interface CreatorCollaborationUnitOfWork {
  findWork(workId: string, lock?: boolean): Promise<CreatorCollaborationWorkRecord | null>;
  findUser(userId: string, lock?: boolean): Promise<CreatorCollaborationUserRecord | null>;
  findMembership(workId: string, userId: string): Promise<CreatorCollaborationMembershipRecord | null>;
  listMemberships(workId: string): Promise<CreatorCollaborationMembershipWithUserRecord[]>;
  countNonDeclinedMemberships(workId: string): Promise<number>;
  createMembership(input: CreateCreatorCollaborationMembershipInput): Promise<void>;
  updateMembership(
    workId: string,
    userId: string,
    input: UpdateCreatorCollaborationMembershipInput,
    expectedInvitationId?: string
  ): Promise<boolean>;
  deleteMembership(workId: string, userId: string): Promise<boolean>;
  listPendingInvitations(
    userId: string,
    limit: number
  ): Promise<CreatorCollaborationInvitationRecord[]>;
  appendEvent(input: AppendCreatorCollaborationEventInput): Promise<void>;
  listAuthorizedEvents(
    actorUserId: string,
    workId: string,
    limit: number
  ): Promise<CreatorCollaborationAuthorizedEventsRecord | null>;
  listAccessibleWorks(
    actorUserId: string,
    limit: number,
    cursor: CreatorSharedWorksCursorKey | null
  ): Promise<CreatorSharedWorkRecord[]>;
  findAccessibleDocument(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocumentRecord | null>;
  findAccessibleDocumentMeta(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocumentMetaRecord | null>;
  updateAccessibleDocument(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    patch: CreatorSharedDocumentPatch,
    updatedAt: Date
  ): Promise<CreatorSharedDocumentMutationRecord | null>;
  appendWorkRevision(
    workId: string,
    revision: number,
    snapshot: CreatorWorkRevisionSnapshot,
    createdAt: Date
  ): Promise<void>;
  deleteWorkRevisionsThrough(workId: string, revision: number): Promise<void>;
}

export interface CreatorCollaborationPersistence {
  read<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T>;
  transaction<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T>;
}

export interface CreatorCollaborationRepositoryOptions {
  now?: () => Date;
  createInvitationId?: () => string;
  createEventId?: () => string;
}

export interface CreatorCollaborationTeamMember {
  userId: string;
  name: string;
  role: CreatorCollaborationViewerRole;
  status: CreatorCollaborationStatus;
  isOwner: boolean;
  invitationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatorCollaborationTeamSnapshot {
  workId: string;
  viewer: {
    userId: string;
    role: CreatorCollaborationViewerRole;
    status: CreatorCollaborationStatus;
    capabilities: CreatorCollaborationAccess;
    invitationId?: string;
  };
  members: CreatorCollaborationTeamMember[];
}

export interface CreatorCollaborationInvitation {
  workId: string;
  workTitle: string;
  owner: {
    name: string;
  };
  role: CreatorCollaborationRole;
  invitationId: string;
  invitedAt: string;
}

export interface CreatorCollaborationInvitationResponse {
  workId: string;
  role: CreatorCollaborationRole;
  status: "active" | "declined";
}

export interface CreatorCollaborationActivity {
  id: string;
  action: CreatorCollaborationEventAction;
  actor: {
    userId: string | null;
    name: string;
  };
  target: {
    userId: string | null;
    name: string;
  };
  before: CreatorCollaborationEventState | null;
  after: CreatorCollaborationEventState | null;
  createdAt: string;
}

export interface CreatorSharedWork {
  workId: string;
  title: string;
  format: "cuttoon" | "upload";
  role: CreatorCollaborationViewerRole;
  status: "active";
  capabilities: Pick<CreatorCollaborationAccess, "view" | "comment" | "edit" | "manageMembers">;
  owner: { name: string };
  updatedAt: string;
}

export interface CreatorSharedWorksPage {
  items: CreatorSharedWork[];
  nextCursor: string | null;
}

export interface CreatorSharedDocument {
  workId: string;
  role: CreatorCollaborationViewerRole;
  status: "active";
  capabilities: { view: true; edit: boolean };
  revision: number;
  updatedAt: string;
  document: CreatorWorkRevisionSnapshot;
}

export type CreatorSharedDocumentMeta = Omit<CreatorSharedDocument, "document">;

export interface CreatorSharedDocumentSaveResponse {
  workId: string;
  revision: number;
  updatedAt: string;
}

export type CreatorCollaborationNotFoundCode =
  | "work_not_found"
  | "member_not_found"
  | "invitation_not_found";

export class CreatorCollaborationNotFoundError extends Error {
  constructor(readonly code: CreatorCollaborationNotFoundCode) {
    super(code);
    this.name = "CreatorCollaborationNotFoundError";
  }
}

export type CreatorCollaborationForbiddenCode =
  | "team_access_denied"
  | "member_management_denied"
  | "document_access_denied"
  | "document_edit_denied"
  | "document_owner_fields_denied";

export class CreatorCollaborationForbiddenError extends Error {
  constructor(readonly code: CreatorCollaborationForbiddenCode) {
    super(code);
    this.name = "CreatorCollaborationForbiddenError";
  }
}

export type CreatorCollaborationConflictCode =
  | "member_already_active"
  | "invitation_already_pending"
  | "invitation_not_pending"
  | "invitation_changed"
  | "member_limit_reached"
  | "reinvite_cooldown";

export class CreatorCollaborationConflictError extends Error {
  constructor(readonly code: CreatorCollaborationConflictCode) {
    super(code);
    this.name = "CreatorCollaborationConflictError";
  }
}

export type CreatorCollaborationInvalidTargetCode =
  | "invalid_role"
  | "invalid_action"
  | "invalid_cursor"
  | "owner_or_self_target"
  | "target_user_unavailable";

export class CreatorCollaborationInvalidTargetError extends Error {
  constructor(readonly code: CreatorCollaborationInvalidTargetCode) {
    super(code);
    this.name = "CreatorCollaborationInvalidTargetError";
  }
}

export class CreatorCollaborationRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("creator_work_revision_conflict");
    this.name = "CreatorCollaborationRevisionConflictError";
  }
}

type DrizzleCreatorCollaborationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DrizzleCreatorCollaborationExecutor = typeof db | DrizzleCreatorCollaborationTransaction;

const collaborationActorUsers = alias(users, "creator_collaboration_actor_user");
const collaborationTargetUsers = alias(users, "creator_collaboration_target_user");
const collaborationActivityViewerMemberships = alias(
  creatorWorkCollaborators,
  "creator_collaboration_activity_viewer_membership"
);
const sharedWorkViewerMemberships = alias(
  creatorWorkCollaborators,
  "creator_shared_work_viewer_membership"
);
const sharedDocumentEditorMemberships = alias(
  creatorWorkCollaborators,
  "creator_shared_document_editor_membership"
);
const sharedDocumentMetaViewerMemberships = alias(
  creatorWorkCollaborators,
  "creator_shared_document_meta_viewer_membership"
);
const sharedDocumentOwners = alias(users, "creator_shared_document_owner");
const sharedDocumentMetaOwners = alias(users, "creator_shared_document_meta_owner");
const sharedWorkOwners = alias(users, "creator_shared_work_owner");

const creatorSharedWorkSelection = {
  workId: creatorWorks.id,
  ownerUserId: creatorWorks.userId,
  ownerName: sharedWorkOwners.name,
  ownerStatus: sharedWorkOwners.status,
  title: creatorWorks.title,
  format: creatorWorks.format,
  createdAt: creatorWorks.createdAt,
  updatedAt: creatorWorks.updatedAt,
  membershipRole: sharedWorkViewerMemberships.role,
  membershipStatus: sharedWorkViewerMemberships.status,
};

const creatorSharedDocumentSelection = {
  workId: creatorWorks.id,
  ownerUserId: creatorWorks.userId,
  ownerName: sharedWorkOwners.name,
  ownerStatus: sharedWorkOwners.status,
  titleId: creatorWorks.titleId,
  title: creatorWorks.title,
  description: creatorWorks.description,
  cover: creatorWorks.cover,
  tags: creatorWorks.tags,
  format: creatorWorks.format,
  pages: creatorWorks.pages,
  doc: creatorWorks.doc,
  status: creatorWorks.status,
  seriesId: creatorWorks.seriesId,
  episodeNo: creatorWorks.episodeNo,
  challengeId: creatorWorks.challengeId,
  remixFromId: creatorWorks.remixFromId,
  revision: creatorWorks.revision,
  createdAt: creatorWorks.createdAt,
  updatedAt: creatorWorks.updatedAt,
  membershipRole: sharedWorkViewerMemberships.role,
  membershipStatus: sharedWorkViewerMemberships.status,
};

const creatorSharedDocumentMetaSelection = {
  workId: creatorWorks.id,
  ownerUserId: creatorWorks.userId,
  ownerStatus: sharedDocumentMetaOwners.status,
  revision: creatorWorks.revision,
  createdAt: creatorWorks.createdAt,
  updatedAt: creatorWorks.updatedAt,
  membershipRole: sharedDocumentMetaViewerMemberships.role,
  membershipStatus: sharedDocumentMetaViewerMemberships.status,
};

const creatorSharedDocumentMutationSelection = {
  workId: creatorWorks.id,
  ownerUserId: creatorWorks.userId,
  titleId: creatorWorks.titleId,
  title: creatorWorks.title,
  description: creatorWorks.description,
  cover: creatorWorks.cover,
  tags: creatorWorks.tags,
  format: creatorWorks.format,
  pages: creatorWorks.pages,
  doc: creatorWorks.doc,
  status: creatorWorks.status,
  seriesId: creatorWorks.seriesId,
  episodeNo: creatorWorks.episodeNo,
  challengeId: creatorWorks.challengeId,
  remixFromId: creatorWorks.remixFromId,
  revision: creatorWorks.revision,
  createdAt: creatorWorks.createdAt,
  updatedAt: creatorWorks.updatedAt,
};

/** Query-builder export keeps the correlated ACL SQL inspectable without opening a database connection. */
export function buildCreatorSharedDocumentUpdateQuery(
  executor: DrizzleCreatorCollaborationExecutor,
  actorUserId: string,
  workId: string,
  baseRevision: number,
  patch: CreatorSharedDocumentPatch,
  updatedAt: Date
) {
  if (Object.hasOwn(patch, "format")) {
    throw new Error("shared document format is immutable");
  }
  const ownerOnlyPatch = Object.hasOwn(patch, "status") || Object.hasOwn(patch, "titleId");
  const editorMembershipQuery = executor
    .select({ authorized: sql`1` })
    .from(sharedDocumentEditorMemberships)
    .where(
      and(
        eq(sharedDocumentEditorMemberships.workId, creatorWorks.id),
        eq(sharedDocumentEditorMemberships.userId, actorUserId),
        eq(sharedDocumentEditorMemberships.status, "active"),
        or(
          eq(sharedDocumentEditorMemberships.role, "admin"),
          eq(sharedDocumentEditorMemberships.role, "editor")
        )
      )
    );
  const activeOwnerQuery = executor
    .select({ authorized: sql`1` })
    .from(sharedDocumentOwners)
    .where(
      and(
        eq(sharedDocumentOwners.id, creatorWorks.userId),
        eq(sharedDocumentOwners.status, "active")
      )
    );
  const editorMembershipExists = sql<boolean>`exists ${editorMembershipQuery}`;
  const activeOwnerExists = sql<boolean>`exists ${activeOwnerQuery}`;
  return executor
    .update(creatorWorks)
    .set({
      ...patch,
      revision: sql`${creatorWorks.revision} + 1`,
      updatedAt,
    })
    .where(
      and(
        eq(creatorWorks.id, workId),
        eq(creatorWorks.revision, baseRevision),
        lt(creatorWorks.revision, CREATOR_WORK_REVISION_MAX),
        ownerOnlyPatch
          ? eq(creatorWorks.userId, actorUserId)
          : or(
              eq(creatorWorks.userId, actorUserId),
              and(activeOwnerExists, editorMembershipExists)
            )
      )
    )
    .returning(creatorSharedDocumentMutationSelection);
}

/**
 * Complete keyset query for the mixed owned/shared feed. PostgreSQL timestamps can carry
 * microseconds while JavaScript Date cursors carry milliseconds, so ordering and filtering both
 * truncate to the same precision to prevent a boundary row from repeating forever.
 */
export function buildCreatorSharedWorksListQuery(
  executor: DrizzleCreatorCollaborationExecutor,
  actorUserId: string,
  limit: number,
  cursor: CreatorSharedWorksCursorKey | null
) {
  const sortAt = sql<Date>`date_trunc('milliseconds', coalesce(${creatorWorks.updatedAt}, ${creatorWorks.createdAt}, to_timestamp(0)))`;
  const access = or(
    eq(creatorWorks.userId, actorUserId),
    and(
      eq(sharedWorkOwners.status, "active"),
      eq(sharedWorkViewerMemberships.userId, actorUserId),
      eq(sharedWorkViewerMemberships.status, "active")
    )
  );
  const afterCursor = cursor
    ? or(
        lt(sortAt, cursor.sortAt),
        and(eq(sortAt, cursor.sortAt), lt(creatorWorks.id, cursor.workId))
      )
    : undefined;
  return executor
    .select(creatorSharedWorkSelection)
    .from(creatorWorks)
    .innerJoin(sharedWorkOwners, eq(sharedWorkOwners.id, creatorWorks.userId))
    .leftJoin(
      sharedWorkViewerMemberships,
      and(
        eq(sharedWorkViewerMemberships.workId, creatorWorks.id),
        eq(sharedWorkViewerMemberships.userId, actorUserId)
      )
    )
    .where(and(access, afterCursor))
    .orderBy(desc(sortAt), desc(creatorWorks.id))
    .limit(limit);
}

/** Minimal ACL/revision probe: deliberately excludes title, cover, pages, doc and owner identity. */
export function buildCreatorSharedDocumentMetaQuery(
  executor: DrizzleCreatorCollaborationExecutor,
  actorUserId: string,
  workId: string
) {
  return executor
    .select(creatorSharedDocumentMetaSelection)
    .from(creatorWorks)
    .innerJoin(sharedDocumentMetaOwners, eq(sharedDocumentMetaOwners.id, creatorWorks.userId))
    .leftJoin(
      sharedDocumentMetaViewerMemberships,
      and(
        eq(sharedDocumentMetaViewerMemberships.workId, creatorWorks.id),
        eq(sharedDocumentMetaViewerMemberships.userId, actorUserId)
      )
    )
    .where(
      and(
        eq(creatorWorks.id, workId),
        or(
          eq(creatorWorks.userId, actorUserId),
          and(
            eq(sharedDocumentMetaOwners.status, "active"),
            eq(sharedDocumentMetaViewerMemberships.userId, actorUserId),
            eq(sharedDocumentMetaViewerMemberships.status, "active")
          )
        )
      )
    )
    .limit(1);
}
const validCollaborationEventPredicate = sql`(
  (
    ${creatorWorkCollaborationEvents.beforeState} is null
    or (
      jsonb_typeof(${creatorWorkCollaborationEvents.beforeState}) = 'object'
      and ${creatorWorkCollaborationEvents.beforeState} ?& array['role', 'status']
      and ${creatorWorkCollaborationEvents.beforeState} - array['role', 'status'] = '{}'::jsonb
      and ${creatorWorkCollaborationEvents.beforeState}->>'role' in ('admin', 'editor', 'commenter', 'viewer')
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' in ('pending', 'active', 'declined')
    )
  )
  and (
    ${creatorWorkCollaborationEvents.afterState} is null
    or (
      jsonb_typeof(${creatorWorkCollaborationEvents.afterState}) = 'object'
      and ${creatorWorkCollaborationEvents.afterState} ?& array['role', 'status']
      and ${creatorWorkCollaborationEvents.afterState} - array['role', 'status'] = '{}'::jsonb
      and ${creatorWorkCollaborationEvents.afterState}->>'role' in ('admin', 'editor', 'commenter', 'viewer')
      and ${creatorWorkCollaborationEvents.afterState}->>'status' in ('pending', 'active', 'declined')
    )
  )
  and (
    (${creatorWorkCollaborationEvents.action} = 'invite'
      and ${creatorWorkCollaborationEvents.beforeState} is null
      and ${creatorWorkCollaborationEvents.afterState}->>'status' = 'pending')
    or (${creatorWorkCollaborationEvents.action} = 'reinvite'
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' = 'declined'
      and ${creatorWorkCollaborationEvents.afterState}->>'status' = 'pending')
    or (${creatorWorkCollaborationEvents.action} in ('accept', 'decline')
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' = 'pending'
      and ${creatorWorkCollaborationEvents.afterState}->>'status' = case
        when ${creatorWorkCollaborationEvents.action} = 'accept' then 'active'
        else 'declined'
      end
      and ${creatorWorkCollaborationEvents.beforeState}->>'role' = ${creatorWorkCollaborationEvents.afterState}->>'role')
    or (${creatorWorkCollaborationEvents.action} = 'role_change'
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' in ('pending', 'active')
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' = ${creatorWorkCollaborationEvents.afterState}->>'status'
      and ${creatorWorkCollaborationEvents.beforeState}->>'role' <> ${creatorWorkCollaborationEvents.afterState}->>'role')
    or (${creatorWorkCollaborationEvents.action} = 'remove'
      and ${creatorWorkCollaborationEvents.beforeState}->>'status' in ('pending', 'active')
      and ${creatorWorkCollaborationEvents.afterState} is null)
  )
)`;

class DrizzleCreatorCollaborationUnitOfWork implements CreatorCollaborationUnitOfWork {
  constructor(private readonly executor: DrizzleCreatorCollaborationExecutor) {}

  async findWork(workId: string, lock = false): Promise<CreatorCollaborationWorkRecord | null> {
    const selectWork = () =>
      this.executor
        .select({
          id: creatorWorks.id,
          ownerUserId: creatorWorks.userId,
          title: creatorWorks.title,
          createdAt: creatorWorks.createdAt,
          updatedAt: creatorWorks.updatedAt,
        })
        .from(creatorWorks)
        .where(eq(creatorWorks.id, workId))
        .limit(1);

    const rows = lock ? await selectWork().for("update") : await selectWork();
    return rows[0] ?? null;
  }

  async findUser(userId: string, lock = false): Promise<CreatorCollaborationUserRecord | null> {
    const selectUser = () =>
      this.executor
        .select({
          userId: users.id,
          name: users.name,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const rows = lock ? await selectUser().for("update") : await selectUser();
    return rows[0] ?? null;
  }

  async findMembership(
    workId: string,
    userId: string
  ): Promise<CreatorCollaborationMembershipRecord | null> {
    const rows = await this.executor
      .select({
        workId: creatorWorkCollaborators.workId,
        userId: creatorWorkCollaborators.userId,
        role: creatorWorkCollaborators.role,
        status: creatorWorkCollaborators.status,
        invitationId: creatorWorkCollaborators.invitationId,
        invitedBy: creatorWorkCollaborators.invitedBy,
        createdAt: creatorWorkCollaborators.createdAt,
        updatedAt: creatorWorkCollaborators.updatedAt,
        respondedAt: creatorWorkCollaborators.respondedAt,
      })
      .from(creatorWorkCollaborators)
      .where(
        and(
          eq(creatorWorkCollaborators.workId, workId),
          eq(creatorWorkCollaborators.userId, userId)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listMemberships(workId: string): Promise<CreatorCollaborationMembershipWithUserRecord[]> {
    return this.executor
      .select({
        workId: creatorWorkCollaborators.workId,
        userId: creatorWorkCollaborators.userId,
        role: creatorWorkCollaborators.role,
        status: creatorWorkCollaborators.status,
        invitationId: creatorWorkCollaborators.invitationId,
        invitedBy: creatorWorkCollaborators.invitedBy,
        createdAt: creatorWorkCollaborators.createdAt,
        updatedAt: creatorWorkCollaborators.updatedAt,
        respondedAt: creatorWorkCollaborators.respondedAt,
        name: users.name,
      })
      .from(creatorWorkCollaborators)
      .innerJoin(users, eq(users.id, creatorWorkCollaborators.userId))
      .where(eq(creatorWorkCollaborators.workId, workId))
      .orderBy(asc(creatorWorkCollaborators.createdAt), asc(creatorWorkCollaborators.userId));
  }

  async countNonDeclinedMemberships(workId: string): Promise<number> {
    const rows = await this.executor
      .select({ value: count() })
      .from(creatorWorkCollaborators)
      .where(
        and(
          eq(creatorWorkCollaborators.workId, workId),
          ne(creatorWorkCollaborators.status, "declined")
        )
      );
    return rows[0]?.value ?? 0;
  }

  async createMembership(input: CreateCreatorCollaborationMembershipInput): Promise<void> {
    await this.executor.insert(creatorWorkCollaborators).values({
      workId: input.workId,
      userId: input.userId,
      role: input.role,
      status: "pending",
      invitationId: input.invitationId,
      invitedBy: input.invitedBy,
      createdAt: input.now,
      updatedAt: input.now,
      respondedAt: null,
    });
  }

  async updateMembership(
    workId: string,
    userId: string,
    input: UpdateCreatorCollaborationMembershipInput,
    expectedInvitationId?: string
  ): Promise<boolean> {
    const filters = [
      eq(creatorWorkCollaborators.workId, workId),
      eq(creatorWorkCollaborators.userId, userId),
    ];
    if (expectedInvitationId !== undefined) {
      filters.push(eq(creatorWorkCollaborators.invitationId, expectedInvitationId));
      filters.push(eq(creatorWorkCollaborators.status, "pending"));
    }
    const rows = await this.executor
      .update(creatorWorkCollaborators)
      .set(input)
      .where(and(...filters))
      .returning({ userId: creatorWorkCollaborators.userId });
    return rows.length === 1;
  }

  async deleteMembership(workId: string, userId: string): Promise<boolean> {
    const rows = await this.executor
      .delete(creatorWorkCollaborators)
      .where(
        and(
          eq(creatorWorkCollaborators.workId, workId),
          eq(creatorWorkCollaborators.userId, userId)
        )
      )
      .returning({ userId: creatorWorkCollaborators.userId });
    return rows.length === 1;
  }

  async listPendingInvitations(
    userId: string,
    limit: number
  ): Promise<CreatorCollaborationInvitationRecord[]> {
    return this.executor
      .select({
        workId: creatorWorkCollaborators.workId,
        workTitle: creatorWorks.title,
        ownerName: users.name,
        ownerStatus: users.status,
        role: creatorWorkCollaborators.role,
        status: creatorWorkCollaborators.status,
        invitationId: creatorWorkCollaborators.invitationId,
        updatedAt: creatorWorkCollaborators.updatedAt,
      })
      .from(creatorWorkCollaborators)
      .innerJoin(creatorWorks, eq(creatorWorks.id, creatorWorkCollaborators.workId))
      .innerJoin(users, eq(users.id, creatorWorks.userId))
      .where(
        and(
          eq(creatorWorkCollaborators.userId, userId),
          eq(creatorWorkCollaborators.status, "pending"),
          eq(users.status, "active")
        )
      )
      .orderBy(
        desc(creatorWorkCollaborators.updatedAt),
        desc(creatorWorkCollaborators.workId)
      )
      .limit(limit);
  }

  async appendEvent(input: AppendCreatorCollaborationEventInput): Promise<void> {
    await this.executor.insert(creatorWorkCollaborationEvents).values(input);
  }

  async listAuthorizedEvents(
    actorUserId: string,
    workId: string,
    limit: number
  ): Promise<CreatorCollaborationAuthorizedEventsRecord | null> {
    // 권한과 이벤트를 한 statement snapshot에서 읽는다. 유효성 조건은 JOIN ON에 두어 LIMIT
    // 전에 손상 행을 제외하면서도, 유효 이벤트가 0개인 권한자에게 작품 sentinel 행을 남긴다.
    const rows = await this.executor
      .select({
        authorized: sql<boolean>`true`,
        eventId: creatorWorkCollaborationEvents.id,
        action: creatorWorkCollaborationEvents.action,
        actorUserId: creatorWorkCollaborationEvents.actorUserId,
        actorName: collaborationActorUsers.name,
        actorStatus: collaborationActorUsers.status,
        targetUserId: creatorWorkCollaborationEvents.targetUserId,
        targetName: collaborationTargetUsers.name,
        targetStatus: collaborationTargetUsers.status,
        beforeState: creatorWorkCollaborationEvents.beforeState,
        afterState: creatorWorkCollaborationEvents.afterState,
        createdAt: creatorWorkCollaborationEvents.createdAt,
      })
      .from(creatorWorks)
      .leftJoin(
        collaborationActivityViewerMemberships,
        and(
          eq(collaborationActivityViewerMemberships.workId, creatorWorks.id),
          eq(collaborationActivityViewerMemberships.userId, actorUserId)
        )
      )
      .leftJoin(
        creatorWorkCollaborationEvents,
        and(
          eq(creatorWorkCollaborationEvents.workId, creatorWorks.id),
          validCollaborationEventPredicate
        )
      )
      .leftJoin(
        collaborationActorUsers,
        eq(collaborationActorUsers.id, creatorWorkCollaborationEvents.actorUserId)
      )
      .leftJoin(
        collaborationTargetUsers,
        eq(collaborationTargetUsers.id, creatorWorkCollaborationEvents.targetUserId)
      )
      .where(
        and(
          eq(creatorWorks.id, workId),
          or(
            eq(creatorWorks.userId, actorUserId),
            and(
              eq(collaborationActivityViewerMemberships.userId, actorUserId),
              eq(collaborationActivityViewerMemberships.role, "admin"),
              eq(collaborationActivityViewerMemberships.status, "active")
            )
          )
        )
      )
      .orderBy(desc(creatorWorkCollaborationEvents.sequence))
      .limit(limit);

    if (rows.length === 0 || rows[0]?.authorized !== true) return null;
    const events: CreatorCollaborationEventRecord[] = [];
    for (const row of rows) {
      if (
        row.eventId === null ||
        row.action === null ||
        row.createdAt === null
      ) {
        continue;
      }
      events.push({
        id: row.eventId,
        action: row.action,
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorStatus: row.actorStatus,
        targetUserId: row.targetUserId,
        targetName: row.targetName,
        targetStatus: row.targetStatus,
        beforeState: row.beforeState,
        afterState: row.afterState,
        createdAt: row.createdAt,
      });
    }
    return { authorized: true, events };
  }

  async listAccessibleWorks(
    actorUserId: string,
    limit: number,
    cursor: CreatorSharedWorksCursorKey | null
  ): Promise<CreatorSharedWorkRecord[]> {
    return buildCreatorSharedWorksListQuery(
      this.executor,
      actorUserId,
      limit,
      cursor
    );
  }

  async findAccessibleDocument(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocumentRecord | null> {
    const rows = await this.executor
      .select(creatorSharedDocumentSelection)
      .from(creatorWorks)
      .innerJoin(sharedWorkOwners, eq(sharedWorkOwners.id, creatorWorks.userId))
      .leftJoin(
        sharedWorkViewerMemberships,
        and(
          eq(sharedWorkViewerMemberships.workId, creatorWorks.id),
          eq(sharedWorkViewerMemberships.userId, actorUserId)
        )
      )
      .where(
        and(
          eq(creatorWorks.id, workId),
          or(
            eq(creatorWorks.userId, actorUserId),
            and(
              eq(sharedWorkOwners.status, "active"),
              eq(sharedWorkViewerMemberships.userId, actorUserId),
              eq(sharedWorkViewerMemberships.status, "active")
            )
          )
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findAccessibleDocumentMeta(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocumentMetaRecord | null> {
    const rows = await buildCreatorSharedDocumentMetaQuery(
      this.executor,
      actorUserId,
      workId
    );
    return rows[0] ?? null;
  }

  async updateAccessibleDocument(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    patch: CreatorSharedDocumentPatch,
    updatedAt: Date
  ): Promise<CreatorSharedDocumentMutationRecord | null> {
    // 서비스가 작품 행을 먼저 잠그지만 UPDATE에도 동일 ACL을 중복 적용한다. 향후 호출자가
    // 바뀌어도 pending/viewer 권한이 write primitive까지 도달하지 못하도록 하는 방어선이다.
    const rows = await buildCreatorSharedDocumentUpdateQuery(
      this.executor,
      actorUserId,
      workId,
      baseRevision,
      patch,
      updatedAt
    );
    return rows[0] ?? null;
  }

  async appendWorkRevision(
    workId: string,
    revision: number,
    snapshot: CreatorWorkRevisionSnapshot,
    createdAt: Date
  ): Promise<void> {
    await this.executor.insert(creatorWorkRevisions).values({
      workId,
      revision,
      snapshot,
      createdAt,
    });
  }

  async deleteWorkRevisionsThrough(workId: string, revision: number): Promise<void> {
    await this.executor
      .delete(creatorWorkRevisions)
      .where(
        and(
          eq(creatorWorkRevisions.workId, workId),
          lte(creatorWorkRevisions.revision, revision)
        )
      );
  }
}

class DrizzleCreatorCollaborationPersistence implements CreatorCollaborationPersistence {
  async read<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return run(new DrizzleCreatorCollaborationUnitOfWork(db));
  }

  async transaction<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return db.transaction((transaction) =>
      run(new DrizzleCreatorCollaborationUnitOfWork(transaction))
    );
  }
}

interface CreatorCollaborationContext {
  work: CreatorCollaborationWorkRecord;
  membership: CreatorCollaborationMembershipRecord | null;
  access: CreatorCollaborationAccess;
}

function optionalIsoString(value: Date | null): string | undefined {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
}

function ownerMember(
  work: CreatorCollaborationWorkRecord,
  owner: CreatorCollaborationUserRecord | null
): CreatorCollaborationTeamMember {
  const member: CreatorCollaborationTeamMember = {
    userId: work.ownerUserId,
    name: owner?.name?.trim() || work.ownerUserId,
    role: "owner",
    status: "active",
    isOwner: true,
  };
  const createdAt = optionalIsoString(work.createdAt);
  const updatedAt = optionalIsoString(work.updatedAt);
  if (createdAt) member.createdAt = createdAt;
  if (updatedAt) member.updatedAt = updatedAt;
  return member;
}

function collaborationMember(
  membership: CreatorCollaborationMembershipWithUserRecord,
  viewerUserId: string
): CreatorCollaborationTeamMember | null {
  const role = normalizeCreatorCollaborationRole(membership.role);
  const status = normalizeCreatorCollaborationStatus(membership.status);
  if (!role || !status) return null;

  const member: CreatorCollaborationTeamMember = {
    userId: membership.userId,
    name: membership.name?.trim() || membership.userId,
    role,
    status,
    isOwner: false,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
  if (membership.userId === viewerUserId && status === "pending") {
    member.invitationId = membership.invitationId;
  }
  return member;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEventAction(value: unknown): CreatorCollaborationEventAction | null {
  switch (value) {
    case "invite":
    case "reinvite":
    case "accept":
    case "decline":
    case "role_change":
    case "remove":
      return value;
    default:
      return null;
  }
}

function normalizeEventState(value: unknown): CreatorCollaborationEventState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 2 ||
    !Object.hasOwn(value, "role") ||
    !Object.hasOwn(value, "status")
  ) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const role = normalizeCreatorCollaborationRole(record.role);
  const status = normalizeCreatorCollaborationStatus(record.status);
  return role && status ? { role, status } : null;
}

function membershipEventState(
  membership: Pick<CreatorCollaborationMembershipRecord, "role" | "status">
): CreatorCollaborationEventState {
  const state = normalizeEventState({ role: membership.role, status: membership.status });
  if (!state) throw new Error("invalid creator collaboration membership state");
  return state;
}

function eventStatesMatchAction(
  action: CreatorCollaborationEventAction,
  before: CreatorCollaborationEventState | null,
  after: CreatorCollaborationEventState | null
): boolean {
  switch (action) {
    case "invite":
      return before === null && after?.status === "pending";
    case "reinvite":
      return before?.status === "declined" && after?.status === "pending";
    case "accept":
      return (
        before?.status === "pending" &&
        after?.status === "active" &&
        before.role === after.role
      );
    case "decline":
      return (
        before?.status === "pending" &&
        after?.status === "declined" &&
        before.role === after.role
      );
    case "role_change":
      return (
        before !== null &&
        after !== null &&
        (before.status === "pending" || before.status === "active") &&
        before.status === after.status &&
        before.role !== after.role
      );
    case "remove":
      return (
        before !== null &&
        (before.status === "pending" || before.status === "active") &&
        after === null
      );
  }
}

function invitationProjection(
  record: CreatorCollaborationInvitationRecord
): CreatorCollaborationInvitation | null {
  const role = normalizeCreatorCollaborationRole(record.role);
  const status = normalizeCreatorCollaborationStatus(record.status);
  if (
    !role ||
    status !== "pending" ||
    typeof record.workId !== "string" ||
    record.workId.length === 0 ||
    typeof record.workTitle !== "string" ||
    record.ownerStatus !== "active" ||
    typeof record.invitationId !== "string" ||
    !UUID_PATTERN.test(record.invitationId) ||
    !(record.updatedAt instanceof Date) ||
    !Number.isFinite(record.updatedAt.getTime())
  ) {
    return null;
  }
  return {
    workId: record.workId,
    workTitle: record.workTitle,
    owner: {
      name: record.ownerName?.trim() || "작품 소유자",
    },
    role,
    invitationId: record.invitationId,
    invitedAt: record.updatedAt.toISOString(),
  };
}

const UNKNOWN_ACTIVITY_USER_NAME = "알 수 없는 사용자";
const DELETED_ACTIVITY_USER_NAME = "탈퇴한 사용자";

function activityUserProjection(
  userId: unknown,
  name: unknown,
  status: unknown
): CreatorCollaborationActivity["actor"] | null {
  if (userId !== null && (typeof userId !== "string" || userId.length === 0)) return null;
  if (status === null || userId === null) {
    return { userId: null, name: UNKNOWN_ACTIVITY_USER_NAME };
  }
  if (status === "deleted") {
    return { userId: null, name: DELETED_ACTIVITY_USER_NAME };
  }
  if (status !== "active" && status !== "suspended") return null;
  const currentName = typeof name === "string" ? name.trim() : "";
  return { userId, name: currentName || UNKNOWN_ACTIVITY_USER_NAME };
}

function activityProjection(
  record: CreatorCollaborationEventRecord
): CreatorCollaborationActivity | null {
  const action = normalizeEventAction(record.action);
  const before = record.beforeState === null ? null : normalizeEventState(record.beforeState);
  const after = record.afterState === null ? null : normalizeEventState(record.afterState);
  const actor = activityUserProjection(
    record.actorUserId,
    record.actorName,
    record.actorStatus
  );
  const target = activityUserProjection(
    record.targetUserId,
    record.targetName,
    record.targetStatus
  );
  if (
    !action ||
    (record.beforeState !== null && !before) ||
    (record.afterState !== null && !after) ||
    !eventStatesMatchAction(action, before, after) ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    !actor ||
    !target ||
    !(record.createdAt instanceof Date) ||
    !Number.isFinite(record.createdAt.getTime())
  ) {
    return null;
  }
  return {
    id: record.id,
    action,
    actor,
    target,
    before,
    after,
    createdAt: record.createdAt.toISOString(),
  };
}

interface CreatorSharedWorksCursorPayload {
  v: typeof CREATOR_SHARED_WORKS_CURSOR_VERSION;
  sortAt: string;
  workId: string;
}

function creatorSharedWorkSortDate(
  record: Pick<CreatorSharedWorkRecord, "createdAt" | "updatedAt">
): Date {
  if (record.updatedAt instanceof Date && Number.isFinite(record.updatedAt.getTime())) {
    return record.updatedAt;
  }
  if (record.createdAt instanceof Date && Number.isFinite(record.createdAt.getTime())) {
    return record.createdAt;
  }
  return new Date(0);
}

export function encodeCreatorSharedWorksCursor(key: CreatorSharedWorksCursorKey): string {
  const payload: CreatorSharedWorksCursorPayload = {
    v: CREATOR_SHARED_WORKS_CURSOR_VERSION,
    sortAt: key.sortAt.toISOString(),
    workId: key.workId,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCreatorSharedWorksCursor(
  cursor: string
): CreatorSharedWorksCursorKey | null {
  if (
    cursor.length === 0 ||
    cursor.length > CREATOR_SHARED_WORKS_CURSOR_MAX_LENGTH ||
    !CREATOR_SHARED_WORKS_CURSOR_PATTERN.test(cursor)
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursor, "base64url");
    // Buffer's decoder is intentionally lenient; a canonical round trip rejects aliases/truncation.
    if (decoded.length === 0 || decoded.toString("base64url") !== cursor) return null;
    const value: unknown = JSON.parse(decoded.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 3 ||
      record.v !== CREATOR_SHARED_WORKS_CURSOR_VERSION ||
      typeof record.sortAt !== "string" ||
      typeof record.workId !== "string" ||
      record.workId.length === 0 ||
      record.workId.length > 160 ||
      record.workId.trim().length === 0
    ) {
      return null;
    }
    const sortAt = new Date(record.sortAt);
    if (!Number.isFinite(sortAt.getTime()) || sortAt.toISOString() !== record.sortAt) return null;
    const key = { sortAt, workId: record.workId };
    return encodeCreatorSharedWorksCursor(key) === cursor ? key : null;
  } catch {
    return null;
  }
}

function boundedCollaborationListLimit(value: number): number {
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 50) : 20;
}

function sharedRecordAccess(
  record: Pick<
    CreatorSharedWorkRecord,
    "ownerUserId" | "ownerStatus" | "membershipRole" | "membershipStatus"
  >,
  actorUserId: string
): { role: CreatorCollaborationViewerRole; access: CreatorCollaborationAccess } | null {
  if (record.ownerUserId === actorUserId) {
    return {
      role: "owner",
      access: resolveCreatorCollaborationAccess({
        actorUserId,
        ownerUserId: record.ownerUserId,
      }),
    };
  }
  const role = normalizeCreatorCollaborationRole(record.membershipRole);
  const status = normalizeCreatorCollaborationStatus(record.membershipStatus);
  if (record.ownerStatus !== "active" || !role || status !== "active") return null;
  const access = resolveCreatorCollaborationAccess({
    actorUserId,
    ownerUserId: record.ownerUserId,
    membership: { userId: actorUserId, role, status },
  });
  return access.view ? { role, access } : null;
}

function requiredIsoString(value: Date | null): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function creatorWorkIsoTimestamp(record: Pick<CreatorSharedWorkRecord, "createdAt" | "updatedAt">): string {
  return creatorSharedWorkSortDate(record).toISOString();
}

function sharedWorkProjection(
  record: CreatorSharedWorkRecord,
  actorUserId: string
): CreatorSharedWork | null {
  const context = sharedRecordAccess(record, actorUserId);
  const updatedAt = creatorWorkIsoTimestamp(record);
  if (
    !context ||
    typeof record.workId !== "string" ||
    record.workId.length === 0 ||
    typeof record.title !== "string" ||
    (record.format !== "cuttoon" && record.format !== "upload")
  ) {
    return null;
  }
  return {
    workId: record.workId,
    title: record.title,
    format: record.format,
    role: context.role,
    status: "active",
    capabilities: {
      view: context.access.view,
      comment: context.access.comment,
      edit: context.access.edit,
      manageMembers: context.access.manageMembers,
    },
    owner: { name: record.ownerName?.trim() || "작품 소유자" },
    updatedAt,
  };
}

function sharedDocumentProjection(
  record: CreatorSharedDocumentRecord,
  actorUserId: string
): CreatorSharedDocument | null {
  const context = sharedRecordAccess(record, actorUserId);
  const updatedAt = creatorWorkIsoTimestamp(record);
  if (
    !context ||
    !Number.isInteger(record.revision) ||
    record.revision < 1 ||
    record.revision > CREATOR_WORK_REVISION_MAX
  ) {
    return null;
  }
  return {
    workId: record.workId,
    role: context.role,
    status: "active",
    capabilities: { view: true, edit: context.access.edit },
    revision: record.revision,
    updatedAt,
    document: createCreatorWorkRevisionSnapshot(record),
  };
}

function sharedDocumentMetaProjection(
  record: CreatorSharedDocumentMetaRecord,
  actorUserId: string
): CreatorSharedDocumentMeta | null {
  const context = sharedRecordAccess(record, actorUserId);
  if (
    !context ||
    typeof record.workId !== "string" ||
    record.workId.length === 0 ||
    !Number.isInteger(record.revision) ||
    record.revision < 1 ||
    record.revision > CREATOR_WORK_REVISION_MAX
  ) {
    return null;
  }
  return {
    workId: record.workId,
    role: context.role,
    status: "active",
    capabilities: { view: true, edit: context.access.edit },
    revision: record.revision,
    updatedAt: creatorWorkIsoTimestamp(record),
  };
}

export class CreatorCollaborationRepository {
  private readonly now: () => Date;
  private readonly createInvitationId: () => string;
  private readonly createEventId: () => string;

  constructor(
    private readonly persistence: CreatorCollaborationPersistence =
      new DrizzleCreatorCollaborationPersistence(),
    options: CreatorCollaborationRepositoryOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createInvitationId = options.createInvitationId ?? randomUUID;
    this.createEventId = options.createEventId ?? randomUUID;
  }

  async listSharedWorks(
    actorUserId: string,
    limit: number,
    cursor?: string
  ): Promise<CreatorSharedWorksPage> {
    const decodedCursor = cursor === undefined ? null : decodeCreatorSharedWorksCursor(cursor);
    if (cursor !== undefined && decodedCursor === null) {
      throw new CreatorCollaborationInvalidTargetError("invalid_cursor");
    }
    const pageLimit = boundedCollaborationListLimit(limit);
    return this.persistence.read(async (unit) => {
      const records = await unit.listAccessibleWorks(
        actorUserId,
        pageLimit + 1,
        decodedCursor
      );
      const pageRecords = records.slice(0, pageLimit);
      const items: CreatorSharedWork[] = [];
      for (const record of pageRecords) {
        const item = sharedWorkProjection(record, actorUserId);
        if (!item) throw new Error("invalid creator shared work record");
        items.push(item);
      }
      const lastRecord = pageRecords.at(-1);
      const nextCursor =
        records.length > pageLimit && lastRecord
          ? encodeCreatorSharedWorksCursor({
              sortAt: creatorSharedWorkSortDate(lastRecord),
              workId: lastRecord.workId,
            })
          : null;
      return { items, nextCursor };
    });
  }

  async getSharedDocument(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocument> {
    return this.persistence.read(async (unit) => {
      const record = await unit.findAccessibleDocument(actorUserId, workId);
      if (!record) {
        const work = await unit.findWork(workId);
        if (!work) throw new CreatorCollaborationNotFoundError("work_not_found");
        throw new CreatorCollaborationForbiddenError("document_access_denied");
      }
      const document = sharedDocumentProjection(record, actorUserId);
      if (!document) throw new Error("invalid creator shared document record");
      return document;
    });
  }

  async getSharedDocumentMeta(
    actorUserId: string,
    workId: string
  ): Promise<CreatorSharedDocumentMeta> {
    return this.persistence.read(async (unit) => {
      const record = await unit.findAccessibleDocumentMeta(actorUserId, workId);
      if (!record) {
        const work = await unit.findWork(workId);
        if (!work) throw new CreatorCollaborationNotFoundError("work_not_found");
        throw new CreatorCollaborationForbiddenError("document_access_denied");
      }
      const meta = sharedDocumentMetaProjection(record, actorUserId);
      if (!meta) throw new Error("invalid creator shared document meta record");
      return meta;
    });
  }

  async saveSharedDocument(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    patch: CreatorSharedDocumentPatch
  ): Promise<CreatorSharedDocumentSaveResponse> {
    if (
      !Number.isInteger(baseRevision) ||
      baseRevision < 1 ||
      baseRevision > CREATOR_WORK_REVISION_MAX ||
      Object.keys(patch).length === 0 ||
      Object.hasOwn(patch, "format")
    ) {
      throw new Error("invalid creator shared document mutation");
    }
    return this.persistence.transaction(async (unit) => {
      // 모든 멤버 변경도 작품 행을 먼저 잠그므로, 여기서 같은 행을 잠그면 ACL 확인·revision
      // 비교·저장이 역할 회수와 직렬화된다. owner는 멤버 행 없이 항상 이 경로를 통과한다.
      const context = await this.loadContext(unit, actorUserId, workId, true);
      if (actorUserId !== context.work.ownerUserId) {
        const owner = await unit.findUser(context.work.ownerUserId, true);
        if (!owner || owner.status !== "active") {
          throw new CreatorCollaborationForbiddenError("document_edit_denied");
        }
      }
      if (!context.access.edit) {
        throw new CreatorCollaborationForbiddenError("document_edit_denied");
      }
      // 편집 역할은 원고 콘텐츠를 저장할 수 있지만 작품의 공개 상태와 카탈로그 연결은
      // 소유권 영역이다. DTO는 owner도 같은 endpoint를 쓰므로 필드를 허용하되 여기서 actor와
      // 함께 판정해 admin/editor가 작품을 게시·비공개 전환하거나 연결 작품을 바꾸지 못하게 한다.
      if (
        actorUserId !== context.work.ownerUserId &&
        (Object.hasOwn(patch, "status") || Object.hasOwn(patch, "titleId"))
      ) {
        throw new CreatorCollaborationForbiddenError("document_owner_fields_denied");
      }
      const current = await unit.findAccessibleDocument(actorUserId, workId);
      if (!current) {
        throw new CreatorCollaborationForbiddenError("document_edit_denied");
      }
      if (current.revision !== baseRevision) {
        throw new CreatorCollaborationRevisionConflictError(current.revision);
      }
      if (current.revision >= CREATOR_WORK_REVISION_MAX) {
        throw new Error("creator work revision limit reached");
      }

      const now = this.now();
      const updated = await unit.updateAccessibleDocument(
        actorUserId,
        workId,
        baseRevision,
        patch,
        now
      );
      if (!updated) {
        const latest = await unit.findAccessibleDocument(actorUserId, workId);
        if (latest && latest.revision !== baseRevision) {
          throw new CreatorCollaborationRevisionConflictError(latest.revision);
        }
        throw new CreatorCollaborationForbiddenError("document_edit_denied");
      }

      await unit.appendWorkRevision(
        workId,
        updated.revision,
        createCreatorWorkRevisionSnapshot(updated),
        now
      );
      const cutoff = creatorWorkRevisionRetentionCutoff(updated.revision);
      if (cutoff !== null) {
        await unit.deleteWorkRevisionsThrough(workId, cutoff);
      }
      const updatedAt = requiredIsoString(updated.updatedAt);
      if (!updatedAt) throw new Error("invalid creator shared document update timestamp");
      return { workId, revision: updated.revision, updatedAt };
    });
  }

  async getTeam(actorUserId: string, workId: string): Promise<CreatorCollaborationTeamSnapshot> {
    return this.persistence.transaction(async (unit) => {
      const context = await this.loadContext(unit, actorUserId, workId, true);
      if (context.access.manageMembers) {
        return this.buildSnapshot(unit, actorUserId, context, "all");
      }
      const membershipRole = normalizeCreatorCollaborationRole(context.membership?.role);
      const membershipStatus = normalizeCreatorCollaborationStatus(context.membership?.status);
      if (membershipRole && membershipStatus) {
        return this.buildSnapshot(unit, actorUserId, context, "self");
      }
      throw new CreatorCollaborationForbiddenError("team_access_denied");
    });
  }

  async listInvitations(
    actorUserId: string,
    limit: number
  ): Promise<CreatorCollaborationInvitation[]> {
    return this.persistence.read(async (unit) => {
      const records = await unit.listPendingInvitations(
        actorUserId,
        boundedCollaborationListLimit(limit)
      );
      return records
        .map(invitationProjection)
        .filter(
          (invitation): invitation is CreatorCollaborationInvitation => invitation !== null
        );
    });
  }

  async getActivity(
    actorUserId: string,
    workId: string,
    limit: number
  ): Promise<CreatorCollaborationActivity[]> {
    return this.persistence.read(async (unit) => {
      const authorizedRead = await unit.listAuthorizedEvents(
        actorUserId,
        workId,
        boundedCollaborationListLimit(limit)
      );
      if (!authorizedRead) {
        const work = await unit.findWork(workId);
        if (!work) throw new CreatorCollaborationNotFoundError("work_not_found");
        throw new CreatorCollaborationForbiddenError("member_management_denied");
      }
      return authorizedRead.events
        .map(activityProjection)
        .filter((activity): activity is CreatorCollaborationActivity => activity !== null);
    });
  }

  async invite(
    actorUserId: string,
    workId: string,
    targetUserId: string,
    requestedRole: CreatorCollaborationRole
  ): Promise<CreatorCollaborationTeamSnapshot> {
    return this.persistence.transaction(async (unit) => {
      const context = await this.loadContext(unit, actorUserId, workId, true);
      this.requireManageAccess(context.access);

      const role = normalizeCreatorCollaborationRole(requestedRole);
      if (!role) throw new CreatorCollaborationInvalidTargetError("invalid_role");
      if (targetUserId === context.work.ownerUserId || targetUserId === actorUserId) {
        throw new CreatorCollaborationInvalidTargetError("owner_or_self_target");
      }

      const target = await unit.findUser(targetUserId);
      if (!target || target.status !== "active") {
        throw new CreatorCollaborationInvalidTargetError("target_user_unavailable");
      }

      const existing = await unit.findMembership(workId, targetUserId);
      const existingStatus = normalizeCreatorCollaborationStatus(existing?.status);
      const now = this.now();
      if (existingStatus === "active") {
        throw new CreatorCollaborationConflictError("member_already_active");
      }
      if (existingStatus === "pending") {
        throw new CreatorCollaborationConflictError("invitation_already_pending");
      }
      if (existingStatus === "declined") {
        const respondedAt = existing?.respondedAt;
        const elapsed = respondedAt ? now.getTime() - respondedAt.getTime() : Number.NEGATIVE_INFINITY;
        if (!Number.isFinite(elapsed) || elapsed < CREATOR_COLLABORATION_REINVITE_COOLDOWN_MS) {
          throw new CreatorCollaborationConflictError("reinvite_cooldown");
        }
      }
      if (
        (!existing || existingStatus === "declined") &&
        (await unit.countNonDeclinedMemberships(workId)) >= CREATOR_COLLABORATION_MAX_MEMBERS
      ) {
        throw new CreatorCollaborationConflictError("member_limit_reached");
      }

      const invitationId = this.createInvitationId();
      const beforeState = existing ? membershipEventState(existing) : null;
      if (existing) {
        const updated = await unit.updateMembership(workId, targetUserId, {
          role,
          status: "pending",
          invitationId,
          invitedBy: actorUserId,
          updatedAt: now,
          respondedAt: null,
        });
        if (!updated) throw new CreatorCollaborationNotFoundError("member_not_found");
      } else {
        await unit.createMembership({
          workId,
          userId: targetUserId,
          role,
          invitedBy: actorUserId,
          invitationId,
          now,
        });
      }
      await this.appendAuditEvent(unit, {
        workId,
        actorUserId,
        targetUserId,
        action: existing ? "reinvite" : "invite",
        beforeState,
        afterState: { role, status: "pending" },
        createdAt: now,
      });

      return this.buildMutationSnapshot(unit, actorUserId, context.work);
    });
  }

  async updateMemberRole(
    actorUserId: string,
    workId: string,
    targetUserId: string,
    requestedRole: CreatorCollaborationRole
  ): Promise<CreatorCollaborationTeamSnapshot> {
    return this.persistence.transaction(async (unit) => {
      const context = await this.loadContext(unit, actorUserId, workId, true);
      this.requireManageMember(context, actorUserId, targetUserId);
      const role = normalizeCreatorCollaborationRole(requestedRole);
      if (!role) throw new CreatorCollaborationInvalidTargetError("invalid_role");

      const targetMembership = await unit.findMembership(workId, targetUserId);
      const targetStatus = normalizeCreatorCollaborationStatus(targetMembership?.status);
      if (!targetMembership || targetStatus === "declined") {
        throw new CreatorCollaborationNotFoundError("member_not_found");
      }
      if (!targetStatus) throw new Error("invalid creator collaboration membership status");
      const beforeState = membershipEventState(targetMembership);
      if (beforeState.role === role) {
        return this.buildMutationSnapshot(unit, actorUserId, context.work);
      }
      const now = this.now();
      const update: UpdateCreatorCollaborationMembershipInput = {
        role,
        updatedAt: now,
      };
      if (targetStatus === "pending") {
        update.invitationId = this.createInvitationId();
      }
      const updated = await unit.updateMembership(workId, targetUserId, update);
      if (!updated) throw new CreatorCollaborationNotFoundError("member_not_found");
      await this.appendAuditEvent(unit, {
        workId,
        actorUserId,
        targetUserId,
        action: "role_change",
        beforeState,
        afterState: { role, status: targetStatus },
        createdAt: now,
      });

      return this.buildMutationSnapshot(unit, actorUserId, context.work);
    });
  }

  async removeMember(
    actorUserId: string,
    workId: string,
    targetUserId: string
  ): Promise<CreatorCollaborationTeamSnapshot> {
    return this.persistence.transaction(async (unit) => {
      const context = await this.loadContext(unit, actorUserId, workId, true);
      this.requireManageMember(context, actorUserId, targetUserId);
      const targetMembership = await unit.findMembership(workId, targetUserId);
      if (!targetMembership || normalizeCreatorCollaborationStatus(targetMembership.status) === "declined") {
        throw new CreatorCollaborationNotFoundError("member_not_found");
      }
      const beforeState = membershipEventState(targetMembership);
      if (beforeState.status !== "pending" && beforeState.status !== "active") {
        throw new CreatorCollaborationNotFoundError("member_not_found");
      }
      if (!(await unit.deleteMembership(workId, targetUserId))) {
        throw new CreatorCollaborationNotFoundError("member_not_found");
      }
      const now = this.now();
      await this.appendAuditEvent(unit, {
        workId,
        actorUserId,
        targetUserId,
        action: "remove",
        beforeState,
        afterState: null,
        createdAt: now,
      });

      return this.buildMutationSnapshot(unit, actorUserId, context.work);
    });
  }

  async respondToInvitation(
    actorUserId: string,
    workId: string,
    requestedAction: CreatorCollaborationInvitationAction,
    invitationId: string
  ): Promise<CreatorCollaborationInvitationResponse> {
    return this.persistence.transaction(async (unit) => {
      const context = await this.loadContext(unit, actorUserId, workId, true);
      // 작품 행과 소유자 행을 같은 transaction에서 잠근다. 소유자 status UPDATE는 이 응답이
      // 끝날 때까지 대기하므로 active 검증과 멤버십 변경 사이의 정지/탈퇴 race를 닫는다.
      const owner = await unit.findUser(context.work.ownerUserId, true);
      if (!owner || owner.status !== "active") {
        throw new CreatorCollaborationConflictError("invitation_not_pending");
      }
      if (!context.membership) {
        throw new CreatorCollaborationNotFoundError("invitation_not_found");
      }
      if (requestedAction !== "accept" && requestedAction !== "decline") {
        throw new CreatorCollaborationInvalidTargetError("invalid_action");
      }
      if (context.membership.invitationId !== invitationId) {
        throw new CreatorCollaborationConflictError("invitation_changed");
      }
      if (!context.access.respondInvite) {
        throw new CreatorCollaborationConflictError("invitation_not_pending");
      }

      const now = this.now();
      const beforeState = membershipEventState(context.membership);
      const afterStatus = requestedAction === "accept" ? "active" : "declined";
      const updated = await unit.updateMembership(workId, actorUserId, {
        status: afterStatus,
        updatedAt: now,
        respondedAt: now,
      }, invitationId);
      if (!updated) throw new CreatorCollaborationConflictError("invitation_changed");
      await this.appendAuditEvent(unit, {
        workId,
        actorUserId,
        targetUserId: actorUserId,
        action: requestedAction,
        beforeState,
        afterState: { role: beforeState.role, status: afterStatus },
        createdAt: now,
      });

      return { workId, role: beforeState.role, status: afterStatus };
    });
  }

  private async appendAuditEvent(
    unit: CreatorCollaborationUnitOfWork,
    input: Omit<AppendCreatorCollaborationEventInput, "id"> & {
      actorUserId: string;
    }
  ): Promise<void> {
    const before = input.beforeState === null ? null : normalizeEventState(input.beforeState);
    const after = input.afterState === null ? null : normalizeEventState(input.afterState);
    if (
      (input.beforeState !== null && !before) ||
      (input.afterState !== null && !after) ||
      !eventStatesMatchAction(input.action, before, after)
    ) {
      throw new Error("invalid creator collaboration event transition");
    }
    await unit.appendEvent({
      ...input,
      id: this.createEventId(),
    });
  }

  private async loadContext(
    unit: CreatorCollaborationUnitOfWork,
    actorUserId: string,
    workId: string,
    lock = false
  ): Promise<CreatorCollaborationContext> {
    const work = await unit.findWork(workId, lock);
    if (!work) throw new CreatorCollaborationNotFoundError("work_not_found");
    const membership =
      actorUserId === work.ownerUserId ? null : await unit.findMembership(workId, actorUserId);
    return {
      work,
      membership,
      access: resolveCreatorCollaborationAccess({
        actorUserId,
        ownerUserId: work.ownerUserId,
        membership,
      }),
    };
  }

  private requireManageAccess(access: CreatorCollaborationAccess): void {
    if (!access.manageMembers) {
      throw new CreatorCollaborationForbiddenError("member_management_denied");
    }
  }

  private requireManageMember(
    context: CreatorCollaborationContext,
    actorUserId: string,
    targetUserId: string
  ): void {
    if (
      !canManageCreatorCollaborationMember(
        context.access,
        actorUserId,
        targetUserId,
        context.work.ownerUserId
      )
    ) {
      throw new CreatorCollaborationForbiddenError("member_management_denied");
    }
  }

  private async buildMutationSnapshot(
    unit: CreatorCollaborationUnitOfWork,
    actorUserId: string,
    work: CreatorCollaborationWorkRecord
  ): Promise<CreatorCollaborationTeamSnapshot> {
    const membership =
      actorUserId === work.ownerUserId ? null : await unit.findMembership(work.id, actorUserId);
    const context: CreatorCollaborationContext = {
      work,
      membership,
      access: resolveCreatorCollaborationAccess({
        actorUserId,
        ownerUserId: work.ownerUserId,
        membership,
      }),
    };
    return this.buildSnapshot(
      unit,
      actorUserId,
      context,
      context.access.manageMembers ? "all" : "self"
    );
  }

  private async buildSnapshot(
    unit: CreatorCollaborationUnitOfWork,
    actorUserId: string,
    context: CreatorCollaborationContext,
    scope: "all" | "self"
  ): Promise<CreatorCollaborationTeamSnapshot> {
    const owner = await unit.findUser(context.work.ownerUserId);
    let memberships: CreatorCollaborationMembershipWithUserRecord[];
    if (scope === "all") {
      memberships = await unit.listMemberships(context.work.id);
    } else if (context.membership) {
      const memberUser = await unit.findUser(context.membership.userId);
      memberships = [
        {
          ...context.membership,
          name: memberUser?.name ?? null,
        },
      ];
    } else {
      memberships = [];
    }
    const normalizedMembers = memberships
      .filter(
        (membership) =>
          membership.userId !== context.work.ownerUserId &&
          (scope === "self" || normalizeCreatorCollaborationStatus(membership.status) !== "declined")
      )
      .map((membership) => collaborationMember(membership, actorUserId))
      .filter((member): member is CreatorCollaborationTeamMember => member !== null);
    const viewerRole =
      actorUserId === context.work.ownerUserId
        ? "owner"
        : (normalizeCreatorCollaborationRole(context.membership?.role) ?? "viewer");
    const viewerStatus =
      actorUserId === context.work.ownerUserId
        ? "active"
        : (normalizeCreatorCollaborationStatus(context.membership?.status) ?? "declined");

    const viewer: CreatorCollaborationTeamSnapshot["viewer"] = {
      userId: actorUserId,
      role: viewerRole,
      status: viewerStatus,
      capabilities: context.access,
    };
    if (viewerStatus === "pending" && context.membership?.userId === actorUserId) {
      viewer.invitationId = context.membership.invitationId;
    }

    return {
      workId: context.work.id,
      viewer,
      members: [ownerMember(context.work, owner), ...normalizedMembers],
    };
  }
}

export const creatorCollaborationRepositoryProvider = {
  provide: CreatorCollaborationRepository,
  useFactory: () => new CreatorCollaborationRepository(),
};
