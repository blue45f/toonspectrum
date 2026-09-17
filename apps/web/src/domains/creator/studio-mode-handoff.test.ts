import { describe, expect, it } from "vitest";

import {
  executeStudioModeHandoff,
  readStudioModeHandoffRecords,
  studioModeHandoffsFor,
} from "./studio-mode-handoff";
import { readStudioProjectDocuments } from "./studio-project-document-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("studio mode handoff", () => {
  it("creates a derived document in the same project and records its source provenance", () => {
    const storage = new MemoryStorage();
    const handoff = studioModeHandoffsFor("storyboard").find((item) => item.id === "storyboard-to-webtoon");
    expect(handoff).toBeDefined();
    const result = executeStudioModeHandoff(storage, "project-1", handoff!, "ko", {
      sourceDocumentId: "storyboard-1",
      at: "2026-09-18T00:00:00.000Z",
    });
    const documents = readStudioProjectDocuments(storage, "project-1").documents;
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ kind: "webtoon", defaultWorkspace: "comic" });
    expect(result.href).toContain("workspace=comic");
    expect(result.href).toContain("startTool=draw");
    expect(result.href).toContain("handoff=storyboard-to-webtoon");
    expect(result.href).toContain("handoffSource=storyboard-1");
    expect(readStudioModeHandoffRecords(storage, "project-1")).toEqual([
      expect.objectContaining({
        sourceDocumentId: "storyboard-1",
        targetDocumentId: result.documentId,
        handoffId: "storyboard-to-webtoon",
        transfer: "derive",
      }),
    ]);
  });

  it("exposes production continuations by source mode", () => {
    expect(studioModeHandoffsFor("webtoon").map((item) => item.target)).toEqual(
      expect.arrayContaining(["animation", "design", "slides"]),
    );
    expect(studioModeHandoffsFor("three-d").map((item) => item.target)).toEqual(
      expect.arrayContaining(["webtoon", "illustration"]),
    );
  });
});
