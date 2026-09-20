import { z } from "zod";

import { studioReviewTaskReferenceSchema } from "./review-task-reference";

export const STUDIO_WORK_SESSION_ARTIFACT_PREFIX = "studio-work-session:";
export const studioWorkSessionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const pin = studioReviewTaskReferenceSchema.shape.subject;
const timestamp = z.iso.datetime({ offset: true });
const identities = z.array(studioWorkSessionId).max(24).refine((value) => new Set(value).size === value.length, "Duplicate identity");
export const studioWorkSessionKindSchema = z.enum(["review", "storyboard", "reading", "material-choice", "scene-review", "mentoring"]);
export const studioWorkSessionResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review"), subject: pin }).strict(),
  z.object({ type: z.literal("task"), id: studioWorkSessionId }).strict(),
  z.object({ type: z.literal("handoff"), id: studioWorkSessionId }).strict(),
]);
const presenter = z.object({ pageOrdinal: z.number().int().min(0).max(499), zoom: z.number().min(0.25).max(4), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const studioWorkSessionSchema = z.object({
  contract: z.literal("studio-work-session-v1"), id: studioWorkSessionId, workId: studioWorkSessionId,
  title: z.string().trim().min(1).max(160), purpose: z.string().trim().min(1).max(1000), kind: studioWorkSessionKindSchema,
  input: pin, createdBy: studioWorkSessionId, createdAt: timestamp, updatedBy: studioWorkSessionId, updatedAt: timestamp,
  version: z.number().int().min(1).max(1_000_000), status: z.enum(["draft", "ready", "active", "paused", "closed", "cancelled"]),
  invitedUserIds: identities, participantUserIds: identities, readerUserId: studioWorkSessionId.nullable(), presenter: presenter.nullable(),
  notes: z.array(z.object({ id: studioWorkSessionId, authorUserId: studioWorkSessionId, at: timestamp,
    category: z.enum(["note", "decision", "unresolved", "material-choice", "ai-evidence"]), body: z.string().trim().min(1).max(2000) }).strict()).max(100),
  results: z.array(studioWorkSessionResultSchema).max(64), closeSummary: z.string().trim().min(1).max(4000).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.input.workId !== value.workId || value.results.some((result) => result.type === "review" && result.subject.workId !== value.workId)) ctx.addIssue({ code: "custom", message: "Cross-work session reference" });
  if (value.participantUserIds.some((id) => id !== value.createdBy && !value.invitedUserIds.includes(id))) ctx.addIssue({ code: "custom", message: "Participant was not invited" });
  if (value.readerUserId && !value.participantUserIds.includes(value.readerUserId)) ctx.addIssue({ code: "custom", message: "Reader has not joined" });
  if (value.status === "closed" && !value.closeSummary) ctx.addIssue({ code: "custom", message: "A closed session needs an explicit outcome" });
  if (new Set(value.notes.map((note) => note.id)).size !== value.notes.length) ctx.addIssue({ code: "custom", message: "Duplicate note" });
  if (JSON.stringify(value).length > 256_000) ctx.addIssue({ code: "custom", message: "Session exceeds storage budget" });
});
export type StudioWorkSession = z.infer<typeof studioWorkSessionSchema>;
export type StudioWorkSessionResult = z.infer<typeof studioWorkSessionResultSchema>;
export const studioWorkSessionCreateSchema = z.object({
  operationId: studioWorkSessionId, id: studioWorkSessionId, title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(1000), kind: studioWorkSessionKindSchema, input: pin, invitedUserIds: identities,
}).strict();
export type StudioWorkSessionCreate = z.infer<typeof studioWorkSessionCreateSchema>;
const base = { operationId: studioWorkSessionId, expectedVersion: z.number().int().min(1).max(1_000_000) };
export const studioWorkSessionCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.enum(["join", "leave", "ready", "start", "pause", "resume", "cancel"]) }).strict(),
  z.object({ ...base, action: z.literal("close"), summary: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ ...base, action: z.literal("note"), category: z.enum(["note", "decision", "unresolved", "material-choice", "ai-evidence"]), body: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...base, action: z.literal("attach-result"), result: studioWorkSessionResultSchema }).strict(),
  z.object({ ...base, action: z.literal("present"), presenter }).strict(),
  z.object({ ...base, action: z.literal("reader"), userId: studioWorkSessionId.nullable() }).strict(),
]);
export type StudioWorkSessionCommand = z.infer<typeof studioWorkSessionCommandSchema>;
export interface StudioWorkSessionActor { readonly userId: string; readonly canEdit: boolean; readonly canComment: boolean }
export class StudioWorkSessionCommandError extends Error {
  constructor(readonly code: "forbidden" | "conflict" | "closed" | "invalid-transition" | "invalid-target" | "capacity") { super(code); }
}
const fail = (code: StudioWorkSessionCommandError["code"]): never => { throw new StudioWorkSessionCommandError(code); };
export function createStudioWorkSession(raw: StudioWorkSessionCreate, actor: StudioWorkSessionActor, at: string): StudioWorkSession {
  const input = studioWorkSessionCreateSchema.parse(raw);
  if (!actor.canEdit) return fail("forbidden");
  return studioWorkSessionSchema.parse({ contract: "studio-work-session-v1", id: input.id, workId: input.input.workId, title: input.title, purpose: input.purpose, kind: input.kind,
    input: input.input, createdBy: actor.userId, createdAt: at, updatedBy: actor.userId, updatedAt: at, version: 1, status: "draft",
    invitedUserIds: input.invitedUserIds.filter((id) => id !== actor.userId), participantUserIds: [actor.userId], readerUserId: null, presenter: null, notes: [], results: [], closeSummary: null });
}
/** Pure transition contract only. The API must independently verify current ACL, pins and all result references. */
export function reduceStudioWorkSession(current: StudioWorkSession, raw: StudioWorkSessionCommand, actor: StudioWorkSessionActor, at: string): StudioWorkSession {
  const command = studioWorkSessionCommandSchema.parse(raw);
  if (command.expectedVersion !== current.version) return fail("conflict");
  const host = actor.userId === current.createdBy && actor.canEdit;
  const invited = actor.userId === current.createdBy || current.invitedUserIds.includes(actor.userId);
  const joined = current.participantUserIds.includes(actor.userId);
  if (!invited) return fail("forbidden");
  if (current.status === "closed" || current.status === "cancelled") return fail("closed");
  if (current.version >= 128 && command.action !== "close" && command.action !== "cancel") return fail("capacity");
  let next: StudioWorkSession = { ...current, version: current.version + 1, updatedBy: actor.userId, updatedAt: at };
  switch (command.action) {
    case "join":
      if (!joined && current.participantUserIds.length >= 24) return fail("capacity");
      next = { ...next, participantUserIds: joined ? current.participantUserIds : [...current.participantUserIds, actor.userId] }; break;
    case "leave":
      if (host && current.status === "active") return fail("invalid-transition");
      next = { ...next, participantUserIds: current.participantUserIds.filter((id) => id !== actor.userId), readerUserId: current.readerUserId === actor.userId ? null : current.readerUserId }; break;
    case "note":
      if (current.notes.length >= 100) return fail("capacity");
      if (!joined || !actor.canComment || (command.category === "decision" && !host)) return fail("forbidden");
      next = { ...next, notes: [...current.notes, { id: command.operationId, authorUserId: actor.userId, at, category: command.category, body: command.body }] }; break;
    case "attach-result":
      if (current.results.length >= 64) return fail("capacity");
      if (!joined || !actor.canComment) return fail("forbidden");
      if (command.result.type === "review" && command.result.subject.workId !== current.workId) return fail("invalid-target");
      next = { ...next, results: [...current.results.filter((result) => JSON.stringify(result) !== JSON.stringify(command.result)), command.result] }; break;
    case "present":
      if (!host || !joined) return fail("forbidden");
      if (current.status !== "active") return fail("invalid-transition");
      next = { ...next, presenter: command.presenter }; break;
    case "reader":
      if (!host) return fail("forbidden");
      if (current.kind !== "reading" || current.status !== "active") return fail("invalid-transition");
      if (command.userId !== null && !current.participantUserIds.includes(command.userId)) return fail("invalid-target");
      next = { ...next, readerUserId: command.userId }; break;
    default: {
      if (!host || !joined) return fail("forbidden");
      const required = { ready: "draft", start: "ready", pause: "active", resume: "paused" } as const;
      if (command.action in required && current.status !== required[command.action as keyof typeof required]) return fail("invalid-transition");
      if (command.action === "close" && !["active", "paused"].includes(current.status)) return fail("invalid-transition");
      const status = { ready: "ready", start: "active", pause: "paused", resume: "active", cancel: "cancelled", close: "closed" } as const;
      next = { ...next, status: status[command.action], ...(command.action === "close" ? { closeSummary: command.summary } : {}) }; break;
    }
  }
  return studioWorkSessionSchema.parse(next);
}
export const studioWorkSessionViewSchema = z.object({ session: studioWorkSessionSchema,
  capabilities: z.object({ edit: z.boolean(), comment: z.boolean() }).strict() }).strict();
export type StudioWorkSessionView = z.infer<typeof studioWorkSessionViewSchema>;
export const studioWorkSessionListSchema = z.object({ items: z.array(studioWorkSessionViewSchema).max(25), nextCursor: studioWorkSessionId.nullable() }).strict();
export const studioWorkSessionReceiptSchema = z.object({ contract: z.literal("studio-work-session-receipt-v1"),
  actorUserId: studioWorkSessionId, operationId: studioWorkSessionId, workId: studioWorkSessionId, sessionId: studioWorkSessionId,
  previousVersion: z.number().int().min(0), resultVersion: z.number().int().min(1), requestHash: z.string().regex(/^[a-f0-9]{64}$/u), stateHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
export type StudioWorkSessionReceipt = z.infer<typeof studioWorkSessionReceiptSchema>;

export const studioWorkSessionMutationSchema = z.object({ view: studioWorkSessionViewSchema, receipt: studioWorkSessionReceiptSchema }).strict();
