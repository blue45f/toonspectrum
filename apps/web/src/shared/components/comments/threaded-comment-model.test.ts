import { describe, expect, it, vi } from "vitest";

import {
  applyThreadedCommentDelete,
  applyThreadedCommentLike,
  buildThreadedCommentForest,
  countActiveComments,
  replaceThreadedComment,
  type ThreadedCommentRecord,
} from "./threaded-comment-model";

function comment(
  id: string,
  parentId: string | null,
  createdAt: string,
  overrides: Partial<ThreadedCommentRecord> = {},
): ThreadedCommentRecord {
  return {
    id,
    parentId,
    author: { id: `user-${id}`, name: id },
    text: id,
    deleted: false,
    likes: 0,
    viewerLiked: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

const earlier = "2026-09-15T00:00:00.000Z";
const later = "2026-09-16T00:00:00.000Z";

describe("threaded comment model", () => {
  it("builds nested threads while keeping replies chronological", () => {
    const forest = buildThreadedCommentForest([
      comment("child-2", "root", later),
      comment("root", null, earlier),
      comment("child-1", "root", earlier),
    ], "newest");

    expect(forest).toHaveLength(1);
    expect(forest[0]?.comment.id).toBe("root");
    expect(forest[0]?.children.map((node) => node.comment.id)).toEqual(["child-1", "child-2"]);
    expect(forest[0]?.children.map((node) => node.depth)).toEqual([1, 1]);
  });

  it("sorts root threads by popularity without reordering their replies", () => {
    const forest = buildThreadedCommentForest([
      comment("old-popular", null, earlier, { likes: 10 }),
      comment("new", null, later, { likes: 1 }),
    ], "popular");
    expect(forest.map((node) => node.comment.id)).toEqual(["old-popular", "new"]);
  });

  it("promotes orphaned and cyclic records to safe roots", () => {
    const forest = buildThreadedCommentForest([
      comment("orphan", "missing", earlier),
      comment("cycle-a", "cycle-b", earlier),
      comment("cycle-b", "cycle-a", later),
    ], "oldest");
    expect(forest.map((node) => node.comment.id)).toEqual(["cycle-a", "orphan", "cycle-b"]);
    expect(forest.every((node) => node.children.length === 0)).toBe(true);
  });

  it("counts only visible active comments", () => {
    expect(countActiveComments([
      comment("active", null, earlier),
      comment("deleted", null, earlier, { deleted: true }),
      comment("hidden", null, earlier, { hidden: true }),
    ])).toBe(1);
  });

  it("applies edit, reaction, soft delete, and cascading hard delete results", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(later));
    const initial = [
      comment("root", null, earlier),
      comment("child", "root", later),
    ];
    const edited = replaceThreadedComment(initial, { ...initial[1]!, text: "edited" });
    expect(edited[1]?.text).toBe("edited");

    const liked = applyThreadedCommentLike(edited, "root", { liked: true, likes: 3 });
    expect(liked[0]).toMatchObject({ viewerLiked: true, likes: 3 });

    const softDeleted = applyThreadedCommentDelete(liked, "root", {
      deleted: true,
      soft: true,
      removedIds: [],
    });
    expect(softDeleted[0]).toMatchObject({ deleted: true, text: "", likes: 0, viewerLiked: false });

    const pruned = applyThreadedCommentDelete(softDeleted, "child", {
      deleted: true,
      soft: false,
      removedIds: ["child", "root"],
    });
    expect(pruned).toEqual([]);
    vi.useRealTimers();
  });
});
