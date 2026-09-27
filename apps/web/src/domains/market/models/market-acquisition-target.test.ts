import { describe, expect, it, vi } from "vitest";

import type { CreatorMarketplaceAcquisitionTarget } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { creatorMarketplaceStudioPackId } from "@/shared/lib/creator-marketplace-package-identity";

import {
  MarketAcquisitionIntegrityError,
  MarketAcquisitionUnavailableError,
  resolveCurrentMarketAcquisitionRecord,
} from "./market-acquisition-target";

const REQUEST_RELEASE_ID = "123e4567-e89b-42d3-a456-426614174001";
const HEAD_RELEASE_ID = "123e4567-e89b-42d3-a456-426614174002";
const PUBLISHER_ID = ["123e4567", "e89b", "42d3", "a456", "426614174003"].join("-");

const requestedRecord: CreatorMarketplaceResourceRecord = {
  schemaVersion: 1,
  id: REQUEST_RELEASE_ID,
  packageId: "test/brush/inking",
  name: "테스트 잉킹 브러시",
  description: "마켓 설치 대상 확인용 브러시",
  kind: "brush",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "0.1.0",
  tags: ["잉킹", "테스트"],
  license: "toonspectrum-standard",
  attributionText: "",
  containsAi: false,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [],
  manifestHash: "1".repeat(64),
  manifestByteSize: 200,
  publisher: {
    id: PUBLISHER_ID,
    name: "테스트 제작자",
    avatar: null,
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  isOwner: false,
  access: "free",
};

const headRecord: CreatorMarketplaceResourceRecord = {
  ...requestedRecord,
  id: HEAD_RELEASE_ID,
  resourceVersion: "1.1.0",
  manifestHash: "2".repeat(64),
  updatedAt: "2026-09-02T00:00:00.000Z",
};

function availableTarget(
  head: CreatorMarketplaceResourceRecord,
): CreatorMarketplaceAcquisitionTarget {
  return {
    state: "available",
    requestReleaseId: requestedRecord.id,
    publisherId: requestedRecord.publisher.id,
    packageId: requestedRecord.packageId,
    kind: requestedRecord.kind,
    logicalPackId: creatorMarketplaceStudioPackId(requestedRecord),
    currentHead: {
      id: head.id,
      resourceVersion: head.resourceVersion,
    },
  };
}

describe("resolveCurrentMarketAcquisitionRecord", () => {
  it("keeps the requested record when it is already the current head", async () => {
    const loadResource = vi.fn();

    const result = await resolveCurrentMarketAcquisitionRecord(requestedRecord, {
      dependencies: {
        resolveTarget: vi.fn().mockResolvedValue(availableTarget(requestedRecord)),
        loadResource,
      },
    });

    expect(result.record).toBe(requestedRecord);
    expect(result.redirectedToCurrentHead).toBe(false);
    expect(loadResource).not.toHaveBeenCalled();
  });

  it("loads and returns the current head for a historical detail release", async () => {
    const resolveTarget = vi.fn().mockResolvedValue(availableTarget(headRecord));
    const loadResource = vi.fn().mockResolvedValue(headRecord);

    const result = await resolveCurrentMarketAcquisitionRecord(requestedRecord, {
      dependencies: { resolveTarget, loadResource },
    });

    expect(resolveTarget).toHaveBeenCalledWith(requestedRecord.id, undefined);
    expect(loadResource).toHaveBeenCalledWith(headRecord.id, undefined);
    expect(result).toMatchObject({
      requestedReleaseId: requestedRecord.id,
      targetReleaseId: headRecord.id,
      redirectedToCurrentHead: true,
      record: headRecord,
    });
  });

  it("fails closed when the loaded head belongs to another package", async () => {
    const mismatchedHead = {
      ...headRecord,
      packageId: "test/brush/other",
    };

    const operation = resolveCurrentMarketAcquisitionRecord(requestedRecord, {
      dependencies: {
        resolveTarget: vi.fn().mockResolvedValue(availableTarget(headRecord)),
        loadResource: vi.fn().mockResolvedValue(mismatchedHead),
      },
    });

    await expect(operation).rejects.toBeInstanceOf(MarketAcquisitionIntegrityError);
    await expect(operation).rejects.toHaveProperty("code", "package-mismatch");
  });

  it("reports catalog policy unavailability without loading a package", async () => {
    const loadResource = vi.fn();
    const target: CreatorMarketplaceAcquisitionTarget = {
      state: "unavailable",
      reason: "owner-delisted",
      requestReleaseId: requestedRecord.id,
      publisherId: requestedRecord.publisher.id,
      packageId: requestedRecord.packageId,
      kind: requestedRecord.kind,
      logicalPackId: creatorMarketplaceStudioPackId(requestedRecord),
    };

    await expect(resolveCurrentMarketAcquisitionRecord(requestedRecord, {
      dependencies: {
        resolveTarget: vi.fn().mockResolvedValue(target),
        loadResource,
      },
    })).rejects.toBeInstanceOf(MarketAcquisitionUnavailableError);
    expect(loadResource).not.toHaveBeenCalled();
  });
});
