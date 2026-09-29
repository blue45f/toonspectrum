import {
  STUDIO_VRM_AVATAR_REFERENCE_LIMITS,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_ID,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_REVISION,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256,
  STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
  STUDIO_VRM_AVATAR_REFERENCE_PROVIDER_ID,
  StudioVrmAvatarReferenceError,
  admitStudioVrmAvatarReferenceCatalogue,
  findStudioVrmAvatarReferencePreset,
  rankStudioVrmAvatarReferenceRecommendations,
  type StudioVrmAvatarReferenceCatalogue,
  type StudioVrmAvatarReferenceCosineSimilarity,
  type StudioVrmAvatarReferenceEmbedding,
} from "./studio-vrm-avatar-reference-recommendation";

export const STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION = 1 as const;

export const STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS = Object.freeze({
  maxQueries: 256,
  maxQueryIdLength: 128,
} as const);

export interface StudioVrmAvatarReferenceHarnessQuery {
  readonly queryId: string;
  readonly expectedPresetId: string;
  readonly queryEmbedding: StudioVrmAvatarReferenceEmbedding;
  readonly queryEmbeddingSha256: string;
}

export interface StudioVrmAvatarReferenceHarnessFixture {
  readonly catalogue: StudioVrmAvatarReferenceCatalogue;
  readonly queries: readonly StudioVrmAvatarReferenceHarnessQuery[];
}

export interface StudioVrmAvatarReferenceHarnessPerQueryResult {
  /** 1-based rank inside the measured Top-N window, or null when the expected preset misses it. */
  readonly rankOfExpected: number | null;
  readonly queryId: string;
  readonly expectedPresetId: string;
  readonly topPresetIds: readonly string[];
  readonly hit: boolean;
  readonly top1Hit: boolean;
}

export interface StudioVrmAvatarReferenceHarnessReport {
  readonly version: typeof STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION;
  readonly catalogueRevision: string;
  readonly topN: number;
  readonly totalQueries: number;
  readonly hits: number;
  readonly accuracy: number;
  readonly top1Hits: number;
  readonly top1Accuracy: number;
  readonly results: readonly StudioVrmAvatarReferenceHarnessPerQueryResult[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failProtocol(cause?: unknown): never {
  throw new StudioVrmAvatarReferenceError(
    "protocol",
    cause === undefined ? undefined : { cause },
  );
}

function asNonEmptyString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) return failProtocol();
  return value;
}

/**
 * Admits a synthetic-embedding harness fixture. The catalogue is rebuilt against the pinned
 * provider/model constants, so a fixture can never substitute a model, weights, or URL — it only
 * supplies bounded synthetic vectors and expected preset labels for Top-N hit-rate measurement.
 */
export function admitStudioVrmAvatarReferenceHarnessFixture(
  value: unknown,
): StudioVrmAvatarReferenceHarnessFixture {
  if (!isRecord(value)) return failProtocol();
  if (value.version !== STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION) return failProtocol();
  if (typeof value.catalogueRevision !== "string") return failProtocol();
  if (!Array.isArray(value.entries) || !Array.isArray(value.queries)) return failProtocol();

  let catalogue: StudioVrmAvatarReferenceCatalogue;
  try {
    catalogue = admitStudioVrmAvatarReferenceCatalogue({
      version: STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
      providerId: STUDIO_VRM_AVATAR_REFERENCE_PROVIDER_ID,
      modelId: STUDIO_VRM_AVATAR_REFERENCE_MODEL_ID,
      modelRevision: STUDIO_VRM_AVATAR_REFERENCE_MODEL_REVISION,
      modelSha256: STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256,
      catalogueRevision: value.catalogueRevision,
      entries: value.entries.map((entry) => {
        if (!isRecord(entry)) return failProtocol();
        return {
          presetId: entry.presetId,
          embedding: {
            headIndex: value.headIndex,
            headName: value.headName,
            floatEmbedding: entry.floatEmbedding,
          },
        };
      }),
    });
  } catch (cause) {
    return failProtocol(cause);
  }

  if (
    value.queries.length < 1
    || value.queries.length > STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS.maxQueries
  ) return failProtocol();
  const catalogueIds = new Set(catalogue.entries.map((entry) => entry.presetId));
  const queryIds = new Set<string>();
  const queries = value.queries.map((candidate) => {
    if (!isRecord(candidate)) return failProtocol();
    const queryId = asNonEmptyString(
      candidate.queryId,
      STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS.maxQueryIdLength,
    );
    if (queryIds.has(queryId)) return failProtocol();
    queryIds.add(queryId);
    const expectedPresetId = asNonEmptyString(candidate.expectedPresetId, 64);
    if (
      !findStudioVrmAvatarReferencePreset(expectedPresetId)
      || !catalogueIds.has(expectedPresetId)
    ) return failProtocol();
    if (
      typeof candidate.queryEmbeddingSha256 !== "string"
      || !SHA256_HEX.test(candidate.queryEmbeddingSha256)
    ) return failProtocol();
    if (!Array.isArray(candidate.floatEmbedding)) return failProtocol();
    const queryEmbedding = Object.freeze({
      headIndex: value.headIndex,
      headName: value.headName,
      floatEmbedding: Object.freeze([...candidate.floatEmbedding]),
    }) as StudioVrmAvatarReferenceEmbedding;
    return Object.freeze({
      queryId,
      expectedPresetId,
      queryEmbedding,
      queryEmbeddingSha256: candidate.queryEmbeddingSha256,
    });
  });

  return Object.freeze({
    catalogue,
    queries: Object.freeze(queries),
  });
}

