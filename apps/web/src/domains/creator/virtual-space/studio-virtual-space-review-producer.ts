import { canonicalJson, isoTimestampSchema, sha256Schema, studioEntityIdSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";
import { api, apiPath, httpStatus } from "@/infrastructure/api";
import { parseStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

const BASE = "/studio-project-graph/review-captures";
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const inputSchema = z.object({ intentId: studioEntityIdSchema, workId: studioEntityIdSchema,
  sourceServerRevision: z.number().int().positive().max(2_147_483_647), sourceContentDigest: sha256Schema,
  pageCount: z.number().int().positive().max(100_000), title: z.string().trim().min(1).max(240),
  deviceId: studioEntityIdSchema, createdAt: isoTimestampSchema }).strict();
const intentSchema = inputSchema.extend({ projectId: studioEntityIdSchema, artifactId: studioEntityIdSchema,
  expectedHeadRevisionId: studioEntityIdSchema, expectedHeadRootGraphHash: sha256Schema }).strict();
export type StudioReviewCaptureInput = z.infer<typeof inputSchema>;
export type StudioReviewCaptureIntent = z.infer<typeof intentSchema>;
export type StudioReviewCapturePhase = "prepare" | "upload" | "complete" | "status" | "cancel";
export class StudioReviewCaptureError extends Error {
  constructor(readonly code: string, readonly phase: StudioReviewCapturePhase, readonly retryable: boolean,
    readonly ambiguous: boolean, options?: ErrorOptions) { super(code, options); this.name = "StudioReviewCaptureError"; }
}
export interface StudioReviewCaptureProgress { readonly phase: "upload" | "complete"; readonly completed: number; readonly total: number }
export type StudioReviewCaptureStatus = { readonly status: "pending" } | { readonly status: "cancelled"; readonly cleanupPending?: boolean }
  | { readonly status: "completed"; readonly subject: StudioVirtualSpaceReviewSubject };

export async function studioReviewCaptureContentDigest(doc: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(doc));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fail(code: string, phase: StudioReviewCapturePhase): never { throw new StudioReviewCaptureError(code, phase, false, false); }
function checkAbort(signal: AbortSignal | undefined, phase: StudioReviewCapturePhase): void {
  if (signal?.aborted) throw new StudioReviewCaptureError("preview-cancelled", phase, true, false);
}
async function request<T>(phase: StudioReviewCapturePhase, perform: () => Promise<T>): Promise<T> {
  try { return await perform(); }
  catch (error) {
    if (error instanceof StudioReviewCaptureError) throw error;
    const status = httpStatus(error);
    const payload = error && typeof error === "object" && "data" in error ? error.data : null;
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
      && /^preview-[a-z-]+$/u.test(payload.code) ? payload.code
      : status === 403 ? "preview-access-or-admission-denied" : status === 404 ? "preview-source-unavailable" : "preview-request-failed";
    const uncertain = status === null || status >= 500;
    throw new StudioReviewCaptureError(code, phase, uncertain || status === 429, uncertain && phase !== "status", { cause: error });
  }
}

function readStatus(raw: unknown, intent: StudioReviewCaptureIntent | StudioReviewCaptureInput, phase: StudioReviewCapturePhase): StudioReviewCaptureStatus {
  const parsed = z.union([
    z.object({ status: z.literal("pending") }).strict(),
    z.object({ status: z.literal("cancelled"), cleanupPending: z.boolean().optional() }).strict(),
    z.object({ status: z.literal("completed"), subject: z.unknown() }).strict(),
  ]).safeParse(raw);
  if (!parsed.success) fail("preview-response-invalid", phase);
  if (parsed.data.status !== "completed") return parsed.data;
  const subject = parseStudioVirtualSpaceReviewSubject(parsed.data.subject);
  if (!subject || ("projectId" in intent && (subject.projectId !== intent.projectId || subject.artifactId !== intent.artifactId)) || subject.workId !== intent.workId
    || subject.rootGraphHash !== intent.sourceContentDigest) fail("preview-response-version-mismatch", phase);
  return { status: "completed", subject };
}

/** Call before rendering; the returned immutable identity is retained through every retry. */
export async function prepareStudioVirtualSpaceReviewCapture(input: StudioReviewCaptureInput,
  options: { readonly signal?: AbortSignal } = {}): Promise<StudioReviewCaptureIntent> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) fail("preview-intent-invalid", "prepare");
  checkAbort(options.signal, "prepare");
  return request("prepare", async () => {
    const raw = await api.post<unknown>(`${BASE}/prepare`, parsed.data, { signal: options.signal, timeout: 60_000, retry: 0 });
    const prepared = intentSchema.safeParse(raw);
    if (!prepared.success) fail("preview-response-invalid", "prepare");
    const { projectId: _projectId, artifactId: _artifactId, expectedHeadRevisionId: _head, expectedHeadRootGraphHash: _hash, ...echo } = prepared.data;
    if (canonicalJson(echo) !== canonicalJson(parsed.data)) fail("preview-response-version-mismatch", "prepare");
    return Object.freeze(prepared.data);
  });
}

