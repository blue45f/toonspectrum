import { describe, expect, it } from "vitest";

import {
  currentStudioOfflineBranchFingerprint,
  planStudioOfflineSceneTransition,
  projectStudioOfflineBranchOperation,
  revertStudioOfflineBranchOperation,
  type StudioOfflinePreparedMutation,
} from "./studio-offline-branch-scene-bridge";

import type { PageState } from "../studio-page-state";
import type { StudioOfflineBranchOperation } from "./studio-offline-branch-contract";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function page(groupName = "선화"): PageState {
  return {
    id: "page-1",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1_200,
    groups: [{ id: "group-1", name: groupName, hidden: false, locked: false }],
  };
}

function operation(
  mutation: StudioOfflinePreparedMutation,
  id = "operation-1",
): StudioOfflineBranchOperation {
  return {
    version: 1,
    id,
    dedupeKey: mutation.dedupeKey,
    targetType: mutation.targetType,
    action: mutation.action,
    targetId: mutation.targetId,
    pageId: mutation.pageId,
    layerId: mutation.layerId,
    beforeId: mutation.beforeId,
    previousBeforeId: mutation.previousBeforeId,
    expectedFingerprint: mutation.expectedFingerprint,
    resultFingerprint: mutation.resultFingerprint,
    payloadHash: mutation.payload ? HASH_A : null,
    payloadBytes: mutation.payload?.byteLength ?? 0,
    previousPayloadHash: mutation.previousPayload ? HASH_B : null,
    previousPayloadBytes: mutation.previousPayload?.byteLength ?? 0,
    actorId: "user-1",
    createdAt: 1,
  };
}

describe("studio offline branch scene bridge", () => {
  it("projects and reverses an update using its previous CAS payload", () => {
    const previous = [page("선화")];
    const next = [page("채색")];
    const plan = planStudioOfflineSceneTransition(previous, next);
    expect(plan.unsupported).toEqual([]);
    expect(plan.mutations).toHaveLength(1);

    const mutation = plan.mutations[0]!;
    const candidate = operation(mutation);
    expect(currentStudioOfflineBranchFingerprint(previous, candidate)).toBe(
      candidate.expectedFingerprint,
    );

    const projected = projectStudioOfflineBranchOperation(
      previous,
      candidate,
      mutation.payload,
    );
    expect(projected[0]?.groups?.[0]?.name).toBe("채색");
    expect(currentStudioOfflineBranchFingerprint(projected, candidate)).toBe(
      candidate.resultFingerprint,
    );

    const restored = revertStudioOfflineBranchOperation(
      projected,
      candidate,
      mutation.previousPayload,
    );
    expect(restored).toEqual(previous);
  });

  it("reverses an offline deletion after an application restart", () => {
    const previous = [page("선화")];
    const next = [{ ...page("선화"), groups: [] }];
    const mutation = planStudioOfflineSceneTransition(previous, next).mutations[0]!;
    const candidate = operation(mutation);
    const projected = projectStudioOfflineBranchOperation(previous, candidate, null);
    expect(projected[0]?.groups).toEqual([]);
    expect(revertStudioOfflineBranchOperation(
      projected,
      candidate,
      mutation.previousPayload,
    )).toEqual(previous);
  });

  it("reverses a newly-created offline group by removing it", () => {
    const previous = [{ ...page(), groups: [] }];
    const next = [page("신규")];
    const mutation = planStudioOfflineSceneTransition(previous, next).mutations[0]!;
    const candidate = operation(mutation);
    expect(candidate.expectedFingerprint).toBeNull();
    const projected = projectStudioOfflineBranchOperation(previous, candidate, mutation.payload);
    expect(projected[0]?.groups?.[0]?.name).toBe("신규");
    expect(revertStudioOfflineBranchOperation(projected, candidate, null)).toEqual(previous);
  });
});
