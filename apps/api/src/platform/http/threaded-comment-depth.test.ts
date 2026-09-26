import { describe, expect, it } from "vitest";

import {
  exceedsThreadedCommentReplyDepth,
  MAX_THREADED_COMMENT_REPLY_DEPTH,
} from "./threaded-comment-depth";

describe("threaded comment reply depth", () => {
  it("allows the documented fourth reply level", () => {
    expect(MAX_THREADED_COMMENT_REPLY_DEPTH).toBe(4);
    expect(exceedsThreadedCommentReplyDepth(4)).toBe(false);
  });

  it("rejects a fifth reply level", () => {
    expect(exceedsThreadedCommentReplyDepth(5)).toBe(true);
  });
});
