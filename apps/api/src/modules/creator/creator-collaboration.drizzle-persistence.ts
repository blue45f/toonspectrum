import { and, asc, count, desc, eq, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  creatorDraftCollaborationRooms,
  creatorWorkCollaborationEvents,
  creatorWorkCollaborators,
  creatorWorkCrdtSnapshots,
  creatorWorkCrdtUpdates,
  creatorWorkRevisions,
  creatorWorks,
  db,
  users,
} from "../../../../../lib/db";
import { CREATOR_WORK_REVISION_MAX } from "../../../../../lib/server/creator-work-revisions";

import { studioCrdtWorkAdvisoryLockQuery } from "./studio-crdt.repository";

import type {
  AppendCreatorCollaborationEventInput,
  CreateCreatorCollaborationMembershipInput,
  CreatorCollaborationAuthorizedEventsRecord,
  CreatorCollaborationEventRecord,
  CreatorCollaborationInvitationRecord,
  CreatorCollaborationMembershipRecord,
  CreatorCollaborationMembershipWithUserRecord,
  CreatorCollaborationPersistence,
  CreatorCollaborationUnitOfWork,
  CreatorCollaborationUserRecord,
  CreatorCollaborationWorkRecord,
  CreatorSharedDocumentMetaRecord,
  CreatorSharedDocumentMutationRecord,
  CreatorSharedDocumentPatch,
  CreatorSharedDocumentRecord,
  CreatorSharedWorkRecord,
  CreatorSharedWorksCursorKey,
  UpdateCreatorCollaborationMembershipInput,
} from "./creator-collaboration.persistence-contract";
import type { CreatorWorkRevisionSnapshot } from "../../../../../lib/server/creator-work-revisions";

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
 * One statement observes the durable CRDT frontier. A compacted snapshot may be ahead of the
 * remaining update rows, while post-compaction updates may be ahead of the snapshot; the save
 * fence therefore compares against their maximum (or zero for a new room).
 */
export function buildCreatorCrdtServerSequenceQuery(
  executor: DrizzleCreatorCollaborationExecutor,
  workId: string
) {
  return executor
    .select({
      serverSequence: sql<string>`(
      greatest(
        coalesce((
          select ${creatorWorkCrdtSnapshots.compactedSequence}
          from ${creatorWorkCrdtSnapshots}
          where ${creatorWorkCrdtSnapshots.workId} = ${workId}
          limit 1
        ), 0::bigint),
        coalesce((
          select max(${creatorWorkCrdtUpdates.sequence})
          from ${creatorWorkCrdtUpdates}
          where ${creatorWorkCrdtUpdates.workId} = ${workId}
        ), 0::bigint)
      )::text
    )`,
    })
    .from(sql`(select 1) as "creator_crdt_sequence_source"`)
    .limit(1);
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

/**
 * Constant-cardinality work/lease probe used by collaboration authorization.
 * The optional marker covers active save-before-collaboration rooms without excluding ordinary
 * saved works. Lock mode targets only creator_work because PostgreSQL cannot lock a nullable
 * outer-join side.
 */
export function buildCreatorCollaborationWorkQuery(
  executor: DrizzleCreatorCollaborationExecutor,
  workId: string,
  lock = false
) {
  const query = executor
    .select({
      id: creatorWorks.id,
      ownerUserId: creatorWorks.userId,
      title: creatorWorks.title,
      createdAt: creatorWorks.createdAt,
      updatedAt: creatorWorks.updatedAt,
      status: creatorWorks.status,
      hidden: creatorWorks.hidden,
      draftCollaborationStatus: creatorDraftCollaborationRooms.status,
      draftCollaborationExpiresAt: creatorDraftCollaborationRooms.expiresAt,
      draftCollaborationOwnerUserId: creatorDraftCollaborationRooms.ownerUserId,
    })
    .from(creatorWorks)
    .leftJoin(
      creatorDraftCollaborationRooms,
      eq(creatorDraftCollaborationRooms.workId, creatorWorks.id)
    )
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  return lock ? query.for("update", { of: creatorWorks }) : query;
}

export class DrizzleCreatorCollaborationUnitOfWork implements CreatorCollaborationUnitOfWork {
  constructor(private readonly executor: DrizzleCreatorCollaborationExecutor) {}

  async acquireStudioCrdtWorkAdvisoryLock(workId: string): Promise<void> {
    await this.executor.execute(studioCrdtWorkAdvisoryLockQuery(workId));
  }

  async getStudioCrdtServerSequence(workId: string): Promise<bigint> {
    const rows = await buildCreatorCrdtServerSequenceQuery(this.executor, workId);
    const value = rows[0]?.serverSequence;
    if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,18})$/.test(value)) {
      throw new Error("invalid creator CRDT server sequence");
    }
    const sequence = BigInt(value);
    if (sequence > BigInt("9223372036854775807")) {
      throw new Error("invalid creator CRDT server sequence");
    }
    return sequence;
  }

  async findWork(workId: string, lock = false): Promise<CreatorCollaborationWorkRecord | null> {
    // Lock only creator_work. PostgreSQL rejects FOR UPDATE against the nullable side of an outer
    // join, and the work row is already the shared first lock for ACL/member mutations.
    const rows = await buildCreatorCollaborationWorkQuery(this.executor, workId, lock);
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

export class DrizzleCreatorCollaborationPersistence implements CreatorCollaborationPersistence {
  async read<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return run(new DrizzleCreatorCollaborationUnitOfWork(db));
  }

  async transaction<T>(run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>): Promise<T> {
    return db.transaction((transaction) =>
      run(new DrizzleCreatorCollaborationUnitOfWork(transaction))
    );
  }
}

export function createDefaultCreatorCollaborationPersistence(): CreatorCollaborationPersistence {
  return new DrizzleCreatorCollaborationPersistence();
}
