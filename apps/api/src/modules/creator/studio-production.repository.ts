import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import {
  creatorStudioPersonalKits,
  creatorWorkCollaborators,
  creatorWorkProductionWorkspaces,
  creatorWorkReviewFeedback,
  creatorWorkReviewLinks,
  creatorWorks,
  db,
  studioArtifacts,
  studioProjectGraphs,
  studioRevisions,
  studioReviewComments,
  studioReviewCommentAssignees,
  studioReviews,
  users,
} from "../../db";
import { resolveCreatorCollaborationAccess } from "./creator-collaboration.policy";
import {
  StudioPersonalKitDocumentSchema,
  StudioProductionWorkspaceDocumentSchema,
} from "./studio-production.dto";
import { StudioProductionReviewReferenceError, validateStudioProductionReviewChanges } from "./studio-production-review-reference";

import type { CreatorCollaborationAccess } from "./creator-collaboration.policy";
import type {
  CreateStudioReviewLinkInput,
  StudioPersonalKitDocument,
  StudioProductionWorkspaceDocument,
  StudioReviewFeedbackInput,
  StudioReviewLinkRole,
} from "./studio-production.dto";

export { StudioProductionReviewReferenceError } from "./studio-production-review-reference";

export const STUDIO_PRODUCTION_REPOSITORY = Symbol("STUDIO_PRODUCTION_REPOSITORY");
const MAX_ACTIVE_REVIEW_LINKS = 50;
const MAX_REVIEW_FEEDBACK = 1_000;
export interface StudioProductionCapabilities {
  readonly view: boolean;
  readonly edit: boolean;
  readonly manageLinks: boolean;
  readonly manageRoles: boolean;
  readonly approve: boolean;
  readonly publish: boolean;
}

export interface StudioProductionWorkspaceSnapshot {
  readonly workId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly capabilities: StudioProductionCapabilities;
  readonly document: StudioProductionWorkspaceDocument;
}

export interface StudioPersonalKitSnapshot {
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: StudioPersonalKitDocument;
}

export interface StudioReviewLinkSummary {
  readonly id: string;
  readonly workId: string;
  readonly role: StudioReviewLinkRole;
  readonly pageIds: readonly string[];
  readonly watermark: boolean;
  readonly allowDownload: boolean;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface StudioCreatedReviewLink extends StudioReviewLinkSummary {
  /** Returned once. Only its SHA-256 digest is persisted. */
  readonly token: string;
}
export interface StudioExternalReviewPage {
  readonly id: string;
  readonly index: number;
  readonly source: string;
}

export interface StudioExternalReviewFeedback {
  readonly id: string;
  readonly kind: "comment" | "approve" | "reject";
  readonly reviewerName: string;
  readonly anchor: { readonly pageId: string; readonly x?: number; readonly y?: number } | null;
  readonly body: string;
  readonly createdAt: string;
}

export interface StudioExternalReviewSnapshot {
  readonly link: Omit<StudioReviewLinkSummary, "workId" | "revokedAt" | "createdAt">;
  readonly work: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly cover: string;
    readonly pages: readonly StudioExternalReviewPage[];
  };
  readonly feedback: readonly StudioExternalReviewFeedback[];
}

export interface StudioProductionRepository {
  getWorkspace(actorUserId: string, workId: string): Promise<StudioProductionWorkspaceSnapshot>;
  saveWorkspace(actorUserId: string, workId: string, baseRevision: number,
    document: StudioProductionWorkspaceDocument): Promise<StudioProductionWorkspaceSnapshot>;
  getPersonalKit(userId: string): Promise<StudioPersonalKitSnapshot>;
  savePersonalKit(userId: string, baseRevision: number,
    document: StudioPersonalKitDocument): Promise<StudioPersonalKitSnapshot>;
  listReviewLinks(actorUserId: string, workId: string): Promise<readonly StudioReviewLinkSummary[]>;
  createReviewLink(actorUserId: string, workId: string,
    input: CreateStudioReviewLinkInput): Promise<StudioCreatedReviewLink>;
  revokeReviewLink(actorUserId: string, workId: string,
    linkId: string): Promise<StudioReviewLinkSummary>;
  getExternalReview(token: string): Promise<StudioExternalReviewSnapshot>;
  addExternalReviewFeedback(token: string, input: StudioReviewFeedbackInput,
    reviewerUserId?: string): Promise<StudioExternalReviewFeedback>;
}

