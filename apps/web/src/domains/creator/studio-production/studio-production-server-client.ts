import { z } from "zod";

import {
  parseProductionWorkspace,
  serializeProductionWorkspace,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { api, isHttpError, toApiError } from "@/infrastructure/api";

const MAX_REVIEW_LINKS = 100;
const MAX_REVIEW_FEEDBACK = 1_000;

export interface StudioServerProductionCapabilities {
  readonly view: boolean;
  readonly edit: boolean;
  readonly manageLinks: boolean;
  readonly approve: boolean;
  readonly publish: boolean;
}

export interface StudioServerProductionSnapshot {
  readonly workId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly capabilities: StudioServerProductionCapabilities;
  readonly document: ProductionWorkspace;
}

export type StudioPersonalKitTouchPolicy =
  | "pen-draw-touch-pan"
  | "pen-only"
  | "touch-draw"
  | "mouse-keyboard";

export interface StudioPersonalKitDocument {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly workspaceProfiles: readonly Readonly<Record<string, unknown>>[];
  readonly quickAccess: Readonly<Record<string, unknown>>;
  readonly gestureMap: Readonly<Record<string, string | number | boolean | null>>;
  readonly penButtonMap: Readonly<Record<string, string | number | boolean | null>>;
  readonly touchPolicy: StudioPersonalKitTouchPolicy;
  readonly favoriteRefs: readonly string[];
}

export interface StudioServerPersonalKitSnapshot {
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: StudioPersonalKitDocument;
}

export interface StudioServerReviewLink {
  readonly id: string;
  readonly workId: string;
  readonly role: "viewer" | "commenter";
  readonly pageIds: readonly string[];
  readonly watermark: boolean;
  readonly allowDownload: boolean;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}
export interface StudioCreatedServerReviewLink extends StudioServerReviewLink {
  readonly token: string;
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
  readonly link: Omit<StudioServerReviewLink, "workId" | "revokedAt" | "createdAt">;
  readonly work: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly cover: string;
    readonly pages: readonly {
      readonly id: string;
      readonly index: number;
      readonly source: string;
    }[];
  };
  readonly feedback: readonly StudioExternalReviewFeedback[];
}

export interface CreateStudioServerReviewLinkInput {
  readonly role: "viewer" | "commenter";
  readonly pageIds: readonly string[];
  readonly watermark: boolean;
  readonly allowDownload: boolean;
  readonly expiresInHours: number;
}

