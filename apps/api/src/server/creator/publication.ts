import { and, eq, inArray, lt, sql } from "drizzle-orm";

import {
  creatorPublicationCommentsAllowed,
  creatorPublicationRemixAllowed,
  isCreatorPublicationDirectlyReadable,
  isCreatorPublicationDue,
  isCreatorPublicationListable,
  markCreatorPublicationPublished,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  resolveCreatorPublicationStatus,
  validateCreatorPublicationDirective,
  writeCreatorPublicationDirective,
  type CreatorPublicationDirective,
  type CreatorPublicationValidationIssue,
} from "../../../../web/src/shared/lib/creator-publication-contract";
import { creatorWorks, db } from "../../db";
import { CREATOR_WORK_REVISION_MAX, CreatorWorkRevisionConflictError } from "../creator-work-revisions";

import {
  getChallenge as rawGetChallenge,
  listChallenges as rawListChallenges,
  type CreatorChallengeDetail,
  type CreatorChallengeSummary,
} from "./challenges";
import { ensureCreatorCommunitySchema } from "./community-schema";
import {
  getSeries as rawGetSeries,
  listSeries as rawListSeries,
  touchSeries,
  type CreatorSeriesDetail,
  type CreatorSeriesSummary,
} from "./series";
import {
  addComment as rawAddComment,
  listComments as rawListComments,
  toggleLike as rawToggleLike,
} from "./work-social";
import {
  parseStatus,
  type CreatorEpisodeRef,
  type CreatorWorkDetail,
  type CreatorWorkInput,
  type CreatorWorkMutationResult,
  type CreatorWorkSort,
  type CreatorWorkStatus,
  type CreatorWorkSummary,
} from "./works-contract";
import {
  bumpViews as rawBumpViews,
  createWork as rawCreateWork,
  deleteWork as rawDeleteWork,
  getWork as rawGetWork,
  listWorks as rawListWorks,
  updateWork as rawUpdateWork,
} from "./works";

export interface CreatorPublicationValidationErrorDetails {
  readonly issues: readonly CreatorPublicationValidationIssue[];
}

export class CreatorPublicationValidationError extends Error {
  readonly details: CreatorPublicationValidationErrorDetails;

  constructor(issues: readonly CreatorPublicationValidationIssue[]) {
    super(issues[0]?.message ?? "게시 설정을 확인해 주세요.");
    this.name = "CreatorPublicationValidationError";
    this.details = { issues: [...issues] };
  }
}

export interface PrepareCreatorPublicationMutationInput {
  input: CreatorWorkInput;
  existingDoc?: unknown;
  existingStatus?: CreatorWorkStatus;
  challengeLinked?: boolean;
  now?: Date;
}

