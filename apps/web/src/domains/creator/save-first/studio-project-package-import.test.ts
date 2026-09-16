import { describe, expect, it } from "vitest";

import {
  readStudioAutosave,
  studioAutosaveKey,
  writeStudioLifecycleAutosave,
  type StudioAutosavePayload,
} from "../studio-autosave";
import {
  readStudioProjectDocuments,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import {
  readStudioProjectLibrary,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import { buildStudioProjectPackage } from "./studio-project-package";
import { importStudioProjectPackage } from "./studio-project-package-import";
import {
  buildStudioProjectWorkspacePackageEntries,
} from "./studio-project-workspace-snapshots";
import {
  createDefaultStudioSaveProfile,
  studioSaveProfileForProject,
  studioSaveProfileNeedsDestination,
} from "./studio-save-profile";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const sourceProject: StudioProjectLibraryEntry = Object.freeze({
  id: "source-project",
  title: "복원할 웹툰",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  templateId: "webtoon-vertical",
  description: "원고가 포함된 프로젝트",
  primaryLocale: "ko-KR",
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedDocumentId: "episode-1",
  thumbnailUrl: null,
});

const sourceDocument: StudioProjectDocumentEntry = Object.freeze({
  id: "episode-1",
  projectId: sourceProject.id,
  title: "EP01 원고",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  defaultWorkspace: "comic",
  allowedWorkspaces: ["comic", "draw", "image", "localization", "review"] as const,
  width: 800,
  height: 1200,
  pageCount: 1,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedAt: "2026-09-16T00:30:00.000Z",
});

const sourceSnapshot: StudioAutosavePayload = {
  version: 2,
  savedAt: "2026-09-16T00:30:00.000Z",
  currentPageId: "page-1",
  pagesList: [{
    id: "page-1",
    canvasH: 1200,
    elements: [{ id: "ink-1", type: "draw", points: [1, 2, 3, 4] }],
  }],
} as StudioAutosavePayload;

function packageFile(withWorkspace = true): File {
  const result = buildStudioProjectPackage({
    project: sourceProject,
    documents: [sourceDocument],
    profile: createDefaultStudioSaveProfile(sourceProject.id, {
      now: sourceProject.createdAt,
    }),
    exportedAt: "2026-09-16T01:00:00.000Z",
    additionalEntries: withWorkspace
      ? buildStudioProjectWorkspacePackageEntries([sourceDocument], [{
          documentId: sourceDocument.id,
          key: "source-autosave",
          authority: "memory-current",
          savedAt: sourceSnapshot.savedAt,
          payload: sourceSnapshot,
        }])
      : undefined,
  });
  return new File([result.blob], result.fileName, { type: result.blob.type });
}

describe("ToonStudio project package import", () => {
  it("restores a package as a new local project without overwriting a colliding autosave", async () => {
    const target = storage();
    const collidingKey = studioAutosaveKey({ userId: "artist-1", workId: sourceDocument.id });
    const existingSnapshot = {
      ...sourceSnapshot,
      savedAt: "2026-09-16T01:30:00.000Z",
      currentPageId: "existing-page",
      pagesList: [{ id: "existing-page", canvasH: 1200, elements: [{ id: "existing-ink", type: "draw" }] }],
    } as StudioAutosavePayload;
    writeStudioLifecycleAutosave(target, collidingKey, existingSnapshot, { preservePrimary: false });

    const result = await importStudioProjectPackage(packageFile(), {
      storage: target,
      authUserId: "artist-1",
      now: "2026-09-16T02:00:00.000Z",
      createProjectId: () => "fixed-id",
      createDocumentId: () => "fixed-id",
    });

    const importedDocumentId = "import-document-fixed-id";
    expect(result.project.id).toBe("import-fixed-id");
    expect(result.restoredSnapshotCount).toBe(1);
    expect(result.href).toContain(`/studio/p/import-fixed-id/d/${importedDocumentId}`);
    expect(readStudioProjectLibrary(target).projects).toHaveLength(1);
    expect(readStudioProjectDocuments(target, result.project.id).documents[0]).toMatchObject({
      id: importedDocumentId,
      projectId: result.project.id,
      title: sourceDocument.title,
    });
    const recovered = readStudioAutosave(target, studioAutosaveKey({
      userId: "artist-1",
      workId: importedDocumentId,
    }));
    expect(recovered?.payload.currentPageId).toBe("page-1");
    expect(JSON.stringify(recovered?.payload)).toContain("ink-1");
    expect(readStudioAutosave(target, collidingKey)?.payload.currentPageId).toBe("existing-page");
    const profile = studioSaveProfileForProject(target, result.project.id);
    expect(studioSaveProfileNeedsDestination(profile)).toBe(false);
    expect(profile.bindings.some((binding) => (
      binding.id === "local-file:imported" && binding.syncState === "synced"
    ))).toBe(true);
  });

  it("rejects old metadata-only project files instead of presenting an empty restored canvas", async () => {
    const target = storage();
    await expect(importStudioProjectPackage(packageFile(false), {
      storage: target,
      createProjectId: () => "fixed-id",
      createDocumentId: () => "fixed-id",
    })).rejects.toThrow(/필수 파일|원고/u);
    expect(readStudioProjectLibrary(target).projects).toEqual([]);
  });
});
