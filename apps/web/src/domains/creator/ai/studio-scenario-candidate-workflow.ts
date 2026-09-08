import type {
  ScenarioImageCandidate,
  ScenarioPreviewItem,
} from "../studio-scenario-layout";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";

export type StudioScenarioImageVariantCount = 1 | 2 | 4;

export interface StudioScenarioImageGenerationRequest {
  readonly indexes?: readonly number[];
  readonly variants?: StudioScenarioImageVariantCount;
}

export interface StudioScenarioImageGenerationTask {
  readonly index: number;
  readonly variant: number;
  readonly variantCount: StudioScenarioImageVariantCount;
}

export interface StudioScenarioImageCandidateInput {
  readonly id: string;
  readonly imageDataUrl: string;
  readonly imageProvenance?: StudioPublishAiProvenance;
  readonly inputFingerprint: string;
  readonly createdAt?: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function scenarioImageReferenceSignature(
  references: readonly {
    readonly id?: string;
    readonly assetId?: string;
    readonly role?: string;
    readonly label?: string;
    readonly guidance?: string;
  }[],
): string {
  return stableSerialize(
    references.map((reference) => ({
      id: normalizeText(reference.id),
      assetId: normalizeText(reference.assetId),
      role: normalizeText(reference.role),
      label: normalizeText(reference.label),
      guidance: normalizeText(reference.guidance),
    })),
  );
}

export function scenarioImageInputFingerprint(
  item: Pick<ScenarioPreviewItem, "imagePrompt" | "continuity" | "aspect">,
  referenceSignature = "",
): string {
  return hashText(
    stableSerialize({
      imagePrompt: normalizeText(item.imagePrompt),
      continuity: item.continuity ?? null,
      aspect: item.aspect,
      references: referenceSignature,
    }),
  );
}

function legacyCandidate(item: ScenarioPreviewItem): ScenarioImageCandidate | null {
  if (!item.imageDataUrl) return null;
  return {
    id: `legacy-${hashText(item.imageDataUrl)}`,
    imageDataUrl: item.imageDataUrl,
    ...(item.imageProvenance ? { imageProvenance: item.imageProvenance } : {}),
    inputFingerprint: scenarioImageInputFingerprint(item),
    createdAt: item.imageProvenance?.createdAt ?? "legacy",
  };
}

export function scenarioImageCandidates(item: ScenarioPreviewItem): ScenarioImageCandidate[] {
  const candidates = [...(item.imageCandidates ?? [])];
  const legacy = legacyCandidate(item);
  if (legacy && !candidates.some((candidate) => candidate.imageDataUrl === legacy.imageDataUrl)) {
    candidates.unshift(legacy);
  }
  return candidates;
}

export function appendScenarioImageCandidate(
  item: ScenarioPreviewItem,
  input: StudioScenarioImageCandidateInput,
): ScenarioPreviewItem {
  const candidate: ScenarioImageCandidate = {
    id: input.id,
    imageDataUrl: input.imageDataUrl,
    ...(input.imageProvenance ? { imageProvenance: input.imageProvenance } : {}),
    inputFingerprint: input.inputFingerprint,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const allCandidates = scenarioImageCandidates(item)
    .filter((existing) => existing.id !== candidate.id)
    .concat(candidate);
  const candidates = allCandidates.slice(-12);
  if (
    item.approvedImageCandidateId &&
    !candidates.some((entry) => entry.id === item.approvedImageCandidateId)
  ) {
    const approved = allCandidates.find(
      (entry) => entry.id === item.approvedImageCandidateId,
    );
    if (approved) candidates[0] = approved;
  }
  return {
    ...item,
    imageCandidates: candidates,
    selectedImageCandidateId: candidate.id,
    imageDataUrl: candidate.imageDataUrl,
    imageProvenance: candidate.imageProvenance,
    imageError: undefined,
  };
}

export function selectScenarioImageCandidate(
  item: ScenarioPreviewItem,
  candidateId: string,
): ScenarioPreviewItem {
  const candidates = scenarioImageCandidates(item);
  const candidate = candidates.find((entry) => entry.id === candidateId);
  if (!candidate) return item;
  return {
    ...item,
    imageCandidates: candidates,
    selectedImageCandidateId: candidate.id,
    imageDataUrl: candidate.imageDataUrl,
    imageProvenance: candidate.imageProvenance,
    imageError: undefined,
  };
}

export function approveScenarioImageCandidate(
  item: ScenarioPreviewItem,
  candidateId: string,
): ScenarioPreviewItem {
  const selected = selectScenarioImageCandidate(item, candidateId);
  if (selected === item) return item;
  return { ...selected, approvedImageCandidateId: candidateId };
}

export function isScenarioImageCandidateStale(
  candidate: ScenarioImageCandidate,
  item: ScenarioPreviewItem,
  referenceSignature = "",
): boolean {
  return candidate.inputFingerprint !== scenarioImageInputFingerprint(item, referenceSignature);
}

export function planStudioScenarioImageGeneration(
  items: readonly ScenarioPreviewItem[],
  request: StudioScenarioImageGenerationRequest = {},
): StudioScenarioImageGenerationTask[] {
  const variants = request.variants ?? 1;
  const explicitIndexes = request.indexes
    ? [...new Set(request.indexes)].filter(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < items.length &&
          (items[index]?.imagePrompt.trim().length ?? 0) > 0,
      )
    : null;
  const indexes =
    explicitIndexes ??
    items.flatMap((item, index) =>
      item.imageDataUrl || item.imagePrompt.trim().length === 0 ? [] : [index],
    );
  return indexes.flatMap((index) =>
    Array.from({ length: variants }, (_, variant) => ({
      index,
      variant: variant + 1,
      variantCount: variants,
    })),
  );
}
