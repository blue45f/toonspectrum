import { type StudioReviewPageMapping, type StudioReviewSourceReference, validateStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { studioSessionAiEvidenceSchema, studioSessionAssetEvidenceSchema, studioSessionEvidenceSchema, type StudioSessionEvidence } from "@toonspectrum/studio-project-model/work-session-evidence";

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const commercial = (value: unknown) => value === true || value === "allowed" ? "allowed" as const : value === false || value === "prohibited" ? "prohibited" as const : "unknown" as const;
function indexElements(elements: unknown[]) {
  const index = new Map<string, Record<string, unknown> | null>();
  for (const raw of elements) { const item = record(raw); if (typeof item?.id === "string") index.set(item.id, index.has(item.id) ? null : item); }
  return index;
}
/** Projection of an already attested capture, never a live document or a provider/billing receipt. */
export function projectStudioSessionEvidence(snapshot: unknown, mappings: Readonly<Record<number, StudioReviewPageMapping>>,
  pin: { sourceContentDigest: string; sourceServerRevision: number }): StudioSessionEvidence {
  const doc = record(snapshot), pages = rows(doc?.pagesList), master = indexElements(rows(record(doc?.master)?.elements));
  const assets: StudioSessionEvidence["assets"] = [], aiOperations: StudioSessionEvidence["aiOperations"] = [];
  let omittedAssets = 0, omittedAiOperations = 0, invalidEntries = 0;
  const knownPages = new Set(pages.map((page) => record(page)?.id));
  for (const mapping of Object.values(mappings)) {
    if (mapping.status !== "mapped" || mapping.sourceContentDigest !== pin.sourceContentDigest || mapping.sourceServerRevision !== pin.sourceServerRevision) continue;
    const page = record(pages[mapping.page.ordinal]);
    if (!page || page.id !== mapping.page.id) { invalidEntries++; continue; }
    const own = indexElements(rows(page.elements)), byOrigin = { page: own, master };
    for (const item of mapping.page.elements) {
      if (item.type !== "image") continue;
      const element = byOrigin[item.origin].get(item.id);
      if (!element || element.type !== "image" || (item.origin === "master" && page.hideMaster === true)) { invalidEntries++; continue; }
      if (assets.length >= 250) { omittedAssets++; continue; }
      const source: StudioReviewSourceReference = { version: 1, ...pin, pageOrdinal: mapping.page.ordinal, pageId: mapping.page.id, elementId: item.id };
      const community = record(element.communityAssetCredit), stock = record(element.stockImageCredit);
      const nativeSceneKind = record(element.bg3dScene) ? "background3d" : record(element.vrmScene) ? "vrm" : null;
      const kind = community ? "community" : text(element.builtinRasterAssetId, 240) ? "builtin" : stock ? "stock"
        : record(element.aiProvenance) ? "ai-generated" : nativeSceneKind ? "native-3d" : "local";
      const parsed = studioSessionAssetEvidenceSchema.safeParse({ source, name: text(element.name, 180) ?? item.id,
        kind, assetId: community ? text(community.assetId, 240) : kind === "builtin" ? text(element.builtinRasterAssetId, 240) : null,
        licenseLabel: text(community?.licenseLabel, 240) ?? text(community?.licenseId, 240),
        attribution: text(community?.attributionText, 500) ?? text(community?.authorName, 500) ?? text(stock?.photographerName, 500),
        commercialUse: commercial(community?.commercialUse), nativeSceneKind });
      if (parsed.success) assets.push(parsed.data); else invalidEntries++;
    }
  }
  const provenance = record(doc?.aiProvenance), operations = provenance?.version === 1 ? rows(provenance.operations) : [];
  // Reject every ambiguous identity, not merely the second occurrence. An oversized
  // source cannot establish uniqueness within a truncated prefix, so expose no AI rows.
  const candidates = operations.length <= 2000 ? operations : [];
  const operationIndex = indexElements(candidates);
  for (const raw of candidates) {
    const op = record(raw);
    if (!op || typeof op.id !== "string" || operationIndex.get(op.id) !== op) { invalidEntries++; continue; }
    const rawTarget = record(op.target);
    let target: StudioReviewSourceReference | null = null;
    let targetStatus: StudioSessionEvidence["aiOperations"][number]["targetStatus"] = rawTarget ? "unmapped" : "missing";
    const mapping = Object.values(mappings).find((item) => item.status === "mapped" && item.page.id === rawTarget?.pageId);
    if (rawTarget && !mapping && knownPages.has(rawTarget.pageId)) targetStatus = "outside-page-window";
    if (rawTarget && mapping?.status === "mapped" && mapping.sourceContentDigest === pin.sourceContentDigest
      && mapping.sourceServerRevision === pin.sourceServerRevision) {
      const candidate: StudioReviewSourceReference = { version: 1, ...pin, pageOrdinal: mapping.page.ordinal, pageId: mapping.page.id,
        ...(typeof rawTarget.frameId === "string" ? { frameId: rawTarget.frameId } : {}),
        ...(typeof rawTarget.elementId === "string" ? { elementId: rawTarget.elementId } : {}) };
      const shape = rawTarget.frameId !== undefined && typeof rawTarget.frameId !== "string"
        || rawTarget.elementId !== undefined && typeof rawTarget.elementId !== "string";
      const anchor = { kind: candidate.frameId ? "panel" : candidate.elementId ? "object" : "page", source: candidate,
        ...(candidate.elementId ? { objectId: candidate.elementId } : {}) };
      if (!shape && validateStudioReviewSpatialAnchor(mapping, anchor)) { target = candidate; targetStatus = "mapped"; }
    }
    const rawUsage = record(op.usage), projectedUsage = rawUsage ? Object.fromEntries(
      ["promptTokens", "completionTokens", "totalTokens"].filter((key) => rawUsage[key] !== undefined).map((key) => [key, rawUsage[key]])) : null;
    const rawDigest = record(op.prompt)?.sha256;
    const parsed = studioSessionAiEvidenceSchema.safeParse({ id: op.id, kind: op.kind, status: op.status,
      provider: op.provider, model: op.model, transport: op.transport, createdAt: op.createdAt,
      promptDigest: typeof rawDigest === "string" && /^[a-f0-9]{64}$/u.test(rawDigest) ? rawDigest : null,
      target, targetStatus, usage: projectedUsage && Object.keys(projectedUsage).length ? projectedUsage : null });
    if (!parsed.success) { invalidEntries++; continue; }
    if (aiOperations.length >= 100) { omittedAiOperations++; continue; }
    aiOperations.push(parsed.data);
  }
  if (operations.length > 2000) omittedAiOperations += operations.length;
  return studioSessionEvidenceSchema.parse({ version: 1, ...pin, assets, aiOperations, omittedAssets, omittedAiOperations, invalidEntries });
}
