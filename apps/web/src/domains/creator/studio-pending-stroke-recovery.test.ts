import { describe, expect, it } from "vitest";

import type { StudioAutosavePayload } from "./studio-autosave";
import {
  isStudioPendingStrokeEmergencyRecoveryPayload,
  shouldPreferStudioPendingStrokeEmergencyRecovery,
} from "./studio-pending-stroke-recovery";

const PAGE_ID = "page-1";
const REASON = "pagehide" as const;

function payload(input: {
  readonly savedAt: string;
  readonly elementIds: readonly string[];
  readonly emergencyIds?: readonly string[];
  readonly lifecycleIds?: readonly string[];
  readonly pageId?: string;
}): StudioAutosavePayload {
  const pageId = input.pageId ?? PAGE_ID;
  const emergencyIds = input.emergencyIds;
  return {
    savedAt: input.savedAt,
    activePageId: PAGE_ID,
    pagesList: [{
      id: pageId,
      elements: input.elementIds.map((id) => ({ id })),
    }],
    ...(emergencyIds
      ? {
          pendingStrokeDurability: {
            kind: "pending-strokes",
            reason: REASON,
            pageId,
            strokeIds: [...emergencyIds],
            savedAt: input.savedAt,
          },
          lifecycleDurability: {
            kind: "lifecycle-snapshot",
            reason: REASON,
            savedAt: input.savedAt,
            pendingStrokePageId: pageId,
            pendingStrokeIds: [...(input.lifecycleIds ?? emergencyIds)],
          },
        }
      : {}),
  } as unknown as StudioAutosavePayload;
}

describe("Studio pending-stroke recovery candidate", () => {
  it("promotes a complete newer emergency snapshot that adds a missing stroke", () => {
    const durable = payload({
      savedAt: "2026-09-10T00:00:00.000Z",
      elementIds: ["stroke-a"],
    });
    const compatibility = payload({
      savedAt: "2026-09-10T00:00:00.100Z",
      elementIds: ["stroke-a", "stroke-b"],
      emergencyIds: ["stroke-a", "stroke-b"],
    });

    expect(isStudioPendingStrokeEmergencyRecoveryPayload(compatibility)).toBe(true);
    expect(shouldPreferStudioPendingStrokeEmergencyRecovery(durable, compatibility)).toBe(true);
  });

  it("also preserves a same-millisecond emergency snapshot when durable content is incomplete", () => {
    const durable = payload({
      savedAt: "2026-09-10T00:00:00.000Z",
      elementIds: ["stroke-a"],
    });
    const compatibility = payload({
      savedAt: durable.savedAt,
      elementIds: ["stroke-a", "stroke-b"],
      emergencyIds: ["stroke-a", "stroke-b"],
    });

    expect(shouldPreferStudioPendingStrokeEmergencyRecovery(durable, compatibility)).toBe(true);
  });

  it("keeps durable authority for generic or older compatibility snapshots", () => {
    const durable = payload({
      savedAt: "2026-09-10T00:00:00.100Z",
      elementIds: ["stroke-a"],
    });
    const generic = payload({
      savedAt: "2026-09-10T00:00:00.200Z",
      elementIds: ["stroke-a", "stroke-b"],
    });
    const olderEmergency = payload({
      savedAt: "2026-09-10T00:00:00.000Z",
      elementIds: ["stroke-a", "stroke-b"],
      emergencyIds: ["stroke-a", "stroke-b"],
    });

    expect(shouldPreferStudioPendingStrokeEmergencyRecovery(durable, generic)).toBe(false);
    expect(shouldPreferStudioPendingStrokeEmergencyRecovery(durable, olderEmergency)).toBe(false);
  });

  it("rejects receipts that do not match lifecycle metadata or persisted elements", () => {
    const durable = payload({
      savedAt: "2026-09-10T00:00:00.000Z",
      elementIds: ["stroke-a"],
    });
    const mismatchedLifecycle = payload({
      savedAt: "2026-09-10T00:00:00.100Z",
      elementIds: ["stroke-a", "stroke-b"],
      emergencyIds: ["stroke-a", "stroke-b"],
      lifecycleIds: ["stroke-a"],
    });
    const missingElement = payload({
      savedAt: "2026-09-10T00:00:00.100Z",
      elementIds: ["stroke-a"],
      emergencyIds: ["stroke-a", "stroke-b"],
    });

    expect(isStudioPendingStrokeEmergencyRecoveryPayload(mismatchedLifecycle)).toBe(false);
    expect(isStudioPendingStrokeEmergencyRecoveryPayload(missingElement)).toBe(false);
    expect(shouldPreferStudioPendingStrokeEmergencyRecovery(durable, missingElement)).toBe(false);
  });
});