export class StudioProductionNotFoundError extends Error {
  constructor(readonly target: "work" | "review-link" | "user") {
    super(`studio_production_${target}_not_found`);
    this.name = "StudioProductionNotFoundError";
  }
}

export class StudioProductionForbiddenError extends Error {
  constructor(readonly operation:
    | "view"
    | "edit"
    | "manage-links"
    | "manage-roles"
    | "approve"
    | "publish"
    | "comment"
  ) {
    super(`studio_production_${operation}_forbidden`);
    this.name = "StudioProductionForbiddenError";
  }
}

export class StudioProductionRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("studio_production_revision_conflict");
    this.name = "StudioProductionRevisionConflictError";
  }
}

export class StudioReviewLinkUnavailableError extends Error {
  constructor(readonly reason: "invalid" | "expired" | "revoked") {
    super(`studio_review_link_${reason}`);
    this.name = "StudioReviewLinkUnavailableError";
  }
}
export class StudioProductionQuotaError extends Error {
  constructor(readonly quota: "review-links" | "feedback") {
    super(`studio_production_${quota}_quota`);
    this.name = "StudioProductionQuotaError";
  }
}

export class StudioProductionInvalidPageError extends Error {
  constructor(readonly pageId: string) {
    super("studio_production_invalid_page");
    this.name = "StudioProductionInvalidPageError";
  }
}

type StudioProductionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface StudioProductionContext {
  readonly ownerUserId: string;
  readonly title: string;
  readonly pageSources: readonly string[];
  readonly document: unknown;
  readonly access: CreatorCollaborationAccess;
}

function protectedProductionOperation(
  current: StudioProductionWorkspaceDocument,
  next: StudioProductionWorkspaceDocument,
): "manage-roles" | "approve" | "publish" | null {
  if (
    JSON.stringify(current.roleAssignments) !== JSON.stringify(next.roleAssignments)
    || JSON.stringify(current.members) !== JSON.stringify(next.members)
  ) {
    return "manage-roles";
  }
  const currentTasks = new Map(current.tasks.map((task) => [task.id, task] as const));
  const nextTasks = new Map(next.tasks.map((task) => [task.id, task] as const));
  for (const task of next.tasks) {
    const previousStage = currentTasks.get(task.id)?.stage ?? null;
    if (previousStage === task.stage) continue;
    if (previousStage === "publishing" || task.stage === "publishing") return "publish";
    if (previousStage === "approved" || task.stage === "approved") return "approve";
  }
  for (const task of current.tasks) {
    if (nextTasks.has(task.id)) continue;
    if (task.stage === "publishing") return "publish";
    if (task.stage === "approved") return "approve";
  }
  const currentReviews = new Map(current.reviews.map((review) => [review.id, review] as const));
  const nextReviews = new Map(next.reviews.map((review) => [review.id, review] as const));
  for (const review of next.reviews) {
    const previous = currentReviews.get(review.id);
    const approvalBoundaryChanged = !previous
      ? review.approvalRequired && review.status === "resolved"
      : (previous.status !== review.status || previous.approvalRequired !== review.approvalRequired)
        && (previous.approvalRequired || review.approvalRequired);
    if (approvalBoundaryChanged) return "approve";
  }
  if (current.reviews.some((review) => review.approvalRequired && !nextReviews.has(review.id))) {
    return "approve";
  }
  return null;
}

function productionCapabilities(access: CreatorCollaborationAccess): StudioProductionCapabilities {
  return {
    view: access.view,
    edit: access.edit,
    manageLinks: access.manageMembers,
    manageRoles: access.manageMembers,
    approve: access.manageMembers,
    publish: access.manageMembers,
  };
}

export function hashStudioReviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function iso(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("invalid production timestamp");
  return value.toISOString();
}

