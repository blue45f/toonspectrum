import { and, eq } from "drizzle-orm";
import { Injectable } from "@nestjs/common";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import {
  creatorWorkCollaborators,
  creatorWorks,
  db,
  productionProjectEvents,
  productionProjectMutationReceipts,
  productionProjects,
} from "../../db";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";

export interface ProductionProjectAccess {
  readonly view: boolean;
  readonly comment: boolean;
  readonly edit: boolean;
  readonly manage: boolean;
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface ProductionProjectRecord {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
}

export interface ProductionMutationResponse {
  readonly aggregate: ProductionProjectAggregate;
  readonly derived?: unknown;
}

export class ProductionProjectNotFoundError extends Error {
  constructor(readonly target: "work" | "project") {
    super(`production_${target}_not_found`);
    this.name = "ProductionProjectNotFoundError";
  }
}

export class ProductionProjectForbiddenError extends Error {
  constructor(readonly operation: "view" | "create" | "edit" | "manage") {
    super(`production_${operation}_forbidden`);
    this.name = "ProductionProjectForbiddenError";
  }
}

export class ProductionProjectRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("production_revision_conflict");
    this.name = "ProductionProjectRevisionConflictError";
  }
}

export class ProductionProjectMutationConflictError extends Error {
  constructor() {
    super("production_mutation_conflict");
    this.name = "ProductionProjectMutationConflictError";
  }
}

export class ProductionProjectIdentityConflictError extends Error {
  constructor(readonly code: "project_exists" | "work_already_linked") {
    super(code);
    this.name = "ProductionProjectIdentityConflictError";
  }
}

interface ProjectRow {
  id: string;
  workId: string;
  revision: number;
  aggregate: ProductionProjectAggregate;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

function accessProjection(input: {
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly membershipRole: string | null;
  readonly membershipStatus: string | null;
}): ProductionProjectAccess {
  const owner = input.actorUserId === input.ownerUserId;
  const role = owner
    ? "owner" as const
    : input.membershipRole === "admin"
      || input.membershipRole === "editor"
      || input.membershipRole === "commenter"
      || input.membershipRole === "viewer"
      ? input.membershipRole
      : null;
  const access = resolveCreatorCollaborationAccess({
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    membership: role && role !== "owner"
      ? { userId: input.actorUserId, role, status: input.membershipStatus }
      : null,
  });
  return Object.freeze({
    view: access.view,
    comment: access.comment,
    edit: access.edit,
    manage: access.manageMembers,
    owner,
    role,
  });
}

async function loadAccess(
  executor: Executor,
  actorUserId: string,
  workId: string,
): Promise<ProductionProjectAccess | null> {
  const rows = await executor
    .select({
      ownerUserId: creatorWorks.userId,
      membershipRole: creatorWorkCollaborators.role,
      membershipStatus: creatorWorkCollaborators.status,
    })
    .from(creatorWorks)
    .leftJoin(
      creatorWorkCollaborators,
      and(
        eq(creatorWorkCollaborators.workId, creatorWorks.id),
        eq(creatorWorkCollaborators.userId, actorUserId),
      ),
    )
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  const row = rows[0];
  return row
    ? accessProjection({ actorUserId, ...row })
    : null;
}

async function loadProjectRow(
  executor: Executor,
  projectId: string,
  lock: boolean,
): Promise<ProjectRow | null> {
  const query = executor
    .select({
      id: productionProjects.id,
      workId: productionProjects.workId,
      revision: productionProjects.revision,
      aggregate: productionProjects.aggregate,
    })
    .from(productionProjects)
    .where(eq(productionProjects.id, projectId))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  return rows[0] ?? null;
}

function assertAggregateRow(row: ProjectRow): void {
  if (
    !row.aggregate
    || row.aggregate.projectId !== row.id
    || row.aggregate.workId !== row.workId
    || row.aggregate.revision !== row.revision
    || row.aggregate.modelVersion !== 1
  ) {
    throw new Error("production project aggregate row is inconsistent");
  }
}

@Injectable()
export class ProductionCollaborationRepository {
  async getProject(
    actorUserId: string,
    projectId: string,
  ): Promise<ProductionProjectRecord> {
    const row = await loadProjectRow(db, projectId, false);
    if (!row) throw new ProductionProjectNotFoundError("project");
    assertAggregateRow(row);
    const access = await loadAccess(db, actorUserId, row.workId);
    if (!access?.view) throw new ProductionProjectForbiddenError("view");
    return { aggregate: row.aggregate, access };
  }