export interface PreparedCreatorPublicationMutation {
  input: CreatorWorkInput;
  directive: CreatorPublicationDirective | null;
  effectiveStatus: CreatorWorkStatus | null;
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

/**
 * Preserves a previously stored publication policy when legacy editor clients replace the rest of
 * `doc`, while still allowing the dedicated publishing surface to atomically update that policy.
 */
export function prepareCreatorPublicationMutation({
  input,
  existingDoc,
  existingStatus,
  challengeLinked = false,
  now = new Date(),
}: PrepareCreatorPublicationMutationInput): PreparedCreatorPublicationMutation {
  const next: CreatorWorkInput = { ...input };
  const docProvided = hasOwn(input, "doc");
  const inputDoc = isRecord(input.doc) ? input.doc : {};
  const publicationProvided = docProvided && hasOwn(inputDoc, "publication");
  const existingDirective = readCreatorPublicationDirective(existingDoc);
  const directive = publicationProvided
    ? normalizeCreatorPublicationDirective(inputDoc.publication)
    : existingDirective;

  if (docProvided && directive) {
    next.doc = writeCreatorPublicationDirective(input.doc, directive);
  }
  if (!directive) {
    return { input: next, directive: null, effectiveStatus: null };
  }

  const statusProvided = hasOwn(input, "status");
  const requestedStatus = statusProvided
    ? parseStatus(input.status)
    : existingStatus ?? "published";
  const policyTransitionRequested = statusProvided || publicationProvided;

  if (requestedStatus === "published" && policyTransitionRequested) {
    const validation = validateCreatorPublicationDirective(directive, {
      now,
      challengeLinked,
    });
    if (!validation.valid) throw new CreatorPublicationValidationError(validation.errors);
  }

  const effectiveStatus = resolveCreatorPublicationStatus(requestedStatus, directive, now);
  let effectiveDirective = directive;
  if (effectiveStatus === "published" && directive.publishedAt === null) {
    effectiveDirective = markCreatorPublicationPublished(directive, now);
    next.doc = writeCreatorPublicationDirective(
      docProvided ? input.doc : existingDoc,
      effectiveDirective,
    );
  }
  if (policyTransitionRequested) next.status = effectiveStatus;

  return {
    input: next,
    directive: effectiveDirective,
    effectiveStatus,
  };
}

async function assertRemixPolicy(userId: string, remixFromId: unknown): Promise<void> {
  const parentId = referenceId(remixFromId);
  if (!parentId) return;
  const parent = await rawGetWork(parentId, userId);
  if (parent && !creatorPublicationRemixAllowed(parent.doc)) {
    throw new Error("원작자가 이 작품의 리믹스를 허용하지 않았습니다.");
  }
}

export async function createWork(
  userId: string,
  input: CreatorWorkInput,
): Promise<CreatorWorkMutationResult> {
  await assertRemixPolicy(userId, input.remixFromId);
  const prepared = prepareCreatorPublicationMutation({
    input,
    challengeLinked: referenceId(input.challengeId) !== null,
  });
  return rawCreateWork(userId, prepared.input);
}

export async function updateWork(
  userId: string,
  id: string,
  input: CreatorWorkInput,
): Promise<CreatorWorkMutationResult> {
  const existing = await rawGetWork(id, userId);
  if (!existing) throw new Error("작품을 찾을 수 없습니다.");
  const nextChallengeId = hasOwn(input, "challengeId")
    ? referenceId(input.challengeId)
    : existing.challengeId;
  const prepared = prepareCreatorPublicationMutation({
    input,
    existingDoc: existing.doc,
    existingStatus: existing.status,
    challengeLinked: nextChallengeId !== null,
  });
  return rawUpdateWork(userId, id, prepared.input);
}

export interface CreatorPublicationListOptions {
  titleId?: string;
  userId?: string;
  sort?: CreatorWorkSort;
  tag?: string;
  viewerId?: string;
  includeHidden?: boolean;
  seriesId?: string;
  challengeId?: string;
  followedBy?: string;
}

async function documentsByWorkId(ids: readonly string[]): Promise<Map<string, unknown>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: creatorWorks.id, doc: creatorWorks.doc })
    .from(creatorWorks)
    .where(inArray(creatorWorks.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.doc] as const));
}

export function filterCreatorPublicationSummaries<Work extends { id: string }>(
  works: readonly Work[],
  documents: ReadonlyMap<string, unknown>,
): Work[] {
  return works.filter((work) =>
    documents.has(work.id) && isCreatorPublicationListable(documents.get(work.id)),
  );
}

async function listableWorkSummaries<Work extends { id: string }>(
  works: readonly Work[],
): Promise<Work[]> {
  if (works.length === 0) return [];
  const documents = await documentsByWorkId(works.map((work) => work.id));
  return filterCreatorPublicationSummaries(works, documents);
}

async function promoteDueCreatorPublicationsSafely(): Promise<void> {
  try {
    await promoteDueCreatorPublications();
  } catch {
    // Request-path promotion is a resilience fallback. Read APIs remain available while the
    // dedicated scheduler or a later request retries the idempotent revision-fenced promotion.
  }
}

export async function listWorks(
  options: CreatorPublicationListOptions = {},
): Promise<CreatorWorkSummary[]> {
  await promoteDueCreatorPublicationsSafely();
  const works = await rawListWorks(options);
  const ownerView =
    Boolean(options.userId) &&
    Boolean(options.viewerId) &&
    options.userId === options.viewerId;
  if (ownerView || options.includeHidden || works.length === 0) return works;
  try {
    return await listableWorkSummaries(works);
  } catch {
    // Discovery fails closed so a transient metadata read cannot leak an unlisted work.
    return [];
  }
}

async function publicationAwareNeighbors(
  work: CreatorWorkDetail,
  viewerId?: string,
): Promise<Pick<CreatorWorkDetail, "prevEpisode" | "nextEpisode">> {
  if (!work.seriesId || work.episodeNo === null) {
    return { prevEpisode: null, nextEpisode: null };
  }
  const episodes = await rawListWorks({ seriesId: work.seriesId, viewerId });
  const documents = await documentsByWorkId(episodes.map((episode) => episode.id));
  const visible = episodes.filter(
    (episode) =>
      episode.id === work.id ||
      (documents.has(episode.id) && isCreatorPublicationListable(documents.get(episode.id))),
  );
  const index = visible.findIndex((episode) => episode.id === work.id);
  const project = (episode: CreatorWorkSummary | undefined): CreatorEpisodeRef | null =>
    episode
      ? { id: episode.id, title: episode.title, episodeNo: episode.episodeNo }
      : null;
  return {
    prevEpisode: index > 0 ? project(visible[index - 1]) : null,
    nextEpisode: index >= 0 ? project(visible[index + 1]) : null,
  };
}

