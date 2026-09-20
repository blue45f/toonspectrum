import { canonicalJson } from "@toonspectrum/studio-project-model";
import { studioWorldManifestSchema, studioWorldPublicationSchema, type StudioWorldPublication, type StudioWorldPublish } from "@toonspectrum/studio-project-model/world-publication";
import { z } from "zod";
import { api, httpStatus } from "@/infrastructure/api";
import { getStudioTeam } from "../../studio-team-client";
import { validateStudioWorldManifest } from "../studio-virtual-space-world-manifest";

export type StudioWorldPublicationReason = "unavailable" | "access-denied" | "invalid-world" | "conflict" | "assets" | "uncertain" | "context-changed";
export class StudioWorldPublicationError extends Error {
  constructor(readonly reason: StudioWorldPublicationReason) { super(reason); }
}
export async function studioWorldDigest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new StudioWorldPublicationError("unavailable");
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function studioWorldPublishManifest(raw: unknown) {
  const parsed = studioWorldManifestSchema.safeParse(raw);
  if (!parsed.success || validateStudioWorldManifest(parsed.data).length) throw new StudioWorldPublicationError("invalid-world");
  return parsed.data;
}
export async function parseStudioWorldPublication(raw: unknown, workId: string): Promise<StudioWorldPublication> {
  const parsed = studioWorldPublicationSchema.safeParse(raw);
  if (!parsed.success || parsed.data.workId !== workId) throw new StudioWorldPublicationError("invalid-world");
  studioWorldPublishManifest(parsed.data.manifest);
  if (await studioWorldDigest(parsed.data.manifest) !== parsed.data.contentHash) throw new StudioWorldPublicationError("invalid-world");
  return parsed.data;
}
const path = (workId: string) => `/studio-project-graph/works/${encodeURIComponent(workId)}/world`;
export async function readStudioWorldPublication(workId: string, signal: AbortSignal) {
  const raw = await api.get<unknown>(path(workId), { signal, retry: 0, cache: "no-store" });
  const parsed = z.object({ publication: z.unknown().nullable() }).strict().safeParse(raw);
  if (!parsed.success || parsed.data.publication === undefined) throw new StudioWorldPublicationError("invalid-world");
  return parsed.data.publication === null ? null : parseStudioWorldPublication(parsed.data.publication, workId);
}
export async function publishStudioWorld(workId: string, input: StudioWorldPublish, intentId: string, signal: AbortSignal) {
  const raw = await api.post<unknown>(`${path(workId)}/publish`, input, { signal, retry: 0, headers: { "Idempotency-Key": intentId } });
  const parsed = z.object({ publication: z.unknown(), replayed: z.boolean() }).strict().safeParse(raw);
  if (!parsed.success) throw new StudioWorldPublicationError("uncertain");
  const publication = await parseStudioWorldPublication(parsed.data.publication, workId);
  if (publication.previousPublishedRevisionId !== input.expectedPublishedRevisionId
    || canonicalJson(publication.manifest) !== canonicalJson(input.manifest)) throw new StudioWorldPublicationError("uncertain");
  return { publication, replayed: parsed.data.replayed };
}
export interface StudioWorldPublicationAuthority {
  readonly publication: StudioWorldPublication | null;
  readonly canPublish: boolean;
  readonly expiresAt: number;
}
export async function readStudioWorldPublicationAuthority(workId: string, actorId: string, signal: AbortSignal): Promise<StudioWorldPublicationAuthority> {
  const started = Date.now();
  const [publication, team] = await Promise.all([readStudioWorldPublication(workId, signal), getStudioTeam(workId, signal)]);
  if (signal.aborted) throw new StudioWorldPublicationError("context-changed");
  if (team.workId !== workId || team.viewer.userId !== actorId || team.viewer.status !== "active" || !team.viewer.capabilities.view) {
    throw new StudioWorldPublicationError("access-denied");
  }
  if (Date.now() >= started + 15_000) throw new StudioWorldPublicationError("unavailable");
  return { publication, canPublish: team.viewer.capabilities.manageMembers, expiresAt: started + 15_000 };
}
export function studioWorldPublicationFailure(error: unknown): StudioWorldPublicationReason {
  if (error instanceof StudioWorldPublicationError) return error.reason;
  const status = httpStatus(error);
  return status === 401 || status === 403 || status === 404 ? "access-denied" : status === 409 ? "conflict" : status === 422 ? "invalid-world" : "unavailable";
}
