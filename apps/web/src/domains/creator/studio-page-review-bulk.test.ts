import { describe, expect, it } from "vitest";

import {
  buildPageReviewBulkPatchPlan,
  PAGE_REVIEW_ASSIGNEE_MAX_LENGTH,
  pageReviewStateIncludesPatch,
} from "./studio-page-review";

const pages = [
  {
    id: "page-a",
    review: { status: "draft", locked: false, assignee: "Writer" },
  },
  {
    id: "page-b",
    review: { status: "approved", locked: false, assignee: "Editor" },
  },
  {
    id: "page-c",
    review: { status: "approved", locked: true },
  },
] as const;

describe("storyboard review bulk patch plan", () => {
  it("keeps document order while pruning duplicate and stale selections", () => {
    expect(
      buildPageReviewBulkPatchPlan(
        pages,
        ["page-c", "missing", "page-a", "page-a"],
        { type: "lock", locked: true },
      ),
    ).toEqual([
      { pageId: "page-a", patch: { locked: true } },
    ]);
  });

  it("locks approvals and emits only fields that still need to change", () => {
    expect(
      buildPageReviewBulkPatchPlan(
        pages,
        ["page-a", "page-b", "page-c"],
        { type: "status", status: "approved" },
      ),
    ).toEqual([
      { pageId: "page-a", patch: { status: "approved", locked: true } },
      { pageId: "page-b", patch: { locked: true } },
    ]);
  });

  it("does not implicitly unlock a page when moving it out of approved", () => {
    expect(
      buildPageReviewBulkPatchPlan(
        pages,
        ["page-c"],
        { type: "status", status: "changes-requested" },
      ),
    ).toEqual([
      { pageId: "page-c", patch: { status: "changes-requested" } },
    ]);
  });

  it("normalizes assignees, supports clearing, and skips no-op values", () => {
    const longAssignee = `  ${"A".repeat(PAGE_REVIEW_ASSIGNEE_MAX_LENGTH + 10)}  `;
    expect(
      buildPageReviewBulkPatchPlan(
        pages,
        ["page-a", "page-b"],
        { type: "assignee", assignee: longAssignee },
      ),
    ).toEqual([
      {
        pageId: "page-a",
        patch: { assignee: "A".repeat(PAGE_REVIEW_ASSIGNEE_MAX_LENGTH) },
      },
      {
        pageId: "page-b",
        patch: { assignee: "A".repeat(PAGE_REVIEW_ASSIGNEE_MAX_LENGTH) },
      },
    ]);

    expect(
      buildPageReviewBulkPatchPlan(
        pages,
        ["page-a", "page-c"],
        { type: "assignee", assignee: "" },
      ),
    ).toEqual([
      { pageId: "page-a", patch: { assignee: "" } },
    ]);
  });

  it("matches persisted review state against a queued patch", () => {
    expect(
      pageReviewStateIncludesPatch(
        { status: "approved", locked: true, assignee: "Editor" },
        { status: "approved", locked: true },
      ),
    ).toBe(true);
    expect(
      pageReviewStateIncludesPatch(
        { status: "approved", locked: true, assignee: "Editor" },
        { assignee: "" },
      ),
    ).toBe(false);
    expect(
      pageReviewStateIncludesPatch(
        { status: "draft", locked: false, assignee: "" },
        { assignee: "" },
      ),
    ).toBe(true);
  });
});
