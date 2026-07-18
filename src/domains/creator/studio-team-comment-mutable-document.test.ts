import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  STUDIO_COMMENTS_MAX_THREADS,
  type StudioCommentActor,
  type StudioCommentsDocument,
} from "./studio-comments";
import {
  mergeStudioTeamCommentMutableDocument,
  partitionStudioTeamCommentMutableDocument,
} from "./studio-team-comment-mutable-document";
import { planStudioTeamCommentMutation } from "./studio-team-comment-mutation-plan";

const ACTOR: StudioCommentActor = { id: "author-1", displayName: "작가" };

function archiveDocument(count: number): StudioCommentsDocument {
  return {
    version: 1,
    threads: Array.from({ length: count }, (_, index) => ({
      id: `legacy-${index}`,
      anchor: { type: "page" as const, pageId: "page-1" },
      author: ACTOR,
      body: `보관 댓글 ${index}`,
      mentions: [],
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      replies: [],
      resolved: false,
    })),
  };
}

describe("team comment mutable document partition", () => {
  it("does not charge a full read-only legacy archive against the live team quota", () => {
    const document = archiveDocument(STUDIO_COMMENTS_MAX_THREADS);
    const readOnlyIds = new Set(document.threads.map((thread) => thread.id));
    const partition = partitionStudioTeamCommentMutableDocument(document, readOnlyIds);

    expect(partition.mutableDocument.threads).toHaveLength(0);
    expect(partition.mutableMessageCount).toBe(0);
    expect(partition.readOnlyMessageCount).toBe(STUDIO_COMMENTS_MAX_THREADS);

    const nextMutable = addStudioCommentThread(partition.mutableDocument, {
      id: "remote-new",
      anchor: { type: "page", pageId: "page-1" },
      author: ACTOR,
      body: "새 팀 댓글",
    });
    const merged = mergeStudioTeamCommentMutableDocument(
      nextMutable,
      partition.readOnlyThreads
    );

    expect(merged.threads).toHaveLength(STUDIO_COMMENTS_MAX_THREADS);
    expect(merged.threads[0]?.id).toBe("remote-new");
    expect(merged.threads.some((thread) => thread.id === "legacy-199")).toBe(false);

    const nextPartition = partitionStudioTeamCommentMutableDocument(merged, readOnlyIds);
    expect(planStudioTeamCommentMutation(
      partition.mutableDocument,
      nextPartition.mutableDocument
    )).toMatchObject({
      kind: "create",
      mutationId: "remote-new",
      body: "새 팀 댓글",
    });
  });
});