function emptyProductionDocument(workId: string, title: string, now: Date): StudioProductionWorkspaceDocument {
  return StudioProductionWorkspaceDocumentSchema.parse({
    schemaVersion: 3,
    revision: 0,
    scopeKey: `work:${workId}`,
    title: title.trim() || "웹툰 제작 프로젝트",
    updatedAt: iso(now),
    tasks: [], reviews: [], hierarchy: [], roleAssignments: [], handoffs: [],
    versions: [], slides: [], members: [], inviteToken: null,
  });
}
function emptyPersonalKit(now: Date): StudioPersonalKitDocument {
  return StudioPersonalKitDocumentSchema.parse({
    schemaVersion: 1,
    updatedAt: iso(now),
    workspaceProfiles: [],
    quickAccess: {},
    gestureMap: {
      twoFingerTap: "undo",
      threeFingerTap: "redo",
      longPress: "eyedropper",
    },
    penButtonMap: { primary: "radial-menu", eraserTip: "eraser" },
    touchPolicy: "pen-draw-touch-pan",
    favoriteRefs: [],
  });
}

async function loadContext(
  transaction: StudioProductionTransaction,
  actorUserId: string,
  workId: string,
  lock: boolean,
): Promise<StudioProductionContext> {
  let workQuery = transaction
    .select({
      ownerUserId: creatorWorks.userId,
      title: creatorWorks.title,
      pageSources: creatorWorks.pages,
      document: creatorWorks.doc,
    })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  if (lock) workQuery = workQuery.for("update") as typeof workQuery;
  const [work] = await workQuery;
  if (!work) throw new StudioProductionNotFoundError("work");
  const [membership] = actorUserId === work.ownerUserId ? [] : await transaction
    .select({
      userId: creatorWorkCollaborators.userId,
      role: creatorWorkCollaborators.role,
      status: creatorWorkCollaborators.status,
    })
    .from(creatorWorkCollaborators)
    .where(and(
      eq(creatorWorkCollaborators.workId, workId),
      eq(creatorWorkCollaborators.userId, actorUserId),
    ))
    .limit(1);
  return {
    ownerUserId: work.ownerUserId,
    title: work.title,
    pageSources: work.pageSources,
    document: work.document,
    access: resolveCreatorCollaborationAccess({
      actorUserId,
      ownerUserId: work.ownerUserId,
      membership: membership ?? null,
    }),
  };
}

function requireAccess(
  access: CreatorCollaborationAccess,
  operation: "view" | "edit" | "manage-links",
): void {
  const allowed = operation === "view"
    ? access.view
    : operation === "edit"
      ? access.edit
      : access.manageMembers;
  if (!allowed) throw new StudioProductionForbiddenError(operation);
}

function reviewLinkSummary(row: {
  id: string; workId: string; role: string; pageIds: string[];
  watermark: boolean; allowDownload: boolean; expiresAt: Date;
  revokedAt: Date | null; createdAt: Date;
}): StudioReviewLinkSummary {
  if (row.role !== "viewer" && row.role !== "commenter") {
    throw new Error("invalid review link role");
  }
  return {
    id: row.id,
    workId: row.workId,
    role: row.role,
    pageIds: row.pageIds,
    watermark: row.watermark,
    allowDownload: row.allowDownload,
    expiresAt: iso(row.expiresAt),
    revokedAt: row.revokedAt ? iso(row.revokedAt) : null,
    createdAt: iso(row.createdAt),
  };
}

function validReviewPageId(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 160
    || value.trim() !== value
    || value.includes("\\")
  ) {
    return false;
  }
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

function projectExternalReviewPages(
  pageSources: readonly string[],
  document: unknown,
): StudioExternalReviewPage[] {
  const rawDocument = document && typeof document === "object" && !Array.isArray(document)
    ? document as Record<string, unknown>
    : {};
  const rawPages = Array.isArray(rawDocument.pagesList) ? rawDocument.pagesList : [];
  const usedPageIds = new Set<string>();
  return pageSources.map((source, index) => {
    const rawPage = rawPages[index];
    const rawId = rawPage && typeof rawPage === "object" && !Array.isArray(rawPage)
      ? (rawPage as Record<string, unknown>).id
      : null;
    const fallbackId = `page-${index + 1}`;
    let pageId = validReviewPageId(rawId) ? rawId : fallbackId;
    if (usedPageIds.has(pageId)) {
      pageId = fallbackId;
      let suffix = 2;
      while (usedPageIds.has(pageId)) {
        pageId = `${fallbackId}-${suffix}`;
        suffix += 1;
      }
    }
    usedPageIds.add(pageId);
    return { id: pageId, index, source };
  });
}