const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value)
  .refine((value) => !value.includes("\\"));
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const RevisionSchema = z.number().int().min(0).max(2_147_483_647);
const CapabilitiesSchema = z.object({
  view: z.boolean(),
  edit: z.boolean(),
  manageLinks: z.boolean(),
  approve: z.boolean(),
  publish: z.boolean(),
}).strict();
const ServerWorkspaceEnvelopeSchema = z.object({
  workId: OpaqueIdSchema,
  revision: RevisionSchema,
  updatedAt: IsoDateTimeSchema,
  capabilities: CapabilitiesSchema,
  document: z.unknown(),
}).strict();
const PersonalKitScalarSchema = z.union([
  z.string().max(240),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const PersonalKitMapSchema = z.record(z.string().min(1).max(80), PersonalKitScalarSchema);
const PersonalKitObjectSchema = z.record(z.string().min(1).max(80), z.unknown());
const PersonalKitDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: IsoDateTimeSchema,
  workspaceProfiles: z.array(PersonalKitObjectSchema).max(20),
  quickAccess: PersonalKitObjectSchema,
  gestureMap: PersonalKitMapSchema,
  penButtonMap: PersonalKitMapSchema,
  touchPolicy: z.enum([
    "pen-draw-touch-pan",
    "pen-only",
    "touch-draw",
    "mouse-keyboard",
  ]),
  favoriteRefs: z.array(z.string().trim().min(1).max(240)).max(2_000),
}).strict().superRefine((document, context) => {
  if (new Set(document.favoriteRefs).size !== document.favoriteRefs.length) {
    context.addIssue({ code: "custom", path: ["favoriteRefs"], message: "duplicate favorite refs" });
  }
});
const PersonalKitEnvelopeSchema = z.object({
  revision: RevisionSchema,
  updatedAt: IsoDateTimeSchema,
  document: PersonalKitDocumentSchema,
}).strict();
const ReviewLinkSchema = z.object({
  id: OpaqueIdSchema,
  workId: OpaqueIdSchema,
  role: z.enum(["viewer", "commenter"]),
  pageIds: z.array(OpaqueIdSchema).max(500),
  watermark: z.boolean(),
  allowDownload: z.boolean(),
  expiresAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
}).strict().superRefine((link, context) => {
  if (new Set(link.pageIds).size !== link.pageIds.length) {
    context.addIssue({ code: "custom", path: ["pageIds"], message: "duplicate page ids" });
  }
  if (Date.parse(link.expiresAt) <= Date.parse(link.createdAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "invalid expiry" });
  }
});
const CreatedReviewLinkSchema = ReviewLinkSchema.extend({
  token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/u),
}).strict();
const ExternalFeedbackSchema = z.object({
  id: OpaqueIdSchema,
  kind: z.enum(["comment", "approve", "reject"]),
  reviewerName: z.string().trim().min(1).max(120),
  anchor: z.object({
    pageId: OpaqueIdSchema,
    x: z.number().finite().min(0).max(1).optional(),
    y: z.number().finite().min(0).max(1).optional(),
  }).strict().nullable(),
  body: z.string().max(4_000),
  createdAt: IsoDateTimeSchema,
}).strict();
const ExternalReviewSchema = z.object({
  link: ReviewLinkSchema.omit({ workId: true, revokedAt: true, createdAt: true }),
  work: z.object({
    id: OpaqueIdSchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().max(20_000),
    cover: z.string().max(4_000_000),
    pages: z.array(z.object({
      id: OpaqueIdSchema,
      index: z.number().int().min(0).max(10_000),
      source: z.string().min(1).max(4_000_000),
    }).strict()).max(500),
  }).strict(),
  feedback: z.array(ExternalFeedbackSchema).max(MAX_REVIEW_FEEDBACK),
}).strict().superRefine((review, context) => {
  const pageIds = new Set<string>();
  for (const [index, page] of review.work.pages.entries()) {
    if (pageIds.has(page.id)) {
      context.addIssue({ code: "custom", path: ["work", "pages", index, "id"], message: "duplicate page id" });
    }
    pageIds.add(page.id);
  }
  for (const [index, feedback] of review.feedback.entries()) {
    if (feedback.anchor && !pageIds.has(feedback.anchor.pageId)) {
      context.addIssue({ code: "custom", path: ["feedback", index, "anchor"], message: "unknown feedback page" });
    }
  }
});

export class StudioProductionServerContractError extends Error {
  constructor(message = "제작 운영 서버 응답 형식이 올바르지 않습니다.") {
    super(message);
    this.name = "StudioProductionServerContractError";
  }
}
export class StudioProductionServerConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("다른 장치나 팀원이 먼저 수정했습니다. 최신 제작 운영 데이터를 다시 불러와 주세요.");
    this.name = "StudioProductionServerConflictError";
  }
}

function canonicalWorkId(value: string): string {
  const parsed = OpaqueIdSchema.safeParse(value.trim());
  if (!parsed.success) throw new TypeError("작품 ID가 올바르지 않습니다.");
  return parsed.data;
}

function parseServerWorkspace(
  value: unknown,
  expectedWorkId: string,
): StudioServerProductionSnapshot {
  const envelope = ServerWorkspaceEnvelopeSchema.safeParse(value);
  if (!envelope.success || envelope.data.workId !== expectedWorkId) {
    throw new StudioProductionServerContractError();
  }
  const document = parseProductionWorkspace(
    JSON.stringify(envelope.data.document),
    `work:${expectedWorkId}`,
  );
  if (!document || document.revision !== envelope.data.revision) {
    throw new StudioProductionServerContractError("제작 운영 문서 리비전이 서버 응답과 일치하지 않습니다.");
  }
  return { ...envelope.data, document };
}

