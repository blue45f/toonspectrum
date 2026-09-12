import { describe, expect, it } from "vitest";

import { readStudioProjectDocuments } from "./studio-project-document-store";
import { readStudioProjectLibrary } from "./studio-project-library-store";
import { createStudioProjectWithInitialDocument } from "./studio-project-creation";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const CREATED_AT = "2026-09-12T01:00:00.000Z";

describe("createStudioProjectWithInitialDocument", () => {
  it("creates a project and template-shaped document in one user action", () => {
    const storage = new MemoryStorage();
    const result = createStudioProjectWithInitialDocument(storage, {
      title: "작품 피칭",
      kind: "slides",
      templateId: "presentation-series-pitch",
      primaryLocale: "ko-KR",
      createdAt: CREATED_AT,
      document: {
        title: "작품 피칭 문서",
        kind: "slides",
        defaultWorkspace: "slides",
        width: 1920,
        height: 1080,
        pageCount: 12,
      },
    });

    expect(result.project).toMatchObject({
      title: "작품 피칭",
      kind: "slides",
      templateId: "presentation-series-pitch",
      lastOpenedDocumentId: result.document.id,
    });
    expect(result.document).toMatchObject({
      title: "작품 피칭 문서",
      kind: "slides",
      defaultWorkspace: "slides",
      width: 1920,
      height: 1080,
      pageCount: 12,
    });
    expect(result.href).toBe(
      `/studio/p/${encodeURIComponent(result.project.id)}/d/${encodeURIComponent(result.document.id)}?workspace=slides`,
    );
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(1);
    expect(readStudioProjectDocuments(storage, result.project.id).documents).toHaveLength(1);
  });

  it("uses the project-kind default document when no document override is supplied", () => {
    const storage = new MemoryStorage();
    const result = createStudioProjectWithInitialDocument(storage, {
      title: "세로 웹툰",
      kind: "webtoon",
      createdAt: CREATED_AT,
    });

    expect(result.document).toMatchObject({
      title: "EP01 원고",
      kind: "webtoon",
      defaultWorkspace: "comic",
    });
  });

  it("rolls back the project entry when initial document creation fails", () => {
    const storage = new MemoryStorage();

    expect(() => createStudioProjectWithInitialDocument(storage, {
      title: "잘못된 템플릿",
      kind: "slides",
      createdAt: CREATED_AT,
      document: {
        title: "실패 문서",
        kind: "slides",
        defaultWorkspace: "slides",
        width: -1,
        height: 1080,
        pageCount: 1,
      },
    })).toThrow("dimensions");

    expect(readStudioProjectLibrary(storage).projects).toEqual([]);
  });
});
