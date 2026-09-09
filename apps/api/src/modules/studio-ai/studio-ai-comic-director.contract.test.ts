import { describe, expect, it } from "vitest";

import {
  parseCreateStudioAiComicApprovalInput,
  parseCreateStudioAiComicDirectorSessionInput,
  parseCreateStudioAiComicJobInput,
  parseUpdateStudioAiComicDirectorSessionInput,
  parseUpdateStudioAiComicJobInput,
} from "./studio-ai-comic-director.contract";
import { studioAiComicDirectorDigest } from "./studio-ai-comic-director.service";

describe("Studio AI Comic Director contracts", () => {
  it("accepts one explicit document scope and stable payload", () => {
    expect(parseCreateStudioAiComicDirectorSessionInput({
      id: "session-1",
      workId: "work-1",
      title: "12화 제작",
      stage: "direction",
      status: "ready",
      payload: { storyText: "대본", scenes: [] },
    })).toEqual({
      id: "session-1",
      workId: "work-1",
      title: "12화 제작",
      stage: "direction",
      status: "ready",
      payload: { storyText: "대본", scenes: [] },
    });

    expect(() => parseCreateStudioAiComicDirectorSessionInput({
      workId: "work-1",
      remixSourceWorkId: "source-1",
    })).toThrow(/cannot belong to work and remix scopes/u);
  });

  it("requires optimistic revision for session updates and approvals", () => {
    expect(parseUpdateStudioAiComicDirectorSessionInput({
      expectedRevision: 4,
      stage: "production",
      status: "generating",
      payload: { selectedIndexes: [1, 2] },
    })).toMatchObject({
      expectedRevision: 4,
      stage: "production",
      status: "generating",
    });
    expect(parseCreateStudioAiComicApprovalInput({
      expectedRevision: 4,
      candidateDigest: "digest-4",
      payload: {},
    })).toEqual({
      expectedRevision: 4,
      candidateDigest: "digest-4",
      payload: {},
    });
    expect(() => parseCreateStudioAiComicApprovalInput({
      expectedRevision: 0,
      candidateDigest: "digest",
    })).toThrow(/expectedRevision/u);
  });

  it("validates durable job progress and event metadata", () => {
    expect(parseCreateStudioAiComicJobInput({
      operationId: "op-1",
      kind: "repair",
      progressTotal: 2,
      payload: { candidateId: "candidate-1" },
    })).toMatchObject({
      operationId: "op-1",
      kind: "repair",
      progressTotal: 2,
      leaseMs: 120_000,
    });
    expect(parseUpdateStudioAiComicJobInput({
      status: "succeeded",
      progressDone: 2,
      progressTotal: 2,
      result: { candidateId: "candidate-2" },
      leaseMs: null,
      eventType: "repair.completed",
    })).toMatchObject({
      status: "succeeded",
      progressDone: 2,
      progressTotal: 2,
      leaseMs: null,
      eventType: "repair.completed",
    });
  });

  it("produces the same digest for objects with different key insertion order", () => {
    expect(studioAiComicDirectorDigest({ b: 2, a: { y: 2, x: 1 } })).toBe(
      studioAiComicDirectorDigest({ a: { x: 1, y: 2 }, b: 2 }),
    );
  });
});