function parseServerPersonalKit(value: unknown): StudioServerPersonalKitSnapshot {
  const parsed = PersonalKitEnvelopeSchema.safeParse(value);
  if (!parsed.success || parsed.data.document.updatedAt !== parsed.data.updatedAt) {
    throw new StudioProductionServerContractError("Personal Kit 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

async function rethrowServerError(error: unknown, fallback: string): Promise<never> {
  if (isHttpError(error) && error.response.status === 409) {
    const data = error.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const revision = (data as Record<string, unknown>).currentRevision;
      if (RevisionSchema.safeParse(revision).success) {
        throw new StudioProductionServerConflictError(revision as number);
      }
    }
  }
  throw await toApiError(error, fallback);
}
export async function loadStudioServerProductionWorkspace(
  workIdValue: string,
  signal?: AbortSignal,
): Promise<StudioServerProductionSnapshot> {
  const workId = canonicalWorkId(workIdValue);
  try {
    const response = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/production`,
      { signal },
    );
    return parseServerWorkspace(response, workId);
  } catch (error) {
    return rethrowServerError(error, "제작 운영 데이터를 불러오지 못했습니다.");
  }
}

export async function saveStudioServerProductionWorkspace(
  workIdValue: string,
  baseRevision: number,
  workspace: ProductionWorkspace,
  signal?: AbortSignal,
): Promise<StudioServerProductionSnapshot> {
  const workId = canonicalWorkId(workIdValue);
  const revision = RevisionSchema.safeParse(baseRevision);
  if (!revision.success) throw new TypeError("기준 리비전이 올바르지 않습니다.");
  const canonical = parseProductionWorkspace(
    serializeProductionWorkspace(workspace),
    `work:${workId}`,
  );
  if (!canonical) throw new TypeError("저장할 제작 운영 문서가 비어 있습니다.");
  try {
    const response = await api.put<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/production`,
      { baseRevision: revision.data, document: canonical },
      { signal },
    );
    return parseServerWorkspace(response, workId);
  } catch (error) {
    return rethrowServerError(error, "제작 운영 데이터를 저장하지 못했습니다.");
  }
}
export async function loadStudioServerPersonalKit(
  signal?: AbortSignal,
): Promise<StudioServerPersonalKitSnapshot> {
  try {
    return parseServerPersonalKit(await api.get<unknown>(
      "/creator/studio/personal-kit",
      { signal },
    ));
  } catch (error) {
    return rethrowServerError(error, "Personal Kit를 불러오지 못했습니다.");
  }
}

export async function saveStudioServerPersonalKit(
  baseRevision: number,
  documentValue: StudioPersonalKitDocument,
  signal?: AbortSignal,
): Promise<StudioServerPersonalKitSnapshot> {
  const revision = RevisionSchema.safeParse(baseRevision);
  const document = PersonalKitDocumentSchema.safeParse(documentValue);
  if (!revision.success || !document.success) {
    throw new TypeError("저장할 Personal Kit 형식이 올바르지 않습니다.");
  }
  try {
    const response = await api.put<unknown>(
      "/creator/studio/personal-kit",
      { baseRevision: revision.data, document: document.data },
      { signal },
    );
    return parseServerPersonalKit(response);
  } catch (error) {
    return rethrowServerError(error, "Personal Kit를 저장하지 못했습니다.");
  }
}

function parseReviewLink(value: unknown, expectedWorkId: string): StudioServerReviewLink {
  const parsed = ReviewLinkSchema.safeParse(value);
  if (!parsed.success || parsed.data.workId !== expectedWorkId) {
    throw new StudioProductionServerContractError("검토 링크 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function listStudioServerReviewLinks(
  workIdValue: string,
  signal?: AbortSignal,
): Promise<readonly StudioServerReviewLink[]> {
  const workId = canonicalWorkId(workIdValue);
  try {
    const response = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/review-links`,
      { signal },
    );
    if (!Array.isArray(response) || response.length > MAX_REVIEW_LINKS) {
      throw new StudioProductionServerContractError("검토 링크 목록 응답 형식이 올바르지 않습니다.");
    }
    const links = response.map((item) => parseReviewLink(item, workId));
    if (new Set(links.map((link) => link.id)).size !== links.length) {
      throw new StudioProductionServerContractError("검토 링크 목록에 중복 항목이 있습니다.");
    }
    return links;
  } catch (error) {
    return rethrowServerError(error, "검토 링크를 불러오지 못했습니다.");
  }
}

function canonicalReviewLinkInput(
  input: CreateStudioServerReviewLinkInput,
): CreateStudioServerReviewLinkInput {
  const parsed = z.object({
    role: z.enum(["viewer", "commenter"]),
    pageIds: z.array(OpaqueIdSchema).max(500),
    watermark: z.boolean(),
    allowDownload: z.boolean(),
    expiresInHours: z.number().int().min(1).max(24 * 30),
  }).strict().safeParse(input);
  if (!parsed.success || new Set(parsed.data.pageIds).size !== parsed.data.pageIds.length) {
    throw new TypeError("검토 링크 설정이 올바르지 않습니다.");
  }
  return parsed.data;
}
export async function createStudioServerReviewLink(
  workIdValue: string,
  inputValue: CreateStudioServerReviewLinkInput,
  signal?: AbortSignal,
): Promise<StudioCreatedServerReviewLink> {
  const workId = canonicalWorkId(workIdValue);
  const input = canonicalReviewLinkInput(inputValue);
  try {
    const response = await api.post<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/review-links`,
      input,
      { signal },
    );
    const parsed = CreatedReviewLinkSchema.safeParse(response);
    if (!parsed.success || parsed.data.workId !== workId) {
      throw new StudioProductionServerContractError("생성된 검토 링크 응답 형식이 올바르지 않습니다.");
    }
    return parsed.data;
  } catch (error) {
    return rethrowServerError(error, "검토 링크를 만들지 못했습니다.");
  }
}

export async function revokeStudioServerReviewLink(
  workIdValue: string,
  linkIdValue: string,
  signal?: AbortSignal,
): Promise<StudioServerReviewLink> {
  const workId = canonicalWorkId(workIdValue);
  const linkId = OpaqueIdSchema.parse(linkIdValue);
  try {
    const response = await api.post<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/review-links/${encodeURIComponent(linkId)}/revoke`,
      undefined,
      { signal },
    );
    return parseReviewLink(response, workId);
  } catch (error) {
    return rethrowServerError(error, "검토 링크를 폐기하지 못했습니다.");
  }
}
function canonicalReviewToken(value: string): string {
  const parsed = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/u).safeParse(value);
  if (!parsed.success) throw new TypeError("검토 링크 토큰이 올바르지 않습니다.");
  return parsed.data;
}

export async function loadStudioExternalReview(
  tokenValue: string,
  signal?: AbortSignal,
): Promise<StudioExternalReviewSnapshot> {
  const token = canonicalReviewToken(tokenValue);
  try {
    const response = await api.get<unknown>(
      `/creator/review/${encodeURIComponent(token)}`,
      { signal },
    );
    const parsed = ExternalReviewSchema.safeParse(response);
    if (!parsed.success) {
      throw new StudioProductionServerContractError("외부 검토 응답 형식이 올바르지 않습니다.");
    }
    return parsed.data;
  } catch (error) {
    return rethrowServerError(error, "검토 원고를 불러오지 못했습니다.");
  }
}

export interface CreateStudioExternalReviewFeedbackInput {
  readonly kind: "comment" | "approve" | "reject";
  readonly reviewerName: string;
  readonly anchor: { readonly pageId: string; readonly x?: number; readonly y?: number } | null;
  readonly body: string;
}

function canonicalExternalFeedbackInput(
  input: CreateStudioExternalReviewFeedbackInput,
): CreateStudioExternalReviewFeedbackInput {
  const parsed = z.object({
    kind: z.enum(["comment", "approve", "reject"]),
    reviewerName: z.string().trim().min(1).max(120),
    anchor: ExternalFeedbackSchema.shape.anchor,
    body: z.string().trim().max(4_000),
  }).strict().safeParse(input);
  if (!parsed.success || (parsed.data.kind !== "approve" && parsed.data.body.length === 0)) {
    throw new TypeError("검토 의견 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function addStudioExternalReviewFeedback(
  tokenValue: string,
  inputValue: CreateStudioExternalReviewFeedbackInput,
  signal?: AbortSignal,
): Promise<StudioExternalReviewFeedback> {
  const token = canonicalReviewToken(tokenValue);
  const input = canonicalExternalFeedbackInput(inputValue);
  try {
    const response = await api.post<unknown>(
      `/creator/review/${encodeURIComponent(token)}/feedback`,
      input,
      { signal },
    );
    const parsed = ExternalFeedbackSchema.safeParse(response);
    if (!parsed.success) {
      throw new StudioProductionServerContractError("검토 의견 응답 형식이 올바르지 않습니다.");
    }
    return parsed.data;
  } catch (error) {
    return rethrowServerError(error, "검토 의견을 저장하지 못했습니다.");
  }
}

export const studioProductionServerClientTestHelpers = {
  parseServerWorkspace,
  parseServerPersonalKit,
  parseReviewLink,
  canonicalReviewLinkInput,
  canonicalExternalFeedbackInput,
};
