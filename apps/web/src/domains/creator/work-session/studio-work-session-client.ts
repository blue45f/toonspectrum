import { z } from "zod";
import { canonicalJson, studioWorkSessionId, studioWorkSessionViewSchema, studioWorkSessionListSchema, studioWorkSessionMutationSchema, studioWorkSessionReceiptSchema,
  type StudioWorkSessionCreate, type StudioWorkSessionCommand, type StudioWorkSessionView } from "@toonspectrum/studio-project-model";
import { api } from "@/infrastructure/api";

export type StudioSessionList = z.infer<typeof studioWorkSessionListSchema>;
export type StudioSessionMutation = z.infer<typeof studioWorkSessionMutationSchema>;
const receiptLookup = z.object({ view: studioWorkSessionViewSchema, receipt: studioWorkSessionReceiptSchema.nullable() }).strict();
export type StudioSessionReceiptLookup = z.infer<typeof receiptLookup>;
export interface StudioWorkSessionApi {
  list(workId: string, signal: AbortSignal, cursor?: string | null): Promise<StudioSessionList>;
  current(workId: string, sessionId: string, signal: AbortSignal): Promise<StudioWorkSessionView>;
  create(workId: string, input: StudioWorkSessionCreate, signal: AbortSignal): Promise<StudioSessionMutation>;
  command(workId: string, sessionId: string, input: StudioWorkSessionCommand, signal: AbortSignal): Promise<StudioSessionMutation>;
  receipt(workId: string, sessionId: string, operationId: string, signal: AbortSignal): Promise<StudioSessionReceiptLookup>;
}
const base = (workId: string) => `/creator/works/${encodeURIComponent(studioWorkSessionId.parse(workId))}/work-sessions`;
const path = (workId: string, sessionId: string) => `${base(workId)}/${encodeURIComponent(studioWorkSessionId.parse(sessionId))}`;
function scope(view: StudioWorkSessionView, workId: string, sessionId?: string) {
  if (view.session.workId !== workId || (sessionId && view.session.id !== sessionId)) throw new Error("Work-session response scope mismatch");
  return view;
}
export async function verifyStudioSessionMutation(raw: unknown, workId: string, sessionId: string, operationId: string): Promise<StudioSessionMutation> {
  const result = studioWorkSessionMutationSchema.parse(raw), { receipt, view } = result;
  scope(view, workId, sessionId);
  if (receipt.workId !== workId || receipt.sessionId !== sessionId || receipt.operationId !== operationId
    || receipt.resultVersion !== receipt.previousVersion + 1 || receipt.resultVersion > view.session.version) throw new Error("Work-session receipt mismatch");
  if (receipt.resultVersion === view.session.version) {
    const bytes = new TextEncoder().encode(canonicalJson(view.session));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
    if (hash !== receipt.stateHash) throw new Error("Work-session receipt content mismatch");
  }
  return result;
}
export const studioWorkSessionApi: StudioWorkSessionApi = {
  async list(workId, signal, cursor = null) {
    const value = studioWorkSessionListSchema.parse(await api.get(`${base(workId)}${cursor ? `?cursor=${encodeURIComponent(studioWorkSessionId.parse(cursor))}` : ""}`, { signal, retry: 0 }));
    value.items.forEach((item) => scope(item, workId)); return value;
  },
  async current(workId, sessionId, signal) {
    return scope(studioWorkSessionViewSchema.parse(await api.get(path(workId, sessionId), { signal, retry: 0 })), workId, sessionId);
  },
  async create(workId, input, signal) {
    return verifyStudioSessionMutation(await api.post(base(workId), input, { signal, retry: 0 }), workId, input.id, input.operationId);
  },
  async command(workId, sessionId, input, signal) {
    return verifyStudioSessionMutation(await api.post(`${path(workId, sessionId)}/commands`, input, { signal, retry: 0 }), workId, sessionId, input.operationId);
  },
  async receipt(workId, sessionId, operationId, signal) {
    const value = receiptLookup.parse(await api.get(`${path(workId, sessionId)}/operations/${encodeURIComponent(studioWorkSessionId.parse(operationId))}`, { signal, retry: 0 }));
    scope(value.view, workId, sessionId);
    if (value.receipt) await verifyStudioSessionMutation(value, workId, sessionId, operationId);
    return value;
  },
};

/** The receipt must match the exact actor/work/request payload, not only a reused operation ID. */
export async function studioWorkSessionRequestHash(workId: string, sessionId: string, input: StudioWorkSessionCreate | StudioWorkSessionCommand): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ workId, sessionId, input }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
