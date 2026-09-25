import { z } from "zod";
import { studioReviewTaskReferenceSchema, type StudioReviewTaskReference, type ReviewPolicyExpectation } from "@toonspectrum/studio-project-model";

import { api } from "@/platform/api";

import {
  compatibilityReportSchema,
  studioArtifactRecordSchema,
  studioBlobRegistrationSchema,
  studioCompatibilityApprovalSchema,
  studioProjectCreateResponseSchema,
  studioProjectRecordSchema,
  studioRestoreRevisionInputSchema,
  studioReviewCommentSchema,
  studioReviewRecordSchema,
  studioReviewSummarySchema,
  studioRevisionCommitResponseSchema,
  studioRevisionRecordSchema,
  type StudioArtifactBootstrapInput,
  type StudioBlobRegistration,
  type StudioBlobRegistrationInput,
  type StudioCompatibilityReportCreateInput,
  type StudioProjectBootstrapInput,
  type StudioProjectCreateResponse,
  type StudioProjectRecord,
  type StudioRestoreRevisionInput,
  type StudioReviewCommentCreateInput,
  type StudioReviewCreateInput,
  type StudioReviewRecord,
  type StudioReviewSummary,
  type StudioRevisionCommitInput,
  type StudioRevisionCommitResponse,
  type StudioRevisionRecord,
  type CompatibilityReport,
} from "./studio-project-graph-contract";

export type {
  StudioArtifactRecord as StudioProjectArtifactRecord,
  StudioProjectRecord as StudioProjectGraphSnapshot,
  StudioRevisionRecord as StudioProjectRevisionRecord,
} from "./studio-project-graph-contract";

const BASE = "/studio-project-graph";
const MAX_PREFIX_LENGTH = 40;

function resourceId(value: string): string {
  return encodeURIComponent(value);
}

function mutationHeaders(idempotencyKey: string): HeadersInit {
  return { "Idempotency-Key": idempotencyKey };
}

function revisionMutationHeaders(
  currentHeadRevisionId: string,
  idempotencyKey: string,
): HeadersInit {
  return {
    "Idempotency-Key": idempotencyKey,
    "If-Match": `"${currentHeadRevisionId}"`,
  };
}

function entropy(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function safePrefix(prefix: string): string {
  const normalized = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, MAX_PREFIX_LENGTH);
  return normalized || "studio";
}

export function newStudioProjectGraphId(prefix: string): string {
  return `${safePrefix(prefix)}-${entropy()}`.slice(0, 160);
}

export function newStudioMutationKey(prefix = "studio-mutation"): string {
  return `${safePrefix(prefix)}:${entropy()}`.slice(0, 240);
}

export async function getStudioProject(
  projectId: string,
): Promise<StudioProjectRecord> {
  const body = await api.get<unknown>(`${BASE}/projects/${resourceId(projectId)}`);
  return studioProjectRecordSchema.parse(body);
}

export async function getStudioProjectByWork(
  workId: string,
  signal?: AbortSignal,
): Promise<StudioProjectRecord> {
  const path = `${BASE}/works/${resourceId(workId)}/project`;
  const body = signal ? await api.get<unknown>(path, { signal }) : await api.get<unknown>(path);
  return studioProjectRecordSchema.parse(body);
}

export async function createStudioProject(
  input: StudioProjectBootstrapInput,
  idempotencyKey = newStudioMutationKey("project-create"),
): Promise<StudioProjectCreateResponse> {
  const body = await api.post<unknown>(`${BASE}/projects`, input, {
    headers: mutationHeaders(idempotencyKey),
  });
  return studioProjectCreateResponseSchema.parse(body);
}

export async function createStudioArtifact(
  projectId: string,
  input: StudioArtifactBootstrapInput,
  idempotencyKey = newStudioMutationKey("artifact-create"),
): Promise<StudioProjectCreateResponse> {
  const body = await api.post<unknown>(
    `${BASE}/projects/${resourceId(projectId)}/artifacts`,
    input,
    { headers: mutationHeaders(idempotencyKey) },
  );
  return studioProjectCreateResponseSchema.parse(body);
}

export async function registerStudioBlob(
  projectId: string,
  input: StudioBlobRegistrationInput,
): Promise<StudioBlobRegistration> {
  const body = await api.post<unknown>(
    `${BASE}/projects/${resourceId(projectId)}/blobs`,
    input,
  );
  return studioBlobRegistrationSchema.parse(body);
}

export async function listStudioArtifactRevisions(
  artifactId: string,
  signal?: AbortSignal,
): Promise<readonly StudioRevisionRecord[]> {
  const path = `${BASE}/artifacts/${resourceId(artifactId)}/revisions`;
  const body = signal ? await api.get<unknown>(path, { signal }) : await api.get<unknown>(path);
  return Object.freeze(z.array(studioRevisionRecordSchema).parse(body));
}

export async function commitStudioRevision(
  artifactId: string,
  currentHeadRevisionId: string,
  input: StudioRevisionCommitInput,
  idempotencyKey = newStudioMutationKey("revision-commit"),
): Promise<StudioRevisionCommitResponse> {
  const body = await api.post<unknown>(
    `${BASE}/artifacts/${resourceId(artifactId)}/revisions`,
    input,
    { headers: revisionMutationHeaders(currentHeadRevisionId, idempotencyKey) },
  );
  return studioRevisionCommitResponseSchema.parse(body);
}