/**
 * Measures Top-N hit rate by ranking every harness query through the exact product ranking path.
 * Pure and deterministic: no model, weights, network, or storage access. `rankOfExpected` is null
 * when the expected preset falls outside the measured Top-N window.
 */
export function measureStudioVrmAvatarReferenceTopN(input: {
  readonly catalogue: StudioVrmAvatarReferenceCatalogue;
  readonly queries: readonly StudioVrmAvatarReferenceHarnessQuery[];
  readonly topN: number;
  readonly cosineSimilarity: StudioVrmAvatarReferenceCosineSimilarity;
}): StudioVrmAvatarReferenceHarnessReport {
  if (
    !Number.isSafeInteger(input.topN)
    || input.topN < 1
    || input.topN > STUDIO_VRM_AVATAR_REFERENCE_LIMITS.maxTopK
    || !Array.isArray(input.queries)
    || input.queries.length < 1
    || input.queries.length > STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS.maxQueries
    || typeof input.cosineSimilarity !== "function"
  ) return failProtocol();
  const catalogue = admitStudioVrmAvatarReferenceCatalogue(input.catalogue);
  const catalogueIds = new Set(catalogue.entries.map((entry) => entry.presetId));
  const queryIds = new Set<string>();

  const results = input.queries.map((query) => {
    if (typeof query !== "object" || query === null || Array.isArray(query)) {
      return failProtocol();
    }
    if (typeof query.queryId !== "string" || queryIds.has(query.queryId)) return failProtocol();
    queryIds.add(query.queryId);
    if (typeof query.expectedPresetId !== "string" || !catalogueIds.has(query.expectedPresetId)) {
      return failProtocol();
    }
    const receipt = rankStudioVrmAvatarReferenceRecommendations({
      catalogue,
      queryEmbedding: query.queryEmbedding,
      queryEmbeddingSha256: query.queryEmbeddingSha256,
      topK: Math.min(input.topN, catalogue.entries.length),
      cosineSimilarity: input.cosineSimilarity,
    });
    const topPresetIds = receipt.recommendations.map((recommendation) => recommendation.presetId);
    const rankIndex = topPresetIds.indexOf(query.expectedPresetId);
    const hit = rankIndex >= 0;
    const top1Hit = topPresetIds[0] === query.expectedPresetId;
    return Object.freeze({
      rankOfExpected: hit ? rankIndex + 1 : null,
      queryId: query.queryId,
      expectedPresetId: query.expectedPresetId,
      topPresetIds: Object.freeze(topPresetIds),
      hit,
      top1Hit,
    });
  });

  const hits = results.filter((result) => result.hit).length;
  const top1Hits = results.filter((result) => result.top1Hit).length;
  return Object.freeze({
    version: STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION,
    catalogueRevision: catalogue.catalogueRevision,
    topN: input.topN,
    totalQueries: results.length,
    hits,
    accuracy: hits / results.length,
    top1Hits,
    top1Accuracy: top1Hits / results.length,
    results: Object.freeze(results),
  });
}
