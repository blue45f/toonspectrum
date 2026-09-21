// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { reloadStudioWorldAfterDraftSave } from "./studio-world-authoring-reload";
import { readStudioWorldAuthoringDraftRecord, writeStudioWorldAuthoringDraft } from "./studio-virtual-space-world-authoring";

afterEach(() => localStorage.clear());
describe("safe module-failure document reload", () => {
  it("reloads only after an actual local draft roundtrip with the exact publication base", () => {
    const reload = vi.fn();
    expect(reloadStudioWorldAfterDraftSave("work", DEFAULT_STUDIO_WORLD_MANIFEST, "rev-1", { write: writeStudioWorldAuthoringDraft, read: readStudioWorldAuthoringDraftRecord, reload })).toBe(true);
    expect(readStudioWorldAuthoringDraftRecord("work")).toEqual({ manifest: DEFAULT_STUDIO_WORLD_MANIFEST, basePublishedRevisionId: "rev-1" });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it.each(["write", "read", "scope", "content", "exception"])("never reloads when %s cannot be verified", (failure) => {
    const reload = vi.fn();
    const write = vi.fn(() => { if (failure === "exception") throw new Error("storage unavailable"); return failure !== "write"; });
    const read = vi.fn(() => failure === "read" ? null : ({ manifest: failure === "content" ? { ...DEFAULT_STUDIO_WORLD_MANIFEST, version: 999 } : DEFAULT_STUDIO_WORLD_MANIFEST,
      basePublishedRevisionId: failure === "scope" ? "other-revision" : "rev-1" }));
    expect(reloadStudioWorldAfterDraftSave("work", DEFAULT_STUDIO_WORLD_MANIFEST, "rev-1", { write, read, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
