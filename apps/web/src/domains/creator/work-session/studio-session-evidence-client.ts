import { studioWorkSessionId } from "@toonspectrum/studio-project-model/work-session";
import { studioSessionEvidenceResponseSchema, type StudioSessionEvidenceResponse } from "@toonspectrum/studio-project-model/work-session-evidence";
import { api } from "@/platform/api";

export async function getStudioSessionEvidence(workId: string, sessionId: string, inputDigest: string,
  offset: number, signal: AbortSignal): Promise<StudioSessionEvidenceResponse> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 99_999) throw new Error("Invalid evidence page offset");
  const path = `/creator/works/${encodeURIComponent(studioWorkSessionId.parse(workId))}/work-sessions/${encodeURIComponent(studioWorkSessionId.parse(sessionId))}/evidence?offset=${offset}`;
  const value = studioSessionEvidenceResponseSchema.parse(await api.get(path, { signal, retry: 0 }));
  const now = Date.now(), expiry = Date.parse(value.expiresAt), evidence = value.evidence;
  if (value.workId !== workId || value.sessionId !== sessionId || value.inputDigest !== inputDigest || value.offset !== offset
    || expiry <= now || expiry > now + 30_000 || (value.nextOffset !== null && value.nextOffset !== offset + 25)) throw new Error("Evidence response scope mismatch");
  const sourceValid = (source: NonNullable<typeof evidence>["assets"][number]["source"]) =>
    source.sourceContentDigest === inputDigest && source.sourceServerRevision === evidence?.sourceServerRevision
      && source.pageOrdinal >= offset && source.pageOrdinal < offset + 25;
  if (evidence && (evidence.sourceContentDigest !== inputDigest
    || evidence.assets.some((asset) => !sourceValid(asset.source))
    || evidence.aiOperations.some((op) => (op.targetStatus === "mapped") !== (op.target !== null) || (op.target && !sourceValid(op.target)))
    || new Set(evidence.assets.map((asset) => JSON.stringify(asset.source))).size !== evidence.assets.length
    || new Set(evidence.aiOperations.map((op) => op.id)).size !== evidence.aiOperations.length)) throw new Error("Evidence source mismatch");
  return value;
}
