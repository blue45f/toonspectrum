import { z } from "zod";

import { studioReviewSourceReferenceSchema } from "./review-source-map";

import type { StudioWorkSession, StudioWorkSessionActor } from "./work-session";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const assetId = z.string().min(1).max(160).refine((value) => value.trim().length > 0
  && [...value].every((character) => { const point = character.codePointAt(0)!; return point > 31 && (point < 127 || point > 159); }), "Invalid asset identity");
const at = z.iso.datetime({ offset: true });
const shortText = z.string().trim().min(1).max(160);
const explanation = z.string().trim().min(1).max(2000);
const base = { operationId: id, expectedVersion: z.number().int().min(1).max(1_000_000) };

export const studioSessionAgendaInputSchema = z.object({
  id, source: studioReviewSourceReferenceSchema, title: shortText,
  purpose: z.string().trim().max(1000), dialogue: z.string().trim().max(4000),
  assignedUserId: id.nullable(),
}).strict();
const agendaOutcome = z.object({ authorUserId: id, at, body: explanation }).strict();
export const studioSessionAgendaItemSchema = studioSessionAgendaInputSchema.extend({
  revision: z.number().int().positive(), createdBy: id, createdAt: at, updatedBy: id, updatedAt: at,
  outcome: agendaOutcome.nullable(),
}).strict();

/** Bytes are pinned by identity and digest. Descriptions are not rights grants. */
export const studioSessionMaterialAssetSchema = z.object({
  assetId, sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  elementType: z.enum(["image", "vrm", "background3d"]),
}).strict();
export const studioSessionMaterialInputSchema = z.object({
  id, asset: studioSessionMaterialAssetSchema, title: shortText,
  rationale: explanation, usageConditions: explanation,
}).strict();
const candidate = studioSessionMaterialInputSchema.extend({
  proposedBy: id, proposedAt: at, withdrawnAt: at.nullable(),
}).strict();
const vote = z.object({ userId: id, candidateId: id, rationale: z.string().trim().max(1000), at }).strict();
const decision = z.object({
  candidateId: id.nullable(), authorUserId: id, at, rationale: explanation,
  sessionVersion: z.number().int().positive(), votes: z.array(vote).max(24),
}).strict();

/** Never default this absent field while replaying a historical v1 event. */
export const studioSessionWorkflowSchema = z.object({
  version: z.literal(1), agenda: z.array(studioSessionAgendaItemSchema).max(32),
  retiredAgendaIds: z.array(id).max(128),
  activeAgendaItemId: id.nullable(), materialCandidates: z.array(candidate).max(16),
  materialVotes: z.array(vote).max(24), materialDecisions: z.array(decision).max(16),
}).strict().superRefine((state, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(state.retiredAgendaIds).size !== state.retiredAgendaIds.length
    || state.agenda.some((item) => state.retiredAgendaIds.includes(item.id))) issue("Reused retired agenda identity");
  if (new Set(state.agenda.map((item) => item.id)).size !== state.agenda.length) issue("Duplicate agenda identity");
  if (state.activeAgendaItemId && !state.agenda.some((item) => item.id === state.activeAgendaItemId)) issue("Missing active agenda item");
  if (new Set(state.materialCandidates.map((item) => item.id)).size !== state.materialCandidates.length) issue("Duplicate candidate identity");
  const candidates = new Set(state.materialCandidates.map((item) => item.id));
  if (new Set(state.materialVotes.map((item) => item.userId)).size !== state.materialVotes.length) issue("Duplicate voter");
  if (state.materialVotes.some((item) => !candidates.has(item.candidateId))) issue("Vote has no candidate");
  if (state.materialDecisions.some((item) => (item.candidateId !== null && !candidates.has(item.candidateId))
    || new Set(item.votes.map((ballot) => ballot.userId)).size !== item.votes.length
    || item.votes.some((ballot) => !candidates.has(ballot.candidateId)))) issue("Invalid decision evidence");
});
export type StudioSessionWorkflow = z.infer<typeof studioSessionWorkflowSchema>;
export type StudioSessionAgendaItem = z.infer<typeof studioSessionAgendaItemSchema>;
export type StudioSessionMaterialAsset = z.infer<typeof studioSessionMaterialAssetSchema>;

