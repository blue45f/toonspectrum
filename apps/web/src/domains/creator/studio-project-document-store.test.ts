import { describe, expect, it } from "vitest";

import {
  archiveStudioProjectDocument,
  createStudioProjectDocument,
  duplicateStudioProjectDocument,
  ensureInitialStudioProjectDocument,
  permanentlyDeleteStudioProjectDocument,
  readStudioProjectDocuments,
  restoreStudioProjectDocument,
  setStudioProjectDocumentWorkspace,
  studioProjectDocumentHref,
  trashStudioProjectDocument,
} from "./studio-project-document-store";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const AT = "2026-09-12T00:00:00.000Z";

describe("Studio project document store", () => {
  it("creates a project-kind default document with a canonical workspace URL", () => {
    const storage = new MemoryStorage();
    const document = ensureInitialStudioProjectDocument(storage, {
      projectId: "series-alpha",
      projectTitle: "작품 A",
      projectKind: "webtoon",
      createdAt: AT,
    });

    expect(document).toMatchObject({
      projectId: "series-alpha",
      title: "EP01 원고",
      kind: "webtoon",
      defaultWorkspace: "comic",
      width: 1080,
      height: 8000,
    });
    expect(studioProjectDocumentHref(document)).toBe(
      `/studio/p/series-alpha/d/${encodeURIComponent(document.id)}?workspace=comic`,
    );
  });

  it("keeps one document identity while switching supported workspaces", () => {
    const storage = new MemoryStorage();
    const document = createStudioProjectDocument(storage, "series-alpha", {
      id: "episode-1",
      title: "1화",
      kind: "webtoon",
      createdAt: AT,
    });

    const draw = setStudioProjectDocumentWorkspace(
      storage,
      "series-alpha",
      document.id,
      "draw",
      { at: "2026-09-12T00:01:00.000Z" },
    );
    expect(draw.id).toBe(document.id);
    expect(draw.defaultWorkspace).toBe("draw");
    expect(studioProjectDocumentHref(draw)).toBe(
      "/studio/p/series-alpha/d/episode-1?workspace=draw",
    );
    expect(() => setStudioProjectDocumentWorkspace(
      storage,
      "series-alpha",
      document.id,
      "slides",
      { at: "2026-09-12T00:02:00.000Z" },
    )).toThrow("not available");
  });

  it("duplicates metadata and preserves archive and Trash recovery", () => {
    const storage = new MemoryStorage();
    const document = createStudioProjectDocument(storage, "series-alpha", {
      id: "pitch",
      title: "피칭 자료",
      kind: "slides",
      width: 1920,
      height: 1080,
      pageCount: 12,
      createdAt: AT,
    });
    const copy = duplicateStudioProjectDocument(storage, "series-alpha", document.id, {
      at: "2026-09-12T00:01:00.000Z",
    });
    expect(copy).toMatchObject({
      title: "피칭 자료 복사본",
      kind: "slides",
      pageCount: 12,
    });

    archiveStudioProjectDocument(storage, "series-alpha", document.id, {
      at: "2026-09-12T00:02:00.000Z",
    });
    const trashed = trashStudioProjectDocument(storage, "series-alpha", document.id, {
      at: "2026-09-12T00:03:00.000Z",
    });
    expect(trashed.statusBeforeTrash).toBe("archived");
    expect(restoreStudioProjectDocument(storage, "series-alpha", document.id, {
      at: "2026-09-12T00:04:00.000Z",
    }).status).toBe("archived");
    expect(readStudioProjectDocuments(storage, "series-alpha").documents).toHaveLength(2);
  });

  it("permanently removes only trashed document entries", () => {
    const storage = new MemoryStorage();
    const document = createStudioProjectDocument(storage, "series-alpha", {
      id: "image-1",
      title: "표지",
      kind: "image",
      createdAt: AT,
    });
    expect(() => permanentlyDeleteStudioProjectDocument(
      storage,
      "series-alpha",
      document.id,
      { at: AT },
    )).toThrow("Only trashed documents");
    trashStudioProjectDocument(storage, "series-alpha", document.id, {
      at: "2026-09-12T00:01:00.000Z",
    });
    expect(permanentlyDeleteStudioProjectDocument(
      storage,
      "series-alpha",
      document.id,
      { at: "2026-09-12T00:02:00.000Z" },
    ).documents).toEqual([]);
  });
});
