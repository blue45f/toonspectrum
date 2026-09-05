import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const commentsPanelSource = readFileSync(
  new URL("./StudioCommentsPanel.tsx", import.meta.url),
  "utf8"
);
const threadPopoverSource = readFileSync(
  new URL("./StudioCommentThreadPopover.tsx", import.meta.url),
  "utf8"
);

describe("Studio focused comment inbox integration", () => {
  it("keeps assigned and mentioned quick views wired to the review rail", () => {
    expect(commentsPanelSource).toContain('{ value: "assigned", label: "내 담당" }');
    expect(commentsPanelSource).toContain('{ value: "mentioned", label: "나를 멘션" }');
    expect(commentsPanelSource).toContain("studioCommentThreadAssignedToActor(thread, currentActor)");
    expect(commentsPanelSource).toContain("studioCommentThreadMentionsActor(thread, currentActor)");
  });

  it("supports fast keyboard submission without taking Enter away from multiline editing", () => {
    expect(commentsPanelSource.match(/aria-keyshortcuts="Control\+Enter Meta\+Enter"/g)).toHaveLength(2);
    expect(threadPopoverSource).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"');
    expect(commentsPanelSource).toContain("event.currentTarget.form?.requestSubmit()");
    expect(threadPopoverSource).toContain("event.currentTarget.form?.requestSubmit()");
  });
});