async function publicationAwareRemixRelations(
  work: CreatorWorkDetail,
): Promise<Pick<CreatorWorkDetail, "remixFromId" | "remixFromTitle" | "remixedChildren">> {
  let remixFromId = work.remixFromId;
  let remixFromTitle = work.remixFromTitle;
  let remixedChildren = work.remixedChildren ?? [];
  const ids = [
    ...(remixFromId ? [remixFromId] : []),
    ...remixedChildren.map((child) => child.id),
  ];
  if (ids.length === 0) return { remixFromId, remixFromTitle, remixedChildren };
  const documents = await documentsByWorkId(ids);
  if (
    remixFromId &&
    (!documents.has(remixFromId) || !isCreatorPublicationListable(documents.get(remixFromId)))
  ) {
    remixFromId = null;
    remixFromTitle = null;
  }
  remixedChildren = remixedChildren.filter(
    (child) =>
      documents.has(child.id) && isCreatorPublicationListable(documents.get(child.id)),
  );
  return { remixFromId, remixFromTitle, remixedChildren };
}

export async function getWork(
  id: string,
  viewerId?: string,
): Promise<CreatorWorkDetail | null> {
  await promoteDueCreatorPublicationsSafely();
  const work = await rawGetWork(id, viewerId);
  if (!work || work.isOwner) return work;
  if (!isCreatorPublicationDirectlyReadable(work.doc)) return null;
  try {
    const [neighbors, remixRelations] = await Promise.all([
      publicationAwareNeighbors(work, viewerId),
      publicationAwareRemixRelations(work),
    ]);
    return { ...work, ...neighbors, ...remixRelations };
  } catch {
    // Exact-link access remains available, but related discovery fails closed.
    return {
      ...work,
      prevEpisode: null,
      nextEpisode: null,
      remixFromId: null,
      remixFromTitle: null,
      remixedChildren: [],
    };
  }
}

function publicationAwareSeriesAggregate(
  detail: CreatorSeriesDetail,
  episodeList: CreatorWorkSummary[],
): CreatorSeriesDetail {
  const removedCovers = new Set(
    detail.episodeList
      .filter((episode) => !episodeList.some((visible) => visible.id === episode.id))
      .map((episode) => episode.cover)
      .filter(Boolean),
  );
  const fallbackCover = episodeList.find((episode) => episode.cover)?.cover ?? "";
  const cover = removedCovers.has(detail.cover) ? fallbackCover : detail.cover;
  const latestEpisodeAt = episodeList.reduce<string | null>(
    (latest, episode) =>
      latest === null || episode.createdAt > latest ? episode.createdAt : latest,
    null,
  );
  return {
    ...detail,
    cover,
    episodeList,
    episodes: episodeList.length,
    views: episodeList.reduce((sum, episode) => sum + episode.views, 0),
    likes: episodeList.reduce((sum, episode) => sum + episode.likes, 0),
    latestEpisodeAt,
  };
}

async function getPublicSeries(
  id: string,
  viewerId?: string,
  forcePublicProjection = false,
): Promise<CreatorSeriesDetail | null> {
  const detail = await rawGetSeries(id, forcePublicProjection ? undefined : viewerId);
  if (!detail) return null;
  if (detail.isOwner && !forcePublicProjection) return detail;
  const episodeList = await listableWorkSummaries(detail.episodeList);
  const projected = publicationAwareSeriesAggregate(detail, episodeList);
  return forcePublicProjection ? { ...projected, isOwner: Boolean(viewerId && detail.author.id === viewerId) } : projected;
}

export async function getSeries(
  id: string,
  viewerId?: string,
): Promise<CreatorSeriesDetail | null> {
  await promoteDueCreatorPublicationsSafely();
  try {
    return await getPublicSeries(id, viewerId);
  } catch {
    return null;
  }
}

export async function listSeries(options: {
  userId?: string;
  sort?: Parameters<typeof rawListSeries>[0] extends { sort?: infer Sort } ? Sort : never;
  viewerId?: string;
} = {}): Promise<CreatorSeriesSummary[]> {
  await promoteDueCreatorPublicationsSafely();
  const series = await rawListSeries(options);
  const ownerView =
    Boolean(options.userId) &&
    Boolean(options.viewerId) &&
    options.userId === options.viewerId;
  if (ownerView || series.length === 0) return series;
  const projected = await Promise.all(
    series.map(async (candidate) => {
      const detail = await getPublicSeries(candidate.id, options.viewerId, true);
      if (!detail) return null;
      const { episodeList: _episodeList, ...summary } = detail;
      return { ...summary, isOwner: candidate.isOwner } satisfies CreatorSeriesSummary;
    }),
  );
  return projected.filter((candidate): candidate is CreatorSeriesSummary => candidate !== null);
}

