import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { readStudioProjectDocuments, studioProjectDocumentStorageKey } from "./studio-project-document-reader";
import { createStudioProjectDocument, readStudioProjectDocuments as readFromStore } from "./studio-project-document-store";

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  const document = createStudioProjectDocument(storage, "project-a", {
    id: "document-a", title: "Saved manuscript", kind: "webtoon", createdAt: "2026-09-13T00:00:00Z",
  });
  storage.setItem.mockClear();
  return { values, storage, document };
}

describe("read-only document metadata boundary", () => {
  it("keeps the existing store API bound to the identical reader", () => {
    expect(readFromStore).toBe(readStudioProjectDocuments);
  });

  it("reads existing metadata without rewriting storage or changing document identity", () => {
    const { storage, values, document } = fixture();
    const before = [...values];
    const state = readStudioProjectDocuments(storage, "project-a");
    expect(state.documents).toEqual([document]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.documents)).toBe(true);
    expect([...values]).toEqual(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["broken json", "{}"])("never repairs corrupt metadata implicitly: %s", (raw) => {
    const { storage, values } = fixture();
    values.set(studioProjectDocumentStorageKey("project-a"), raw);
    expect(readStudioProjectDocuments(storage, "project-a").documents).toEqual([]);
    expect(values.get(studioProjectDocumentStorageKey("project-a"))).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects a document from a different project without rewriting the saved record", () => {
    const { storage, values, document } = fixture();
    const raw = JSON.stringify({ schemaVersion: 1, projectId: "project-a", documents: [{ ...document, projectId: "other" }] });
    values.set(studioProjectDocumentStorageKey("project-a"), raw);
    expect(readStudioProjectDocuments(storage, "project-a").documents).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps manuscript source readers independent from library mutation commands", () => {
    const reader = readFileSync(new URL("./studio-project-document-reader.ts", import.meta.url), "utf8");
    expect(reader).not.toMatch(/storage\.setItem|studio-project-document-store/u);
    for (const source of ["studio-local-document-source.ts", "studio-editor-document-source.ts"]) {
      const code = readFileSync(new URL(source, import.meta.url), "utf8");
      expect(code).toContain('from "./studio-project-document-reader"');
      expect(code).not.toContain('from "./studio-project-document-store"');
    }
  });
});
