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
  it("rejects invalid scope before creating any derived document", () => {
    const writes: string[] = [];
    const storage = { getItem: () => null, setItem: (key: string) => { writes.push(key); } };
    const handoff = studioModeHandoffsFor("storyboard")[0]!;
    for (const projectId of ["", " project-1", "project-1 ", "x".repeat(161)]) {
      expect(() => executeStudioModeHandoff(storage, projectId, handoff, "ko", {
        sourceDocumentId: "source-1",
      })).toThrow("valid project");
    }
    expect(writes).toEqual([]);
  });
  it("never exposes another project's provenance records", () => {
    const storage = new MemoryStorage();
    executeStudioModeHandoff(storage, "project-a", studioModeHandoffsFor("storyboard")[0]!, "ko", {
      sourceDocumentId: "source-a",
    });
    expect(readStudioModeHandoffRecords(storage, "project-a")).toHaveLength(1);
    expect(readStudioModeHandoffRecords(storage, "project-b")).toEqual([]);
    storage.setItem("toonspectrum:studio-mode-handoffs:v1:project-b", "{");
    expect(readStudioModeHandoffRecords(storage, "project-b")).toEqual([]);
  });

});
