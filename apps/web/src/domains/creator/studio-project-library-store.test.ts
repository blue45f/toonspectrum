import { describe, expect, it } from "vitest";

import {
  activateStudioProject,
  archiveStudioProject,
  createStudioProject,
  duplicateStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  readStudioProjectLibrary,
  renameStudioProject,
  restoreStudioProject,
  trashStudioProject,
} from "./studio-project-library-store";

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

describe("Studio project library store", () => {
  it("creates, renames, opens and duplicates projects through one storage authority", () => {
    const storage = new MemoryStorage();
    const project = createStudioProject(storage, {
      id: "series-alpha",
      title: "  첫 번째   작품  ",
      kind: "webtoon",
      templateId: "webtoon-vertical",
      primaryLocale: "ko-KR",
      createdAt: AT,
    });

    expect(project).toMatchObject({
      id: "series-alpha",
      title: "첫 번째 작품",
      status: "active",
      kind: "webtoon",
    });

    expect(renameStudioProject(storage, project.id, "작품 A", {
      at: "2026-09-12T00:01:00.000Z",
    }).title).toBe("작품 A");
    expect(markStudioProjectOpened(storage, project.id, "episode-1", {
      at: "2026-09-12T00:02:00.000Z",
    }).lastOpenedDocumentId).toBe("episode-1");

    const copy = duplicateStudioProject(storage, project.id, {
      at: "2026-09-12T00:03:00.000Z",
    });
    expect(copy.id).not.toBe(project.id);
    expect(copy.title).toBe("작품 A 복사본");
    expect(readStudioProjectLibrary(storage).projects).toHaveLength(2);
  });

  it("archives, trashes and restores without losing the previous list", () => {
    const storage = new MemoryStorage();
    const project = createStudioProject(storage, {
      id: "series-alpha",
      title: "작품",
      kind: "illustration",
      createdAt: AT,
    });

    expect(archiveStudioProject(storage, project.id, {
      at: "2026-09-12T00:01:00.000Z",
    }).status).toBe("archived");
    const trashed = trashStudioProject(storage, project.id, {
      at: "2026-09-12T00:02:00.000Z",
    });
    expect(trashed).toMatchObject({
      status: "trashed",
      statusBeforeTrash: "archived",
    });
    expect(restoreStudioProject(storage, project.id, {
      at: "2026-09-12T00:03:00.000Z",
    }).status).toBe("archived");
    expect(activateStudioProject(storage, project.id, {
      at: "2026-09-12T00:04:00.000Z",
    }).status).toBe("active");
  });

  it("allows permanent deletion only from Trash", () => {
    const storage = new MemoryStorage();
    const project = createStudioProject(storage, {
      id: "series-alpha",
      title: "작품",
      kind: "design",
      createdAt: AT,
    });

    expect(() => permanentlyDeleteStudioProject(storage, project.id, { at: AT }))
      .toThrow("Only trashed projects");
    trashStudioProject(storage, project.id, { at: "2026-09-12T00:01:00.000Z" });
    expect(permanentlyDeleteStudioProject(storage, project.id, {
      at: "2026-09-12T00:02:00.000Z",
    }).projects).toEqual([]);
  });

  it("recovers conservatively from malformed persisted data", () => {
    const storage = new MemoryStorage();
    storage.setItem("toonspectrum:studio-project-library:v1", "{broken");
    expect(readStudioProjectLibrary(storage).projects).toEqual([]);
  });
});
