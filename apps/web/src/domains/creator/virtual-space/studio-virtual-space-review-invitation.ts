import { httpStatus } from "@/infrastructure/api";

import {
  getStudioProject, getStudioProjectByWork, getStudioReview,
  listStudioArtifactRevisions, listStudioReviews,
} from "../project-graph/studio-project-graph-client";
import type {
  StudioProjectRecord, StudioReviewRecord, StudioReviewSummary, StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { studioProjectSectionPath } from "../studio-route-registry";
import { parseStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

export type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
export { parseStudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

/** A UI lease, not an authorization token. Every explicit Open must fetch server authority again. */
export const STUDIO_VIRTUAL_SPACE_REVIEW_LEASE_MS = 15_000;
const MAX_SUBJECTS = 64;
const MAX_ARTIFACTS = 32;
const MAX_VERIFICATION_MS = 10_000;

export type StudioVirtualSpaceReviewFailure = "invalid-subject" | "unavailable" | "access-denied" | "closed" | "version-mismatch";
export type StudioVirtualSpaceReviewIntent = "propose" | "receive" | "view";

export interface StudioVirtualSpaceReviewAuthority {
  readonly getProject: (projectId: string) => Promise<StudioProjectRecord>;
  readonly getProjectByWork: (workId: string) => Promise<StudioProjectRecord>;
  readonly getReview: (reviewId: string) => Promise<StudioReviewRecord>;
  readonly listRevisions: (artifactId: string) => Promise<readonly StudioRevisionRecord[]>;
  readonly listReviews: (artifactId: string) => Promise<readonly StudioReviewSummary[]>;
  readonly now?: () => number;
}

const SERVER_AUTHORITY: StudioVirtualSpaceReviewAuthority = {
  getProject: getStudioProject, getProjectByWork: getStudioProjectByWork, getReview: getStudioReview,
  listRevisions: listStudioArtifactRevisions, listReviews: listStudioReviews,
};

export interface StudioVirtualSpaceVerifiedReview {
  readonly ok: true;
  readonly subject: StudioVirtualSpaceReviewSubject;
  readonly project: StudioProjectRecord;
  readonly review: StudioReviewRecord;
  readonly revision: StudioRevisionRecord;
  readonly href: string;
  readonly verifiedAt: number;
  readonly expiresAt: number;
}
export type StudioVirtualSpaceReviewVerification = StudioVirtualSpaceVerifiedReview
  | { readonly ok: false; readonly reason: StudioVirtualSpaceReviewFailure };

function failure(reason: StudioVirtualSpaceReviewFailure): { readonly ok: false; readonly reason: StudioVirtualSpaceReviewFailure } {
  return Object.freeze({ ok: false, reason });
}

function serverFailure(error: unknown): ReturnType<typeof failure> {
  const status = httpStatus(error);
  return failure(status === 401 || status === 403 ? "access-denied" : "unavailable");
}

function openReview(review: StudioReviewSummary): boolean {
  return review.status === "open" || review.status === "changes-requested";
}

/** This route must render the pinned review, not silently fall back to the editable latest head. */
export function studioVirtualSpaceReviewHref(subject: StudioVirtualSpaceReviewSubject): string {
  const parsed = parseStudioVirtualSpaceReviewSubject(subject);
  if (!parsed) throw new Error("Invalid pinned review subject");
  const query = new URLSearchParams({ view: "versions", sharedReview: parsed.reviewId,
    artifact: parsed.artifactId, revision: parsed.revisionId, digest: parsed.rootGraphHash,
    graphProject: parsed.projectId });
  // Project-shell routes use the CreatorWork id; graph ids are a distinct coordinate.
  return `${studioProjectSectionPath(parsed.workId, "review")}?${query.toString()}`;
}

/** Parse only our allowlisted identity fields; unrelated project-view query fields remain local. */
export function studioVirtualSpaceReviewSubjectFromLocation(
  workId: string, search: string,
): StudioVirtualSpaceReviewSubject | null {
  const query = new URLSearchParams(search);
  const keys = ["sharedReview", "artifact", "revision", "digest", "graphProject"];
  if (keys.some((key) => query.getAll(key).length !== 1)) return null;
  return parseStudioVirtualSpaceReviewSubject({ schemaVersion: 1, workId,
    projectId: query.get("graphProject"), reviewId: query.get("sharedReview"),
    artifactId: query.get("artifact"), revisionId: query.get("revision"), rootGraphHash: query.get("digest") });
}

/**
 * Each invocation uses authenticated server reads, never local graph cache/live peer claims.
 * Accepting a social invitation grants no comment, edit or official approval permission.
 */
export async function verifyStudioVirtualSpaceReviewSubject(
  rawSubject: unknown,
  intent: StudioVirtualSpaceReviewIntent,
  authority: StudioVirtualSpaceReviewAuthority = SERVER_AUTHORITY,
): Promise<StudioVirtualSpaceReviewVerification> {
  const subject = parseStudioVirtualSpaceReviewSubject(rawSubject);
  if (!subject || (intent !== "propose" && intent !== "receive" && intent !== "view")) return failure("invalid-subject");
  const now = authority.now ?? Date.now;
  const startedAt = now();
  try {
    const [project, review] = await Promise.all([
      authority.getProject(subject.projectId), authority.getReview(subject.reviewId),
    ]);
    if (!project.access.view || (intent === "propose" && !project.access.edit)) return failure("access-denied");
    if (project.id !== subject.projectId || project.workId !== subject.workId
      || !project.artifacts.some((artifact) => artifact.id === subject.artifactId && artifact.projectId === subject.projectId)
      || review.id !== subject.reviewId || review.artifactId !== subject.artifactId
      || review.revisionId !== subject.revisionId) return failure("version-mismatch");
    if (intent !== "view" && !openReview(review)) return failure("closed");
    const revisions = await authority.listRevisions(subject.artifactId);
    const revision = revisions.find((candidate) => candidate.id === subject.revisionId);
    if (!revision || revision.artifactId !== subject.artifactId || revision.kind !== "review-snapshot"
      || revision.rootGraphHash !== subject.rootGraphHash) return failure("version-mismatch");
    if (now() - startedAt >= MAX_VERIFICATION_MS || now() < startedAt) return failure("unavailable");
    // Base the lease on the earliest read so slow responses cannot extend stale authority.
    return Object.freeze({ ok: true, subject, project, review, revision,
      href: studioVirtualSpaceReviewHref(subject), verifiedAt: startedAt,
      expiresAt: startedAt + STUDIO_VIRTUAL_SPACE_REVIEW_LEASE_MS });
  } catch (error) { return serverFailure(error); }
}

export interface StudioVirtualSpaceReviewChoice {
  readonly subject: StudioVirtualSpaceReviewSubject;
  readonly title: string;
  readonly artifactTitle: string;
  readonly createdAt: string;
}
export type StudioVirtualSpaceReviewChoices = {
  readonly ok: true;
  readonly choices: readonly StudioVirtualSpaceReviewChoice[];
  readonly truncated: boolean;
} | { readonly ok: false; readonly reason: StudioVirtualSpaceReviewFailure };

/** Existing immutable snapshots only. Discovery neither creates reviews nor promotes local work. */
export async function listStudioVirtualSpaceReviewSubjects(
  workId: string,
  authority: StudioVirtualSpaceReviewAuthority = SERVER_AUTHORITY,
): Promise<StudioVirtualSpaceReviewChoices> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u.test(workId)) return failure("invalid-subject");
  try {
    const project = await authority.getProjectByWork(workId);
    if (project.workId !== workId) return failure("version-mismatch");
    if (!project.access.view || !project.access.edit) return failure("access-denied");
    const choices: StudioVirtualSpaceReviewChoice[] = [];
    let truncated = project.artifacts.length > MAX_ARTIFACTS;
    // Sequential artifacts keep discovery bounded and avoid a burst of API requests for large works.
    for (const artifact of project.artifacts.slice(0, MAX_ARTIFACTS)) {
      if (artifact.projectId !== project.id) return failure("version-mismatch");
      const [reviews, revisions] = await Promise.all([
        authority.listReviews(artifact.id), authority.listRevisions(artifact.id),
      ]);
      const indexed = new Map(revisions.map((revision) => [revision.id, revision]));
      for (const review of reviews) {
        if (!openReview(review) || review.artifactId !== artifact.id) continue;
        const revision = indexed.get(review.revisionId);
        if (!revision || revision.kind !== "review-snapshot" || revision.artifactId !== artifact.id) continue;
        const subject = parseStudioVirtualSpaceReviewSubject({ schemaVersion: 1, projectId: project.id,
          workId, artifactId: artifact.id, reviewId: review.id, revisionId: revision.id, rootGraphHash: revision.rootGraphHash });
        if (!subject) continue;
        if (choices.length >= MAX_SUBJECTS) { truncated = true; break; }
        choices.push(Object.freeze({ subject, title: review.title, artifactTitle: artifact.title, createdAt: review.createdAt }));
      }
      if (choices.length >= MAX_SUBJECTS) { truncated = true; break; }
    }
    return Object.freeze({ ok: true, choices: Object.freeze(choices), truncated });
  } catch (error) { return serverFailure(error); }
}
