import { eq } from "drizzle-orm";

import {
  creatorPublicationCommentsAllowed,
  creatorPublicationRemixAllowed,
  isCreatorPublicationDirectlyReadable,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  type CreatorPublicationValidationIssue,
} from "../../../../web/src/shared/lib/creator-publication-contract";
import { creatorWorks, db } from "../../db";

import {
  CreatorPublicationValidationError,
  createWork as createPublicationWork,
  getWork as getPublicationWork,
  updateWork as updatePublicationWork,
} from "./publication";
import {
  addComment as addPublicationComment,
  listComments as listPublicationComments,
  toggleLike as togglePublicationLike,
} from "./work-social";
import {
  parseStatus,
  type CreatorWorkDetail,
  type CreatorWorkInput,
  type CreatorWorkMutationResult,
  type CreatorWorkStatus,
} from "./works-contract";

interface CreatorPublicationPolicyRow {
  id: string;
  ownerId: string;
  status: CreatorWorkStatus;
  hidden: boolean;
  doc: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function referenceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function publicationPolicyRow(
  workId: string,
): Promise<CreatorPublicationPolicyRow | null> {
  const [row] = await db
    .select({
      id: creatorWorks.id,
      ownerId: creatorWorks.userId,
      status: creatorWorks.status,
      hidden: creatorWorks.hidden,
      doc: creatorWorks.doc,
    })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  return row ?? null;
}

/** Raw creator JSON must be checked before public projection removes a private directive. */
export function isCreatorPublicationPolicyRowReadable(
  row: Pick<CreatorPublicationPolicyRow, "status" | "hidden" | "doc">,
): boolean {
  return (
    row.status === "published" &&
    !row.hidden &&
    isCreatorPublicationDirectlyReadable(row.doc)
  );
}

function challengeVisibilityIssue(): CreatorPublicationValidationIssue {
  return {
    code: "CHALLENGE_REQUIRES_PUBLIC",
    severity: "error",
    message: "챌린지 참여작은 전체 공개로 게시해야 합니다.",
    path: "challengeId",
  };
}

/**
 * Series/challenge settings can be edited from the public work page without resubmitting status or
 * publication JSON. Guard that path explicitly so an already-published unlisted work cannot enter
 * challenge discovery through a relation-only mutation.
 */
export function assertCreatorPublicationRelationMutationAllowed(
  existing: Pick<CreatorWorkDetail, "status" | "challengeId" | "doc">,
  input: CreatorWorkInput,
): void {
  const nextChallengeId = hasOwn(input, "challengeId")
    ? referenceId(input.challengeId)
    : existing.challengeId;
  if (!nextChallengeId) return;

  const requestedStatus = hasOwn(input, "status")
    ? parseStatus(input.status)
    : existing.status;
  if (requestedStatus !== "published") return;

  const inputDoc = isRecord(input.doc) ? input.doc : null;
  const publicationProvided = inputDoc !== null && hasOwn(inputDoc, "publication");
  const directive = publicationProvided
    ? normalizeCreatorPublicationDirective(inputDoc.publication)
    : readCreatorPublicationDirective(existing.doc);
  if (directive && directive.visibility !== "public") {
    throw new CreatorPublicationValidationError([challengeVisibilityIssue()]);
  }
}

async function assertCreatorPublicationRemixAllowed(
  userId: string,
  remixFromId: unknown,
): Promise<void> {
  const parentId = referenceId(remixFromId);
  if (!parentId) return;
  const parent = await publicationPolicyRow(parentId);
  if (
    !parent ||
    parent.hidden ||
    (parent.ownerId !== userId && !isCreatorPublicationPolicyRowReadable(parent))
  ) {
    throw new Error("원작을 찾을 수 없거나 이어서 편집할 수 없습니다.");
  }
  if (!creatorPublicationRemixAllowed(parent.doc)) {
    throw new Error("원작자가 이 작품의 리믹스를 허용하지 않았습니다.");
  }
}

async function assertReadablePublication(workId: string): Promise<CreatorPublicationPolicyRow> {
  const row = await publicationPolicyRow(workId);
  if (!row || !isCreatorPublicationPolicyRowReadable(row)) {
    throw new Error("작품을 찾을 수 없습니다.");
  }
  return row;
}

export async function getWork(
  id: string,
  viewerId?: string,
): Promise<CreatorWorkDetail | null> {
  const work = await getPublicationWork(id, viewerId);
  if (!work || work.isOwner) return work;
  const policy = await publicationPolicyRow(work.id);
  return policy && isCreatorPublicationPolicyRowReadable(policy) ? work : null;
}

export async function createWork(
  userId: string,
  input: CreatorWorkInput,
): Promise<CreatorWorkMutationResult> {
  await assertCreatorPublicationRemixAllowed(userId, input.remixFromId);
  return createPublicationWork(userId, input);
}

export async function updateWork(
  userId: string,
  id: string,
  input: CreatorWorkInput,
): Promise<CreatorWorkMutationResult> {
  const existing = await getPublicationWork(id, userId);
  if (!existing) throw new Error("작품을 찾을 수 없습니다.");
  assertCreatorPublicationRelationMutationAllowed(existing, input);
  return updatePublicationWork(userId, id, input);
}

export async function addComment(userId: string, workId: string, text: unknown) {
  const policy = await assertReadablePublication(workId);
  if (!creatorPublicationCommentsAllowed(policy.doc)) {
    throw new Error("이 작품은 새 댓글을 받지 않습니다.");
  }
  return addPublicationComment(userId, workId, text);
}

export async function listComments(workId: string, includeHidden = false) {
  await assertReadablePublication(workId);
  return listPublicationComments(workId, includeHidden);
}

export async function toggleLike(userId: string, workId: string) {
  await assertReadablePublication(workId);
  return togglePublicationLike(userId, workId);
}