function publicationAwareChallengeAggregate(
  detail: CreatorChallengeDetail,
  works: CreatorWorkSummary[],
): CreatorChallengeDetail {
  return { ...detail, works, entries: works.length };
}

export async function getChallenge(
  key: string,
  viewerId?: string,
): Promise<CreatorChallengeDetail | null> {
  await promoteDueCreatorPublicationsSafely();
  const detail = await rawGetChallenge(key, viewerId);
  if (!detail) return null;
  try {
    return publicationAwareChallengeAggregate(
      detail,
      await listableWorkSummaries(detail.works),
    );
  } catch {
    return { ...detail, works: [], entries: 0 };
  }
}

export async function listChallenges(): Promise<CreatorChallengeSummary[]> {
  await promoteDueCreatorPublicationsSafely();
  const challenges = await rawListChallenges();
  const projected = await Promise.all(
    challenges.map(async (challenge) => {
      const detail = await getChallenge(challenge.id);
      if (!detail) return null;
      const { works: _works, ...summary } = detail;
      return summary;
    }),
  );
  return projected.filter((challenge): challenge is CreatorChallengeSummary => challenge !== null);
}

export async function addComment(userId: string, workId: string, text: unknown) {
  await promoteDueCreatorPublicationsSafely();
  const work = await rawGetWork(workId, userId);
  if (work && !creatorPublicationCommentsAllowed(work.doc)) {
    throw new Error("이 작품은 새 댓글을 받지 않습니다.");
  }
  return rawAddComment(userId, workId, text);
}

export async function listComments(workId: string, includeHidden = false) {
  await promoteDueCreatorPublicationsSafely();
  return rawListComments(workId, includeHidden);
}

export async function toggleLike(userId: string, workId: string) {
  await promoteDueCreatorPublicationsSafely();
  return rawToggleLike(userId, workId);
}

export interface PromoteDueCreatorPublicationsResult {
  promoted: number;
  workIds: string[];
  skipped: number;
}

/**
 * Promotes due schedules through the existing revision-fenced update transaction. Multiple API
 * replicas can race safely: one revision wins, later replicas observe a conflict and retry from a
 * fresh snapshot on the next bounded sweep.
 */
export async function promoteDueCreatorPublications(options: {
  now?: Date;
  limit?: number;
} = {}): Promise<PromoteDueCreatorPublicationsResult> {
  if (!(await ensureCreatorCommunitySchema())) {
    return { promoted: 0, workIds: [], skipped: 0 };
  }
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  const candidates = await db
    .select({
      id: creatorWorks.id,
      ownerId: creatorWorks.userId,
      doc: creatorWorks.doc,
      revision: creatorWorks.revision,
      seriesId: creatorWorks.seriesId,
    })
    .from(creatorWorks)
    .where(
      and(
        eq(creatorWorks.status, "draft"),
        eq(creatorWorks.hidden, false),
        lt(creatorWorks.revision, CREATOR_WORK_REVISION_MAX),
        sql`${creatorWorks.doc} -> 'publication' ->> 'mode' = 'scheduled'`,
        sql`${creatorWorks.doc} -> 'publication' ->> 'scheduledAt' <= ${nowIso}`,
      ),
    )
    .orderBy(
      sql`${creatorWorks.doc} -> 'publication' ->> 'scheduledAt' ASC`,
      creatorWorks.id,
    )
    .limit(limit);

  const workIds: string[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const directive = readCreatorPublicationDirective(candidate.doc);
    if (!directive || !isCreatorPublicationDue(directive, now)) {
      skipped += 1;
      continue;
    }
    const publishedDirective = markCreatorPublicationPublished(directive, now);
    try {
      await rawUpdateWork(candidate.ownerId, candidate.id, {
        baseRevision: candidate.revision,
        doc: writeCreatorPublicationDirective(candidate.doc, publishedDirective),
        status: "published",
      });
      workIds.push(candidate.id);
      if (candidate.seriesId) await touchSeries(candidate.seriesId);
    } catch (error) {
      skipped += 1;
      if (!(error instanceof CreatorWorkRevisionConflictError)) {
        // Invalid or removed candidates are intentionally skipped. A future edit/request sweep can
        // make them eligible again without blocking unrelated scheduled works.
      }
    }
  }
  return { promoted: workIds.length, workIds, skipped };
}

export const bumpViews = rawBumpViews;
export const deleteWork = rawDeleteWork;
