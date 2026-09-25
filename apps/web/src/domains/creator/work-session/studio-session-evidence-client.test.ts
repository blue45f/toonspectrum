import { afterEach, expect, it, vi } from "vitest";
import { getStudioSessionEvidence } from "./studio-session-evidence-client";
import { studioSessionEvidenceNote } from "./studio-session-evidence-note";
import type { StudioSessionEvidenceResponse } from "@toonspectrum/studio-project-model/work-session-evidence";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/platform/api", () => ({ api: { get } }));
const digest = "a".repeat(64);
function response(): StudioSessionEvidenceResponse {
  const source = { version: 1 as const, sourceServerRevision: 4, sourceContentDigest: digest, pageOrdinal: 0, pageId: "page" };
  return { workId: "work", sessionId: "session", inputDigest: digest, offset: 0, nextOffset: null, expiresAt: new Date(Date.now() + 15000).toISOString(),
    evidence: { version: 1, sourceContentDigest: digest, sourceServerRevision: 4, omittedAssets: 0, omittedAiOperations: 0, invalidEntries: 0,
      assets: [{ source: { ...source, elementId: "image" }, name: "Asset", kind: "local", assetId: null, licenseLabel: null, attribution: null, commercialUse: "unknown", nativeSceneKind: null }],
      aiOperations: [{ id: "op", kind: "image", status: "failed", provider: "Provider", model: "Model", transport: "local", createdAt: "2026-09-20T00:00:00.000Z", promptDigest: null, target: source, targetStatus: "mapped", usage: { promptTokens: 0 } }] } };
}
const read = () => getStudioSessionEvidence("work", "session", digest, 0, new AbortController().signal);
afterEach(() => get.mockReset());
it("reads only the exact session endpoint without automatic retries", async () => {
  const value = response(); get.mockResolvedValue(value); expect(await read()).toEqual(value);
  expect(get).toHaveBeenCalledWith("/creator/works/work/work-sessions/session/evidence?offset=0", { signal: expect.any(AbortSignal), retry: 0 });
});
it.each(["workId", "sessionId", "inputDigest"])("rejects another %s", async (key) => {
  get.mockResolvedValue({ ...response(), [key]: key === "inputDigest" ? "b".repeat(64) : "other" }); await expect(read()).rejects.toThrow();
});
it.each([-1, 0, 60000])("rejects expired or excessive TTL %s", async (duration) => {
  get.mockResolvedValue({ ...response(), expiresAt: new Date(Date.now() + duration).toISOString() }); await expect(read()).rejects.toThrow();
});
it.each([-1, 0.5, NaN, 100000])("does not issue a read for invalid offset %s", async (offset) => {
  await expect(getStudioSessionEvidence("work", "session", digest, offset, new AbortController().signal)).rejects.toThrow(); expect(get).not.toHaveBeenCalled();
});
it.each(["sourceContentDigest", "sourceServerRevision", "pageOrdinal"])("rejects a misplaced asset's %s", async (key) => {
  const value = response(); const source = value.evidence!.assets[0]!.source;
  Object.assign(source, { [key]: key === "sourceContentDigest" ? "b".repeat(64) : key === "pageOrdinal" ? 25 : 5 });
  get.mockResolvedValue(value); await expect(read()).rejects.toThrow();
});
it.each([0, -1, 26, 100])("rejects looping or skipped metadata offset %s", async (nextOffset) => {
  get.mockResolvedValue({ ...response(), nextOffset }); await expect(read()).rejects.toThrow();
});
it("rejects inconsistent target states and duplicated records", async () => {
  const value = response(); value.evidence!.aiOperations[0]!.target = null;
  get.mockResolvedValue(value); await expect(read()).rejects.toThrow();
  const duplicated = response(); duplicated.evidence!.assets.push(duplicated.evidence!.assets[0]!);
  get.mockResolvedValue(duplicated); await expect(read()).rejects.toThrow();
  const aiDuplicate = response(); aiDuplicate.evidence!.aiOperations.push(aiDuplicate.evidence!.aiOperations[0]!);
  get.mockResolvedValue(aiDuplicate); await expect(read()).rejects.toThrow();
});
it("keeps unavailable source evidence distinct from empty records", async () => {
  get.mockResolvedValue({ ...response(), evidence: null }); expect((await read()).evidence).toBeNull();
});
it("cites the exact saved record with zero usage and an explicit unverified-receipt disclaimer", () => {
  const evidence = response().evidence!, operation = evidence.aiOperations[0]!;
  const note = studioSessionEvidenceNote(evidence, operation);
  expect(note).toContain(digest); expect(note).toContain("failed"); expect(note).toContain("input=0"); expect(note).toContain("total=unknown");
  expect(note).toContain("not an edit or approval"); expect(note.length).toBeLessThan(2000);
  expect(() => studioSessionEvidenceNote(evidence, { ...operation, model: "Unrelated model" })).toThrow();
});
