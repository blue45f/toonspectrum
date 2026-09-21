import { describe, expect, it } from "vitest";
import { nextReviewNoteId, reviewNoteMatches } from "./studio-review-note-query";

const note = { body: "말풍선 간격 수정", status: "open" as const, severity: "required" as const, assigneeIds: ["artist"] };
describe("review note views", () => {
  it("filters only the presentation without changing approval evidence", () => {
    expect(reviewNoteMatches(note, "required", "말풍선", "artist")).toBe(true);
    expect(reviewNoteMatches(note, "mine", "", "other")).toBe(false);
    expect(reviewNoteMatches(note, "mine", "", null)).toBe(false);
    expect(reviewNoteMatches(note, "resolved", "", "artist")).toBe(false);
    expect(reviewNoteMatches({ ...note, status: "resolved" }, "required", "", "artist")).toBe(false);
    expect(reviewNoteMatches({ ...note, status: "dismissed" }, "resolved", "", "artist")).toBe(true);
    expect(note.status).toBe("open");
  });
  it("wraps within visible notes and recovers when the previous note is filtered out", () => {
    expect(nextReviewNoteId(["a", "b"], null, 1)).toBe("a");
    expect(nextReviewNoteId(["a", "b"], "a", -1)).toBe("b");
    expect(nextReviewNoteId(["a", "b"], "b", 1)).toBe("a");
    expect(nextReviewNoteId(["b"], "filtered", 1)).toBe("b");
    expect(nextReviewNoteId([], "a", 1)).toBeNull();
  });
});