export async function getStudioVirtualSpaceReviewCaptureStatus(intent: StudioReviewCaptureIntent,
  options: { readonly signal?: AbortSignal } = {}): Promise<StudioReviewCaptureStatus> {
  if (!intentSchema.safeParse(intent).success) fail("preview-intent-invalid", "status");
  checkAbort(options.signal, "status");
  return request("status", async () => readStatus(await api.post<unknown>(`${BASE}/status`, intent,
    { signal: options.signal, timeout: 60_000, retry: 0 }), intent, "status"));
}

/** No automatic retry, latest-head substitution, second capture, or remote navigation. */
export async function produceStudioVirtualSpaceReviewCapture(intent: StudioReviewCaptureIntent, pages: readonly Blob[],
  options: { readonly signal?: AbortSignal; readonly onProgress?: (progress: StudioReviewCaptureProgress) => void } = {}): Promise<StudioVirtualSpaceReviewSubject> {
  if (!intentSchema.safeParse(intent).success || pages.length !== intent.pageCount
    || pages.some((page) => !(page instanceof Blob) || page.type !== "image/png" || page.size === 0 || page.size > MAX_PAGE_BYTES)) fail("preview-pages-invalid", "upload");
  checkAbort(options.signal, "upload");
  const status = await getStudioVirtualSpaceReviewCaptureStatus(intent, options);
  if (status.status === "completed") return status.subject;
  if (status.status === "cancelled") fail("preview-intent-cancelled", "upload");
  const receipts: { ordinal: number; sha256: string }[] = [];
  for (const [ordinal, page] of pages.entries()) {
    checkAbort(options.signal, "upload");
    const form = new FormData();
    form.set("intent", JSON.stringify(intent));
    form.set("file", page, `review-page-${ordinal + 1}.png`);
    const receipt = await request("upload", async () => {
      const raw = await api.raw.put(apiPath(`${BASE}/pages/${ordinal}`),
        { body: form, signal: options.signal, timeout: 60_000, retry: 0 }).json<unknown>();
      const parsed = z.object({ ordinal: z.number().int().nonnegative(), sha256: sha256Schema,
        width: z.number().int().positive().max(16_384), height: z.number().int().positive().max(16_384) }).strict().safeParse(raw);
      if (!parsed.success || parsed.data.ordinal !== ordinal) fail("preview-response-invalid", "upload");
      return { ordinal, sha256: parsed.data.sha256 };
    });
    receipts.push(receipt);
    options.onProgress?.({ phase: "upload", completed: ordinal + 1, total: pages.length });
  }
  checkAbort(options.signal, "complete");
  options.onProgress?.({ phase: "complete", completed: pages.length, total: pages.length });
  const result = await request("complete", async () => readStatus(await api.post<unknown>(`${BASE}/complete`,
    { intent, pages: receipts }, { signal: options.signal, timeout: 60_000, retry: 0 }), intent, "complete"));
  if (result.status !== "completed") fail("preview-intent-cancelled", "complete");
  return result.subject;
}

export async function cancelStudioVirtualSpaceReviewCapture(intent: StudioReviewCaptureIntent | StudioReviewCaptureInput,
  options: { readonly signal?: AbortSignal } = {}): Promise<Exclude<StudioReviewCaptureStatus, { readonly status: "pending" }>> {
  if (!z.union([intentSchema, inputSchema]).safeParse(intent).success) fail("preview-intent-invalid", "cancel");
  const result = await request("cancel", async () => readStatus(await api.post<unknown>(`${BASE}/cancel`, { intent },
    { signal: options.signal, timeout: 60_000, retry: 0 }), intent, "cancel"));
  if (result.status === "pending") fail("preview-response-invalid", "cancel");
  return result;
}