  async getProjectByWork(
    actorUserId: string,
    workId: string,
  ): Promise<ProductionProjectRecord> {
    const rows = await db
      .select({
        id: productionProjects.id,
        workId: productionProjects.workId,
        revision: productionProjects.revision,
        aggregate: productionProjects.aggregate,
      })
      .from(productionProjects)
      .where(eq(productionProjects.workId, workId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ProductionProjectNotFoundError("project");
    assertAggregateRow(row);
    const access = await loadAccess(db, actorUserId, workId);
    if (!access?.view) throw new ProductionProjectForbiddenError("view");
    return { aggregate: row.aggregate, access };
  }

  async createProject(input: {
    readonly actorUserId: string;
    readonly aggregate: ProductionProjectAggregate;
    readonly mutationId: string;
    readonly requestDigest: string;
  }): Promise<ProductionMutationResponse> {
    return db.transaction(async (transaction) => {
      const existingReceipt = await transaction
        .select({
          requestDigest: productionProjectMutationReceipts.requestDigest,
          response: productionProjectMutationReceipts.response,
        })
        .from(productionProjectMutationReceipts)
        .where(and(
          eq(productionProjectMutationReceipts.projectId, input.aggregate.projectId),
          eq(productionProjectMutationReceipts.actorUserId, input.actorUserId),
          eq(productionProjectMutationReceipts.mutationId, input.mutationId),
        ))
        .limit(1);
      if (existingReceipt[0]) {
        if (existingReceipt[0].requestDigest !== input.requestDigest) {
          throw new ProductionProjectMutationConflictError();
        }
        return existingReceipt[0].response;
      }

      const workRows = await transaction
        .select({ ownerUserId: creatorWorks.userId })
        .from(creatorWorks)
        .where(eq(creatorWorks.id, input.aggregate.workId))
        .limit(1)
        .for("update");
      const work = workRows[0];
      if (!work) throw new ProductionProjectNotFoundError("work");
      if (work.ownerUserId !== input.actorUserId) {
        throw new ProductionProjectForbiddenError("create");
      }

      const duplicateByProject = await loadProjectRow(transaction, input.aggregate.projectId, true);
      if (duplicateByProject) throw new ProductionProjectIdentityConflictError("project_exists");
      const duplicateByWork = await transaction
        .select({ id: productionProjects.id })
        .from(productionProjects)
        .where(eq(productionProjects.workId, input.aggregate.workId))
        .limit(1)
        .for("update");
      if (duplicateByWork[0]) throw new ProductionProjectIdentityConflictError("work_already_linked");

      await transaction.insert(productionProjects).values({
        id: input.aggregate.projectId,
        workId: input.aggregate.workId,
        organizationId: input.aggregate.organizationId,
        title: input.aggregate.title,
        collaborationModel: input.aggregate.collaborationModel,
        modelVersion: input.aggregate.modelVersion,
        revision: input.aggregate.revision,
        aggregate: input.aggregate,
        createdBy: input.actorUserId,
        createdAt: new Date(input.aggregate.createdAt),
        updatedAt: new Date(input.aggregate.updatedAt),
      });
      const event = input.aggregate.auditEvents.at(-1);
      if (!event || event.aggregateRevision !== input.aggregate.revision) {
        throw new Error("production project creation requires a matching audit event");
      }
      await transaction.insert(productionProjectEvents).values({
        id: event.id,
        projectId: event.projectId,
        aggregateRevision: event.aggregateRevision,
        actorUserId: input.actorUserId,
        actorPartyId: event.actorPartyId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        beforeDigest: event.beforeDigest,
        afterDigest: event.afterDigest,
        reason: event.reason,
        occurredAt: new Date(event.occurredAt),
      });
      const response = Object.freeze({ aggregate: input.aggregate });
      await transaction.insert(productionProjectMutationReceipts).values({
        projectId: input.aggregate.projectId,
        actorUserId: input.actorUserId,
        mutationId: input.mutationId,
        requestDigest: input.requestDigest,
        resultRevision: input.aggregate.revision,
        response,
      });
      return response;
    });
  }

  async mutateProject(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly expectedRevision: number;
    readonly mutationId: string;
    readonly requestDigest: string;
    readonly requiredCapability?: "comment" | "edit" | "manage";
    readonly mutate: (
      aggregate: ProductionProjectAggregate,
      access: ProductionProjectAccess,
    ) => ProductionMutationResponse;
  }): Promise<ProductionMutationResponse> {
    return db.transaction(async (transaction) => {
      const row = await loadProjectRow(transaction, input.projectId, true);
      if (!row) throw new ProductionProjectNotFoundError("project");
      assertAggregateRow(row);
      const access = await loadAccess(transaction, input.actorUserId, row.workId);
      const requiredCapability = input.requiredCapability ?? "edit";
      if (!access || (requiredCapability === "comment" && !access.comment)) {
        throw new ProductionProjectForbiddenError("edit");
      }
      if (requiredCapability === "edit" && !access.edit) {
        throw new ProductionProjectForbiddenError("edit");
      }
      if (requiredCapability === "manage" && !access.manage) {
        throw new ProductionProjectForbiddenError("manage");
      }

      const receiptRows = await transaction
        .select({
          requestDigest: productionProjectMutationReceipts.requestDigest,
          response: productionProjectMutationReceipts.response,
        })
        .from(productionProjectMutationReceipts)
        .where(and(
          eq(productionProjectMutationReceipts.projectId, input.projectId),
          eq(productionProjectMutationReceipts.actorUserId, input.actorUserId),
          eq(productionProjectMutationReceipts.mutationId, input.mutationId),
        ))
        .limit(1);
      const receipt = receiptRows[0];
      if (receipt) {
        if (receipt.requestDigest !== input.requestDigest) {
          throw new ProductionProjectMutationConflictError();
        }
        return receipt.response;
      }
      if (row.revision !== input.expectedRevision) {
        throw new ProductionProjectRevisionConflictError(row.revision);
      }

      const response = input.mutate(row.aggregate, access);
      const aggregate = response.aggregate;
      if (
        aggregate.projectId !== row.id
        || aggregate.workId !== row.workId
        || aggregate.revision !== row.revision + 1
        || aggregate.modelVersion !== 1
      ) {
        throw new Error("production mutation returned an invalid aggregate revision");
      }
      const event = aggregate.auditEvents.at(-1);
      if (!event || event.aggregateRevision !== aggregate.revision) {
        throw new Error("production mutation requires a matching append-only audit event");
      }

      const updated = await transaction
        .update(productionProjects)
        .set({
          title: aggregate.title,
          organizationId: aggregate.organizationId,
          collaborationModel: aggregate.collaborationModel,
          revision: aggregate.revision,
          aggregate,
          updatedAt: new Date(aggregate.updatedAt),
        })
        .where(and(
          eq(productionProjects.id, row.id),
          eq(productionProjects.revision, row.revision),
        ))
        .returning({ revision: productionProjects.revision });
      if (updated[0]?.revision !== aggregate.revision) {
        throw new ProductionProjectRevisionConflictError(row.revision);
      }

      await transaction.insert(productionProjectEvents).values({
        id: event.id,
        projectId: event.projectId,
        aggregateRevision: event.aggregateRevision,
        actorUserId: input.actorUserId,
        actorPartyId: event.actorPartyId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        beforeDigest: event.beforeDigest,
        afterDigest: event.afterDigest,
        reason: event.reason,
        occurredAt: new Date(event.occurredAt),
      });
      await transaction.insert(productionProjectMutationReceipts).values({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        mutationId: input.mutationId,
        requestDigest: input.requestDigest,
        resultRevision: aggregate.revision,
        response,
      });
      return response;
    });
  }
}