export const studioSessionWorkflowCommandOptions = [
  z.object({ ...base, action: z.literal("agenda-add"), item: studioSessionAgendaInputSchema }).strict(),
  z.object({ ...base, action: z.literal("agenda-edit"), itemId: id, expectedItemRevision: z.number().int().positive(),
    title: shortText, purpose: z.string().trim().max(1000), dialogue: z.string().trim().max(4000), assignedUserId: id.nullable() }).strict(),
  z.object({ ...base, action: z.literal("agenda-remove"), itemId: id, expectedItemRevision: z.number().int().positive() }).strict(),
  z.object({ ...base, action: z.literal("agenda-reorder"), expectedOrder: z.array(id).max(32), itemIds: z.array(id).max(32) }).strict(),
  z.object({ ...base, action: z.literal("agenda-focus"), itemId: id.nullable() }).strict(),
  z.object({ ...base, action: z.literal("agenda-conclude"), itemId: id, expectedItemRevision: z.number().int().positive(), body: explanation }).strict(),
  z.object({ ...base, action: z.literal("material-propose"), candidate: studioSessionMaterialInputSchema }).strict(),
  z.object({ ...base, action: z.literal("material-withdraw"), candidateId: id }).strict(),
  z.object({ ...base, action: z.literal("material-vote"), candidateId: id.nullable(), rationale: z.string().trim().max(1000) }).strict(),
  z.object({ ...base, action: z.literal("material-decide"), observedVersion: z.number().int().positive(), candidateId: id.nullable(), rationale: explanation }).strict(),
] as const;
export const studioSessionWorkflowCommandSchema = z.discriminatedUnion("action", studioSessionWorkflowCommandOptions);
export type StudioSessionWorkflowCommand = z.infer<typeof studioSessionWorkflowCommandSchema>;
export const isStudioSessionWorkflowCommand = (command: { readonly action: string }): command is StudioSessionWorkflowCommand =>
  command.action.startsWith("agenda-") || command.action.startsWith("material-");
export function emptyStudioSessionWorkflow(): StudioSessionWorkflow {
  return { version: 1, agenda: [], retiredAgendaIds: [], activeAgendaItemId: null, materialCandidates: [], materialVotes: [], materialDecisions: [] };
}