interface StudioProductionRepositoryOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly createToken?: () => string;
}

export class DrizzleStudioProductionRepository implements StudioProductionRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createToken: () => string;

  constructor(options: StudioProductionRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async getWorkspace(
    actorUserId: string,
    workId: string,
  ): Promise<StudioProductionWorkspaceSnapshot> {
    return db.transaction(async (transaction) => {
      const context = await loadContext(transaction, actorUserId, workId, false);
      requireAccess(context.access, "view");
      const [stored] = await transaction
        .select({
          revision: creatorWorkProductionWorkspaces.revision,
          document: creatorWorkProductionWorkspaces.document,
          updatedAt: creatorWorkProductionWorkspaces.updatedAt,
        })
        .from(creatorWorkProductionWorkspaces)
        .where(eq(creatorWorkProductionWorkspaces.workId, workId))
        .limit(1);
      const document = stored
        ? StudioProductionWorkspaceDocumentSchema.parse(stored.document)
        : emptyProductionDocument(workId, context.title, this.now());
      return {
        workId,
        revision: stored?.revision ?? 0,
        updatedAt: stored ? iso(stored.updatedAt) : document.updatedAt,
        capabilities: productionCapabilities(context.access),
        document,
      };
    });
  }
  async saveWorkspace(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    document: StudioProductionWorkspaceDocument,
  ): Promise<StudioProductionWorkspaceSnapshot> {
    return db.transaction(async (transaction) => {
      const context = await loadContext(transaction, actorUserId, workId, true);
      requireAccess(context.access, "edit");
      const [stored] = await transaction
        .select({
          revision: creatorWorkProductionWorkspaces.revision,
          document: creatorWorkProductionWorkspaces.document,
        })
        .from(creatorWorkProductionWorkspaces)
        .where(eq(creatorWorkProductionWorkspaces.workId, workId))
        .limit(1);
      const currentRevision = stored?.revision ?? 0;
      if (currentRevision !== baseRevision) {
        throw new StudioProductionRevisionConflictError(currentRevision);
      }
      if ([...document.tasks, ...document.versions.flatMap((version) => version.tasks)]
        .some((task) => task.reviewRef && task.reviewRef.subject.workId !== workId)) {
        throw new StudioProductionReviewReferenceError("reference");
      }
      const now = this.now();
      const nextRevision = currentRevision + 1;
      const canonical = StudioProductionWorkspaceDocumentSchema.parse({
        ...document,
        revision: nextRevision,
        scopeKey: `work:${workId}`,
        updatedAt: iso(now),
        inviteToken: null,
      });
      const currentDocument = stored
        ? StudioProductionWorkspaceDocumentSchema.parse(stored.document)
        : emptyProductionDocument(workId, context.title, now);
      if (!context.access.manageMembers) {
        const protectedOperation = protectedProductionOperation(currentDocument, canonical);
        if (protectedOperation) throw new StudioProductionForbiddenError(protectedOperation);
      }
      await validateStudioProductionReviewChanges(currentDocument, canonical, {
        readReference: async (reference) => {
          const pin = reference.subject;
          const rows = await transaction.select({ id: studioReviewComments.id })
            .from(studioReviewComments)
            .innerJoin(studioReviews, eq(studioReviewComments.reviewId, studioReviews.id))
            .innerJoin(studioRevisions, and(eq(studioReviews.revisionId, studioRevisions.id), eq(studioReviews.artifactId, studioRevisions.artifactId)))
            .innerJoin(studioArtifacts, eq(studioRevisions.artifactId, studioArtifacts.id))
            .innerJoin(studioProjectGraphs, eq(studioArtifacts.projectId, studioProjectGraphs.id))
            .where(and(eq(studioProjectGraphs.workId, workId), eq(studioProjectGraphs.id, pin.projectId),
              eq(studioArtifacts.id, pin.artifactId), eq(studioReviews.id, pin.reviewId),
              eq(studioRevisions.id, pin.revisionId), eq(studioRevisions.kind, "review-snapshot"),
              eq(studioRevisions.rootGraphHash, pin.rootGraphHash), eq(studioReviewComments.id, reference.commentId),
              sql`${studioReviewComments.anchor}->>'artifactId' = ${pin.artifactId}`,
              sql`${studioReviewComments.anchor}->>'revisionId' = ${pin.revisionId}`))
            .limit(1).for("share", { of: [studioReviewComments, studioReviews, studioRevisions, studioArtifacts, studioProjectGraphs] });
          if (!rows.length) return null;
          const assignees = await transaction.select({ userId: studioReviewCommentAssignees.assigneeUserId })
            .from(studioReviewCommentAssignees).where(eq(studioReviewCommentAssignees.commentId, reference.commentId)).for("share");
          return assignees.map((row) => row.userId);
        },
        readEligibleUserIds: async () => {
          const members = await transaction.select({ userId: creatorWorkCollaborators.userId })
            .from(creatorWorkCollaborators).where(and(eq(creatorWorkCollaborators.workId, workId),
              eq(creatorWorkCollaborators.status, "active"), sql`${creatorWorkCollaborators.role} IN ('admin', 'editor')`)).for("share");
          return [context.ownerUserId, ...members.map((member) => member.userId)];
        },
      });
      await transaction
        .insert(creatorWorkProductionWorkspaces)
        .values({
          workId,
          revision: nextRevision,
          document: canonical,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: creatorWorkProductionWorkspaces.workId,
          set: {
            revision: nextRevision,
            document: canonical,
            updatedBy: actorUserId,
            updatedAt: now,
          },
        });
      return {
        workId,
        revision: nextRevision,
        updatedAt: iso(now),
        capabilities: productionCapabilities(context.access),
        document: canonical,
      };
    });
  }

  async getPersonalKit(userId: string): Promise<StudioPersonalKitSnapshot> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new StudioProductionNotFoundError("user");
    const [stored] = await db
      .select({
        revision: creatorStudioPersonalKits.revision,
        document: creatorStudioPersonalKits.document,
        updatedAt: creatorStudioPersonalKits.updatedAt,
      })
      .from(creatorStudioPersonalKits)
      .where(eq(creatorStudioPersonalKits.userId, userId))
      .limit(1);
    const document = stored
      ? StudioPersonalKitDocumentSchema.parse(stored.document)
      : emptyPersonalKit(this.now());
    return {
      revision: stored?.revision ?? 0,
      updatedAt: stored ? iso(stored.updatedAt) : document.updatedAt,
      document,
    };
  }

  async savePersonalKit(
    userId: string,
    baseRevision: number,
    document: StudioPersonalKitDocument,
  ): Promise<StudioPersonalKitSnapshot> {
    return db.transaction(async (transaction) => {
      const [user] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for("update");
      if (!user) throw new StudioProductionNotFoundError("user");
      const [stored] = await transaction
        .select({ revision: creatorStudioPersonalKits.revision })
        .from(creatorStudioPersonalKits)
        .where(eq(creatorStudioPersonalKits.userId, userId))
        .limit(1);
      const currentRevision = stored?.revision ?? 0;
      if (currentRevision !== baseRevision) {
        throw new StudioProductionRevisionConflictError(currentRevision);
      }
      const now = this.now();
      const nextRevision = currentRevision + 1;
      const canonical = StudioPersonalKitDocumentSchema.parse({
        ...document,
        updatedAt: iso(now),
      });
      await transaction
        .insert(creatorStudioPersonalKits)
        .values({
          userId,
          revision: nextRevision,
          document: canonical,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: creatorStudioPersonalKits.userId,
          set: { revision: nextRevision, document: canonical, updatedAt: now },
        });
      return { revision: nextRevision, updatedAt: iso(now), document: canonical };
    });
  }

  async listReviewLinks(
    actorUserId: string,
    workId: string,
  ): Promise<readonly StudioReviewLinkSummary[]> {
    return db.transaction(async (transaction) => {
      const context = await loadContext(transaction, actorUserId, workId, false);
      requireAccess(context.access, "manage-links");
      const rows = await transaction
        .select()
        .from(creatorWorkReviewLinks)
        .where(eq(creatorWorkReviewLinks.workId, workId))
        .orderBy(desc(creatorWorkReviewLinks.createdAt))
        .limit(100);
      return rows.map(reviewLinkSummary);
    });
  }
  async createReviewLink(
    actorUserId: string,
    workId: string,
    input: CreateStudioReviewLinkInput,
  ): Promise<StudioCreatedReviewLink> {
    return db.transaction(async (transaction) => {
      const context = await loadContext(transaction, actorUserId, workId, true);
      requireAccess(context.access, "manage-links");
      const availablePageIds = new Set(
        projectExternalReviewPages(context.pageSources, context.document).map((page) => page.id),
      );
      const invalidPageId = input.pageIds.find((pageId) => !availablePageIds.has(pageId));
      if (invalidPageId) throw new StudioProductionInvalidPageError(invalidPageId);
      const now = this.now();
      const [{ value: activeCount = 0 } = { value: 0 }] = await transaction
        .select({ value: count() })
        .from(creatorWorkReviewLinks)
        .where(and(
          eq(creatorWorkReviewLinks.workId, workId),
          isNull(creatorWorkReviewLinks.revokedAt),
          sql`${creatorWorkReviewLinks.expiresAt} > ${now}`,
        ));
      if (activeCount >= MAX_ACTIVE_REVIEW_LINKS) {
        throw new StudioProductionQuotaError("review-links");
      }
      const token = this.createToken();
      const createdAt = now;
      const expiresAt = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1_000);
      const row = {
        id: this.createId(),
        workId,
        tokenHash: hashStudioReviewToken(token),
        role: input.role,
        pageIds: [...input.pageIds],
        watermark: input.watermark,
        allowDownload: input.allowDownload,
        expiresAt,
        revokedAt: null,
        createdBy: actorUserId,
        createdAt,
        updatedAt: createdAt,
      };
      await transaction.insert(creatorWorkReviewLinks).values(row);
      return { ...reviewLinkSummary(row), token };
    });
  }

  async revokeReviewLink(
    actorUserId: string,
    workId: string,
    linkId: string,
  ): Promise<StudioReviewLinkSummary> {
    return db.transaction(async (transaction) => {
      const context = await loadContext(transaction, actorUserId, workId, true);
      requireAccess(context.access, "manage-links");
      const [link] = await transaction
        .select()
        .from(creatorWorkReviewLinks)
        .where(and(
          eq(creatorWorkReviewLinks.id, linkId),
          eq(creatorWorkReviewLinks.workId, workId),
        ))
        .limit(1);
      if (!link) throw new StudioProductionNotFoundError("review-link");
      if (link.revokedAt) return reviewLinkSummary(link);
      const now = this.now();
      const [updated] = await transaction
        .update(creatorWorkReviewLinks)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(
          eq(creatorWorkReviewLinks.id, linkId),
          eq(creatorWorkReviewLinks.workId, workId),
          isNull(creatorWorkReviewLinks.revokedAt),
        ))
        .returning();
      return reviewLinkSummary(updated ?? { ...link, revokedAt: now, updatedAt: now });
    });
  }

  async getExternalReview(token: string): Promise<StudioExternalReviewSnapshot> {
    const now = this.now();
    const tokenHash = hashStudioReviewToken(token);
    const [record] = await db
      .select({
        link: creatorWorkReviewLinks,
        workId: creatorWorks.id,
        title: creatorWorks.title,
        description: creatorWorks.description,
        cover: creatorWorks.cover,
        pages: creatorWorks.pages,
        doc: creatorWorks.doc,
      })
      .from(creatorWorkReviewLinks)
      .innerJoin(creatorWorks, eq(creatorWorks.id, creatorWorkReviewLinks.workId))
      .where(eq(creatorWorkReviewLinks.tokenHash, tokenHash))
      .limit(1);
    if (!record) throw new StudioReviewLinkUnavailableError("invalid");
    if (record.link.revokedAt) throw new StudioReviewLinkUnavailableError("revoked");
    if (record.link.expiresAt.getTime() <= now.getTime()) {
      throw new StudioReviewLinkUnavailableError("expired");
    }
    const allowed = new Set(record.link.pageIds);
    const pages = projectExternalReviewPages(record.pages, record.doc)
      .filter((page) => allowed.size === 0 || allowed.has(page.id));
    const feedbackRows = await db
      .select()
      .from(creatorWorkReviewFeedback)
      .where(eq(creatorWorkReviewFeedback.reviewLinkId, record.link.id))
      .orderBy(creatorWorkReviewFeedback.createdAt, creatorWorkReviewFeedback.id)
      .limit(MAX_REVIEW_FEEDBACK);
    const summary = reviewLinkSummary(record.link);
    return {
      link: {
        id: summary.id,
        role: summary.role,
        pageIds: summary.pageIds,
        watermark: summary.watermark,
        allowDownload: summary.allowDownload,
        expiresAt: summary.expiresAt,
      },
      work: {
        id: record.workId,
        title: record.title,
        description: record.description,
        cover: record.cover,
        pages,
      },
      feedback: feedbackRows.map(projectFeedback),
    };
  }
  async addExternalReviewFeedback(
    token: string,
    input: StudioReviewFeedbackInput,
    reviewerUserId?: string,
  ): Promise<StudioExternalReviewFeedback> {
    return db.transaction(async (transaction) => {
      const now = this.now();
      const tokenHash = hashStudioReviewToken(token);
      const [link] = await transaction
        .select()
        .from(creatorWorkReviewLinks)
        .where(eq(creatorWorkReviewLinks.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (!link) throw new StudioReviewLinkUnavailableError("invalid");
      if (link.revokedAt) throw new StudioReviewLinkUnavailableError("revoked");
      if (link.expiresAt.getTime() <= now.getTime()) {
        throw new StudioReviewLinkUnavailableError("expired");
      }
      if (link.role !== "commenter") {
        throw new StudioProductionForbiddenError("comment");
      }
      if (input.anchor) {
        const [work] = await transaction
          .select({ pageSources: creatorWorks.pages, document: creatorWorks.doc })
          .from(creatorWorks)
          .where(eq(creatorWorks.id, link.workId))
          .limit(1);
        const availablePageIds = new Set(
          work ? projectExternalReviewPages(work.pageSources, work.document).map((page) => page.id) : [],
        );
        const pageIsShared = link.pageIds.length === 0 || link.pageIds.includes(input.anchor.pageId);
        if (!pageIsShared || !availablePageIds.has(input.anchor.pageId)) {
          throw new StudioProductionForbiddenError("comment");
        }
      }
      const [{ value: feedbackCount = 0 } = { value: 0 }] = await transaction
        .select({ value: count() })
        .from(creatorWorkReviewFeedback)
        .where(eq(creatorWorkReviewFeedback.reviewLinkId, link.id));
      if (feedbackCount >= MAX_REVIEW_FEEDBACK) {
        throw new StudioProductionQuotaError("feedback");
      }
      const row = {
        id: this.createId(),
        reviewLinkId: link.id,
        kind: input.kind,
        reviewerName: input.reviewerName,
        reviewerUserId: reviewerUserId ?? null,
        anchor: input.anchor,
        body: input.body,
        createdAt: now,
      };
      await transaction.insert(creatorWorkReviewFeedback).values(row);
      return projectFeedback(row);
    });
  }
}
function projectFeedback(row: {
  id: string;
  kind: string;
  reviewerName: string;
  anchor: { pageId: string; x?: number; y?: number } | null;
  body: string;
  createdAt: Date;
}): StudioExternalReviewFeedback {
  if (row.kind !== "comment" && row.kind !== "approve" && row.kind !== "reject") {
    throw new Error("invalid review feedback kind");
  }
  return {
    id: row.id,
    kind: row.kind,
    reviewerName: row.reviewerName,
    anchor: row.anchor,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}

export const studioProductionRepositoryTestHelpers = {
  protectedProductionOperation,
  projectExternalReviewPages,
};

export const studioProductionRepositoryProvider = {
  provide: STUDIO_PRODUCTION_REPOSITORY,
  useFactory: (): StudioProductionRepository => new DrizzleStudioProductionRepository(),
};
