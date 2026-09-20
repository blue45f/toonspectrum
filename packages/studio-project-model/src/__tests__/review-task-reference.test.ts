import { describe, expect, it } from "vitest";

import { studioReviewTaskReferenceSchema, studioReviewTaskReferencesAreValid } from "../graph/review-task-reference";

const reference = { subject: { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1",
  reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) }, commentId: "comment-1", handoffId: "handoff-1" };

describe("production review reference", () => {
  it("carries only exact identities, rejecting private payloads or permission claims", () => {
    expect(studioReviewTaskReferenceSchema.parse(reference)).toEqual(reference);
    for (const extra of [{ previewUrl: "https://private.example/review" }, { access: "edit" }, { approval: true }, { body: "Private note" }]) {
      expect(studioReviewTaskReferenceSchema.safeParse({ ...reference, ...extra }).success).toBe(false);
      expect(studioReviewTaskReferenceSchema.safeParse({ ...reference, subject: { ...reference.subject, ...extra } }).success).toBe(false);
    }
    expect(studioReviewTaskReferenceSchema.safeParse({ ...reference, commentId: "../comment" }).success).toBe(false);
    expect(studioReviewTaskReferenceSchema.safeParse({ ...reference, subject: { ...reference.subject, rootGraphHash: "latest" } }).success).toBe(false);
  });
  it("keeps the handoff in the same production hierarchy and refuses foreign or ambiguous references", () => {
    const tasks = [{ reviewRef: reference, hierarchyNodeId: "scene-1" }];
    const handoffs = [{ id: "handoff-1", hierarchyNodeId: "scene-1" }];
    expect(studioReviewTaskReferencesAreValid("work:work-1", tasks, handoffs)).toBe(true);
    expect(studioReviewTaskReferencesAreValid("work:other", tasks, handoffs)).toBe(false);
    expect(studioReviewTaskReferencesAreValid("work:work-1", tasks, [])).toBe(false);
    expect(studioReviewTaskReferencesAreValid("work:work-1", tasks, [...handoffs, ...handoffs])).toBe(false);
    expect(studioReviewTaskReferencesAreValid("work:work-1", tasks, [{ ...handoffs[0]!, hierarchyNodeId: "scene-2" }])).toBe(false);
    expect(studioReviewTaskReferencesAreValid("work:work-1", [{ reviewRef: { ...reference, handoffId: null } }], [])).toBe(true);
  });
});
