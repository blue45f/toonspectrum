import { canonicalJson, reviewAnchorSchema, studioEntityIdSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { parseStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

export const draftNoteInputSchema = z.object({
  id: studioEntityIdSchema, anchor: reviewAnchorSchema, body: z.string().trim().min(1).max(20_000),
  severity: z.enum(["note", "recommended", "required"]),
  assigneeIds: z.array(studioEntityIdSchema).max(64).default([]),
  dueAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export type ReviewDraftInput = z.infer<typeof draftNoteInputSchema>;
const entrySchema = z.object({ input: draftNoteInputSchema, state: z.enum(["draft", "attempted"]), savedAt: z.number().int().nonnegative() }).strict();
export type ReviewPrivateDraft = z.infer<typeof entrySchema>;
const shelfSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema).max(20) }).strict();
export interface ReviewDraftScope { readonly actorId: string; readonly subject: StudioVirtualSpaceReviewSubject }
export function reviewDraftScopeKey(scope: ReviewDraftScope): string {
  studioEntityIdSchema.parse(scope.actorId);
  const subject = parseStudioVirtualSpaceReviewSubject(scope.subject);
  if (!subject) throw new Error("Invalid draft scope");
  return canonicalJson({ actorId: scope.actorId, subject });
}
export const draftContentKey = (input: ReviewDraftInput): string => canonicalJson({ ...input, id: null, assigneeIds: [...input.assigneeIds].sort() });
export function parseReviewDraftShelf(raw: string | null, scope: ReviewDraftScope): ReviewPrivateDraft[] {
  if (raw === null) return [];
  if (new TextEncoder().encode(raw).byteLength > 1_000_000) throw new Error("Draft capacity exceeded");
  const { entries } = shelfSchema.parse(JSON.parse(raw));
  if (new Set(entries.map((entry) => entry.input.id)).size !== entries.length) throw new Error("Duplicate draft identity");
  for (const { input } of entries) {
    if (input.anchor.artifactId !== scope.subject.artifactId || input.anchor.revisionId !== scope.subject.revisionId
      || input.anchor.scope.projectId !== scope.subject.projectId
      || new Set(input.assigneeIds).size !== input.assigneeIds.length) throw new Error("Draft target mismatch");
  }
  return entries;
}
export type ReviewDraftLock = <T>(key: string, action: () => Promise<T>) => Promise<T>;
export interface ReviewDraftRepository {
  list(scope: ReviewDraftScope): Promise<ReviewPrivateDraft[]>;
  add(scope: ReviewDraftScope, input: ReviewDraftInput, current: () => boolean): Promise<ReviewPrivateDraft[]>;
  reviseBody(scope: ReviewDraftScope, id: string, body: string, current: () => boolean): Promise<ReviewPrivateDraft[]>;
  markAttempt(scope: ReviewDraftScope, id: string, current: () => boolean): Promise<ReviewPrivateDraft>;
  remove(scope: ReviewDraftScope, id: string, current: () => boolean, confirmed?: boolean): Promise<ReviewPrivateDraft[]>;
  publishLock: ReviewDraftLock;
}
export function createReviewDraftRepository(store: StudioAsyncKeyValueStore, lock: ReviewDraftLock): ReviewDraftRepository {
  const list = async (scope: ReviewDraftScope) => parseReviewDraftShelf(await store.get(reviewDraftScopeKey(scope)), scope);
  const update = (scope: ReviewDraftScope, current: () => boolean, apply: (entries: ReviewPrivateDraft[]) => ReviewPrivateDraft[]) =>
    lock(`studio-review-drafts:storage:${reviewDraftScopeKey(scope)}`, async () => {
      if (!current()) throw new Error("Draft operation is no longer current");
      const previous = await list(scope);
      if (!current()) throw new Error("Draft operation is no longer current");
      const next = apply(previous), raw = JSON.stringify({ version: 1, entries: next });
      parseReviewDraftShelf(raw, scope);
      await store.set(reviewDraftScopeKey(scope), raw); return next;
    });
  return {
    list, publishLock: lock,
    add: (scope, raw, current) => update(scope, current, (entries) => {
      const input = draftNoteInputSchema.parse(raw);
      const duplicate = entries.find((entry) => draftContentKey(entry.input) === draftContentKey(input));
      return duplicate ? entries : [...entries, { input, state: "draft", savedAt: Date.now() }];
    }),
    reviseBody: (scope, id, body, current) => update(scope, current, (entries) => {
      const entry = entries.find((item) => item.input.id === id);
      if (!entry || entry.state !== "draft") throw new Error("Only unpublished drafts may be edited");
      const input = draftNoteInputSchema.parse({ ...entry.input, body });
      return entries.map((item) => item.input.id === id ? { ...item, input } : item);
    }),
    markAttempt: async (scope, id, current) => {
      const next = await update(scope, current, (entries) => {
        if (!entries.some((entry) => entry.input.id === id)) throw new Error("Draft no longer exists");
        return entries.map((entry) => entry.input.id === id ? { ...entry, state: "attempted" } : entry);
      });
      return next.find((entry) => entry.input.id === id)!;
    },
    remove: (scope, id, current, confirmed = false) => update(scope, current, (entries) => {
      if (!confirmed && entries.some((entry) => entry.input.id === id && entry.state === "attempted")) throw new Error("Reconcile the publication result before deleting this draft");
      return entries.filter((entry) => entry.input.id !== id);
    }),
  };
}
export async function acquireReviewDraftRepository(): Promise<ReviewDraftRepository> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  return createReviewDraftRepository(database.asAsyncKeyValueStore("studio-private-review-drafts-v1"), async (key, action) => {
    if (typeof navigator.locks?.request !== "function") throw new Error("Private draft storage requires Web Locks");
    return navigator.locks.request(key, action);
  });
}
