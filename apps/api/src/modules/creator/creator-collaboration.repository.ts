import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  creatorWorkCollaborationEvents,
  creatorWorkCollaborators,
  creatorWorks,
  db,
  users,
} from "../../../../../lib/db";

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

interface CreatorCollaborationWorkRecord {
  id: string;
  ownerUserId: string;
  title: string;
  createdAt: Date | null;
  updatedAt: Date | null;
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

export type CreatorCollaborationForbiddenCode = "team_access_denied" | "member_management_denied";

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
  | "owner_or_self_target"
  | "target_user_unavailable";

export class CreatorCollaborationInvalidTargetError extends Error {
  constructor(readonly code: CreatorCollaborationInvalidTargetCode) {
    super(code);
    this.name = "CreatorCollaborationInvalidTargetError";
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

function boundedCollaborationListLimit(value: number): number {
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 50) : 20;
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
