import { checkStudioBg3dThreeBudgets } from "./studio-background-3d-model";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dParsedGlbMetrics,
  StudioBg3dSceneBudgets,
} from "./studio-bg3d-scene-document";

export type StudioBg3dModelPlacementAdmissionFailureCode =
  | "cached-record-mismatch"
  | "invalid-placement-budget"
  | "model-byte-budget-exceeded"
  | "cumulative-byte-budget-exceeded"
  | NonNullable<ReturnType<typeof checkStudioBg3dThreeBudgets>>["code"];

const PLACEMENT_FAILURE_MESSAGES: Readonly<
  Record<Exclude<StudioBg3dModelPlacementAdmissionFailureCode,
    NonNullable<ReturnType<typeof checkStudioBg3dThreeBudgets>>["code"]>, string>
> = Object.freeze({
  "cached-record-mismatch":
    "캐시된 3D 모델과 현재 라이브러리 원본의 무결성 정보가 달라 배치를 중단했습니다.",
  "invalid-placement-budget":
    "현재 장면의 3D 모델 안전 예산을 확인할 수 없어 배치를 중단했습니다.",
  "model-byte-budget-exceeded":
    "이 장면의 3D 모델 용량 기준을 초과했습니다. 더 작은 모델을 사용해 주세요.",
  "cumulative-byte-budget-exceeded":
    "프로젝트의 3D 모델 누적 용량 기준을 초과했습니다. 사용하지 않는 모델을 정리해 주세요.",
});

export class StudioBg3dModelPlacementAdmissionError extends Error {
  readonly code: StudioBg3dModelPlacementAdmissionFailureCode;

  constructor(code: StudioBg3dModelPlacementAdmissionFailureCode, message?: string) {
    super(message ?? PLACEMENT_FAILURE_MESSAGES[
      code as keyof typeof PLACEMENT_FAILURE_MESSAGES
    ] ?? "3D 모델이 현재 장면의 안전 예산을 통과하지 못했습니다.");
    this.name = "StudioBg3dModelPlacementAdmissionError";
    this.code = code;
  }
}

export interface StudioBg3dModelPlacementAdmissionInput {
  readonly record: Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "byteSize" | "mime">;
  readonly cachedRecord?: Pick<
    Bg3dVerifiedStoredRecord,
    "id" | "contentHash" | "byteSize" | "mime"
  >;
  readonly metrics: StudioBg3dParsedGlbMetrics;
  readonly budgets: StudioBg3dSceneBudgets;
  /** Bytes already owned by the live scene, excluding this storage id when it is already placed. */
  readonly cumulativeUsedBytes: number;
  readonly maximumCumulativeBytes: number;
}

/**
 * Cheap per-placement admission for an already decoded model.
 *
 * Cache attestation proves immutable bytes and engine parsing once per device profile. Placement
 * admission is deliberately separate: every click must re-check the current live scene byte
 * total and the selected profile's post-parse metrics, even when the decoded root is a cache hit.
 */
export function assertStudioBg3dModelPlacementAdmission(
  input: StudioBg3dModelPlacementAdmissionInput,
): void {
  const { record, cachedRecord, budgets } = input;
  if (
    cachedRecord && (
      cachedRecord.id !== record.id ||
      cachedRecord.contentHash !== record.contentHash ||
      cachedRecord.byteSize !== record.byteSize ||
      cachedRecord.mime !== record.mime
    )
  ) {
    throw new StudioBg3dModelPlacementAdmissionError("cached-record-mismatch");
  }

  const maximumModelBytes = budgets?.complexity?.maxModelBytes;
  if (
    !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 ||
    !Number.isSafeInteger(input.cumulativeUsedBytes) || input.cumulativeUsedBytes < 0 ||
    !Number.isSafeInteger(maximumModelBytes) || maximumModelBytes <= 0 ||
    !Number.isSafeInteger(input.maximumCumulativeBytes) || input.maximumCumulativeBytes <= 0 ||
    input.cumulativeUsedBytes > input.maximumCumulativeBytes
  ) {
    throw new StudioBg3dModelPlacementAdmissionError("invalid-placement-budget");
  }
  if (record.byteSize > maximumModelBytes) {
    throw new StudioBg3dModelPlacementAdmissionError("model-byte-budget-exceeded");
  }
  if (record.byteSize > input.maximumCumulativeBytes - input.cumulativeUsedBytes) {
    throw new StudioBg3dModelPlacementAdmissionError("cumulative-byte-budget-exceeded");
  }

  const metricsFailure = checkStudioBg3dThreeBudgets(input.metrics, budgets);
  if (metricsFailure) {
    throw new StudioBg3dModelPlacementAdmissionError(
      metricsFailure.code,
      metricsFailure.message,
    );
  }
}

export function totalStudioBg3dModelAttachmentBytes(
  attachments: Iterable<StudioBg3dModelAttachment>,
): number {
  const hashes = new Set<string>();
  let total = 0;
  for (const attachment of attachments) {
    if (hashes.has(attachment.hash)) continue;
    hashes.add(attachment.hash);
    total += attachment.byteSize;
  }
  return total;
}

/**
 * Returns the unique model bytes already owned by the authoritative live scene. The candidate
 * storage id is excluded so re-adding another instance of the same immutable model is charged once.
 */
export function calculateStudioBg3dPlacedModelBytes(
  models: readonly Pick<BgCustomModelInstance, "modelId">[],
  attachments: ReadonlyMap<string, StudioBg3dModelAttachment>,
  candidateStorageId?: string,
): number {
  const usedStorageIds = new Set(models.map((model) => model.modelId));
  if (candidateStorageId) usedStorageIds.delete(candidateStorageId);
  const selected: StudioBg3dModelAttachment[] = [];
  for (const storageId of usedStorageIds) {
    const attachment = attachments.get(storageId);
    if (attachment) selected.push(attachment);
  }
  return totalStudioBg3dModelAttachmentBytes(selected);
}