export async function restoreStudioRevision(
  artifactId: string,
  targetRevisionId: string,
  currentHeadRevisionId: string,
  rawInput: StudioRestoreRevisionInput,
  idempotencyKey = newStudioMutationKey("revision-restore"),
): Promise<StudioRevisionCommitResponse> {
  const input = studioRestoreRevisionInputSchema.parse(rawInput);
  const body = await api.post<unknown>(
    `${BASE}/artifacts/${resourceId(artifactId)}/revisions/${resourceId(targetRevisionId)}/restore`,
    input,
    { headers: revisionMutationHeaders(currentHeadRevisionId, idempotencyKey) },
  );
  return studioRevisionCommitResponseSchema.parse(body);
}

export async function listStudioCompatibilityReports(
  projectId: string,
): Promise<readonly CompatibilityReport[]> {
  const body = await api.get<unknown>(
    `${BASE}/projects/${resourceId(projectId)}/compatibility-reports`,
  );
  return Object.freeze(z.array(compatibilityReportSchema).parse(body));
}

export async function createStudioCompatibilityReport(
  projectId: string,
  input: StudioCompatibilityReportCreateInput,
): Promise<CompatibilityReport> {
  const body = await api.post<unknown>(
    `${BASE}/projects/${resourceId(projectId)}/compatibility-reports`,
    input,
  );
  return compatibilityReportSchema.parse(body);
}

export async function approveStudioCompatibilityReport(
  reportId: string,
): Promise<{ readonly id: string; readonly approvedBy: string | null; readonly approvedAt: string | null }> {
  const body = await api.post<unknown>(
    `${BASE}/compatibility-reports/${resourceId(reportId)}/approve`,
  );
  return studioCompatibilityApprovalSchema.parse(body);
}

export async function listStudioReviews(
  artifactId: string,
): Promise<readonly StudioReviewSummary[]> {
  const body = await api.get<unknown>(
    `${BASE}/artifacts/${resourceId(artifactId)}/reviews`,
  );
  return Object.freeze(z.array(studioReviewSummarySchema).parse(body));
}

export async function getStudioReview(reviewId: string): Promise<StudioReviewRecord> {
  const body = await api.get<unknown>(`${BASE}/reviews/${resourceId(reviewId)}`);
  return studioReviewRecordSchema.parse(body);
}

const createdReviewSchema = z
  .object({
    id: z.string(),
    artifactId: z.string(),
    revisionId: z.string(),
    title: z.string(),
    status: z.literal("open"),
    reviewerIds: z.array(z.string()),
    createdAt: z.string(),
  })
  .strict();

export async function createStudioReview(
  artifactId: string,
  input: StudioReviewCreateInput,
) {
  const body = await api.post<unknown>(
    `${BASE}/artifacts/${resourceId(artifactId)}/reviews`,
    input,
  );
  return createdReviewSchema.parse(body);
}

const createdCommentSchema = z
  .object({
    id: z.string(),
    reviewId: z.string(),
    status: z.literal("open"),
    anchor: studioReviewCommentSchema.shape.anchor,
    createdAt: z.string(),
  })
  .strict();

export async function createStudioReviewComment(
  reviewId: string,
  input: StudioReviewCommentCreateInput,
) {
  const body = await api.post<unknown>(
    `${BASE}/reviews/${resourceId(reviewId)}/comments`,
    input,
  );
  return createdCommentSchema.parse(body);
}

const reviewDecisionSchema = z
  .object({
    id: z.string(),
    status: z.enum(["changes-requested", "approved", "rejected", "cancelled"]),
    decidedAt: z.string().nullable(),
    decidedBy: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();

export async function decideStudioReview(
  reviewId: string,
  status: "changes-requested" | "approved" | "rejected" | "cancelled",
  policyExpectation?: ReviewPolicyExpectation,
) {
  const body = await api.post<unknown>(
    `${BASE}/reviews/${resourceId(reviewId)}/decision`,
    { status, ...(policyExpectation ? { policyExpectation } : {}) },
  );
  return reviewDecisionSchema.parse(body);
}

const reviewCommentDecisionSchema = z
  .object({
    id: z.string(),
    status: z.enum(["resolved", "dismissed", "reopened", "open"]),
    resolutionRevisionId: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();

export async function resolveStudioReviewComment(
  commentId: string,
  resolutionRevisionId: string,
  status: "resolved" | "dismissed" = "resolved",
  resolutionSourceRef?: StudioReviewTaskReference["subject"],
) {
  const source = resolutionSourceRef === undefined ? undefined : studioReviewTaskReferenceSchema.shape.subject.parse(resolutionSourceRef);
  const body = await api.post<unknown>(
    `${BASE}/review-comments/${resourceId(commentId)}/resolve`,
    { resolutionRevisionId, status, ...(source ? { resolutionSourceRef: source } : {}) },
  );
  return reviewCommentDecisionSchema.parse(body);
}

export async function reopenStudioReviewComment(commentId: string) {
  const body = await api.post<unknown>(
    `${BASE}/review-comments/${resourceId(commentId)}/reopen`,
  );
  return reviewCommentDecisionSchema.parse(body);
}

export const studioProjectGraphClientTestHelpers = Object.freeze({
  mutationHeaders,
  revisionMutationHeaders,
  resourceId,
  safePrefix,
  studioArtifactRecordSchema,
});