/** Pure transition only: the repository verifies all saved page/asset references. */
export function reduceStudioSessionWorkflow(
  current: StudioWorkSession, command: StudioSessionWorkflowCommand, actor: StudioWorkSessionActor, timestamp: string,
  fail: (reason: "conflict" | "forbidden" | "invalid-transition" | "invalid-target" | "capacity") => never,
): StudioWorkSession {
  const host = current.createdBy === actor.userId && actor.canEdit;
  if (!current.participantUserIds.includes(actor.userId) || !actor.canComment) return fail("forbidden");
  const state = current.workflow ?? emptyStudioSessionWorkflow();
  let next: StudioSessionWorkflow = state;
  let readerUserId = current.readerUserId;
  const selected = state.materialDecisions.at(-1)?.candidateId ?? null;
  if (command.action.startsWith("agenda-")) {
    if (!host) return fail("forbidden");
    if (!["storyboard", "reading", "scene-review", "mentoring", "review"].includes(current.kind)) return fail("invalid-transition");
  } else if (current.kind !== "material-choice") return fail("invalid-transition");
  const ensureAssignee = (userId: string | null) => {
    if (userId && !current.participantUserIds.includes(userId)) return fail("invalid-target");
  };
  const liveCandidate = (candidateId: string) => {
    const found = state.materialCandidates.find((item) => item.id === candidateId && item.withdrawnAt === null);
    if (!found) return fail("invalid-target");
    return found;
  };
  switch (command.action) {
    case "agenda-add": {
      if (state.agenda.length >= 32) return fail("capacity");
      if (state.retiredAgendaIds.includes(command.item.id) || state.agenda.some((item) => item.id === command.item.id)) return fail("invalid-target");
      ensureAssignee(command.item.assignedUserId);
      next = { ...state, agenda: [...state.agenda, { ...command.item, revision: 1, createdBy: actor.userId, createdAt: timestamp,
        updatedBy: actor.userId, updatedAt: timestamp, outcome: null }] }; break;
    }
    case "agenda-edit": {
      const item = state.agenda.find((entry) => entry.id === command.itemId);
      if (!item) return fail("invalid-target");
      if (item.revision !== command.expectedItemRevision) return fail("conflict");
      if (item.outcome) return fail("invalid-transition");
      ensureAssignee(command.assignedUserId);
      const { title, purpose, dialogue, assignedUserId } = command;
      next = { ...state, agenda: state.agenda.map((entry) => entry.id !== item.id ? entry
        : { ...entry, revision: entry.revision + 1, title, purpose, dialogue, assignedUserId, updatedBy: actor.userId, updatedAt: timestamp }) };
      if (current.kind === "reading" && state.activeAgendaItemId === item.id) readerUserId = assignedUserId;
      break;
    }
    case "agenda-remove": {
      const item = state.agenda.find((entry) => entry.id === command.itemId);
      if (!item) return fail("invalid-target");
      if (item.revision !== command.expectedItemRevision) return fail("conflict");
      if (current.status === "active" || item.outcome) return fail("invalid-transition");
      next = { ...state, retiredAgendaIds: [...state.retiredAgendaIds, item.id], agenda: state.agenda.filter((entry) => entry.id !== item.id),
        activeAgendaItemId: state.activeAgendaItemId === item.id ? null : state.activeAgendaItemId };
      if (current.kind === "reading" && state.activeAgendaItemId === item.id) readerUserId = null;
      break;
    }
    case "agenda-reorder": {
      if (JSON.stringify(command.expectedOrder) !== JSON.stringify(state.agenda.map((item) => item.id))) return fail("conflict");
      if (new Set(command.itemIds).size !== state.agenda.length || command.itemIds.length !== state.agenda.length
        || command.itemIds.some((itemId) => !state.agenda.some((entry) => entry.id === itemId))) return fail("invalid-target");
      next = { ...state, agenda: command.itemIds.map((itemId) => state.agenda.find((entry) => entry.id === itemId)!) }; break;
    }
    case "agenda-focus": {
      if (current.status !== "active") return fail("invalid-transition");
      const item = command.itemId === null ? null : state.agenda.find((entry) => entry.id === command.itemId);
      if (command.itemId !== null && !item) return fail("invalid-target");
      ensureAssignee(item?.assignedUserId ?? null);
      next = { ...state, activeAgendaItemId: item?.id ?? null };
      if (current.kind === "reading") readerUserId = item?.assignedUserId ?? null;
      break;
    }
    case "agenda-conclude": {
      if (current.status !== "active") return fail("invalid-transition");
      const item = state.agenda.find((entry) => entry.id === command.itemId);
      if (!item) return fail("invalid-target");
      if (item.revision !== command.expectedItemRevision) return fail("conflict");
      if (item.outcome) return fail("invalid-transition");
      next = { ...state, agenda: state.agenda.map((entry) => entry.id !== item.id ? entry
        : { ...entry, outcome: { authorUserId: actor.userId, at: timestamp, body: command.body } }) }; break;
    }
    case "material-propose": {
      if (selected !== null) return fail("invalid-transition");
      if (state.materialCandidates.length >= 16) return fail("capacity");
      if (state.materialCandidates.some((item) => item.id === command.candidate.id
        || (item.withdrawnAt === null && item.asset.assetId === command.candidate.asset.assetId))) return fail("invalid-target");
      next = { ...state, materialCandidates: [...state.materialCandidates, { ...command.candidate,
        proposedBy: actor.userId, proposedAt: timestamp, withdrawnAt: null }] }; break;
    }
    case "material-withdraw": {
      if (selected !== null) return fail("invalid-transition");
      const item = liveCandidate(command.candidateId);
      if (!host && item.proposedBy !== actor.userId) return fail("forbidden");
      next = { ...state, materialCandidates: state.materialCandidates.map((entry) => entry.id === item.id
        ? { ...entry, withdrawnAt: timestamp } : entry), materialVotes: state.materialVotes.filter((ballot) => ballot.candidateId !== item.id) }; break;
    }
    case "material-vote": {
      if (current.status !== "active" || selected !== null) return fail("invalid-transition");
      if (command.candidateId !== null) liveCandidate(command.candidateId);
      next = { ...state, materialVotes: [...state.materialVotes.filter((item) => item.userId !== actor.userId),
        ...(command.candidateId === null ? [] : [{ userId: actor.userId, candidateId: command.candidateId, rationale: command.rationale, at: timestamp }])] }; break;
    }
    case "material-decide": {
      if (!host) return fail("forbidden");
      if (command.observedVersion !== current.version) return fail("conflict");
      if (current.status !== "active") return fail("invalid-transition");
      if (state.materialDecisions.length >= 16) return fail("capacity");
      if (command.candidateId !== null) liveCandidate(command.candidateId);
      if (command.candidateId === null && selected === null) return fail("invalid-transition");
      next = { ...state, materialDecisions: [...state.materialDecisions, { candidateId: command.candidateId,
        authorUserId: actor.userId, at: timestamp, rationale: command.rationale, sessionVersion: current.version,
        votes: state.materialVotes.map((item) => ({ ...item })) }] }; break;
    }
  }
  return { ...current, version: current.version + 1, updatedBy: actor.userId, updatedAt: timestamp,
    readerUserId, workflow: studioSessionWorkflowSchema.parse(next) };
}


export const studioSessionResourcesSchema = z.object({
  workId: id, sessionId: id, inputDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  expiresAt: at, sourceStatus: z.enum(["mapped", "unavailable"]),
  pages: z.array(z.object({ source: studioReviewSourceReferenceSchema,
    previewCursor: z.string().regex(/^(0|[1-9][0-9]{0,6})\.[a-f0-9]{64}$/u).nullable(),
    title: shortText, frameIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u)).max(1000) }).strict()).max(25),
  nextPageOffset: z.number().int().min(0).max(99999).nullable(),
  assets: z.array(studioSessionMaterialAssetSchema.extend({ title: shortText }).strict()).max(250),
}).strict();
export type StudioSessionResources = z.infer<typeof studioSessionResourcesSchema>;
