import * as Automerge from "@automerge/automerge/slim";
import { beforeAll, describe, expect, it } from "vitest";

import {
  StudioOfflineBranchAutomergeEngine,
  initializeStudioOfflineBranchAutomerge,
} from "./studio-offline-branch-automerge";

import type {
  StudioOfflineBranchOperation,
  StudioOfflineBranchReceipt,
} from "./studio-offline-branch-contract";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const FP_A = `fp1:${"1".repeat(16)}`;
const FP_B = `fp1:${"2".repeat(16)}`;

function operation(input: {
  id: string;
  actorId: string;
  targetId: string;
  createdAt: number;
  hash?: string;
  fingerprint?: string;
  dedupeKey?: string;
}): StudioOfflineBranchOperation {
  return {
    version: 1,
    id: input.id,
    dedupeKey: input.dedupeKey ?? `dedupe-${input.targetId}`,
    targetType: "stroke",
    action: "upsert",
    targetId: input.targetId,
    pageId: "page-1",
    layerId: "page-root",
    beforeId: null,
    previousBeforeId: null,
    expectedFingerprint: null,
    resultFingerprint: input.fingerprint ?? FP_A,
    payloadHash: input.hash ?? HASH_A,
    payloadBytes: 128,
    previousPayloadHash: null,
    previousPayloadBytes: 0,
    actorId: input.actorId,
    createdAt: input.createdAt,
  };
}

function engine(id: string, actorId: string, createdAt: number) {
  return StudioOfflineBranchAutomergeEngine.create({
    id,
    workId: "work-1",
    scope: "user-1",
    actorId,
    createdAt,
  });
}

describe("StudioOfflineBranchAutomergeEngine", () => {
  beforeAll(async () => {
    await initializeStudioOfflineBranchAutomerge();
  });

  it("initializes the worker-safe Automerge WASM entrypoint", () => {
    expect(Automerge.isWasmInitialized()).toBe(true);
  });

  it("imports independently-created journals without root-map data loss", () => {
    const left = engine("branch-left", "actor-left", 1);
    const right = engine("branch-right", "actor-right", 1);
    left.append([
      operation({ id: "op-left", actorId: "actor-left", targetId: "stroke-left", createdAt: 2 }),
    ], 2);
    right.append([
      operation({
        id: "op-right",
        actorId: "actor-right",
        targetId: "stroke-right",
        createdAt: 2,
        hash: HASH_B,
        fingerprint: FP_B,
      }),
    ], 2);

    expect(left.importDocument(right.save(), 3)).toEqual({
      changed: true,
      replyNeeded: true,
    });
    expect(left.snapshot().operations.map(({ id }) => id)).toEqual(["op-left", "op-right"]);

    expect(right.importDocument(left.save(), 4)).toEqual({
      changed: true,
      replyNeeded: false,
    });
    expect(right.snapshot().operations.map(({ id }) => id)).toEqual(["op-left", "op-right"]);
    left.close();
    right.close();
  });

  it("propagates monotonic server receipts across semantic imports", () => {
    const left = engine("branch-left", "actor-left", 10);
    const right = engine("branch-right", "actor-right", 10);
    const candidate = operation({
      id: "op-server",
      actorId: "actor-left",
      targetId: "stroke-server",
      createdAt: 11,
    });
    left.append([candidate], 11);
    right.importDocument(left.save(), 12);
    const receipt: StudioOfflineBranchReceipt = {
      operationId: candidate.id,
      state: "server",
      yjsUpdateId: "update-server",
      serverSequence: "42",
      appliedAt: 13,
    };
    right.recordReceipts([receipt], 13);

    expect(left.importDocument(right.save(), 14)).toEqual({
      changed: true,
      replyNeeded: false,
    });
    expect(left.snapshot().receipts[candidate.id]).toEqual(receipt);
    expect(left.snapshot().branch.state).toBe("merged");
    left.close();
    right.close();
  });

  it("allows a persisted journal to reopen with a new local writer identity", () => {
    const first = engine("branch", "actor-old", 20);
    first.append([
      operation({ id: "op-old", actorId: "actor-old", targetId: "stroke-old", createdAt: 21 }),
    ], 21);
    const bytes = first.save();
    first.close();

    const reopened = StudioOfflineBranchAutomergeEngine.load(bytes, {
      workId: "work-1",
      scope: "user-1",
      actorId: "actor-new",
    });
    expect(reopened.append([
      operation({
        id: "op-new",
        actorId: "actor-new",
        targetId: "stroke-new",
        createdAt: 22,
        hash: HASH_B,
        fingerprint: FP_B,
      }),
    ], 22)).toBe(1);
    expect(reopened.snapshot().operations).toHaveLength(2);
    reopened.close();
  });

  it("rejects a semantic dedupe collision instead of selecting a winner", () => {
    const left = engine("branch-left", "actor-left", 30);
    const right = engine("branch-right", "actor-right", 30);
    left.append([
      operation({
        id: "op-left",
        actorId: "actor-left",
        targetId: "stroke-left",
        createdAt: 31,
        dedupeKey: "same-semantic-key",
      }),
    ], 31);
    right.append([
      operation({
        id: "op-right",
        actorId: "actor-right",
        targetId: "stroke-right",
        createdAt: 31,
        hash: HASH_B,
        fingerprint: FP_B,
        dedupeKey: "same-semantic-key",
      }),
    ], 31);

    expect(() => left.importDocument(right.save(), 32)).toThrow(/dedupe collision/u);
    left.close();
    right.close();
  });
});
