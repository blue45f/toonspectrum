import type { CreatorMarketplaceAcquisitionTarget } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  getCreatorMarketplaceResource,
  resolveCreatorMarketplaceCloudLibraryAcquisitionTarget,
} from "@/platform/creator-marketplace-client";
import { creatorMarketplaceStudioPackId } from "@/shared/lib/creator-marketplace-package-identity";

type AvailableAcquisitionTarget = Extract<
  CreatorMarketplaceAcquisitionTarget,
  { state: "available" }
>;
type UnavailableAcquisitionTarget = Extract<
  CreatorMarketplaceAcquisitionTarget,
  { state: "unavailable" }
>;

export type MarketAcquisitionIntegrityCode =
  | "request-release-mismatch"
  | "publisher-mismatch"
  | "package-mismatch"
  | "kind-mismatch"
  | "logical-pack-mismatch"
  | "head-release-mismatch"
  | "head-version-mismatch";

export class MarketAcquisitionUnavailableError extends Error {
  readonly reason: UnavailableAcquisitionTarget["reason"];

  constructor(reason: UnavailableAcquisitionTarget["reason"]) {
    const message = reason === "moderated"
      ? "운영 정책 검토로 현재 받을 수 없는 에셋입니다."
      : reason === "owner-delisted"
        ? "제작자가 공개를 중단해 현재 받을 수 없는 에셋입니다."
        : "제작자 계정 상태로 현재 받을 수 없는 에셋입니다.";
    super(message);
    this.name = "MarketAcquisitionUnavailableError";
    this.reason = reason;
  }
}

export class MarketAcquisitionIntegrityError extends Error {
  readonly code: MarketAcquisitionIntegrityCode;

  constructor(code: MarketAcquisitionIntegrityCode, message: string) {
    super(message);
    this.name = "MarketAcquisitionIntegrityError";
    this.code = code;
  }
}

export interface MarketAcquisitionTargetDependencies {
  readonly resolveTarget: (
    releaseId: string,
    signal?: AbortSignal,
  ) => Promise<CreatorMarketplaceAcquisitionTarget>;
  readonly loadResource: (
    releaseId: string,
    signal?: AbortSignal,
  ) => Promise<CreatorMarketplaceResourceRecord>;
}

export interface ResolveMarketAcquisitionRecordOptions {
  readonly signal?: AbortSignal;
  readonly dependencies?: MarketAcquisitionTargetDependencies;
}

export interface ResolvedMarketAcquisitionRecord {
  readonly requestedReleaseId: string;
  readonly targetReleaseId: string;
  readonly redirectedToCurrentHead: boolean;
  readonly target: AvailableAcquisitionTarget;
  readonly record: CreatorMarketplaceResourceRecord;
}

const DEFAULT_DEPENDENCIES: MarketAcquisitionTargetDependencies = {
  resolveTarget: resolveCreatorMarketplaceCloudLibraryAcquisitionTarget,
  loadResource: getCreatorMarketplaceResource,
};

function integrityFailure(
  code: MarketAcquisitionIntegrityCode,
  message: string,
): never {
  throw new MarketAcquisitionIntegrityError(code, message);
}

function assertRequestedIdentity(
  requested: CreatorMarketplaceResourceRecord,
  target: AvailableAcquisitionTarget,
): void {
  if (target.requestReleaseId !== requested.id) {
    integrityFailure(
      "request-release-mismatch",
      "요청한 릴리스와 서버가 확인한 릴리스가 일치하지 않습니다.",
    );
  }
  if (target.publisherId !== requested.publisher.id) {
    integrityFailure(
      "publisher-mismatch",
      "요청한 에셋의 제작자 정보가 현재 공개 패키지와 일치하지 않습니다.",
    );
  }
  if (target.packageId !== requested.packageId) {
    integrityFailure(
      "package-mismatch",
      "요청한 에셋의 패키지 정보가 현재 공개 패키지와 일치하지 않습니다.",
    );
  }
  if (target.kind !== requested.kind) {
    integrityFailure(
      "kind-mismatch",
      "요청한 에셋 종류가 현재 공개 패키지와 일치하지 않습니다.",
    );
  }
  if (target.logicalPackId !== creatorMarketplaceStudioPackId(requested)) {
    integrityFailure(
      "logical-pack-mismatch",
      "현재 공개 패키지의 안정 식별자를 확인하지 못했습니다.",
    );
  }
}

function assertCurrentHeadIdentity(
  requested: CreatorMarketplaceResourceRecord,
  currentHead: CreatorMarketplaceResourceRecord,
  target: AvailableAcquisitionTarget,
): void {
  if (currentHead.id !== target.currentHead.id) {
    integrityFailure(
      "head-release-mismatch",
      "현재 공개 릴리스 응답이 서버가 지정한 릴리스와 일치하지 않습니다.",
    );
  }
  if (currentHead.resourceVersion !== target.currentHead.resourceVersion) {
    integrityFailure(
      "head-version-mismatch",
      "현재 공개 릴리스의 버전 정보가 일치하지 않습니다.",
    );
  }
  if (currentHead.publisher.id !== requested.publisher.id) {
    integrityFailure(
      "publisher-mismatch",
      "현재 공개 릴리스의 제작자 정보가 요청한 패키지와 일치하지 않습니다.",
    );
  }
  if (currentHead.packageId !== requested.packageId) {
    integrityFailure(
      "package-mismatch",
      "현재 공개 릴리스가 요청한 패키지 계열과 일치하지 않습니다.",
    );
  }
  if (currentHead.kind !== requested.kind) {
    integrityFailure(
      "kind-mismatch",
      "현재 공개 릴리스의 에셋 종류가 요청한 패키지와 일치하지 않습니다.",
    );
  }
  if (creatorMarketplaceStudioPackId(currentHead) !== target.logicalPackId) {
    integrityFailure(
      "logical-pack-mismatch",
      "현재 공개 릴리스의 안정 식별자가 서버 확인 결과와 일치하지 않습니다.",
    );
  }
}

/**
 * Resolves an immutable detail-page release to the currently installable head of the same package.
 * The returned record is the only release that may be acquired and handed to Studio.
 */
export async function resolveCurrentMarketAcquisitionRecord(
  requested: CreatorMarketplaceResourceRecord,
  options: ResolveMarketAcquisitionRecordOptions = {},
): Promise<ResolvedMarketAcquisitionRecord> {
  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES;
  const target = await dependencies.resolveTarget(requested.id, options.signal);
  if (target.state === "unavailable") {
    throw new MarketAcquisitionUnavailableError(target.reason);
  }

  assertRequestedIdentity(requested, target);

  const currentHead = target.currentHead.id === requested.id
    ? requested
    : await dependencies.loadResource(target.currentHead.id, options.signal);
  assertCurrentHeadIdentity(requested, currentHead, target);

  return {
    requestedReleaseId: requested.id,
    targetReleaseId: currentHead.id,
    redirectedToCurrentHead: currentHead.id !== requested.id,
    target,
    record: currentHead,
  };
}
